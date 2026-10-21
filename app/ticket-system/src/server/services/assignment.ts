import type { DbClient } from '@commonapp/dbkit'
import { notFound, stateConflict, validationError } from '../errors'

export type GroupMember = { id: number; username: string; fullName: string; department: string }
export type GroupInfo = {
  id: number
  name: string
  description: string
  memberCount: number
  members: GroupMember[]
  createdAt: string
}
export type RuleInfo = {
  id: number
  categoryId: number
  categoryName: string
  groupId: number
  groupName: string
  createdAt: string
}
export type CategoryInfo = { id: number; code: string; name: string }
export type CompanyUser = { id: number; username: string; fullName: string; email: string; department: string }

type GroupRow = {
  id: number
  name: string
  description: string
  createdAt: string
  memberId: number | null
  memberUsername: string | null
  memberFullName: string | null
  memberDepartment: string | null
}

async function loadGroups(db: DbClient, companyId: number, groupId?: number): Promise<GroupInfo[]> {
  const conditions = ['g.company_id = ?']
  const params: unknown[] = [companyId]
  if (groupId !== undefined) {
    conditions.push('g.id = ?')
    params.push(groupId)
  }
  const rows = await db.queryAll<GroupRow>({
    text: `SELECT g.id, g.name, g.description, g.created_at AS createdAt,
        m.user_id AS memberId, u.username AS memberUsername, u.full_name AS memberFullName, u.department AS memberDepartment
      FROM business_groups g
      LEFT JOIN business_group_members m ON m.group_id = g.id
      LEFT JOIN users u ON u.id = m.user_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY g.id ASC, m.user_id ASC`,
    params,
  })
  const groups = new Map<number, GroupInfo>()
  for (const row of rows) {
    let group = groups.get(row.id)
    if (!group) {
      group = { id: row.id, name: row.name, description: row.description, memberCount: 0, members: [], createdAt: row.createdAt }
      groups.set(row.id, group)
    }
    if (row.memberId !== null) {
      group.members.push({
        id: row.memberId,
        username: row.memberUsername ?? '',
        fullName: row.memberFullName ?? '',
        department: row.memberDepartment ?? '',
      })
    }
  }
  return [...groups.values()].map((group) => ({ ...group, memberCount: group.members.length }))
}

export async function listGroups(db: DbClient, companyId: number): Promise<GroupInfo[]> {
  return loadGroups(db, companyId)
}

export async function requireGroupForCompany(db: DbClient, groupId: number, companyId: number): Promise<void> {
  const row = await db.queryOne<{ id: number }>({
    text: 'SELECT id FROM business_groups WHERE id = ? AND company_id = ?',
    params: [groupId, companyId],
  })
  if (!row) throw notFound('业务组不存在或无权限')
}

export async function createGroup(db: DbClient, companyId: number, input: { name: string; description: string }): Promise<GroupInfo> {
  const existing = await db.queryOne<{ id: number }>({
    text: 'SELECT id FROM business_groups WHERE company_id = ? AND name = ?',
    params: [companyId, input.name],
  })
  if (existing) throw stateConflict('本公司同名业务组已存在')
  await db.run({
    text: 'INSERT INTO business_groups (company_id, name, description, created_at) VALUES (?, ?, ?, ?)',
    params: [companyId, input.name, input.description, new Date().toISOString()],
  })
  const { id } = (await db.queryOne<{ id: number }>({ text: 'SELECT last_insert_rowid() AS id' }))!
  const groups = await loadGroups(db, companyId, id)
  return groups[0]
}

export async function addGroupMembers(db: DbClient, companyId: number, groupId: number, userIds: number[]): Promise<GroupInfo> {
  await requireGroupForCompany(db, groupId, companyId)
  const distinctIds = [...new Set(userIds)]
  const placeholders = distinctIds.map(() => '?').join(', ')
  const found = await db.queryAll<{ id: number }>({
    text: `SELECT id FROM users WHERE company_id = ? AND id IN (${placeholders})`,
    params: [companyId, ...distinctIds],
  })
  if (found.length !== distinctIds.length) throw validationError('包含非本公司用户')
  const now = new Date().toISOString()
  for (const userId of distinctIds) {
    await db.run({
      text: 'INSERT OR IGNORE INTO business_group_members (group_id, user_id, created_at) VALUES (?, ?, ?)',
      params: [groupId, userId, now],
    })
  }
  const groups = await loadGroups(db, companyId, groupId)
  return groups[0]
}

