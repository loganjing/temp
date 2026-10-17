import type { Hono } from 'hono'
import type { DbClient } from '@commonapp/dbkit'
import type { BootstrapResponse, BusinessGroup, CompanyGroupsResponse, CreateGroupResponse, CreateUserResponse, User } from '../../shared/contract'
import { apiError } from '../api-error'
import { newId } from '../ids'
import { optionalString, readJson, requireString, requireStringArray } from '../request'

// organizations：公司、用户资料、业务组与成员的维护与查询（架构基线 2.2）。
// 独占 companies / users / business_groups / group_members 表；其他模块经此处导出函数访问，不直读表。

export interface CompanyRow {
  id: string
  name: string
  created_at: string
}

export interface UserRow {
  id: string
  name: string
  email: string
  company_id: string
  department: string | null
  created_at: string
}

export interface GroupRow {
  id: string
  company_id: string
  name: string
  created_at: string
}

export function toUser(row: UserRow): User {
  return { id: row.id, name: row.name, email: row.email, companyId: row.company_id, department: row.department }
}

export async function findCompanyById(db: DbClient, id: string): Promise<CompanyRow | null> {
  return db.queryOne<CompanyRow>({ text: 'SELECT id, name, created_at FROM companies WHERE id = ?', params: [id] })
}

export async function requireCompany(db: DbClient, id: string): Promise<CompanyRow> {
  const company = await findCompanyById(db, id)
  if (!company) throw apiError.notFound('公司不存在')
  return company
}

export async function findUserById(db: DbClient, id: string): Promise<UserRow | null> {
  return db.queryOne<UserRow>({
    text: 'SELECT id, name, email, company_id, department, created_at FROM users WHERE id = ?',
    params: [id],
  })
}

export async function requireUser(db: DbClient, id: string, label = '用户'): Promise<UserRow> {
  const user = await findUserById(db, id)
  if (!user) throw apiError.notFound(`${label}不存在`)
  return user
}

export async function findUserByEmail(db: DbClient, email: string): Promise<UserRow | null> {
  return db.queryOne<UserRow>({
    text: 'SELECT id, name, email, company_id, department, created_at FROM users WHERE email = ?',
    params: [email],
  })
}

export async function findUsersByIds(db: DbClient, ids: readonly string[]): Promise<Map<string, UserRow>> {
  if (ids.length === 0) return new Map()
  const placeholders = ids.map(() => '?').join(', ')
  const rows = await db.queryAll<UserRow>({
    text: `SELECT id, name, email, company_id, department, created_at FROM users WHERE id IN (${placeholders})`,
    params: [...ids],
  })
  return new Map(rows.map((row) => [row.id, row]))
}

export async function findGroupById(db: DbClient, id: string): Promise<GroupRow | null> {
  return db.queryOne<GroupRow>({
    text: 'SELECT id, company_id, name, created_at FROM business_groups WHERE id = ?',
    params: [id],
  })
}

export async function requireGroup(db: DbClient, id: string): Promise<GroupRow> {
  const group = await findGroupById(db, id)
  if (!group) throw apiError.notFound('业务组不存在')
  return group
}

/** 成员在该公司的所属业务组（转派给成员时以其所属业务组为归属组）。 */
export async function findMemberGroupId(db: DbClient, userId: string, companyId: string): Promise<string | null> {
  const row = await db.queryOne<{ id: string }>({
    text: `SELECT bg.id AS id
           FROM group_members gm JOIN business_groups bg ON bg.id = gm.group_id
           WHERE gm.user_id = ? AND bg.company_id = ?
           ORDER BY gm.created_at ASC LIMIT 1`,
    params: [userId, companyId],
  })
  return row?.id ?? null
}

/** 提交人按邮箱归并/新建 users 记录（AD-3）：邮箱已存在则更新姓名与部门，否则新建并取操作者所属公司。 */
export async function upsertSubmitterByEmail(
  db: DbClient,
  input: { name: string; email: string; department: string | null; companyId: string },
): Promise<UserRow> {
  const existing = await findUserByEmail(db, input.email)
  if (existing) {
    await db.run({
      text: 'UPDATE users SET name = ?, department = ? WHERE id = ?',
      params: [input.name, input.department, existing.id],
    })
    return { ...existing, name: input.name, department: input.department }
  }
  const id = newId()
  const createdAt = new Date().toISOString()
  await db.run({
    text: 'INSERT INTO users (id, name, email, company_id, department, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    params: [id, input.name, input.email, input.companyId, input.department, createdAt],
  })
  return { id, name: input.name, email: input.email, company_id: input.companyId, department: input.department, created_at: createdAt }
}

