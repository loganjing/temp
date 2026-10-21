import type { Context, Hono } from 'hono'
import type { DbClient } from '@commonapp/dbkit'
import type { AuditKit } from './audit'
import { createAuditRecorder, type AuditRecorder } from './audit'
import {
  ApiError,
  BodyReader,
  currentAuthUser,
  forbiddenCompany,
  requireCompanyContext,
  validationFailed,
  type CompanyContext,
} from './support'

// 分配配置域（契约第 3 节）：业务组与成员、分类自动分配规则、公司可用分类集合。

export type GroupMember = { userId: number; name: string; email: string; department: string }

export type GroupView = { groupId: number; name: string; createdAt: string; members: GroupMember[] }

export type RuleView = { ruleId: number; category: string; groupId: number; groupName: string }

export type GroupDeps = { db: DbClient; audit: AuditKit }

type GroupRow = { group_id: number; name: string; created_at: string }
type MemberRow = { group_id: number; user_no: number; name: string; email: string; department: string }

const recorderFor = (deps: GroupDeps, company: CompanyContext, now: string): AuditRecorder =>
  createAuditRecorder(deps.audit, { userId: company.userId, userNo: company.userNo, userName: company.name }, () => now)

async function loadGroups(db: DbClient, companyId: number): Promise<GroupView[]> {
  const groups = await db.queryAll<GroupRow>({
    text: 'SELECT id AS group_id, name, created_at FROM business_groups WHERE company_id = ? ORDER BY name ASC, id ASC',
    params: [companyId],
  })
  if (groups.length === 0) return []
  const placeholders = groups.map(() => '?').join(', ')
  const members = await db.queryAll<MemberRow>({
    text: `SELECT m.group_id, m.user_no, u.name, u.email, u.department
           FROM group_members m JOIN users u ON u.user_no = m.user_no
           WHERE m.group_id IN (${placeholders}) ORDER BY u.name ASC, m.user_no ASC`,
    params: groups.map((group) => group.group_id),
  })
  return groups.map((group) => ({
    groupId: group.group_id,
    name: group.name,
    createdAt: group.created_at,
    members: members
      .filter((member) => member.group_id === group.group_id)
      .map((member) => ({ userId: member.user_no, name: member.name, email: member.email, department: member.department ?? '' })),
  }))
}

async function loadGroupView(db: DbClient, groupId: number): Promise<GroupView | null> {
  const groups = await loadGroupsForIds(db, [groupId])
  return groups[0] ?? null
}

async function loadGroupsForIds(db: DbClient, groupIds: number[]): Promise<GroupView[]> {
  if (groupIds.length === 0) return []
  const placeholders = groupIds.map(() => '?').join(', ')
  const groups = await db.queryAll<GroupRow>({
    text: `SELECT id AS group_id, name, created_at FROM business_groups WHERE id IN (${placeholders})`,
    params: groupIds,
  })
  const members = await db.queryAll<MemberRow>({
    text: `SELECT m.group_id, m.user_no, u.name, u.email, u.department
           FROM group_members m JOIN users u ON u.user_no = m.user_no
           WHERE m.group_id IN (${placeholders}) ORDER BY u.name ASC, m.user_no ASC`,
    params: groupIds,
  })
  return groups.map((group) => ({
    groupId: group.group_id,
    name: group.name,
    createdAt: group.created_at,
    members: members
      .filter((member) => member.group_id === group.group_id)
      .map((member) => ({ userId: member.user_no, name: member.name, email: member.email, department: member.department ?? '' })),
  }))
}

// 成员须属本公司；不存在或跨公司均拒绝（403）。
async function validateMembers(db: DbClient, companyId: number, memberIds: number[]): Promise<void> {
  if (memberIds.length === 0) return
  const placeholders = memberIds.map(() => '?').join(', ')
  const rows = await db.queryAll<{ user_no: number }>({
    text: `SELECT user_no FROM users WHERE CAST(company_id AS INTEGER) = ? AND user_no IN (${placeholders})`,
    params: [companyId, ...memberIds],
  })
  if (rows.length !== new Set(memberIds).size) throw forbiddenCompany('成员须属于本公司')
}

async function loadRuleView(db: DbClient, ruleId: number): Promise<RuleView | null> {
  const row = await db.queryOne<{ rule_id: number; category: string; group_id: number; group_name: string }>({
    text: `SELECT r.id AS rule_id, r.category, r.group_id, g.name AS group_name
           FROM category_rules r JOIN business_groups g ON g.id = r.group_id
           WHERE r.id = ?`,
    params: [ruleId],
  })
  if (!row) return null
  return { ruleId: row.rule_id, category: row.category, groupId: row.group_id, groupName: row.group_name }
}

