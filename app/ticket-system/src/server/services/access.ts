import type { DbClient } from '@commonapp/dbkit'
import type { TicketStatus, UserRole } from '../../shared/ticket-domain'
import { forbidden } from './errors'

export type Profile = {
  userId: string
  name: string
  email: string
  role: UserRole
  companyId: string
  companyName: string
  departmentId: string
  departmentName: string
  groupIds: string[]
}

type ProfileRow = {
  id: string
  name: string
  email: string
  role: UserRole
  company_id: string
  company_name: string
  department_id: string
  department_name: string
}

export async function loadProfile(db: DbClient, userId: string): Promise<Profile | null> {
  const row = await db.queryOne<ProfileRow>({
    text: `SELECT u.id, u.name, u.email, p.role, d.company_id, c.name AS company_name,
                  d.id AS department_id, d.name AS department_name
             FROM users u
             JOIN user_profiles p ON p.user_id = u.id
             JOIN departments d ON d.id = p.department_id
             JOIN companies c ON c.id = d.company_id
            WHERE u.id = ?`,
    params: [userId],
  })
  if (!row) return null
  const groups = await db.queryAll<{ group_id: string }>({
    text: 'SELECT group_id FROM business_group_members WHERE user_id = ?',
    params: [userId],
  })
  return {
    userId: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    companyId: row.company_id,
    companyName: row.company_name,
    departmentId: row.department_id,
    departmentName: row.department_name,
    groupIds: groups.map((group) => group.group_id),
  }
}

export async function requireProfile(db: DbClient, userId: string): Promise<Profile> {
  const profile = await loadProfile(db, userId)
  if (!profile) throw forbidden('当前账号尚未配置公司、部门与角色')
  return profile
}

/** SQL fragment and parameters restricting a `tickets` alias to the caller's visible set. */
export function visibleTicketScope(profile: Profile, alias = 't'): { sql: string; params: unknown[] } {
  if (profile.role === 'ops') return { sql: '1 = 1', params: [] }
  if (profile.role === 'submitter') return { sql: `${alias}.submitter_id = ?`, params: [profile.userId] }
  if (profile.role === 'admin') return { sql: `${alias}.company_id = ?`, params: [profile.companyId] }
  return {
    sql: `${alias}.company_id = ? AND (${alias}.status = 'unassigned' OR ${alias}.group_id IN (SELECT group_id FROM business_group_members WHERE user_id = ?))`,
    params: [profile.companyId, profile.userId],
  }
}

export type TicketAccessShape = {
  id: string
  company_id: string
  status: TicketStatus
  submitter_id: string
  group_id: string | null
}

export function canViewTicket(profile: Profile, ticket: TicketAccessShape): boolean {
  if (profile.role === 'ops') return true
  if (profile.role === 'submitter') return ticket.submitter_id === profile.userId
  if (profile.role === 'admin') return ticket.company_id === profile.companyId
  if (ticket.company_id !== profile.companyId) return false
  return ticket.status === 'unassigned' || (ticket.group_id !== null && profile.groupIds.includes(ticket.group_id))
}

export function isGroupMember(profile: Profile, groupId: string | null): boolean {
  return groupId !== null && profile.groupIds.includes(groupId)
}

export function isSameCompany(profile: Profile, companyId: string): boolean {
  return profile.companyId === companyId
}
