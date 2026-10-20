import type { DbClient } from '@commonapp/dbkit'
import { conflict, notFound, validation } from './http'

// assignment：分配流程（进入待分配 + 公司级「分类→业务组」规则匹配）、转派与业务组/分类/规则配置。
export type GroupMember = { userId: string; displayName: string }

export type Group = {
  id: number
  name: string
  memberCount: number
  members: GroupMember[]
}

export type CategoryRule = { id: number; category: string; groupId: number; groupName: string }

type GroupRow = { id: number; company_id: number; name: string }
type MemberRow = { user_id: string; display_name: string }
type RuleRow = { id: number; category: string; group_id: number; group_name: string }
type ProfileRow = { user_id: string; display_name: string }

const now = () => new Date().toISOString()

export async function getGroup(db: DbClient, groupId: number, companyId: number): Promise<GroupRow | null> {
  return db.queryOne<GroupRow>({ text: 'SELECT id, company_id, name FROM groups WHERE id = ? AND company_id = ?', params: [groupId, companyId] })
}

async function requireGroup(db: DbClient, groupId: number, companyId: number): Promise<GroupRow> {
  const group = await getGroup(db, groupId, companyId)
  if (!group) throw notFound('Group not found')
  return group
}

export async function listGroups(db: DbClient, companyId: number): Promise<Group[]> {
  const groups = await db.queryAll<GroupRow>({
    text: 'SELECT id, company_id, name FROM groups WHERE company_id = ? ORDER BY name, id',
    params: [companyId],
  })
  const members = await db.queryAll<MemberRow & { group_id: number }>({
    text: `SELECT m.group_id, m.user_id, p.display_name
           FROM group_members m JOIN user_profiles p ON p.user_id = m.user_id
           WHERE p.company_id = ?
           ORDER BY p.display_name, m.user_id`,
    params: [companyId],
  })
  return groups.map((group) => {
    const own = members.filter((member) => member.group_id === group.id)
    return {
      id: group.id,
      name: group.name,
      memberCount: own.length,
      members: own.map((member) => ({ userId: member.user_id, displayName: member.display_name })),
    }
  })
}

export async function createGroup(db: DbClient, companyId: number, name: string): Promise<Group> {
  const existing = await db.queryOne<{ id: number }>({ text: 'SELECT id FROM groups WHERE company_id = ? AND name = ?', params: [companyId, name] })
  if (existing) throw conflict('A group with this name already exists')
  const row = await db.queryOne<{ id: number }>({
    text: 'INSERT INTO groups (company_id, name, created_at) VALUES (?, ?, ?) RETURNING id',
    params: [companyId, name, now()],
  })
  if (!row) throw new Error('Failed to create group')
  return { id: row.id, name, memberCount: 0, members: [] }
}

// 全量替换成员（契约 §4.3 PUT /api/groups/:id/members）。
export async function setGroupMembers(db: DbClient, companyId: number, groupId: number, userIds: string[]): Promise<Group> {
  await requireGroup(db, groupId, companyId)
  if (!Array.isArray(userIds) || userIds.some((id) => typeof id !== 'string' || !id.trim())) {
    throw validation('userIds must be an array of user identifiers')
  }
  const uniqueIds = [...new Set(userIds.map((id) => id.trim()))]
  if (uniqueIds.length > 0) {
    const placeholders = uniqueIds.map(() => '?').join(', ')
    const profiles = await db.queryAll<ProfileRow>({
      text: `SELECT user_id, display_name FROM user_profiles WHERE company_id = ? AND user_id IN (${placeholders})`,
      params: [companyId, ...uniqueIds],
    })
    if (profiles.length !== uniqueIds.length) throw validation('userIds contains users outside this company')
  }
  const members = await db.transaction(async (tx) => {
    await tx.run({ text: 'DELETE FROM group_members WHERE group_id = ?', params: [groupId] })
    for (const userId of uniqueIds) {
      await tx.run({ text: 'INSERT INTO group_members (group_id, user_id) VALUES (?, ?)', params: [groupId, userId] })
    }
    return tx.queryAll<MemberRow>({
      text: `SELECT m.user_id, p.display_name FROM group_members m JOIN user_profiles p ON p.user_id = m.user_id WHERE m.group_id = ? ORDER BY p.display_name, m.user_id`,
      params: [groupId],
    })
  })
  const group = await requireGroup(db, groupId, companyId)
  return {
    id: group.id,
    name: group.name,
    memberCount: members.length,
    members: members.map((member) => ({ userId: member.user_id, displayName: member.display_name })),
  }
}

