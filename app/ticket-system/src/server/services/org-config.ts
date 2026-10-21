import type { DbClient } from '@commonapp/dbkit'
import { ApiError, conflict, notFound } from '../errors'

/** 契约 §3/§4/§5 组织配置：公司、分类字典、业务组、成员、分类自动分配规则。 */

export interface Company {
  id: number
  name: string
}

export interface Category {
  id: number
  name: string
}

export interface BusinessGroup {
  id: number
  name: string
  memberCount: number
}

export interface GroupMember {
  userId: string
  displayName: string
  email: string | null
  department: string | null
}

export interface RoutingRule {
  id: number
  categoryId: number
  categoryName: string
  groupId: number
  groupName: string
}

export async function listCompanies(db: DbClient): Promise<{ items: Company[] }> {
  const items = await db.queryAll<Company>({ text: 'SELECT id, name FROM companies ORDER BY id' })
  return { items }
}

export async function findCompany(db: DbClient, companyId: number): Promise<Company | null> {
  return db.queryOne<Company>({ text: 'SELECT id, name FROM companies WHERE id = ?', params: [companyId] })
}

export async function createCompany(db: DbClient, name: string): Promise<Company> {
  if (await db.queryOne({ text: 'SELECT 1 FROM companies WHERE name = ?', params: [name] })) {
    throw conflict('DUPLICATE_COMPANY', 'A company with this name already exists')
  }
  await db.run({
    text: 'INSERT INTO companies (name, created_at) VALUES (?, ?)',
    params: [name, new Date().toISOString()],
  })
  return { id: await lastId(db), name }
}

async function lastId(db: DbClient): Promise<number> {
  const row = await db.queryOne<{ id: number }>({ text: 'SELECT last_insert_rowid() AS id' })
  return Number(row?.id ?? 0)
}

export async function listCategories(db: DbClient): Promise<{ items: Category[] }> {
  const items = await db.queryAll<Category>({ text: 'SELECT id, name FROM categories ORDER BY sort_order, id' })
  return { items }
}

export async function findCategory(db: DbClient, categoryId: number): Promise<Category | null> {
  return db.queryOne<Category>({ text: 'SELECT id, name FROM categories WHERE id = ?', params: [categoryId] })
}

const groupRow = (id: number, name: string, memberCount: number): BusinessGroup => ({ id, name, memberCount })

export async function listGroups(db: DbClient, companyId: number): Promise<{ items: BusinessGroup[] }> {
  const company = await findCompany(db, companyId)
  if (!company) throw notFound('Company not found')
  const items = await db.queryAll<{ id: number; name: string; member_count: number }>({
    text: `SELECT bg.id, bg.name, COUNT(gm.id) AS member_count
           FROM business_groups bg
           LEFT JOIN group_members gm ON gm.group_id = bg.id
           WHERE bg.company_id = ?
           GROUP BY bg.id, bg.name
           ORDER BY bg.id`,
    params: [companyId],
  })
  return { items: items.map((row) => groupRow(row.id, row.name, Number(row.member_count))) }
}

export async function createGroup(db: DbClient, companyId: number, name: string): Promise<BusinessGroup> {
  const company = await findCompany(db, companyId)
  if (!company) throw notFound('Company not found')
  if (await db.queryOne({ text: 'SELECT 1 FROM business_groups WHERE company_id = ? AND name = ?', params: [companyId, name] })) {
    throw conflict('DUPLICATE_GROUP', 'A group with this name already exists in the company')
  }
  await db.run({
    text: 'INSERT INTO business_groups (company_id, name, created_at) VALUES (?, ?, ?)',
    params: [companyId, name, new Date().toISOString()],
  })
  return groupRow(await lastId(db), name, 0)
}

