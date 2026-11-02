import { randomUUID } from 'node:crypto'
import type { DbClient } from '@commonapp/dbkit'
import type { Profile } from './access'
import { conflict, forbidden, notFound, validationError } from './errors'

type GroupRow = { id: string; company_id: string; name: string; created_at: string }
type MemberRow = {
  group_id: string
  user_id: string
  name: string
  email: string
  department_name: string | null
}

function audit(action: string, profile: Profile, targetId: string, detail?: Record<string, unknown>) {
  console.info('[audit]', JSON.stringify({ action, actorId: profile.userId, companyId: profile.companyId, targetId, at: new Date().toISOString(), ...detail }))
}

async function loadGroup(db: DbClient, groupId: string): Promise<GroupRow> {
  const group = await db.queryOne<GroupRow>({
    text: 'SELECT * FROM business_groups WHERE id = ?',
    params: [groupId],
  })
  if (!group) throw notFound('业务组不存在')
  return group
}

async function loadOwnedGroup(db: DbClient, profile: Profile, groupId: string): Promise<GroupRow> {
  const group = await loadGroup(db, groupId)
  if (group.company_id !== profile.companyId) throw forbidden('无权访问其他公司的业务组')
  return group
}

async function presentGroup(db: DbClient, group: GroupRow) {
  const members = await db.queryAll<MemberRow>({
    text: `SELECT m.group_id, m.user_id, u.name, u.email, d.name AS department_name
             FROM business_group_members m
             JOIN users u ON u.id = m.user_id
             LEFT JOIN user_profiles p ON p.user_id = u.id
             LEFT JOIN departments d ON d.id = p.department_id
            WHERE m.group_id = ?
            ORDER BY u.name ASC`,
    params: [group.id],
  })
  return {
    id: group.id,
    name: group.name,
    companyId: group.company_id,
    memberCount: members.length,
    members: members.map((member) => ({
      userId: member.user_id,
      name: member.name,
      email: member.email,
      departmentName: member.department_name,
    })),
    createdAt: group.created_at,
  }
}

function readName(body: Record<string, unknown>) {
  const value = typeof body.name === 'string' ? body.name.trim() : ''
  if (value.length < 1 || value.length > 100) throw validationError('业务组名称需为 1-100 个字符', { name: 'name 长度需为 1-100 个字符' })
  return value
}

function assertAdmin(profile: Profile) {
  if (profile.role !== 'admin') throw forbidden('仅管理员可以执行该配置操作')
}

export async function listGroups(db: DbClient, profile: Profile) {
  if (profile.role === 'submitter') throw forbidden('提交人无法访问业务组配置')
  const rows = profile.role === 'ops'
    ? await db.queryAll<GroupRow>({ text: 'SELECT * FROM business_groups ORDER BY company_id ASC, created_at ASC, rowid ASC' })
    : await db.queryAll<GroupRow>({
        text: 'SELECT * FROM business_groups WHERE company_id = ? ORDER BY created_at ASC, rowid ASC',
        params: [profile.companyId],
      })
  return Promise.all(rows.map((row) => presentGroup(db, row)))
}

export async function createGroup(db: DbClient, profile: Profile, body: Record<string, unknown>) {
  assertAdmin(profile)
  const name = readName(body)
  const existing = await db.queryOne<{ id: string }>({
    text: 'SELECT id FROM business_groups WHERE company_id = ? AND name = ?',
    params: [profile.companyId, name],
  })
  if (existing) throw conflict('duplicate_group', '本公司已存在同名业务组')
  const id = randomUUID()
  const now = new Date().toISOString()
  await db.run({
    text: 'INSERT INTO business_groups (id, company_id, name, created_at) VALUES (?, ?, ?, ?)',
    params: [id, profile.companyId, name, now],
  })
  audit('group.created', profile, id, { name })
  return presentGroup(db, { id, company_id: profile.companyId, name, created_at: now })
}

export async function renameGroup(db: DbClient, profile: Profile, groupId: string, body: Record<string, unknown>) {
  assertAdmin(profile)
  const group = await loadOwnedGroup(db, profile, groupId)
  const name = readName(body)
  const duplicate = await db.queryOne<{ id: string }>({
    text: 'SELECT id FROM business_groups WHERE company_id = ? AND name = ? AND id <> ?',
    params: [group.company_id, name, group.id],
  })
  if (duplicate) throw conflict('duplicate_group', '本公司已存在同名业务组')
  await db.run({ text: 'UPDATE business_groups SET name = ? WHERE id = ?', params: [name, group.id] })
  audit('group.renamed', profile, group.id, { name })
  return presentGroup(db, { ...group, name })
}

