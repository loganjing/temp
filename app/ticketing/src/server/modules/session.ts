import type { DbClient } from '@commonapp/dbkit'
import type { AuthUser } from '@commonapp/userkit'

export interface SessionUser {
  id: string
  name: string
  email: string
  companyId: number | null
  companyName: string | null
  department: string
  groupIds: number[]
}

interface SessionRow {
  department: string | null
  company_id: string | null
  company_name: string | null
}

// 从可信身份（authkit 注入的 currentUser）出发，加载公司、部门与所属业务组。
// companyId 来自 users 表（userkit 维护），不取自请求参数。
export async function loadSessionUser(db: DbClient, authUser: AuthUser): Promise<SessionUser> {
  const row = await db.queryOne<SessionRow>({
    text: `SELECT u.department AS department, u.company_id AS company_id, c.name AS company_name
           FROM users u LEFT JOIN companies c ON c.id = u.company_id WHERE u.id = ?`,
    params: [authUser.id],
  })
  const groupRows = await db.queryAll<{ id: number }>({
    text: 'SELECT group_id AS id FROM group_members WHERE user_id = ?',
    params: [authUser.id],
  })
  const companyId = row?.company_id != null && row.company_id !== '' ? Number(row.company_id) : null
  return {
    id: authUser.id,
    name: authUser.name,
    email: authUser.email,
    companyId,
    companyName: row?.company_name ?? null,
    department: row?.department ?? '',
    groupIds: groupRows.map((r) => r.id),
  }
}
