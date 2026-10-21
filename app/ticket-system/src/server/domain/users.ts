import type { Context, Hono } from 'hono'
import type { DbClient } from '@commonapp/dbkit'
import { currentAuthUser, escapeLike, requireCompanyContext } from './support'

// 用户域（契约第 1 节）：UserProfile 组装与本公司用户列表。

export type UserProfile = {
  userId: number
  name: string
  email: string
  companyId: number | null
  companyName: string
  department: string
}

export type UserProfileSummary = { userId: number; name: string; email: string; department: string }

type ProfileRow = {
  user_no: number
  name: string
  email: string
  department: string
  company_id: number | null
  company_name: string | null
}

export async function getUserProfile(db: DbClient, userId: string): Promise<UserProfile | null> {
  const row = await db.queryOne<ProfileRow>({
    text: `SELECT u.user_no, u.name, u.email, u.department, c.id AS company_id, c.name AS company_name
           FROM users u LEFT JOIN companies c ON c.id = CAST(u.company_id AS INTEGER)
           WHERE u.id = ?`,
    params: [userId],
  })
  if (!row) return null
  return {
    userId: row.user_no,
    name: row.name,
    email: row.email,
    companyId: row.company_id ?? null,
    companyName: row.company_name ?? '',
    department: row.department ?? '',
  }
}

export type UserDeps = { db: DbClient }

export function registerUserRoutes(app: Hono, deps: UserDeps) {
  // 本公司用户列表（业务组成员选择等）：keyword 按姓名/邮箱前缀过滤。
  app.get('/api/users', async (context: Context) => {
    const company = await requireCompanyContext(deps.db, currentAuthUser(context))
    const keyword = (context.req.query('keyword') ?? '').trim()
    const like = keyword ? `${escapeLike(keyword)}%` : '%'
    const rows = await deps.db.queryAll<{ user_no: number; name: string; email: string; department: string }>({
      text: `SELECT u.user_no, u.name, u.email, u.department
             FROM users u
             WHERE CAST(u.company_id AS INTEGER) = ?
               AND (u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')
             ORDER BY u.name ASC, u.user_no ASC`,
      params: [company.companyId, like, like],
    })
    const items: UserProfileSummary[] = rows.map((row) => ({
      userId: row.user_no,
      name: row.name,
      email: row.email,
      department: row.department ?? '',
    }))
    return context.json({ items })
  })
}
