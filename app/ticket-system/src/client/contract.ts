// 契约类型与查询构造：全部依据 docs/wi-t1000330/technical-contract.md 定义，
// 不引入契约之外的接口行为。共享枚举与分类字典当前在 src/client 内定义
//（src/shared 归服务端任务所有）。

export type Priority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'
export const PRIORITIES: readonly Priority[] = ['P0', 'P1', 'P2', 'P3', 'P4']

export type TicketStatus =
  | 'created'
  | 'pending_assignment'
  | 'pending_processing'
  | 'completed'
  | 'cancelled'
export const TICKET_STATUSES: readonly TicketStatus[] = [
  'created',
  'pending_assignment',
  'pending_processing',
  'completed',
  'cancelled',
]

export type TicketAction =
  | 'ticket_created'
  | 'ticket_assigned'
  | 'ticket_replied'
  | 'ticket_transferred'
  | 'ticket_completed'
  | 'ticket_cancelled'
  | 'ticket_rated'
  | 'notification_failed'
export const TICKET_ACTIONS: readonly TicketAction[] = [
  'ticket_created',
  'ticket_assigned',
  'ticket_replied',
  'ticket_transferred',
  'ticket_completed',
  'ticket_cancelled',
  'ticket_rated',
  'notification_failed',
]

export type Category = 'account' | 'payment' | 'performance' | 'bug' | 'feature' | 'other'
export const CATEGORY_OPTIONS: readonly { value: Category; label: string }[] = [
  { value: 'account', label: '账号' },
  { value: 'payment', label: '支付' },
  { value: 'performance', label: '性能' },
  { value: 'bug', label: '缺陷' },
  { value: 'feature', label: '功能' },
  { value: 'other', label: '其他' },
]

export interface UserBrief {
  id: number
  displayName: string
  email: string
  companyId: number
  companyName: string
  departmentName: string | null
}

export interface AuthUser extends UserBrief {
  crossCompanyView: boolean
}

export interface Ticket {
  id: number
  companyId: number
  subject: string
  description: string
  category: string
  priority: Priority
  status: TicketStatus
  submitter: UserBrief
  assignedGroupId: number | null
  currentAssignee: UserBrief | null
  firstReplyAt: string | null
  completedBy: UserBrief | null
  completedAt: string | null
  cancelledAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Reply {
  id: number
  ticketId: number
  replier: UserBrief
  content: string
  createdAt: string
}

export interface Group {
  id: number
  companyId: number
  name: string
  members: UserBrief[]
  createdAt: string
}

export interface AssignmentRule {
  id: number
  companyId: number
  category: string
  targetGroupId: number
  targetGroupName: string
  createdAt: string
}

export interface LogEntry {
  id: number
  action: TicketAction
  actor: UserBrief | 'system'
  createdAt: string
  ticketId: number | null
  detail: string
}

export interface RatingInfo {
  score: number
  createdAt: string
}

export interface TicketDetail {
  ticket: Ticket
  replies: Reply[]
  rating: RatingInfo | null
}

export interface HistoryTicket {
  id: number
  subject: string
  status: TicketStatus
  category: string
  priority: Priority
  createdAt: string
}

export interface SubmitterContext {
  name: string
  email: string
  companyName: string
  departmentName: string | null
  historyTickets: HistoryTicket[]
}

export interface TicketListResult {
  items: Ticket[]
  total: number
  page: number
  pageSize: number
}

export type TicketSortField = 'createdAt' | 'priority' | 'status' | 'firstReplyAt'
export type SortOrder = 'asc' | 'desc'

export interface TicketListQuery {
  scope: 'workbench' | 'mine'
  status?: TicketStatus
  category?: string
  priority?: Priority
  companyId?: number
  q?: string
  sort: TicketSortField
  order: SortOrder
  page: number
  pageSize: number
}

export function buildTicketQuery(query: TicketListQuery): string {
  const params = new URLSearchParams()
  params.set('scope', query.scope)
  if (query.status !== undefined) params.set('status', query.status)
  if (query.category !== undefined && query.category !== '') params.set('category', query.category)
  if (query.priority !== undefined) params.set('priority', query.priority)
  if (query.companyId !== undefined) params.set('companyId', String(query.companyId))
  if (query.q !== undefined && query.q !== '') params.set('q', query.q)
  params.set('sort', query.sort)
  params.set('order', query.order)
  params.set('page', String(query.page))
  params.set('pageSize', String(query.pageSize))
  return params.toString()
}

export type DistributionDimension = 'company' | 'department'
export interface DistributionItem {
  key: number | string
  label: string
  count: number
}
export interface DistributionStats {
  dimension: DistributionDimension
  items: DistributionItem[]
}

export interface DashboardStats {
  ticketCount: { total: number; byStatus: Record<TicketStatus, number> }
  avgResponseMinutes: number | null
  satisfaction: { avgScore: number | null; ratedCount: number }
  hotCategories: { category: string; count: number }[]
}

export interface LogListQuery {
  ticketId?: number
  action?: TicketAction
  companyId?: number
  page: number
  pageSize: number
}

export function buildLogQuery(query: LogListQuery): string {
  const params = new URLSearchParams()
  if (query.ticketId !== undefined) params.set('ticketId', String(query.ticketId))
  if (query.action !== undefined) params.set('action', query.action)
  if (query.companyId !== undefined) params.set('companyId', String(query.companyId))
  params.set('page', String(query.page))
  params.set('pageSize', String(query.pageSize))
  return params.toString()
}

export interface LogListResult {
  items: LogEntry[]
  total: number
  page: number
  pageSize: number
}

export interface CompleteResult {
  ticket: Ticket
  notification: { sent: boolean; error: string | null }
}

export interface RatingResult {
  ticketId: number
  score: number
  createdAt: string
}

export interface LoginResult {
  token: string
  user: AuthUser
}

export interface CreateTicketPayload {
  subject: string
  description: string
  category: string
  priority: Priority
}