export async function deleteGroup(db: DbClient, profile: Profile, groupId: string) {
  assertAdmin(profile)
  const group = await loadOwnedGroup(db, profile, groupId)
  const ticketCount = await db.queryOne<{ total: number }>({
    text: "SELECT COUNT(*) AS total FROM tickets WHERE group_id = ? AND status IN ('unassigned', 'in_progress')",
    params: [group.id],
  })
  const ruleCount = await db.queryOne<{ total: number }>({
    text: 'SELECT COUNT(*) AS total FROM assignment_rules WHERE group_id = ?',
    params: [group.id],
  })
  if (Number(ticketCount?.total ?? 0) > 0 || Number(ruleCount?.total ?? 0) > 0)
    throw conflict('group_in_use', '业务组仍被未完成工单或分配规则引用')
  await db.run({ text: 'DELETE FROM business_groups WHERE id = ?', params: [group.id] })
  audit('group.deleted', profile, group.id)
  return { ok: true }
}

export async function addGroupMember(db: DbClient, profile: Profile, groupId: string, body: Record<string, unknown>) {
  assertAdmin(profile)
  const group = await loadOwnedGroup(db, profile, groupId)
  const userId = typeof body.userId === 'string' && body.userId.trim() ? body.userId.trim() : ''
  if (!userId) throw validationError('userId 为必填项', { userId: 'userId 为必填项' })
  const member = await db.queryOne<MemberRow>({
    text: `SELECT NULL AS group_id, u.id AS user_id, u.name, u.email, d.name AS department_name
             FROM users u
             JOIN user_profiles p ON p.user_id = u.id
             JOIN departments d ON d.id = p.department_id
            WHERE u.id = ? AND d.company_id = ?`,
    params: [userId, group.company_id],
  })
  if (!member) throw validationError('成员必须是本公司的已配置用户', { userId: 'userId 无效' })

  const existing = await db.queryOne<{ user_id: string }>({
    text: 'SELECT user_id FROM business_group_members WHERE group_id = ? AND user_id = ?',
    params: [group.id, userId],
  })
  if (!existing) {
    await db.run({
      text: 'INSERT INTO business_group_members (group_id, user_id, added_at) VALUES (?, ?, ?)',
      params: [group.id, userId, new Date().toISOString()],
    })
    audit('group.member.added', profile, group.id, { userId })
  }
  return {
    created: !existing,
    groupId: group.id,
    member: { userId: member.user_id, name: member.name, email: member.email, departmentName: member.department_name },
  }
}

export async function removeGroupMember(db: DbClient, profile: Profile, groupId: string, userId: string) {
  assertAdmin(profile)
  const group = await loadOwnedGroup(db, profile, groupId)
  await db.run({
    text: 'DELETE FROM business_group_members WHERE group_id = ? AND user_id = ?',
    params: [group.id, userId],
  })
  audit('group.member.removed', profile, group.id, { userId })
  return { ok: true }
}

export async function listCategories(db: DbClient) {
  const rows = await db.queryAll<{ id: string; code: string; name: string }>({
    text: 'SELECT id, code, name FROM categories WHERE active = 1 ORDER BY code ASC',
  })
  return rows
}

type RuleRow = {
  id: string
  company_id: string
  category_id: string
  group_id: string
  category_name: string
  group_name: string
}

const RULE_SELECT = `SELECT r.id, r.company_id, r.category_id, r.group_id,
       c.name AS category_name, g.name AS group_name
  FROM assignment_rules r
  JOIN categories c ON c.id = r.category_id
  JOIN business_groups g ON g.id = r.group_id`

function presentRule(row: RuleRow) {
  return {
    id: row.id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    groupId: row.group_id,
    groupName: row.group_name,
  }
}

export async function listAssignmentRules(db: DbClient, profile: Profile) {
  assertAdmin(profile)
  const rows = await db.queryAll<RuleRow>({
    text: `${RULE_SELECT} WHERE r.company_id = ? ORDER BY r.created_at ASC, r.rowid ASC`,
    params: [profile.companyId],
  })
  return rows.map(presentRule)
}