export async function deleteGroup(db: DbClient, companyId: number, groupId: number): Promise<void> {
  await requireGroup(db, groupId, companyId)
  const referenced = await db.queryOne<{ total: number }>({
    text: 'SELECT COUNT(*) AS total FROM category_rules WHERE company_id = ? AND group_id = ?',
    params: [companyId, groupId],
  })
  if (Number(referenced?.total ?? 0) > 0) throw conflict('Group is still referenced by category rules')
  await db.transaction(async (tx) => {
    await tx.run({ text: 'DELETE FROM group_members WHERE group_id = ?', params: [groupId] })
    await tx.run({ text: 'DELETE FROM groups WHERE id = ? AND company_id = ?', params: [groupId, companyId] })
  })
}

export async function listCategories(db: DbClient, companyId: number): Promise<string[]> {
  const rows = await db.queryAll<{ category: string }>({
    text: 'SELECT category FROM company_categories WHERE company_id = ? ORDER BY category',
    params: [companyId],
  })
  return rows.map((row) => row.category)
}

export async function addCategory(db: DbClient, companyId: number, category: string): Promise<string> {
  const existing = await db.queryOne<{ category: string }>({
    text: 'SELECT category FROM company_categories WHERE company_id = ? AND category = ?',
    params: [companyId, category],
  })
  if (existing) throw conflict('Category already exists')
  await db.run({ text: 'INSERT INTO company_categories (company_id, category) VALUES (?, ?)', params: [companyId, category] })
  return category
}

export async function deleteCategory(db: DbClient, companyId: number, category: string): Promise<void> {
  const existing = await db.queryOne<{ category: string }>({
    text: 'SELECT category FROM company_categories WHERE company_id = ? AND category = ?',
    params: [companyId, category],
  })
  if (!existing) throw notFound('Category not found')
  const referenced = await db.queryOne<{ total: number }>({
    text: 'SELECT COUNT(*) AS total FROM category_rules WHERE company_id = ? AND category = ?',
    params: [companyId, category],
  })
  if (Number(referenced?.total ?? 0) > 0) throw conflict('Category is still referenced by rules')
  await db.run({ text: 'DELETE FROM company_categories WHERE company_id = ? AND category = ?', params: [companyId, category] })
}

export async function listRules(db: DbClient, companyId: number): Promise<CategoryRule[]> {
  const rows = await db.queryAll<RuleRow>({
    text: `SELECT r.id, r.category, r.group_id, g.name AS group_name
           FROM category_rules r JOIN groups g ON g.id = r.group_id
           WHERE r.company_id = ? ORDER BY r.category`,
    params: [companyId],
  })
  return rows.map((row) => ({ id: row.id, category: row.category, groupId: row.group_id, groupName: row.group_name }))
}

// 存在则更新，不存在则创建（契约 §4.3 PUT /api/category-rules/:category）。
export async function upsertRule(db: DbClient, companyId: number, category: string, groupId: number): Promise<CategoryRule> {
  const inList = await db.queryOne<{ category: string }>({
    text: 'SELECT category FROM company_categories WHERE company_id = ? AND category = ?',
    params: [companyId, category],
  })
  if (!inList) throw validation('Category is not in the company category list')
  const group = await getGroup(db, groupId, companyId)
  if (!group) throw validation('Group does not belong to this company')
  const existing = await db.queryOne<{ id: number }>({
    text: 'SELECT id FROM category_rules WHERE company_id = ? AND category = ?',
    params: [companyId, category],
  })
  let ruleId: number
  if (existing) {
    await db.run({ text: 'UPDATE category_rules SET group_id = ? WHERE id = ?', params: [groupId, existing.id] })
    ruleId = existing.id
  } else {
    const row = await db.queryOne<{ id: number }>({
      text: 'INSERT INTO category_rules (company_id, category, group_id) VALUES (?, ?, ?) RETURNING id',
      params: [companyId, category, groupId],
    })
    if (!row) throw new Error('Failed to create category rule')
    ruleId = row.id
  }
  return { id: ruleId, category, groupId: group.id, groupName: group.name }
}

export async function deleteRule(db: DbClient, companyId: number, category: string): Promise<void> {
  const result = await db.run({ text: 'DELETE FROM category_rules WHERE company_id = ? AND category = ?', params: [companyId, category] })
  if (result.changes === 0) throw notFound('Category rule not found')
}

// 契约 §3：规则命中查询（dispatch 内使用）。
export function findRuleByCategory(db: DbClient, companyId: number, category: string) {
  return db.queryOne<{ group_id: number; group_name: string }>({
    text: `SELECT r.group_id, g.name AS group_name FROM category_rules r JOIN groups g ON g.id = r.group_id
           WHERE r.company_id = ? AND r.category = ?`,
    params: [companyId, category],
  })
}

export function isGroupMember(db: DbClient, groupId: number, userId: string) {
  return db.queryOne<{ user_id: string }>({ text: 'SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ?', params: [groupId, userId] })
}
