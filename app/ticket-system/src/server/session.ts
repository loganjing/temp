import type { DbClient } from '@commonapp/dbkit'
import { forbidden } from './errors'

export type Role = 'submitter' | 'agent' | 'admin' | 'viewer'

export const ROLES: readonly Role[] = ['submitter', 'agent', 'admin', 'viewer']

/** 会话身份的最小来源（userkit AuthUser 满足该形状）。 */
export interface SessionUser {
  id: string
  name: string
  email?: string | null
}

export interface SessionProfile {
  displayName: string
  email: string | null
  companyId: number | null
  department: string | null
  role: Role
}

/** 请求会话：认证身份（users 表）+ 业务档案（user_profiles）。 */
export interface Session {
  userId: string
  username: string
  email: string | null
  profile: SessionProfile | null
}

export async function loadSession(db: DbClient, user: SessionUser): Promise<Session> {
  const profile = await db.queryOne<{
    display_name: string
    email: string | null
    company_id: number | null
    department: string | null
    role: Role
  }>({
    text: 'SELECT display_name, email, company_id, department, role FROM user_profiles WHERE user_id = ?',
    params: [user.id],
  })
  return {
    userId: user.id,
    username: user.name,
    email: user.email ?? null,
    profile: profile
      ? {
          displayName: profile.display_name,
          email: profile.email,
          companyId: profile.company_id,
          department: profile.department,
          role: profile.role,
        }
      : null,
  }
}

export function requireProfile(session: Session): SessionProfile {
  if (!session.profile) throw forbidden('This account has no business profile')
  return session.profile
}

/** 业务角色门禁（契约授权矩阵）。角色不足返回 403 FORBIDDEN；资源越权由各服务按 404 隐藏。 */
export function requireRole(session: Session, ...roles: Role[]): SessionProfile {
  const profile = requireProfile(session)
  if (!roles.includes(profile.role)) throw forbidden(`This action requires role: ${roles.join(' or ')}`)
  return profile
}