async function readRuleInput(db: DbClient, profile: Profile, body: Record<string, unknown>) {
  const categoryId = typeof body.categoryId === 'string' && body.categoryId.trim() ? body.categoryId.trim() : ''
  const groupId = typeof body.groupId === 'string' && body.groupId.trim() ? body.groupId.trim() : ''
  const fields: Record<string, string> = {}
  if (!categoryId) fields.categoryId = 'categoryId 为必填项'
  if (!groupId) fields.groupId = 'groupId 为必填项'
  if (Object.keys(fields).length > 0) throw validationError('分配规则字段校验失败', fields)
  const category = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM categories WHERE id = ?', params: [categoryId] })
  if (!category) throw validationError('问题分类不存在', { categoryId: 'categoryId 无效' })
  const group = await loadOwnedGroup(db, profile, groupId)
  return { categoryId, groupId: group.id }
}

export async function createAssignmentRule(db: DbClient, profile: Profile, body: Record<string, unknown>) {
  assertAdmin(profile)
  const { categoryId, groupId } = await readRuleInput(db, profile, body)
  const existing = await db.queryOne<{ id: string }>({
    text: 'SELECT id FROM assignment_rules WHERE company_id = ? AND category_id = ?',
    params: [profile.companyId, categoryId],
  })
  if (existing) throw conflict('rule_exists', '该分类已存在分配规则')
  const id = randomUUID()
  const now = new Date().toISOString()
  await db.run({
    text: 'INSERT INTO assignment_rules (id, company_id, category_id, group_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    params: [id, profile.companyId, categoryId, groupId, now, now],
  })
  audit('assignment_rule.created', profile, id, { categoryId, groupId })
  const row = await db.queryOne<RuleRow>({ text: `${RULE_SELECT} WHERE r.id = ?`, params: [id] })
  if (!row) throw new Error('assignment rule was not persisted')
  return presentRule(row)
}

export async function updateAssignmentRule(db: DbClient, profile: Profile, ruleId: string, body: Record<string, unknown>) {
  assertAdmin(profile)
  const rule = await db.queryOne<{ id: string; company_id: string; category_id: string }>({
    text: 'SELECT id, company_id, category_id FROM assignment_rules WHERE id = ?',
    params: [ruleId],
  })
  if (!rule) throw notFound('分配规则不存在')
  if (rule.company_id !== profile.companyId) throw forbidden('无权修改其他公司的分配规则')
  const { groupId } = await readRuleInput(db, profile, { categoryId: rule.category_id, groupId: body.groupId })
  await db.run({
    text: 'UPDATE assignment_rules SET group_id = ?, updated_at = ? WHERE id = ?',
    params: [groupId, new Date().toISOString(), rule.id],
  })
  audit('assignment_rule.updated', profile, rule.id, { groupId })
  const row = await db.queryOne<RuleRow>({ text: `${RULE_SELECT} WHERE r.id = ?`, params: [rule.id] })
  if (!row) throw new Error('assignment rule was not persisted')
  return presentRule(row)
}

export async function deleteAssignmentRule(db: DbClient, profile: Profile, ruleId: string) {
  assertAdmin(profile)
  const rule = await db.queryOne<{ id: string; company_id: string }>({
    text: 'SELECT id, company_id FROM assignment_rules WHERE id = ?',
    params: [ruleId],
  })
  if (!rule) throw notFound('分配规则不存在')
  if (rule.company_id !== profile.companyId) throw forbidden('无权删除其他公司的分配规则')
  await db.run({ text: 'DELETE FROM assignment_rules WHERE id = ?', params: [rule.id] })
  audit('assignment_rule.deleted', profile, rule.id)
  return { ok: true }
}

export async function listCompanies(db: DbClient, profile: Profile) {
  const rows = await db.queryAll<{ id: string; name: string; code: string }>({
    text: profile.role === 'ops' ? 'SELECT id, name, code FROM companies ORDER BY name ASC' : 'SELECT id, name, code FROM companies WHERE id = ? ORDER BY name ASC',
    params: profile.role === 'ops' ? [] : [profile.companyId],
  })
  return rows
}

export async function listDepartments(db: DbClient, profile: Profile, requestedCompanyId: string | undefined) {
  let companyId: string | undefined
  if (profile.role === 'ops') companyId = requestedCompanyId
  else companyId = profile.companyId
  const rows = await db.queryAll<{ id: string; company_id: string; name: string }>({
    text: companyId
      ? 'SELECT id, company_id, name FROM departments WHERE company_id = ? ORDER BY name ASC'
      : 'SELECT id, company_id, name FROM departments ORDER BY company_id ASC, name ASC',
    params: companyId ? [companyId] : [],
  })
  return rows.map((row) => ({ id: row.id, companyId: row.company_id, name: row.name }))
}
