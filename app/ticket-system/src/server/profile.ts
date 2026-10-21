/**
 * 业务用户档案：平台登录用户 → 公司/部门/跨公司视角的唯一映射。
 * 公司隔离从该可信映射出发，不信任任何客户端提交的公司标识。
 */
import type { DbClient } from '@commonapp/dbkit'
import type { UserBrief } from './views'

export interface AuthProfileRow {
  id: number
  platform_user_id: string
  display_name: string
  email: string
  company_id: number
  department_id: number | null
  cross_company_view: number
  company_name: string
  department_name: string | null
}

/** 契约 2.1 AuthUser = UserBrief + crossCompanyView。 */
export interface AuthUserDto extends UserBrief {
  crossCompanyView: boolean
}

/** 业务请求上下文（公司隔离判断依据）。 */
export interface ProfileContext {
  profileId: number
  platformUserId: string
  companyId: number
  crossCompanyView: boolean
}

const AUTH_PROFILE_SELECT = `
  SELECT p.id, p.platform_user_id, p.display_name, p.email, p.company_id, p.department_id, p.cross_company_view,
         c.name AS company_name, d.name AS department_name
  FROM user_profiles p
  JOIN companies c ON c.id = p.company_id
  LEFT JOIN departments d ON d.id = p.department_id
`

export function findAuthProfile(db: DbClient, platformUserId: string): Promise<AuthProfileRow | null> {
  return db.queryOne<AuthProfileRow>({
    text: `${AUTH_PROFILE_SELECT} WHERE p.platform_user_id = ?`,
    params: [platformUserId],
  })
}

export function toAuthUser(row: AuthProfileRow): AuthUserDto {
  return {
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    companyId: row.company_id,
    companyName: row.company_name,
    departmentName: row.department_name,
    crossCompanyView: row.cross_company_view === 1,
  }
}

export function toProfileContext(row: AuthProfileRow): ProfileContext {
  return {
    profileId: row.id,
    platformUserId: row.platform_user_id,
    companyId: row.company_id,
    crossCompanyView: row.cross_company_view === 1,
  }
}
