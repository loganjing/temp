import type { DbClient } from '@commonapp/dbkit'
import { duplicate, notFound, validationFailed } from './errors'
import type { Group, Rule } from './types'

// 组织与权限模块（契约第 4 节）：公司、用户组织档案、业务组与成员、分类、自动分配规则，
// 以及服务端角色计算与工单可见范围。公司隔离与组成员关系是唯一授权依据。

export type OrgProfile = { companyId: number; companyName: string; department: string; isCompanyAdmin: boolean }
export type IdentityGroup = { id: number; name: string; companyId: number }

export type Identity = {
  userId: string
  name: string
  email: string
  org: OrgProfile | null
  groups: IdentityGroup[]
}

/** 服务端角色计算（契约第 1 节）：从 user_org 与 group_members 取得身份与授权范围。 */
export async function loadIdentity(db: DbClient, userId: string): Promise<Identity> {
  const user = await db.queryOne<{ name: string; email: string }>({
    text: 'SELECT name, email FROM users WHERE id = ?',
    params: [userId],
  })
  const org = await db.queryOne<{ company_id: number; company_name: string; department: string; is_company_admin: number }>({
    text: `SELECT uo.company_id, c.name AS company_name, uo.department, uo.is_company_admin
           FROM user_org uo JOIN companies c ON c.id = uo.company_id
           WHERE uo.user_id = ?`,
    params: [userId],
  })
  const groups = await db.queryAll<{ id: number; name: string; company_id: number }>({
    text: `SELECT bg.id, bg.name, bg.company_id
           FROM business_groups bg JOIN group_members gm ON gm.group_id = bg.id
           WHERE gm.user_id = ? ORDER BY bg.id ASC`,
    params: [userId],
  })
  return {
    userId,
    name: user?.name ?? userId,
    email: user?.email ?? '',
    org: org
      ? {
          companyId: org.company_id,
          companyName: org.company_name,
          department: org.department,
          isCompanyAdmin: Boolean(org.is_company_admin),
        }
      : null,
    groups: groups.map((group) => ({ id: group.id, name: group.name, companyId: group.company_id })),
  }
}

export function isCompanyAdminOf(identity: Identity, companyId: number): boolean {
  return identity.org?.isCompanyAdmin === true && identity.org.companyId === companyId
}

export function isGroupMemberOf(identity: Identity, groupId: number | null): boolean {
  return groupId !== null && identity.groups.some((group) => group.id === groupId)
}

/** 工单可见范围（3.2）：本公司全部 ∪ 成员组所辖（组成员关系可跨公司）。参数为数据库行（snake_case）。 */
export function ticketVisibilityClause(identity: Identity): { clause: string; params: unknown[] } {
  const memberClause = 't.assigned_group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = ?)'
  if (identity.org) {
    return { clause: `(t.company_id = ? OR ${memberClause})`, params: [identity.org.companyId, identity.userId] }
  }
  if (identity.groups.length > 0) return { clause: memberClause, params: [identity.userId] }
  return { clause: '0 = 1', params: [] }
}

export function canViewTicket(identity: Identity, ticket: { company_id: number; assigned_group_id: number | null }): boolean {
  if (identity.org && ticket.company_id === identity.org.companyId) return true
  return isGroupMemberOf(identity, ticket.assigned_group_id)
}

export async function listCategories(db: DbClient): Promise<{ id: number; name: string }[]> {
  const rows = await db.queryAll<{ id: number; name: string }>({ text: 'SELECT id, name FROM categories ORDER BY id ASC' })
  return rows
}

export async function findCompany(db: DbClient, companyId: number): Promise<{ id: number; name: string } | null> {
  if (!Number.isInteger(companyId)) return null
  return db.queryOne<{ id: number; name: string }>({ text: 'SELECT id, name FROM companies WHERE id = ?', params: [companyId] })
}

