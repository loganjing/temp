import type { DbClient } from '@commonapp/dbkit'
import { forbidden } from './http'

// auth-context：解析当前用户（公司、部门、角色）的请求上下文。
// 公司归属唯一权威来源是 user_profiles.company_id，来自服务端可信数据。
export type Role = 'submitter' | 'agent' | 'company_admin'

export type TicketUser = {
  userId: string
  displayName: string
  email: string
  companyId: number
  companyName: string
  department: string | null
  role: Role
}

// 契约 §4.1 UserProfile。
export type UserProfile = {
  id: string
  displayName: string
  email: string
  companyId: number
  companyName: string
  department: string | null
  role: Role
}

type ProfileRow = {
  user_id: string
  display_name: string
  email: string
  company_id: number
  company_name: string
  department: string | null
  role: string
}

export async function loadTicketUser(db: DbClient, userId: string): Promise<TicketUser | null> {
  const row = await db.queryOne<ProfileRow>({
    text: `SELECT p.user_id, p.display_name, p.email, p.company_id, c.name AS company_name, p.department, p.role
           FROM user_profiles p JOIN companies c ON c.id = p.company_id
           WHERE p.user_id = ?`,
    params: [userId],
  })
  if (!row) return null
  return {
    userId: row.user_id,
    displayName: row.display_name,
    email: row.email,
    companyId: row.company_id,
    companyName: row.company_name,
    department: row.department,
    role: row.role as Role,
  }
}

export function toUserProfile(user: TicketUser): UserProfile {
  return {
    id: user.userId,
    displayName: user.displayName,
    email: user.email,
    companyId: user.companyId,
    companyName: user.companyName,
    department: user.department,
    role: user.role,
  }
}

// company_admin 具备 agent 全部能力（契约 §1）。
export const isHandler = (user: TicketUser) => user.role === 'agent' || user.role === 'company_admin'

// 认证已通过但缺少公司上下文（用户无 user_profiles 记录）时的统一拒绝。
export const noCompanyContext = () => forbidden('User has no company context in this application')
