export const TICKET_STATUSES = ['pending_assignment', 'pending', 'completed', 'cancelled'] as const
export type TicketStatus = (typeof TICKET_STATUSES)[number]

export const TERMINAL_TICKET_STATUSES: readonly TicketStatus[] = ['completed', 'cancelled']

export const TICKET_PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'P4'] as const
export type TicketPriority = (typeof TICKET_PRIORITIES)[number]

export const PRIORITY_RANK: Record<TicketPriority, number> = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4 }

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  P0: '紧急',
  P1: '高',
  P2: '中',
  P3: '低',
  P4: '最低',
}

export const STATUS_LABELS: Record<TicketStatus, string> = {
  pending_assignment: '待分配',
  pending: '待处理',
  completed: '完成',
  cancelled: '取消',
}

export const NOTIFICATION_STATUSES = ['sent', 'failed', 'skipped'] as const
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number]

export const NOTIFICATION_STATUS_LABELS: Record<NotificationStatus, string> = {
  sent: '已发送',
  failed: '发送失败',
  skipped: '未配置',
}

export const LOG_ACTIONS = [
  'created',
  'assigned',
  'transferred',
  'replied',
  'completed',
  'cancelled',
  'rated',
  'notified',
  'notification_retried',
] as const
export type LogAction = (typeof LOG_ACTIONS)[number]

export const LOG_ACTION_LABELS: Record<LogAction, string> = {
  created: '创建工单',
  assigned: '指派工单',
  transferred: '转派工单',
  replied: '回复工单',
  completed: '完成工单',
  cancelled: '取消工单',
  rated: '满意度评价',
  notified: '发送完成通知',
  notification_retried: '重试完成通知',
}

export const ROLE_COMPANY_ADMIN = 'company_admin'
export const ROLE_AGENT = 'agent'
export const ROLE_PLATFORM_STATS = 'platform_stats'

export const TICKET_ALLOWED_ACTIONS = ['reply', 'assign', 'transfer', 'complete', 'cancel', 'rate', 'retryNotification'] as const
export type TicketAllowedAction = (typeof TICKET_ALLOWED_ACTIONS)[number]

export const STATS_DIMENSIONS = ['company', 'department'] as const
export type StatsDimension = (typeof STATS_DIMENSIONS)[number]

export type CompanyRef = { id: string; code: string; name: string }
export type GroupRef = { id: string; name: string }

export type UserProfile = {
  id: string
  name: string
  email: string
  companyId: string
  companyName: string
  department: string
  roles: string[]
  groups: GroupRef[]
}

export type CategoryRef = { id: string; name: string; sortOrder: number }

export type TicketSummary = {
  id: string
  code: string
  subject: string
  categoryId: string
  categoryName: string
  priority: TicketPriority
  status: TicketStatus
  submitter: { id: string; name: string }
  companyId: string
  companyName: string
  department: string
  group: GroupRef | null
  assignee: { id: string; name: string } | null
  createdAt: string
  updatedAt: string
}

export type TicketReply = { id: string; author: { id: string; name: string }; content: string; createdAt: string }
export type TicketRating = { score: number; comment: string | null; createdAt: string }
export type NotificationRecord = {
  id: string
  recipientEmail: string
  status: NotificationStatus
  errorMessage: string | null
  attempt: number
  createdAt: string
  sentAt: string | null
}
export type TicketHistoryItem = { id: string; code: string; subject: string; categoryName: string; status: TicketStatus; createdAt: string }

export type TicketDetail = TicketSummary & {
  description: string
  submitter: { id: string; name: string; email: string; companyId: string; companyName: string; department: string }
  history: TicketHistoryItem[]
  replies: TicketReply[]
  rating: TicketRating | null
  notifications: NotificationRecord[]
  completedBy: { id: string; name: string } | null
  completedAt: string | null
  cancelledBy: { id: string; name: string } | null
  cancelledAt: string | null
  firstReplyAt: string | null
  allowedActions: TicketAllowedAction[]
}

export type TicketLogEntry = {
  id: string
  action: LogAction
  actionLabel: string
  summary: string
  actor: { id: string; name: string }
  detail: Record<string, unknown> | null
  createdAt: string
}

export type Paginated<T> = { items: T[]; total: number; page: number; pageSize: number }

export type CompanyUser = {
  id: string
  name: string
  email: string
  department: string
  enabled: boolean
  roles: string[]
  groups: GroupRef[]
}

export type BusinessGroup = {
  id: string
  name: string
  description: string | null
  enabled: boolean
  members: Array<{ id: string; name: string; email: string; department: string }>
}

export type TicketCategory = { id: string; name: string; enabled: boolean; sortOrder: number }

export type AssignmentRule = {
  id: string
  categoryId: string
  categoryName: string
  groupId: string
  groupName: string
  enabled: boolean
}

export type StatsOverview = {
  range: { from: string; to: string }
  volume: number
  cancelledCount: number
  avgFirstResponseMinutes: number | null
  satisfaction: { average: number | null; count: number }
  hotCategories: Array<{ categoryId: string; name: string; count: number }>
}

export type StatsDistribution = {
  dimension: StatsDimension
  total: number
  groups: Array<{ key: string; label: string; count: number }>
}

export function isTerminalStatus(status: TicketStatus): boolean {
  return status === 'completed' || status === 'cancelled'
}

export function formatTicketCode(sequence: number): string {
  return `TK-${String(sequence).padStart(6, '0')}`
}