async function insertReturningId(db: DbClient, text: string, params: unknown[]): Promise<number> {
  await db.run({ text, params })
  const row = await db.queryOne<{ id: number }>({ text: 'SELECT last_insert_rowid() AS id' })
  return Number(row?.id ?? 0)
}

export async function createGroup(db: DbClient, input: { companyId: number; name: string }): Promise<Group> {
  if (!await findCompany(db, input.companyId)) throw validationFailed('Company does not exist')
  const existing = await db.queryOne<{ id: number }>({
    text: 'SELECT id FROM business_groups WHERE company_id = ? AND name = ?',
    params: [input.companyId, input.name],
  })
  if (existing) throw duplicate('A group with this name already exists in the company')
  const id = await insertReturningId(
    db,
    'INSERT INTO business_groups (company_id, name, created_at) VALUES (?, ?, ?)',
    [input.companyId, input.name, new Date().toISOString()],
  )
  return { id, companyId: input.companyId, name: input.name, members: [] }
}

async function loadGroupRows(db: DbClient, where: string, params: unknown[]): Promise<Group[]> {
  const groups = await db.queryAll<{ id: number; company_id: number; name: string }>({
    text: `SELECT id, company_id, name FROM business_groups WHERE ${where} ORDER BY id ASC`,
    params,
  })
  if (groups.length === 0) return []
  const members = await db.queryAll<{ group_id: number; user_id: string; name: string }>({
    text: `SELECT gm.group_id, gm.user_id, u.name
           FROM group_members gm JOIN users u ON u.id = gm.user_id
           WHERE gm.group_id IN (${groups.map(() => '?').join(', ')})
           ORDER BY u.name ASC, gm.user_id ASC`,
    params: groups.map((group) => group.id),
  })
  return groups.map((group) => ({
    id: group.id,
    companyId: group.company_id,
    name: group.name,
    members: members
      .filter((member) => member.group_id === group.id)
      .map((member) => ({ userId: member.user_id, name: member.name })),
  }))
}

export async function listGroups(db: DbClient, companyId: number): Promise<Group[]> {
  return loadGroupRows(db, 'company_id = ?', [companyId])
}

export async function findGroup(db: DbClient, groupId: number): Promise<{ id: number; company_id: number; name: string } | null> {
  if (!Number.isInteger(groupId)) return null
  return db.queryOne<{ id: number; company_id: number; name: string }>({
    text: 'SELECT id, company_id, name FROM business_groups WHERE id = ?',
    params: [groupId],
  })
}

/** 设置业务组成员（4.4）：全量替换，成员可跨公司；不存在的账户返回 422。 */
export async function setGroupMembers(db: DbClient, groupId: number, userIds: string[]): Promise<Group> {
  const group = await findGroup(db, groupId)
  if (!group) throw notFound('Group not found')
  const uniqueIds = [...new Set(userIds)]
  const missing: string[] = []
  for (const userId of uniqueIds) {
    const user = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM users WHERE id = ?', params: [userId] })
    if (!user) missing.push(userId)
  }
  if (missing.length > 0) throw validationFailed(`Users do not exist: ${missing.join(', ')}`)
  const now = new Date().toISOString()
  await db.transaction(async (tx) => {
    await tx.run({ text: 'DELETE FROM group_members WHERE group_id = ?', params: [groupId] })
    for (const userId of uniqueIds) {
      await tx.run({ text: 'INSERT INTO group_members (group_id, user_id) VALUES (?, ?)', params: [groupId, userId] })
    }
  })
  const [result] = await loadGroupRows(db, 'id = ?', [groupId])
  return result
}