export function registerGroupRoutes(app: Hono, deps: GroupDeps) {
  app.get('/api/groups', async (context: Context) => {
    const company = await requireCompanyContext(deps.db, currentAuthUser(context))
    return context.json({ items: await loadGroups(deps.db, company.companyId) })
  })

  app.post('/api/groups', async (context: Context) => {
    const company = await requireCompanyContext(deps.db, currentAuthUser(context))
    const reader = new BodyReader(await context.req.json().catch(() => null))
    const name = reader.string('name', { required: true, min: 1, max: 50 })
    const memberIds = reader.numberArray('memberIds') ?? []
    if (reader.issues.length > 0) throw validationFailed(reader.issues)

    await validateMembers(deps.db, company.companyId, memberIds)
    const now = new Date().toISOString()
    const groupId = await deps.db.transaction(async (tx) => {
      const existing = await tx.queryOne<{ id: number }>({
        text: 'SELECT id FROM business_groups WHERE company_id = ? AND name = ?',
        params: [company.companyId, name],
      })
      if (existing) throw new ApiError(409, 'GROUP_NAME_EXISTS', '该公司已存在同名业务组')
      const inserted = await tx.queryOne<{ id: number }>({
        text: 'INSERT INTO business_groups (company_id, name, created_at) VALUES (?, ?, ?) RETURNING id AS id',
        params: [company.companyId, name, now],
      })
      if (!inserted) throw new Error('业务组创建失败')
      for (const userNo of new Set(memberIds)) {
        await tx.run({
          text: 'INSERT INTO group_members (group_id, user_no, created_at) VALUES (?, ?, ?)',
          params: [inserted.id, userNo, now],
        })
      }
      await recorderFor(deps, company, now)({
        type: 'group.created',
        detail: `创建业务组 ${name}，成员 ${new Set(memberIds).size} 人`,
      })
      return inserted.id
    })
    const view = await loadGroupView(deps.db, groupId)
    return context.json(view, 201)
  })

  app.put('/api/groups/:groupId', async (context: Context) => {
    const company = await requireCompanyContext(deps.db, currentAuthUser(context))
    const groupId = Number(context.req.param('groupId'))
    if (!Number.isInteger(groupId) || groupId <= 0) throw new ApiError(404, 'NOT_FOUND', '业务组不存在')
    const group = await deps.db.queryOne<{ id: number; company_id: number; name: string }>({
      text: 'SELECT id, company_id, name FROM business_groups WHERE id = ?',
      params: [groupId],
    })
    if (!group) throw new ApiError(404, 'NOT_FOUND', '业务组不存在')
    if (group.company_id !== company.companyId) throw forbiddenCompany()

    const body = await context.req.json().catch(() => null)
    const reader = new BodyReader(body)
    const name = reader.string('name', { min: 1, max: 50 })
    const memberIds = body && (body as Record<string, unknown>).memberIds !== undefined ? reader.numberArray('memberIds') ?? [] : undefined
    if (reader.issues.length > 0) throw validationFailed(reader.issues)
    if (memberIds !== undefined) await validateMembers(deps.db, company.companyId, memberIds)

    const now = new Date().toISOString()
    await deps.db.transaction(async (tx) => {
      if (name !== null) {
        const clash = await tx.queryOne<{ id: number }>({
          text: 'SELECT id FROM business_groups WHERE company_id = ? AND name = ? AND id <> ?',
          params: [company.companyId, name, groupId],
        })
        if (clash) throw new ApiError(409, 'GROUP_NAME_EXISTS', '该公司已存在同名业务组')
        await tx.run({ text: 'UPDATE business_groups SET name = ? WHERE id = ?', params: [name, groupId] })
      }
      if (memberIds !== undefined) {
        await tx.run({ text: 'DELETE FROM group_members WHERE group_id = ?', params: [groupId] })
        for (const userNo of new Set(memberIds)) {
          await tx.run({
            text: 'INSERT INTO group_members (group_id, user_no, created_at) VALUES (?, ?, ?)',
            params: [groupId, userNo, now],
          })
        }
      }
      await recorderFor(deps, company, now)({
        type: 'group.updated',
        detail: `更新业务组 ${name ?? group.name}${memberIds !== undefined ? `，成员整体替换为 ${new Set(memberIds).size} 人` : ''}`,
      })
    })
    const view = await loadGroupView(deps.db, groupId)
    return context.json(view)
  })

  app.get('/api/category-rules', async (context: Context) => {
    const company = await requireCompanyContext(deps.db, currentAuthUser(context))
    const rows = await deps.db.queryAll<{ rule_id: number; category: string; group_id: number; group_name: string }>({
      text: `SELECT r.id AS rule_id, r.category, r.group_id, g.name AS group_name
             FROM category_rules r JOIN business_groups g ON g.id = r.group_id
             WHERE r.company_id = ? ORDER BY r.category ASC`,
      params: [company.companyId],
    })
    return context.json({ items: rows.map((row) => ({ ruleId: row.rule_id, category: row.category, groupId: row.group_id, groupName: row.group_name })) })
  })

  app.post('/api/category-rules', async (context: Context) => {
    const company = await requireCompanyContext(deps.db, currentAuthUser(context))
    const reader = new BodyReader(await context.req.json().catch(() => null))
    const category = reader.string('category', { required: true, min: 1, max: 50 })
    const groupId = reader.number('groupId', { required: true, min: 1 })
    if (reader.issues.length > 0) throw validationFailed(reader.issues)

    const group = await deps.db.queryOne<{ id: number; name: string }>({
      text: 'SELECT id, name FROM business_groups WHERE id = ? AND company_id = ?',
      params: [groupId, company.companyId],
    })
    if (!group) throw forbiddenCompany('规则指向的业务组须属于本公司')

    const now = new Date().toISOString()
    const ruleId = await deps.db.transaction(async (tx) => {
      const existing = await tx.queryOne<{ id: number }>({
        text: 'SELECT id FROM category_rules WHERE company_id = ? AND category = ?',
        params: [company.companyId, category],
      })
      if (existing) throw new ApiError(409, 'RULE_CATEGORY_EXISTS', '该分类已有自动分配规则')
      const inserted = await tx.queryOne<{ id: number }>({
        text: 'INSERT INTO category_rules (company_id, category, group_id, created_at) VALUES (?, ?, ?, ?) RETURNING id AS id',
        params: [company.companyId, category, group.id, now],
      })
      if (!inserted) throw new Error('分配规则创建失败')
      await recorderFor(deps, company, now)({
        type: 'rule.created',
        detail: `配置规则：分类 ${category} → 业务组 ${group.name}`,
      })
      return inserted.id
    })
    return context.json(await loadRuleView(deps.db, ruleId), 201)
  })

  app.put('/api/category-rules/:ruleId', async (context: Context) => {
    const company = await requireCompanyContext(deps.db, currentAuthUser(context))
    const ruleId = Number(context.req.param('ruleId'))
    if (!Number.isInteger(ruleId) || ruleId <= 0) throw new ApiError(404, 'NOT_FOUND', '分配规则不存在')
    const rule = await deps.db.queryOne<{ id: number; company_id: number; category: string; group_id: number }>({
      text: 'SELECT id, company_id, category, group_id FROM category_rules WHERE id = ?',
      params: [ruleId],
    })
    if (!rule) throw new ApiError(404, 'NOT_FOUND', '分配规则不存在')
    if (rule.company_id !== company.companyId) throw forbiddenCompany()

    const reader = new BodyReader(await context.req.json().catch(() => null))
    const category = reader.string('category', { min: 1, max: 50 })
    const groupId = reader.number('groupId', { min: 1 })
    if (reader.issues.length > 0) throw validationFailed(reader.issues)

    let groupName: string | null = null
    if (groupId !== null) {
      const group = await deps.db.queryOne<{ id: number; name: string }>({
        text: 'SELECT id, name FROM business_groups WHERE id = ? AND company_id = ?',
        params: [groupId, company.companyId],
      })
      if (!group) throw forbiddenCompany('规则指向的业务组须属于本公司')
      groupName = group.name
    }

    const now = new Date().toISOString()
    await deps.db.transaction(async (tx) => {
      const nextCategory = category ?? rule.category
      if (category !== null && category !== rule.category) {
        const clash = await tx.queryOne<{ id: number }>({
          text: 'SELECT id FROM category_rules WHERE company_id = ? AND category = ? AND id <> ?',
          params: [company.companyId, category, ruleId],
        })
        if (clash) throw new ApiError(409, 'RULE_CATEGORY_EXISTS', '该分类已有自动分配规则')
      }
      await tx.run({
        text: 'UPDATE category_rules SET category = ?, group_id = ? WHERE id = ?',
        params: [nextCategory, groupId ?? rule.group_id, ruleId],
      })
      const currentGroup = await tx.queryOne<{ name: string }>({
        text: 'SELECT g.name FROM business_groups g JOIN category_rules r ON r.group_id = g.id WHERE r.id = ?',
        params: [ruleId],
      })
      await recorderFor(deps, company, now)({
        type: 'rule.updated',
        detail: `更新规则：分类 ${nextCategory} → 业务组 ${groupName ?? currentGroup?.name ?? ''}`,
      })
    })
    return context.json(await loadRuleView(deps.db, ruleId))
  })

  // 本公司已用分类集合（tickets.category ∪ rules.category，字典序）。
  app.get('/api/categories', async (context: Context) => {
    const company = await requireCompanyContext(deps.db, currentAuthUser(context))
    const rows = await deps.db.queryAll<{ category: string }>({
      text: `SELECT DISTINCT category FROM tickets WHERE company_id = ?
             UNION
             SELECT DISTINCT category FROM category_rules WHERE company_id = ?
             ORDER BY category ASC`,
      params: [company.companyId, company.companyId],
    })
    return context.json({ items: rows.map((row) => row.category) })
  })
}