async function memberIdsByGroup(db: DbClient, groupIds: readonly string[]): Promise<Map<string, string[]>> {
  const memberIds = new Map<string, string[]>(groupIds.map((id) => [id, []]))
  if (groupIds.length === 0) return memberIds
  const placeholders = groupIds.map(() => '?').join(', ')
  const rows = await db.queryAll<{ group_id: string; user_id: string }>({
    text: `SELECT group_id, user_id FROM group_members WHERE group_id IN (${placeholders}) ORDER BY created_at`,
    params: [...groupIds],
  })
  for (const row of rows) memberIds.get(row.group_id)?.push(row.user_id)
  return memberIds
}

export function registerOrganizationsRoutes(app: Hono, db: DbClient) {
  app.get('/api/bootstrap', async (c) => {
    const [companies, users, groups] = await Promise.all([
      db.queryAll<CompanyRow>({ text: 'SELECT id, name, created_at FROM companies ORDER BY created_at' }),
      db.queryAll<UserRow>({ text: 'SELECT id, name, email, company_id, department, created_at FROM users ORDER BY created_at' }),
      db.queryAll<GroupRow>({ text: 'SELECT id, company_id, name, created_at FROM business_groups ORDER BY created_at' }),
    ])
    const memberIds = await memberIdsByGroup(db, groups.map((group) => group.id))
    const response: BootstrapResponse = {
      companies: companies.map((row) => ({ id: row.id, name: row.name })),
      users: users.map(toUser),
      groups: groups.map((row): BusinessGroup => ({
        id: row.id,
        companyId: row.company_id,
        name: row.name,
        memberIds: memberIds.get(row.id) ?? [],
      })),
    }
    return c.json(response)
  })

  app.post('/api/users', async (c) => {
    const body = await readJson(c)
    const name = requireString(body, 'name')
    const email = requireString(body, 'email')
    const companyId = requireString(body, 'companyId')
    const department = optionalString(body, 'department')
    await requireCompany(db, companyId)
    if (await findUserByEmail(db, email)) throw apiError.conflict('邮箱已存在')
    const id = newId()
    const createdAt = new Date().toISOString()
    await db.run({
      text: 'INSERT INTO users (id, name, email, company_id, department, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      params: [id, name, email, companyId, department, createdAt],
    })
    const response: CreateUserResponse = { id, name, email, companyId, department, createdAt }
    return c.json(response, 201)
  })

  app.get('/api/companies/:id/groups', async (c) => {
    const company = await requireCompany(db, c.req.param('id'))
    const groups = await db.queryAll<GroupRow>({
      text: 'SELECT id, company_id, name, created_at FROM business_groups WHERE company_id = ? ORDER BY created_at',
      params: [company.id],
    })
    const memberIds = await memberIdsByGroup(db, groups.map((group) => group.id))
    const response: CompanyGroupsResponse = {
      groups: groups.map((row) => ({ id: row.id, name: row.name, memberIds: memberIds.get(row.id) ?? [] })),
    }
    return c.json(response)
  })

  app.post('/api/companies/:id/groups', async (c) => {
    const body = await readJson(c)
    const name = requireString(body, 'name')
    const company = await requireCompany(db, c.req.param('id'))
    const id = newId()
    const createdAt = new Date().toISOString()
    await db.run({
      text: 'INSERT INTO business_groups (id, company_id, name, created_at) VALUES (?, ?, ?, ?)',
      params: [id, company.id, name, createdAt],
    })
    const response: CreateGroupResponse = { id, companyId: company.id, name, memberIds: [], createdAt }
    return c.json(response, 201)
  })

  app.post('/api/groups/:id/members', async (c) => {
    const group = await requireGroup(db, c.req.param('id'))
    const body = await readJson(c)
    const userIds = [...new Set(requireStringArray(body, 'userIds'))]
    for (const userId of userIds) {
      const user = await requireUser(db, userId)
      if (user.company_id !== group.company_id) throw apiError.validation('业务组成员须属于该公司')
    }
    const createdAt = new Date().toISOString()
    await db.transaction(async (tx) => {
      await tx.run({ text: 'DELETE FROM group_members WHERE group_id = ?', params: [group.id] })
      for (const userId of userIds) {
        await tx.run({
          text: 'INSERT INTO group_members (id, group_id, user_id, created_at) VALUES (?, ?, ?, ?)',
          params: [newId(), group.id, userId, createdAt],
        })
      }
    })
    return c.json({ id: group.id, memberIds: userIds })
  })
}