export async function renameGroup(db: DbClient, groupId: number, name: string): Promise<BusinessGroup> {
  const group = await db.queryOne<{ id: number; company_id: number }>({
    text: 'SELECT id, company_id FROM business_groups WHERE id = ?',
    params: [groupId],
  })
  if (!group) throw notFound('Group not found')
  if (await db.queryOne({ text: 'SELECT 1 FROM business_groups WHERE company_id = ? AND name = ? AND id <> ?', params: [group.company_id, name, groupId] })) {
    throw conflict('DUPLICATE_GROUP', 'A group with this name already exists in the company')
  }
  await db.run({ text: 'UPDATE business_groups SET name = ? WHERE id = ?', params: [name, groupId] })
  const members = await db.queryAll<{ one: number }>({ text: 'SELECT 1 AS one FROM group_members WHERE group_id = ?', params: [groupId] })
  return groupRow(groupId, name, members.length)
}

export async function deleteGroup(db: DbClient, groupId: number): Promise<void> {
  const group = await db.queryOne<{ id: number }>({ text: 'SELECT id FROM business_groups WHERE id = ?', params: [groupId] })
  if (!group) throw notFound('Group not found')
  const active = await db.queryOne<{ total: number }>({
    text: "SELECT COUNT(*) AS total FROM tickets WHERE assigned_group_id = ? AND status NOT IN ('completed', 'cancelled')",
    params: [groupId],
  })
  if (Number(active?.total ?? 0) > 0) {
    throw conflict('GROUP_HAS_TICKETS', 'The group still has assigned open tickets')
  }
  await db.transaction(async (tx) => {
    await tx.run({ text: 'DELETE FROM group_members WHERE group_id = ?', params: [groupId] })
    await tx.run({ text: 'DELETE FROM routing_rules WHERE group_id = ?', params: [groupId] })
    await tx.run({ text: 'DELETE FROM business_groups WHERE id = ?', params: [groupId] })
  })
}

export async function listMembers(db: DbClient, groupId: number): Promise<{ items: GroupMember[] }> {
  const group = await db.queryOne<{ id: number }>({ text: 'SELECT id FROM business_groups WHERE id = ?', params: [groupId] })
  if (!group) throw notFound('Group not found')
  const items = await db.queryAll<{
    user_id: string
    display_name: string | null
    profile_email: string | null
    platform_email: string | null
    department: string | null
  }>({
    text: `SELECT gm.user_id, up.display_name, up.email AS profile_email, u.email AS platform_email, up.department
           FROM group_members gm
           JOIN users u ON u.id = gm.user_id
           LEFT JOIN user_profiles up ON up.user_id = gm.user_id
           WHERE gm.group_id = ?
           ORDER BY u.created_at, gm.user_id`,
    params: [groupId],
  })
  return {
    items: items.map((row) => ({
      userId: row.user_id,
      displayName: row.display_name ?? row.platform_email ?? row.user_id,
      email: row.profile_email ?? row.platform_email,
      department: row.department,
    })),
  }
}

export async function addMember(db: DbClient, groupId: number, userId: string): Promise<GroupMember> {
  const group = await db.queryOne<{ id: number }>({ text: 'SELECT id FROM business_groups WHERE id = ?', params: [groupId] })
  if (!group) throw notFound('Group not found')
  const user = await db.queryOne<{ id: string; name: string; email: string | null }>({
    text: 'SELECT id, name, email FROM users WHERE id = ?',
    params: [userId],
  })
  if (!user) throw notFound('User not found')
  if (await db.queryOne({ text: 'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?', params: [groupId, userId] })) {
    throw conflict('DUPLICATE_MEMBER', 'The user is already a member of this group')
  }
  await db.run({
    text: 'INSERT INTO group_members (group_id, user_id, created_at) VALUES (?, ?, ?)',
    params: [groupId, userId, new Date().toISOString()],
  })
  const profile = await db.queryOne<{ display_name: string | null; email: string | null; department: string | null }>({
    text: 'SELECT display_name, email, department FROM user_profiles WHERE user_id = ?',
    params: [userId],
  })
  return {
    userId,
    displayName: profile?.display_name ?? user.name,
    email: profile?.email ?? user.email,
    department: profile?.department ?? null,
  }
}

