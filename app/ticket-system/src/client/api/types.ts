// 契约类型：按 docs/wi-t1000312/technical-contract.md 转写，仅在 client 内使用。
// 响应字段经 platform/api-client 的 camelCase 归一化后与此处结构一致。

export type Role = 'submitter' | 'handler' | 'admin'
export type Priority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'
export type TicketStatus = 'PENDING_ASSIGNMENT' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED'
export type TicketStatusFilter = TicketStatus | 'ALL'
export type TicketSortField = 'createdAt' | 'priority' | 'firstReplyAt'
export type SortOrder = 'asc' | 'desc'

export interface CurrentUser {
  id: string
  name: string
  email: string
  role: Role
  companyId: string | null
  department: string | null
  status: string
  companyName?: string | null
}

export interface LoginResponse {
  token: string
  user: CurrentUser
}

export interface UserListItem {
  id: string
  name: string
  email: string
  companyId: string
  companyName: string
  department: string | null
  role: Role
  enabled: boolean
}

export interface Company {
  id: string
  name: string
}

export interface GroupMember {
  userId: string
  userName: string
}

export interface Group {
  id: string
  companyId: string
  companyName?: string
  name: string
  members: GroupMember[]
}

export interface CategoryRule {
  id: string
  companyId: string
  category: string
  groupId: string
  groupName: string
}

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
  priority: Priority
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
  unreadHint: boolean
}

export interface PageResult<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
}

export interface TicketListQuery {
  status?: TicketStatusFilter
  company?: string
  category?: string
  priority?: string
  q?: string
  sort?: TicketSortField
  order?: SortOrder
  page?: number
  pageSize?: number
}

export interface Reply {
  id: string
  ticketId: string
  authorId: string
  authorName: string
  authorRole: string
  content: string
  createdAt: string
}

export interface TicketLog {
  id: string
  ticketId: string
  actorId: string | null
  actorName: string | null
  action: string
  detail: string | null
  createdAt: string
}

export type NotificationStatus = 'sent' | 'skipped' | 'failed'

export interface TicketNotification {
  id: string
  ticketId: string
  toEmail: string
  subject: string
  status: NotificationStatus
  error: string | null
  createdAt: string
}

export interface SubmitterInfo {
  user: {
    id: string
    name: string
    email: string
    companyName: string
    department: string | null
  }
  historyTickets: TicketListItem[]
}

export interface DistributionItem {
  key: string | null
  companyId?: string
  count: number
}

export interface DistributionResult {
  dimension: 'company' | 'department'
  items: DistributionItem[]
}

export interface DashboardStats {
  totalTickets: number
  avgResponseMinutes: number | null
  satisfaction: { avgScore: number | null; ratedCount: number }
  hotCategories: { category: string; count: number }[]
}
