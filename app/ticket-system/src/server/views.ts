/**
 * API 投影装配层：把 SQLite 行装配为技术契约定义的 UserBrief / Ticket / Reply / Group 对象。
 */
import type { DbClient } from '@commonapp/dbkit'

/** 契约 1.2 UserBrief。 */
export interface UserBrief {
  id: number
  displayName: string
  email: string
  companyId: number
  companyName: string
  departmentName: string | null
}

interface UserRow {
  id: number
  display_name: string
  email: string
  company_id: number
  company_name: string
  department_name: string | null
}

const USER_BRIEF_SELECT = `
  SELECT p.id, p.display_name, p.email, p.company_id, c.name AS company_name, d.name AS department_name
  FROM user_profiles p
  JOIN companies c ON c.id = p.company_id
  LEFT JOIN departments d ON d.id = p.department_id
`

export const toUserBrief = (row: UserRow): UserBrief => ({
  id: row.id,
  displayName: row.display_name,
  email: row.email,
  companyId: row.company_id,
  companyName: row.company_name,
  departmentName: row.department_name,
})

const placeholders = (count: number) => Array.from({ length: count }, () => '?').join(', ')

export async function loadUserBriefs(db: DbClient, profileIds: readonly number[]): Promise<Map<number, UserBrief>> {
  const ids = [...new Set(profileIds.filter((id) => Number.isInteger(id) && id > 0))]
  if (ids.length === 0) return new Map()
  const rows = await db.queryAll<UserRow>({
    text: `${USER_BRIEF_SELECT} WHERE p.id IN (${placeholders(ids.length)})`,
    params: ids,
  })
  return new Map(rows.map((row) => [row.id, toUserBrief(row)]))
}

export async function loadUserBrief(db: DbClient, profileId: number): Promise<UserBrief | null> {
  const row = await db.queryOne<UserRow>({ text: `${USER_BRIEF_SELECT} WHERE p.id = ?`, params: [profileId] })
  return row ? toUserBrief(row) : null
}

/** 按平台用户 ID 装配档案（审计事件的 actor 映射）。 */
export async function loadUserBriefsByPlatformIds(
  db: DbClient,
  platformUserIds: readonly string[],
): Promise<Map<string, UserBrief>> {
  const ids = [...new Set(platformUserIds.filter((id) => typeof id === 'string' && id.length > 0))]
  if (ids.length === 0) return new Map()
  const rows = await db.queryAll<UserRow & { platform_user_id: string }>({
    text: `
      SELECT p.platform_user_id, p.id, p.display_name, p.email, p.company_id, c.name AS company_name, d.name AS department_name
      FROM user_profiles p
      JOIN companies c ON c.id = p.company_id
      LEFT JOIN departments d ON d.id = p.department_id
      WHERE p.platform_user_id IN (${placeholders(ids.length)})
    `,
    params: ids,
  })
  return new Map(rows.map((row) => [row.platform_user_id, toUserBrief(row)]))
}

/** 用户列表（契约 2.4）：按 displayName 排序。 */
export async function listUserBriefsByCompany(db: DbClient, companyId: number): Promise<UserBrief[]> {
  const rows = await db.queryAll<UserRow>({
    text: `${USER_BRIEF_SELECT} WHERE p.company_id = ? ORDER BY p.display_name, p.id`,
    params: [companyId],
  })
  return rows.map(toUserBrief)
}

/** tickets 表行（snake_case）。 */
export interface TicketRow {
  id: number
  company_id: number
  subject: string
  description: string
  category: string
  priority: string
  status: string
  submitter_user_id: number
  assigned_group_id: number | null
  current_assignee_id: number | null
  first_reply_at: string | null
  completed_by: number | null
  completed_at: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string
}

/** 工单完整列清单（RETURNING / SELECT 共用）。 */
export const TICKET_COLUMNS =
  'id, company_id, subject, description, category, priority, status, submitter_user_id, assigned_group_id, current_assignee_id, first_reply_at, completed_by, completed_at, cancelled_at, created_at, updated_at'

/** 契约 1.2 Ticket。 */
export interface TicketDto {
  id: number
  companyId: number
  subject: string
  description: string
  category: string
  priority: string
  status: string
  submitter: UserBrief | null
  assignedGroupId: number | null
  currentAssignee: UserBrief | null
  firstReplyAt: string | null
  completedBy: UserBrief | null
  completedAt: string | null
  cancelledAt: string | null
  createdAt: string
  updatedAt: string
}

export function toTicketDto(row: TicketRow, users: Map<number, UserBrief>): TicketDto {
  return {
    id: row.id,
    companyId: row.company_id,
    subject: row.subject,
    description: row.description,
    category: row.category,
    priority: row.priority,
    status: row.status,
    submitter: users.get(row.submitter_user_id) ?? null,
    assignedGroupId: row.assigned_group_id,
    currentAssignee: row.current_assignee_id === null ? null : users.get(row.current_assignee_id) ?? null,
    firstReplyAt: row.first_reply_at,
    completedBy: row.completed_by === null ? null : users.get(row.completed_by) ?? null,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function assembleTickets(db: DbClient, rows: readonly TicketRow[]): Promise<TicketDto[]> {
  const users = await loadUserBriefs(
    db,
    rows.flatMap((row) => [row.submitter_user_id, row.current_assignee_id ?? 0, row.completed_by ?? 0]),
  )
  return rows.map((row) => toTicketDto(row, users))
}

/** ticket_replies 表行。 */
export interface ReplyRow {
  id: number
  ticket_id: number
  replier_user_id: number
  content: string
  created_at: string
}

/** 契约 1.2 Reply。 */
export interface ReplyDto {
  id: number
  ticketId: number
  replier: UserBrief | null
  content: string
  createdAt: string
}

export async function assembleReplies(db: DbClient, rows: readonly ReplyRow[]): Promise<ReplyDto[]> {
  const users = await loadUserBriefs(db, rows.map((row) => row.replier_user_id))
  return rows.map((row) => ({
    id: row.id,
    ticketId: row.ticket_id,
    replier: users.get(row.replier_user_id) ?? null,
    content: row.content,
    createdAt: row.created_at,
  }))
}

/** groups 表行。 */
export interface GroupRow {
  id: number
  company_id: number
  name: string
  created_at: string
}

/** 契约 1.2 Group。 */
export interface GroupDto {
  id: number
  companyId: number
  name: string
  members: UserBrief[]
  createdAt: string
}

interface GroupMemberRow extends UserRow {
  group_id: number
}

export async function assembleGroups(db: DbClient, rows: readonly GroupRow[]): Promise<GroupDto[]> {
  if (rows.length === 0) return []
  const members = await db.queryAll<GroupMemberRow>({
    text: `
      SELECT gm.group_id, p.id, p.display_name, p.email, p.company_id, c.name AS company_name, d.name AS department_name
      FROM group_members gm
      JOIN user_profiles p ON p.id = gm.user_id
      JOIN companies c ON c.id = p.company_id
      LEFT JOIN departments d ON d.id = p.department_id
      WHERE gm.group_id IN (${placeholders(rows.length)})
      ORDER BY p.display_name, p.id
    `,
    params: rows.map((row) => row.id),
  })
  const grouped = new Map<number, UserBrief[]>()
  for (const member of members) {
    const list = grouped.get(member.group_id) ?? []
    list.push(toUserBrief(member))
    grouped.set(member.group_id, list)
  }
  return rows.map((row) => ({
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    members: grouped.get(row.id) ?? [],
    createdAt: row.created_at,
  }))
}
