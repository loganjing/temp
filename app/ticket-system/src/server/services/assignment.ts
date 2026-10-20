import type { DbClient } from '@commonapp/dbkit'
import { ApiError, notFound, validationFailed } from '../api-error'
import type { AssignmentRule, BusinessGroup, BusinessGroupMember, Role } from '../../shared/tickets'
import { requireCompanyReadScope, requireOps } from './authz-common'
import type { Actor } from './actor'

type GroupRow = { id: number; company_id: number; name: string }
type MemberRow = { group_id: number; user_id: string; display_name: string; department: string | null }
type RuleRow = { id: number; company_id: number; category: string; group_id: number; group_name: string }

export function createAssignmentService(db: DbClient) {
  const nowIso = () => new Date().toISOString()

  const loadGroup = async (groupId: number): Promise<GroupRow> => {
    const row = await db.queryOne<GroupRow>({ text: 'SELECT id, company_id, name FROM business_groups WHERE id = ?', params: [groupId] })
    if (!row) throw notFound('业务组不存在')
    return row
  }

  // 读取权限：ops（任意公司）或该公司 handler（契约第 6 节）。
  const listBusinessGroups = async (actor: Actor, companyId: number): Promise<BusinessGroup[]> => {
    requireCompanyReadScope(actor, companyId)
    const groups = await db.queryAll<GroupRow>({
      text: 'SELECT id, company_id, name FROM business_groups WHERE company_id = ? ORDER BY id',
      params: [companyId],
    })
    if (groups.length === 0) return []
    const placeholders = groups.map(() => '?').join(', ')
    const members = await db.queryAll<MemberRow>({
      text: `SELECT m.group_id, m.user_id, p.display_name, p.department FROM business_group_members m JOIN user_profiles p ON p.user_id = m.user_id WHERE m.group_id IN (${placeholders}) ORDER BY m.user_id`,
      params: groups.map((group) => group.id),
    })
    return groups.map((group) => ({
      id: group.id,
      company_id: group.company_id,
      name: group.name,
      members: members
        .filter((member) => member.group_id === group.id)
        .map((member) => ({ user_id: member.user_id, display_name: member.display_name, department: member.department })),
    }))
  }

  const createBusinessGroup = async (actor: Actor, companyId: number, name: string): Promise<BusinessGroup> => {
    requireOps(actor)
    const company = await db.queryOne<{ id: number }>({ text: 'SELECT id FROM companies WHERE id = ?', params: [companyId] })
    if (!company) throw validationFailed('公司不存在')
    const duplicate = await db.queryOne<{ id: number }>({
      text: 'SELECT id FROM business_groups WHERE company_id = ? AND name = ?',
      params: [companyId, name],
    })
    if (duplicate) throw new ApiError(409, 'DUPLICATE_NAME', '同公司下业务组名称已存在')
    const createdAt = nowIso()
    await db.run({ text: 'INSERT INTO business_groups (company_id, name, created_at) VALUES (?, ?, ?)', params: [companyId, name, createdAt] })
    const row = await db.queryOne<{ id: number }>({ text: 'SELECT last_insert_rowid() AS id' })
    return { id: row?.id ?? 0, company_id: companyId, name, members: [] }
  }

  const patchBusinessGroup = async (actor: Actor, groupId: number, name: string): Promise<BusinessGroup> => {
    requireOps(actor)
    const group = await loadGroup(groupId)
    const duplicate = await db.queryOne<{ id: number }>({
      text: 'SELECT id FROM business_groups WHERE company_id = ? AND name = ? AND id <> ?',
      params: [group.company_id, name, groupId],
    })
    if (duplicate) throw new ApiError(409, 'DUPLICATE_NAME', '同公司下业务组名称已存在')
    await db.run({ text: 'UPDATE business_groups SET name = ? WHERE id = ?', params: [name, groupId] })
    const members = await db.queryAll<MemberRow>({
      text: 'SELECT m.group_id, m.user_id, p.display_name, p.department FROM business_group_members m JOIN user_profiles p ON p.user_id = m.user_id WHERE m.group_id = ? ORDER BY m.user_id',
      params: [groupId],
    })
    return {
      id: group.id,
      company_id: group.company_id,
      name,
      members: members.map((member) => ({ user_id: member.user_id, display_name: member.display_name, department: member.department })),
    }
  }

  const deleteBusinessGroup = async (actor: { role: Role }, groupId: number): Promise<void> => {
    requireOps(actor)
    await loadGroup(groupId)
    const inUse = await db.queryOne<{ total: number }>({
      text: "SELECT COUNT(*) AS total FROM tickets WHERE status = 'in_progress' AND assigned_group_id = ?",
      params: [groupId],
    })
    if ((inUse?.total ?? 0) > 0) throw new ApiError(409, 'GROUP_IN_USE', '业务组仍存在待处理工单，无法删除')
    await db.run({ text: 'DELETE FROM business_groups WHERE id = ?', params: [groupId] })
  }

  const addGroupMember = async (actor: { role: Role }, groupId: number, userId: string): Promise<BusinessGroupMember> => {
    requireOps(actor)
    const group = await loadGroup(groupId)
    const profile = await db.queryOne<{ user_id: string; company_id: number; display_name: string; department: string | null }>({
      text: 'SELECT user_id, company_id, display_name, department FROM user_profiles WHERE user_id = ?',
      params: [userId],
    })
    if (!profile) throw notFound('用户不存在')
    if (profile.company_id !== group.company_id) throw new ApiError(400, 'USER_COMPANY_MISMATCH', '用户不属于该业务组所在公司')
    const duplicate = await db.queryOne<{ group_id: number }>({
      text: 'SELECT group_id FROM business_group_members WHERE group_id = ? AND user_id = ?',
      params: [groupId, userId],
    })
    if (duplicate) throw new ApiError(409, 'DUPLICATE_MEMBER', '该用户已是业务组成员')
    await db.run({ text: 'INSERT INTO business_group_members (group_id, user_id, added_at) VALUES (?, ?, ?)', params: [groupId, userId, nowIso()] })
    return { user_id: profile.user_id, display_name: profile.display_name, department: profile.department }
  }

  const removeGroupMember = async (actor: { role: Role }, groupId: number, userId: string): Promise<void> => {
    requireOps(actor)
    await loadGroup(groupId)
    const result = await db.run({
      text: 'DELETE FROM business_group_members WHERE group_id = ? AND user_id = ?',
      params: [groupId, userId],
    })
    if (result.changes === 0) throw notFound('成员不存在')
  }

  const listAssignmentRules = async (actor: Actor, companyId: number): Promise<AssignmentRule[]> => {
    requireCompanyReadScope(actor, companyId)
    return db.queryAll<RuleRow>({
      text: 'SELECT r.id, r.company_id, r.category, r.group_id, g.name AS group_name FROM assignment_rules r JOIN business_groups g ON g.id = r.group_id WHERE r.company_id = ? ORDER BY r.id',
      params: [companyId],
    })
  }

  // 按（公司, 分类）upsert（契约第 6 节）：更新返回 200 语义，新建返回 201 语义。
  const putAssignmentRule = async (
    actor: { role: Role },
    input: { companyId: number; category: string; groupId: number },
  ): Promise<{ created: boolean; rule: AssignmentRule }> => {
    requireOps(actor)
    const group = await loadGroup(input.groupId)
    if (group.company_id !== input.companyId) throw new ApiError(400, 'GROUP_COMPANY_MISMATCH', '业务组不属于该公司')
    const existing = await db.queryOne<{ id: number }>({
      text: 'SELECT id FROM assignment_rules WHERE company_id = ? AND category = ?',
      params: [input.companyId, input.category],
    })
    if (existing) {
      await db.run({ text: 'UPDATE assignment_rules SET group_id = ? WHERE id = ?', params: [input.groupId, existing.id] })
    } else {
      await db.run({
        text: 'INSERT INTO assignment_rules (company_id, category, group_id, created_at) VALUES (?, ?, ?, ?)',
        params: [input.companyId, input.category, input.groupId, nowIso()],
      })
    }
    const rule = await db.queryOne<RuleRow>({
      text: 'SELECT r.id, r.company_id, r.category, r.group_id, g.name AS group_name FROM assignment_rules r JOIN business_groups g ON g.id = r.group_id WHERE r.company_id = ? AND r.category = ?',
      params: [input.companyId, input.category],
    })
    if (!rule) throw notFound('分配规则不存在')
    return { created: !existing, rule }
  }

  const deleteAssignmentRule = async (actor: { role: Role }, ruleId: number): Promise<void> => {
    requireOps(actor)
    const existing = await db.queryOne<{ id: number }>({ text: 'SELECT id FROM assignment_rules WHERE id = ?', params: [ruleId] })
    if (!existing) throw notFound('分配规则不存在')
    await db.run({ text: 'DELETE FROM assignment_rules WHERE id = ?', params: [ruleId] })
  }

  return {
    listBusinessGroups,
    createBusinessGroup,
    patchBusinessGroup,
    deleteBusinessGroup,
    addGroupMember,
    removeGroupMember,
    listAssignmentRules,
    putAssignmentRule,
    deleteAssignmentRule,
  }
}

export type AssignmentService = ReturnType<typeof createAssignmentService>
