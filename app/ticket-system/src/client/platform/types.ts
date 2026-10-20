// 按 docs/wi-t1000316/technical-contract.md §2/§4 定义的客户端契约类型。
// 仅描述契约请求/响应结构，不依赖服务端实现状态。

export type Role = 'submitter' | 'agent' | 'company_admin'
export type Priority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'
export type TicketStatus = 'created' | 'pending_assignment' | 'processing' | 'completed' | 'cancelled'
export type TicketView = 'mine' | 'workbench' | 'company'
export type TicketSort = 'created_at' | 'priority' | 'status'
export type SortOrder = 'asc' | 'desc'
export type NotificationStatus = 'sent' | 'skipped' | 'failed'

export interface UserProfile {
  id: string
  displayName: string
  email: string
  companyId: number
  companyName: string
  department: string | null
  role: Role
}

export interface LoginResponse {
  token: string
  user: UserProfile
}

export interface MeResponse {
  user: UserProfile
}

export interface TicketSummary {
  id: number
  ticketNo: string
  subject: string
  category: string
  priority: string
  status: string
  submitterName: string
  groupName: string | null
  createdAt: string
  completedAt: string | null
}

export interface Ticket extends TicketSummary {
  description: string
  submitterEmail: string
  submitterDepartment: string | null
  assigneeUserId: string | null
  handlerName: string | null
  dispatchedAt: string | null
  assignedAt: string | null
  firstReplyAt: string | null
  cancelledAt: string | null
  groupId: number | null
}

export interface Reply {
  id: number
  authorName: string
  authorKind: 'submitter' | 'agent'
  content: string
  createdAt: string
}

export interface ActivityEntry {
  id: number
  action: string
  operatorName: string
  detail: string | null
  occurredAt: string
}

export interface NotificationEntry {
  id: number
  recipientEmail: string
  subject: string
  status: NotificationStatus
  sentAt: string
}

export interface Rating {
  score: number
  comment: string | null
  createdAt: string
}

export interface SubmitterInfo {
  userId: string
  displayName: string
  email: string
  companyName: string
  department: string | null
  historyTickets: TicketSummary[]
}

export interface TicketDetailResponse {
  ticket: Ticket
  replies: Reply[]
  activity: ActivityEntry[]
  notifications: NotificationEntry[]
  rating: Rating | null
  submitter: SubmitterInfo
}

export interface TicketListResponse {
  items: TicketSummary[]
  total: number
}

export interface CreateTicketRequest {
  subject: string
  description: string
  category: string
  priority: Priority
}

export interface TransferRequest {
  targetGroupId: number
  targetUserId: string | null
  reason: string | null
}

export interface RatingRequest {
  score: number
  comment: string | null
}

export interface GroupMemberRef {
  userId: string
  displayName: string
}

export interface Group {
  id: number
  name: string
  memberCount: number
  members: GroupMemberRef[]
}

export interface GroupListResponse {
  items: Group[]
}

export interface CategoryListResponse {
  items: string[]
}

export interface CategoryRule {
  id: number
  category: string
  groupId: number
  groupName: string
}

export interface CategoryRuleListResponse {
  items: CategoryRule[]
}

export interface Dashboard {
  totalTickets: number
  statusBreakdown: Record<string, number>
  avgResponseMinutes: number | null
  avgRating: number | null
  ratedCount: number
  hotCategories: { category: string; count: number }[]
}

export interface Distribution {
  dimension: string
  items: { label: string; count: number }[]
}
