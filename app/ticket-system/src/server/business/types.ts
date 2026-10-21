// 契约第 2 节公共类型（服务端实现与序列化使用）。
export type Priority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'
export type Status = 'pending_assign' | 'processing' | 'completed' | 'cancelled'
export type Role = 'submitter' | 'agent' | 'company_admin' | 'platform_ops'
export type LogAction =
  | 'created'
  | 'auto_assigned'
  | 'assigned'
  | 'transferred'
  | 'replied'
  | 'completed'
  | 'cancelled'
  | 'rated'

export const PRIORITIES: readonly Priority[] = ['P0', 'P1', 'P2', 'P3', 'P4']
export const STATUSES: readonly Status[] = ['pending_assign', 'processing', 'completed', 'cancelled']
export const ROLES: readonly Role[] = ['submitter', 'agent', 'company_admin', 'platform_ops']

export interface UserProfileSummary {
  id: number
  displayName: string
  email: string
  department: string
  companyName: string
  role: Role
}

export interface TicketSummary {
  id: number
  ticketNo: string
  subject: string
  priority: Priority
  status: Status
  createdAt: string
}

export interface Rating {
  score: number
  comment: string | null
  raterId: number
  createdAt: string
}

export interface TicketReply {
  id: number
  ticketId: number
  author: UserProfileSummary
  content: string
  createdAt: string
}

export interface Ticket {
  id: number
  ticketNo: string
  companyId: number
  companyName: string
  subject: string
  description: string
  categoryId: number
  categoryName: string
  priority: Priority
  status: Status
  submitter: UserProfileSummary
  groupId: number | null
  groupName: string | null
  handlerId: number | null
  handlerName: string | null
  firstReplyAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  createdAt: string
  rating: Rating | null
}

// 详情响应在 Ticket 之上附带回复列表：契约未定义独立的回复读取端点，
// AC-02 的“查看回复列表”由详情响应承载（附加字段，不改变既有字段）。
export interface TicketDetail extends Ticket {
  replies: TicketReply[]
}

export interface TicketLog {
  id: number
  ticketId: number
  actor: { id: number; displayName: string } | null
  action: LogAction
  detail: string
  createdAt: string
}

export interface BusinessGroup {
  id: number
  companyId: number
  name: string
  memberCount: number
  members?: UserProfileSummary[]
}

export interface Category {
  id: number
  companyId: number
  name: string
}

export interface AssignmentRule {
  id: number
  categoryId: number
  categoryName: string
  groupId: number
  groupName: string
}

export interface Notification {
  id: number
  ticketId: number
  ticketNo: string
  subject: string
  body: string
  createdAt: string
}

export interface DashboardStats {
  totalTickets: number
  byStatus: { pending_assign: number; processing: number; completed: number; cancelled: number }
  respondedTickets: number
  avgResponseSeconds: number | null
  ratedTickets: number
  avgRating: number | null
  topCategories: { categoryId: number; name: string; count: number }[]
}

export interface DistributionItem {
  key: string
  label: string
  count: number
}
