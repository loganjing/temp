// Domain types matching technical-contract.md

export type Priority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'
export type TicketStatus = 'created' | 'pending_assignment' | 'pending_handling' | 'completed' | 'cancelled'
export type AssignedMode = 'auto' | 'manual'
export type ReplyAuthorRole = 'submitter' | 'handler'
export type LogAction =
  | 'ticket_created' | 'ticket_assigned' | 'ticket_transferred'
  | 'ticket_replied' | 'ticket_status_changed' | 'ticket_completed'
  | 'ticket_cancelled' | 'rating_submitted'
export type NotificationStatus = 'queued' | 'sent' | 'failed'
export type SortOrder = 'createdAt_desc' | 'createdAt_asc'
export type StatsDimension = 'company' | 'department'

export interface UserRef {
  id: string
  name: string
  email?: string
  companyId?: string
  companyName?: string
  department?: string
}

export interface SessionUser extends UserRef {
  email: string
  companyId: string
  companyName: string
  department: string
  role: string
}

export type Capability = 'submit_ticket' | 'handle_ticket' | 'configure_assignment' | 'view_stats'

export interface Session {
  user: SessionUser | null
  capabilities: Capability[]
}

export interface TicketAssignment {
  groupId: string
  groupName: string
  assignedAt: string
  assignedMode: AssignedMode
  assigneeId: string | null
}

export interface TicketCompletion {
  handledBy: UserRef
  handledAt: string
}

export interface TicketRating {
  score: number
  ratedBy: UserRef
  ratedAt: string
}

export interface Ticket {
  id: string
  companyId: string
  companyName: string
  subject: string
  description: string
  category: string
  priority: Priority
  status: TicketStatus
  submitter: UserRef
  createdAt: string
  assignment: TicketAssignment | null
  completion: TicketCompletion | null
  cancelledAt: string | null
  rating: TicketRating | null
  replyCount: number
}

export interface Reply {
  id: string
  ticketId: string
  author: UserRef
  authorRole: ReplyAuthorRole
  content: string
  createdAt: string
}

export interface Transfer {
  id: string
  fromGroupId: string | null
  fromUserId: string | null
  toGroupId: string | null
  toUserId: string | null
  transferredBy: UserRef
  transferredAt: string
}

export interface LogEntry {
  id: string
  ticketId: string
  action: LogAction
  actor: UserRef
  createdAt: string
  detail: Record<string, unknown>
}

export interface TicketDetail {
  ticket: Ticket
  replies: Reply[]
  transfers: Transfer[]
  logs: LogEntry[]
}

export interface TicketListResponse {
  items: Ticket[]
  total: number
  page: number
  pageSize: number
}

export interface BusinessGroupMember {
  id: string
  name: string
  email: string
  department: string
}

export interface BusinessGroup {
  id: string
  companyId: string
  name: string
  members: BusinessGroupMember[]
}

export interface AssignmentRule {
  id: string
  companyId: string
  category: string
  groupId: string
  groupName: string
  enabled: boolean
}

export interface StatsDistributionItem {
  key: string
  label: string
  count: number
}

export interface StatsDistribution {
  dimension: StatsDimension
  items: StatsDistributionItem[]
  total: number
}

export interface StatsDashboard {
  ticketCount: number
  avgResponseMinutes: number | null
  avgResponseSampleCount: number
  avgSatisfaction: number | null
  ratingSampleCount: number
  hotCategories: { category: string; count: number }[]
}

export interface Notification {
  id: string
  ticketId: string
  toEmail: string
  subject: string
  status: NotificationStatus
  createdAt: string
  sentAt: string | null
  error: string | null
}

export interface UserProfile {
  user: SessionUser
  historyTickets: {
    items: { id: string; subject: string; status: TicketStatus; createdAt: string }[]
    total: number
  }
}

export interface ApiError {
  code: string
  message: string
  details?: Record<string, unknown>
}

export interface TicketQueryParams {
  q?: string
  category?: string
  priority?: Priority
  status?: TicketStatus
  companyId?: string
  sort?: SortOrder
  page?: number
  pageSize?: number
}
