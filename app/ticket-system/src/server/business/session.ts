import type { DbClient } from '@commonapp/dbkit'
import type { AuthUser } from '@commonapp/userkit'
import { forbidden, unauthenticated } from './errors'
import type { Role, UserProfileSummary } from './types'
import { ROLES } from './types'

// 会话业务档案：公司隔离与角色判定的唯一可信来源（来自服务端 user_profiles，
// 不使用请求中的任何公司/角色参数）。
export interface SessionProfile {
  id: number
  platformUserId: string
  companyId: number
  companyName: string
  displayName: string
  email: string
  department: string
  role: Role
}

interface ProfileRow {
  id: number
  platform_user_id: string
  company_id: number
  company_name: string
  display_name: string
  email: string
  department: string
  role: string
}

export function currentUserOf(context: unknown): AuthUser {
  const user = (context as { get(name: string): unknown }).get('currentUser') as AuthUser | undefined
  if (!user) throw unauthenticated()
  return user
}

export function toSummary(profile: SessionProfile): UserProfileSummary {
  return {
    id: profile.id,
    displayName: profile.displayName,
    email: profile.email,
    department: profile.department,
    companyName: profile.companyName,
    role: profile.role,
  }
}

export async function findSessionProfile(db: DbClient, context: unknown): Promise<SessionProfile | null> {
  const user = currentUserOf(context)
  const row = await db.queryOne<ProfileRow>({
    text: `SELECT p.id, p.platform_user_id, p.company_id, c.name AS company_name,
      p.display_name, p.email, p.department, p.role
      FROM user_profiles p JOIN companies c ON c.id = p.company_id WHERE p.platform_user_id = ?`,
    params: [user.id],
  })
  if (!row) return null
  if (!ROLES.includes(row.role as Role)) return null
  return {
    id: row.id,
    platformUserId: row.platform_user_id,
    companyId: row.company_id,
    companyName: row.company_name,
    displayName: row.display_name,
    email: row.email,
    department: row.department,
    role: row.role as Role,
  }
}

export async function requireSessionProfile(db: DbClient, context: unknown): Promise<SessionProfile> {
  const profile = await findSessionProfile(db, context)
  if (!profile) throw forbidden('当前用户没有业务档案，无法访问业务数据')
  return profile
}

export function requireRole(profile: SessionProfile, ...allowed: Role[]): void {
  if (!allowed.includes(profile.role)) throw forbidden('当前角色无权执行该操作')
}