export async function removeGroupMember(db: DbClient, companyId: number, groupId: number, userId: number): Promise<void> {
  await requireGroupForCompany(db, groupId, companyId)
  const result = await db.run({
    text: 'DELETE FROM business_group_members WHERE group_id = ? AND user_id = ?',
    params: [groupId, userId],
  })
  if (result.changes === 0) throw notFound('成员关系不存在或无权限')
}

export async function listRules(db: DbClient, companyId: number): Promise<RuleInfo[]> {
  return db.queryAll<RuleInfo>({
    text: `SELECT r.id, r.category_id AS categoryId, c.name AS categoryName, r.group_id AS groupId, g.name AS groupName, r.created_at AS createdAt
      FROM assignment_rules r
      JOIN categories c ON c.id = r.category_id
      JOIN business_groups g ON g.id = r.group_id
      WHERE r.company_id = ?
      ORDER BY r.id ASC`,
    params: [companyId],
  })
}

// 本公司"分类 → 业务组"规则 upsert：已存在则改指向。
export async function upsertRule(db: DbClient, companyId: number, categoryId: number, groupId: number): Promise<RuleInfo> {
  const category = await db.queryOne<{ id: number }>({ text: 'SELECT id FROM categories WHERE id = ?', params: [categoryId] })
  if (!category) throw validationError('问题分类不存在')
  const group = await db.queryOne<{ id: number }>({
    text: 'SELECT id FROM business_groups WHERE id = ? AND company_id = ?',
    params: [groupId, companyId],
  })
  if (!group) throw notFound('业务组不存在或无权限')
  await db.run({
    text: `INSERT INTO assignment_rules (company_id, category_id, group_id, created_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(company_id, category_id) DO UPDATE SET group_id = excluded.group_id`,
    params: [companyId, categoryId, groupId, new Date().toISOString()],
  })
  return (await db.queryOne<RuleInfo>({
    text: `SELECT r.id, r.category_id AS categoryId, c.name AS categoryName, r.group_id AS groupId, g.name AS groupName, r.created_at AS createdAt
      FROM assignment_rules r
      JOIN categories c ON c.id = r.category_id
      JOIN business_groups g ON g.id = r.group_id
      WHERE r.company_id = ? AND r.category_id = ?`,
    params: [companyId, categoryId],
  }))!
}

export async function deleteRule(db: DbClient, companyId: number, categoryId: number): Promise<void> {
  const result = await db.run({
    text: 'DELETE FROM assignment_rules WHERE company_id = ? AND category_id = ?',
    params: [companyId, categoryId],
  })
  if (result.changes === 0) throw notFound('分配规则不存在')
}

// 按分类自动分配解析：命中返回目标组 id，未命中返回 null（工单停留待分配）。
export async function resolveAutoAssignGroupId(db: DbClient, companyId: number, categoryId: number): Promise<number | null> {
  const row = await db.queryOne<{ groupId: number }>({
    text: 'SELECT group_id AS groupId FROM assignment_rules WHERE company_id = ? AND category_id = ?',
    params: [companyId, categoryId],
  })
  return row?.groupId ?? null
}

export async function listCategories(db: DbClient): Promise<CategoryInfo[]> {
  return db.queryAll<CategoryInfo>({ text: 'SELECT id, code, name FROM categories ORDER BY id ASC' })
}

export async function requireCategory(db: DbClient, categoryId: number): Promise<void> {
  const row = await db.queryOne<{ id: number }>({ text: 'SELECT id FROM categories WHERE id = ?', params: [categoryId] })
  if (!row) throw validationError('问题分类不存在')
}

export async function listCompanyUsers(db: DbClient, companyId: number): Promise<CompanyUser[]> {
  return db.queryAll<CompanyUser>({
    text: 'SELECT id, username, full_name AS fullName, email, department FROM users WHERE company_id = ? ORDER BY id ASC',
    params: [companyId],
  })
}