export async function createAssignmentRule(db: DbClient, input: { companyId: number; categoryId: number; groupId: number }): Promise<Rule> {
  if (!await findCompany(db, input.companyId)) throw validationFailed('Company does not exist')
  const category = await db.queryOne<{ id: number; name: string }>({
    text: 'SELECT id, name FROM categories WHERE id = ?',
    params: [input.categoryId],
  })
  if (!category) throw validationFailed('Category does not exist')
  const group = await findGroup(db, input.groupId)
  if (!group || group.company_id !== input.companyId) throw validationFailed('Group does not belong to the company')
  const existing = await db.queryOne<{ id: number }>({
    text: 'SELECT id FROM assignment_rules WHERE company_id = ? AND category_id = ?',
    params: [input.companyId, input.categoryId],
  })
  if (existing) throw duplicate('An assignment rule already exists for this category')
  const id = await insertReturningId(
    db,
    'INSERT INTO assignment_rules (company_id, category_id, group_id) VALUES (?, ?, ?)',
    [input.companyId, input.categoryId, input.groupId],
  )
  return { id, companyId: input.companyId, category: { id: category.id, name: category.name }, group: { id: group.id, name: group.name } }
}

export async function listAssignmentRules(db: DbClient, companyId: number): Promise<Rule[]> {
  return db.queryAll<{ id: number; companyId: number; categoryId: number; categoryName: string; groupId: number; groupName: string }>({
    text: `SELECT ar.id, ar.company_id, c.id AS categoryId, c.name AS categoryName, bg.id AS groupId, bg.name AS groupName
           FROM assignment_rules ar
           JOIN categories c ON c.id = ar.category_id
           JOIN business_groups bg ON bg.id = ar.group_id
           WHERE ar.company_id = ? ORDER BY ar.id ASC`,
    params: [companyId],
  }).then((rows) => rows.map((row) => ({
    id: row.id,
    companyId: row.companyId,
    category: { id: row.categoryId, name: row.categoryName },
    group: { id: row.groupId, name: row.groupName },
  })))
}

/** 设置用户组织档案（4.7）：upsert。 */
export async function setUserOrg(
  db: DbClient,
  userId: string,
  input: { companyId: number; department: string; isCompanyAdmin: boolean },
): Promise<{ userId: string; companyId: number; companyName: string; department: string; isCompanyAdmin: boolean }> {
  const company = await findCompany(db, input.companyId)
  if (!company) throw validationFailed('Company does not exist')
  const user = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM users WHERE id = ?', params: [userId] })
  if (!user) throw validationFailed('User does not exist')
  const now = new Date().toISOString()
  await db.run({
    text: `INSERT INTO user_org (user_id, company_id, department, is_company_admin, created_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET company_id = excluded.company_id, department = excluded.department,
             is_company_admin = excluded.is_company_admin`,
    params: [userId, input.companyId, input.department, input.isCompanyAdmin ? 1 : 0, now],
  })
  return {
    userId,
    companyId: company.id,
    companyName: company.name,
    department: input.department,
    isCompanyAdmin: input.isCompanyAdmin,
  }
}

/** 公司用户目录（4.8）：全部账户（含未设置组织档案的），便于将未入组用户纳入本公司管理。 */
export async function listCompanyUsers(db: DbClient): Promise<
  { id: string; name: string; email: string; org: { companyId: number; companyName: string; department: string; isCompanyAdmin: boolean } | null }[]
> {
  const rows = await db.queryAll<{
    id: string
    name: string
    email: string
    company_id: number | null
    company_name: string | null
    department: string | null
    is_company_admin: number | null
  }>({
    text: `SELECT u.id, u.name, u.email, uo.company_id, c.name AS company_name, uo.department, uo.is_company_admin
           FROM users u
           LEFT JOIN user_org uo ON uo.user_id = u.id
           LEFT JOIN companies c ON c.id = uo.company_id
           ORDER BY u.name ASC, u.id ASC`,
  })
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    org: row.company_id !== null && row.company_id !== undefined
      ? {
          companyId: row.company_id,
          companyName: row.company_name ?? '',
          department: row.department ?? '',
          isCompanyAdmin: Boolean(row.is_company_admin),
        }
      : null,
  }))
}
