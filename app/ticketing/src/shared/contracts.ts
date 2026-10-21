// 工单系统前后端共享契约类型与枚举常量。
// 依据 docs/wi-t1000335/technical-contract.md 第 2、3 节定义。
// 本文件为平台中立纯类型，禁止依赖 server/client/Node/Hono/React。
//
// 类型说明：companies/groups/assignment_rules/tickets/replies/ratings/
// notification_log 的主键为自增整数（number）；users 由 userkit 管理，
// 主键为 TEXT UUID，因此 submitter/handler/member/rater/operator/CurrentUser
// 的 id 为 string。审计事件表（auditkit）主键亦为 TEXT，故 AuditEntry.id 为 string。

export type TicketStatus = 'pending_assignment' | 'processing' | 'completed' | 'cancelled'
export type Priority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'
export type NotificationStatus = 'sent' | 'failed'
export type AuditAction =
  | 'ticket_created'
  | 'ticket_assigned'
  | 'ticket_replied'
  | 'ticket_transferred'
  | 'ticket_completed'
  | 'ticket_cancelled'
  | 'ticket_rated'

export const TICKET_STATUSES: readonly TicketStatus[] = [
  'pending_assignment',
  'processing',
  'completed',
  'cancelled',
] as const
export const PRIORITIES: readonly Priority[] = ['P0', 'P1', 'P2', 'P3', 'P4'] as const
export const AUDIT_ACTIONS: readonly AuditAction[] = [
  'ticket_created',
  'ticket_assigned',
  'ticket_replied',
  'ticket_transferred',
  'ticket_completed',
  'ticket_cancelled',
  'ticket_rated',
] as const

export const isPriority = (value: unknown): value is Priority =>
  typeof value === 'string' && (PRIORITIES as readonly string[]).includes(value)
export const isTicketStatus = (value: unknown): value is TicketStatus =>
  typeof value === 'string' && (TICKET_STATUSES as readonly string[]).includes(value)
export const isAuditAction = (value: unknown): value is AuditAction =>
  typeof value === 'string' && (AUDIT_ACTIONS as readonly string[]).includes(value)

export interface CompanyRef {
  id: number
  name: string
}
export interface UserRef {
  id: string
  name: string
}
export interface SubmitterInfo {
  id: string
  name: string
  email: string
  department: string
}
export interface GroupRef {
  id: number
  name: string
}

export interface Ticket {
  ticketNo: string
  subject: string
  description: string
  category: string
  priority: Priority
  status: TicketStatus
  company: CompanyRef
  submitter: SubmitterInfo
  currentGroup: GroupRef | null
  handler: UserRef | null
  handledAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Reply {
  id: number
  author: UserRef
  content: string
  createdAt: string
}

export interface Rating {
  score: number
  comment: string | null
  raterId: string
  createdAt: string
}

export interface NotificationRecord {
  id: number
  recipientEmail: string
  subject: string
  status: NotificationStatus
  sentAt: string
  detail: string | null
}

export interface GroupMember {
  id: string
  name: string
  email: string
  department: string
}

export interface Group {
  id: number
  name: string
  companyId: number
  members: GroupMember[]
}

export interface AssignmentRule {
  id: number
  category: string
  groupId: number
  groupName: string
}

export interface AuditEntry {
  id: string
  action: AuditAction
  operator: UserRef
  ticketNo: string
  detail: string | null
  createdAt: string
}

export interface CurrentUser {
  id: string
  name: string
  email: string
  company: CompanyRef
  department: string
  groupIds: number[]
}
