/**
 * 工单系统前后端共享契约类型与常量。
 *
 * 唯一契约来源：docs/wi-t1000312/technical-contract.md（method/path、字段、
 * 可空性、错误码、状态机与枚举值均以契约为准，本文件只做类型化映射）。
 *
 * 平台中立约束：仅依赖 TypeScript，禁止导入 src/server/、src/client/、
 * Node API、Hono、React、DOM 或数据库驱动。
 */

export const USER_ROLES = ['submitter', 'handler', 'admin'] as const
export type UserRole = (typeof USER_ROLES)[number]

export const TICKET_PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'P4'] as const
export type TicketPriority = (typeof TICKET_PRIORITIES)[number]

export const TICKET_STATUSES = ['PENDING_ASSIGNMENT', 'PROCESSING', 'COMPLETED', 'CANCELLED'] as const
export type TicketStatus = (typeof TICKET_STATUSES)[number]

/** 列表查询允许的状态参数（含 ALL）。 */
export const TICKET_LIST_STATUSES = [...TICKET_STATUSES, 'ALL'] as const
export type TicketListStatus = (typeof TICKET_LIST_STATUSES)[number]

export const TICKET_LOG_ACTIONS = [
  'ticket.created',
  'ticket.assigned',
  'ticket.reassigned',
  'ticket.replied',
  'ticket.completed',
  'ticket.cancelled',
  'ticket.rated',
] as const
export type TicketLogAction = (typeof TICKET_LOG_ACTIONS)[number]

export const NOTIFICATION_STATUSES = ['sent', 'skipped', 'failed'] as const
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number]

export const TICKET_SORT_FIELDS = ['createdAt', 'priority', 'firstReplyAt'] as const
export type TicketSortField = (typeof TICKET_SORT_FIELDS)[number]

export const SORT_ORDERS = ['asc', 'desc'] as const
export type SortOrder = (typeof SORT_ORDERS)[number]

export const STATS_DIMENSIONS = ['company', 'department'] as const
export type StatsDimension = (typeof STATS_DIMENSIONS)[number]

export function isTicketPriority(value: unknown): value is TicketPriority {
  return (TICKET_PRIORITIES as readonly string[]).includes(value as string)
}

export function isTicketStatus(value: unknown): value is TicketStatus {
  return (TICKET_STATUSES as readonly string[]).includes(value as string)
}

export function isTicketListStatus(value: unknown): value is TicketListStatus {
  return (TICKET_LIST_STATUSES as readonly string[]).includes(value as string)
}

export function isTicketSortField(value: unknown): value is TicketSortField {
  return (TICKET_SORT_FIELDS as readonly string[]).includes(value as string)
}

export function isSortOrder(value: unknown): value is SortOrder {
  return (SORT_ORDERS as readonly string[]).includes(value as string)
}

export function isStatsDimension(value: unknown): value is StatsDimension {
  return (STATS_DIMENSIONS as readonly string[]).includes(value as string)
}

/** 优先级排序序：P0 最紧急在前（升序）。 */
export function ticketPriorityRank(priority: TicketPriority): number {
  return TICKET_PRIORITIES.indexOf(priority)
}

// ---------------------------------------------------------------------------
// 契约响应结构
// ---------------------------------------------------------------------------

export interface TicketSubmitterRef {
  id: string
  name: string
  email: string
  department: string | null
}

export interface TicketRating {
  score: number
  comment: string | null
  ratedAt: string
}

export interface Ticket {
  id: string
  title: string
  description: string
  category: string
  priority: TicketPriority
  status: TicketStatus
  companyId: string
  companyName: string
  submitter: TicketSubmitterRef
  assignedGroupId: string | null
  assignedGroupName: string | null
  assigneeId: string | null
  assigneeName: string | null
  completedById: string | null
  completedAt: string | null
  firstReplyAt: string | null
  rating: TicketRating | null
  createdAt: string
}

export interface TicketListItem extends Ticket {
  replyCount: number
  unreadHint: false
}

export interface PaginatedResult<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
}

export interface ReplyItem {
  id: number
  ticketId: string
  authorId: string
  authorName: string
  authorRole: string
  content: string
  createdAt: string
}

export interface RatingSummary {
  score: number
  comment: string | null
  ratedAt: string
}

export interface TicketLogItem {
  id: number
  ticketId: string
  actorId: string | null
  actorName: string | null
  action: TicketLogAction
  detail: string | null
  createdAt: string
}

export interface NotificationItem {
  id: number
  ticketId: string
  toEmail: string
  subject: string
  status: NotificationStatus
  error: string | null
  createdAt: string
}

export interface CompanyItem {
  id: string
  name: string
}

export interface GroupMemberRef {
  userId: string
  userName: string
}

/** POST /api/groups 响应（无 companyName）。 */
export interface GroupSummary {
  id: string
  companyId: string
  name: string
  members: GroupMemberRef[]
}

/** GET /api/groups 列表项与 PUT /api/groups/:id 读回（含 companyName）。 */
export interface GroupItem extends GroupSummary {
  companyName: string
}

export interface CategoryRuleItem {
  id: string
  companyId: string
  category: string
  groupId: string
  groupName: string
}

export interface LoginUser {
  id: string
  name: string
  email: string
  role: string
  companyId: string | null
  department: string | null
  status: string
}

export interface MeUser extends LoginUser {
  companyName: string | null
}

export interface LoginResponse {
  token: string
  user: LoginUser
}

export interface UserItem {
  id: string
  name: string
  email: string
  companyId: string | null
  companyName: string | null
  department: string | null
  role: string
  enabled: boolean
}

export interface SubmitterInfoResponse {
  user: {
    id: string
    name: string
    email: string
    companyName: string | null
    department: string | null
  }
  historyTickets: TicketListItem[]
}

export interface DistributionCompanyItem {
  key: string
  companyId: string
  count: number
}

export interface DistributionDepartmentItem {
  key: string | null
  count: number
}

export type DistributionResponse =
  | { dimension: 'company'; items: DistributionCompanyItem[] }
  | { dimension: 'department'; items: DistributionDepartmentItem[] }

export interface HotCategoryItem {
  category: string
  count: number
}

export interface DashboardResponse {
  totalTickets: number
  avgResponseMinutes: number | null
  satisfaction: { avgScore: number | null; ratedCount: number }
  hotCategories: HotCategoryItem[]
}
