import type { DbClient } from '@commonapp/dbkit'
import type { CurrentUser } from '../platform/auth'
import { forbidden } from '../errors'
import { escapeLike } from '../util'
import type { MeUser, UserItem } from '../../shared/contracts'

export interface ListUsersQuery {
  companyId?: string
  q?: string
}

/** 身份与用户域：me 与 handler/admin 用户列表查询（契约 §2.2/§2.3）。 */
export function createUserService(db: DbClient) {
  async function getMe(user: CurrentUser): Promise<MeUser> {
    const row = await db.queryOne<{ department: string | null; companyName: string | null }>({
      text: `SELECT up.department AS department, c.name AS companyName
             FROM users u
             LEFT JOIN user_profiles up ON up.user_id = u.id
             LEFT JOIN companies c ON c.id = u.company_id
             WHERE u.id = ?`,
      params: [user.id],
    })
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      department: row?.department ?? null,
      companyName: row?.companyName ?? null,
      status: user.status,
    }
  }

  async function listUsers(actor: CurrentUser, query: ListUsersQuery): Promise<{ items: UserItem[] }> {
    if (actor.role !== 'handler' && actor.role !== 'admin') throw forbidden()
    // companyId 可空（空 = 当前用户公司）；无分页参数，返回全量。
    const companyId = query.companyId || actor.companyId
    const conditions: string[] = ['u.company_id IS ?']
    const params: unknown[] = [companyId]
    if (query.q && query.q.trim()) {
      const like = `%${escapeLike(query.q.trim().toLowerCase())}%`
      conditions.push(
        "(lower(u.name) LIKE ? ESCAPE '\\' OR lower(u.email) LIKE ? ESCAPE '\\' OR lower(COALESCE(up.department, '')) LIKE ? ESCAPE '\\')",
      )
      params.push(like, like, like)
    }
    const rows = await db.queryAll<{
      id: string
      name: string
      email: string
      company_id: string | null
      company_name: string | null
      department: string | null
      role: string
      enabled: number
    }>({
      text: `SELECT u.id, u.name, u.email, u.company_id, c.name AS company_name, up.department, up.role, u.enabled
             FROM users u
             LEFT JOIN user_profiles up ON up.user_id = u.id
             LEFT JOIN companies c ON c.id = u.company_id
             WHERE ${conditions.join(' AND ')}
             ORDER BY u.name, u.id`,
      params,
    })
    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        companyId: row.company_id ?? null,
        companyName: row.company_name ?? null,
        department: row.department ?? null,
        role: row.role ?? 'user',
        enabled: Boolean(row.enabled),
      })),
    }
  }

  return { getMe, listUsers }
}

export type UserService = ReturnType<typeof createUserService>