export async function removeMember(db: DbClient, groupId: number, userId: string): Promise<void> {
  const result = await db.run({
    text: 'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
    params: [groupId, userId],
  })
  if (result.changes === 0) throw notFound('Group member not found')
}

const ruleSelect = `
  SELECT rr.id, rr.category_id, c.name AS category_name, rr.group_id, bg.name AS group_name
  FROM routing_rules rr
  JOIN categories c ON c.id = rr.category_id
  JOIN business_groups bg ON bg.id = rr.group_id`

export async function listRoutingRules(db: DbClient, companyId: number): Promise<{ items: RoutingRule[] }> {
  const company = await findCompany(db, companyId)
  if (!company) throw notFound('Company not found')
  const items = await db.queryAll<RoutingRule>({
    text: `${ruleSelect} WHERE rr.company_id = ? ORDER BY rr.id`,
    params: [companyId],
  })
  return { items }
}

export interface RuleInput {
  categoryId: number
  groupId: number
}

export async function createRoutingRule(db: DbClient, companyId: number, input: RuleInput): Promise<RoutingRule> {
  const company = await findCompany(db, companyId)
  if (!company) throw notFound('Company not found')
  const category = await findCategory(db, input.categoryId)
  if (!category) throw notFound('Category not found')
  const group = await db.queryOne<{ id: number; name: string; company_id: number }>({
    text: 'SELECT id, name, company_id FROM business_groups WHERE id = ?',
    params: [input.groupId],
  })
  if (!group) throw notFound('Group not found')
  if (group.company_id !== companyId) {
    throw new ApiError(400, 'RULE_GROUP_MISMATCH', 'The target group does not belong to this company')
  }
  if (await db.queryOne({ text: 'SELECT 1 FROM routing_rules WHERE company_id = ? AND category_id = ?', params: [companyId, input.categoryId] })) {
    throw conflict('DUPLICATE_RULE', 'A routing rule for this category already exists in the company')
  }
  await db.run({
    text: 'INSERT INTO routing_rules (company_id, category_id, group_id) VALUES (?, ?, ?)',
    params: [companyId, input.categoryId, input.groupId],
  })
  return {
    id: await lastId(db),
    categoryId: input.categoryId,
    categoryName: category.name,
    groupId: input.groupId,
    groupName: group.name,
  }
}

export async function updateRoutingRule(db: DbClient, ruleId: number, groupId: number): Promise<RoutingRule> {
  const rule = await db.queryOne<{ id: number; company_id: number; category_id: number }>({
    text: 'SELECT id, company_id, category_id FROM routing_rules WHERE id = ?',
    params: [ruleId],
  })
  if (!rule) throw notFound('Routing rule not found')
  const group = await db.queryOne<{ id: number; name: string; company_id: number }>({
    text: 'SELECT id, name, company_id FROM business_groups WHERE id = ?',
    params: [groupId],
  })
  if (!group) throw notFound('Group not found')
  if (group.company_id !== rule.company_id) {
    throw new ApiError(400, 'RULE_GROUP_MISMATCH', 'The target group does not belong to this company')
  }
  await db.run({ text: 'UPDATE routing_rules SET group_id = ? WHERE id = ?', params: [groupId, ruleId] })
  const category = await findCategory(db, rule.category_id)
  return {
    id: ruleId,
    categoryId: rule.category_id,
    categoryName: category?.name ?? '',
    groupId,
    groupName: group.name,
  }
}

export async function deleteRoutingRule(db: DbClient, ruleId: number): Promise<void> {
  const result = await db.run({ text: 'DELETE FROM routing_rules WHERE id = ?', params: [ruleId] })
  if (result.changes === 0) throw notFound('Routing rule not found')
}
