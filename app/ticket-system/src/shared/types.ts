import type { TicketStatus, TicketPriority } from './constants'

export type { TicketStatus, TicketPriority, AuditEventType } from './constants'

export interface TicketListItem {
  id: string
  subject: string
  category: string
  priority: TicketPriority
  status: TicketStatus
  companyId: string
  submitterName: string
  assigneeName: string | null
  businessGroupName: string | null
  createdAt: string
}

export interface TicketListResponse {
  items: TicketListItem[]
  total: number
}

export interface TicketSubmitterDetail {
  id: string
  name: string
  email: string
  companyName: string | null
  departmentName: string | null
  historicalTickets: Array<{ id: string; subject: string; status: TicketStatus; createdAt: string }>
}

export interface TicketReplyDetail {
  id: string
  replierId: string
  replierName: string
  content: string
  repliedAt: string
}

export interface TicketEvaluationDetail {
  rating: number
  comment: string | null
  evaluatedAt: string
}

export interface TicketLogEntry {
  id: string
  eventType: string
  actorUserId: string | null
  occurredAt: string
  metadata: Record<string, unknown>
}

export interface TicketDetail {
  id: string
  subject: string
  description: string | null
  category: string
  priority: TicketPriority
  status: TicketStatus
  companyId: string
  submitter: TicketSubmitterDetail
  businessGroupId: string | null
  businessGroupName: string | null
  assigneeId: string | null
  assigneeName: string | null
  handlerId: string | null
  handlerName: string | null
  createdAt: string
  handledAt: string | null
  replies: TicketReplyDetail[]
  evaluation: TicketEvaluationDetail | null
  recentLogs: TicketLogEntry[]
}

export interface TicketCreateRequest {
  subject: string
  description?: string
  category: string
  priority: TicketPriority
}

export interface TicketCreateResponse {
  id: string
  subject: string
  category: string
  priority: TicketPriority
  status: TicketStatus
  companyId: string
  submitterId: string
  businessGroupId: string | null
  createdAt: string
}

export interface TicketTransferRequest {
  targetUserId?: string
  targetGroupId?: string
}

export interface TicketTransferResponse {
  id: string
  status: TicketStatus
  assigneeId: string | null
  businessGroupId: string | null
}

export interface TicketCompleteResponse {
  id: string
  status: TicketStatus
  handlerId: string
  handlerName: string
  handledAt: string
  emailNotification: { status: 'sent' | 'skipped' | 'failed'; reason?: string }
}

export interface TicketCancelResponse {
  id: string
  status: TicketStatus
}

export interface TicketEvaluationRequest {
  rating: number
  comment?: string
}

export interface TicketEvaluationResponse {
  id: string
  ticketId: string
  rating: number
  comment: string | null
  evaluatedAt: string
}

export interface TicketReplyCreateRequest {
  content: string
}

export interface TicketReplyCreateResponse {
  id: string
  ticketId: string
  replierId: string
  replierName: string
  content: string
  repliedAt: string
}

export interface TicketLogsResponse {
  items: TicketLogEntry[]
}

export interface CompanyItem {
  id: string
  name: string
}

export interface DepartmentItem {
  id: string
  name: string
  companyId: string
}

export interface BusinessGroupMember {
  userId: string
  userName: string
}

export interface BusinessGroupItem {
  id: string
  name: string
  companyId: string
  members: BusinessGroupMember[]
}

export interface BusinessGroupCreateRequest {
  name: string
}

export interface BusinessGroupMemberRequest {
  userId: string
}

export interface RoutingRuleItem {
  id: string
  companyId: string
  category: string
  businessGroupId: string
  businessGroupName: string
}

export interface RoutingRuleCreateRequest {
  category: string
  businessGroupId: string
}

export interface UserListItem {
  id: string
  name: string
  email: string
  phone: string | null
  companyId: string | null
  departmentName: string | null
}

export interface UserListResponse {
  items: UserListItem[]
  total: number
}

export interface UserCreateRequest {
  name: string
  email: string
  phone?: string
  password: string
  companyId?: string
  departmentId?: string
}

export interface UserCreateResponse {
  id: string
  name: string
  email: string
  companyId: string | null
}

export interface StatsDistributionResponse {
  dimension: 'company' | 'department'
  items: Array<{ label: string; count: number; companyId?: string }>
}

export interface StatsDashboardResponse {
  totalTickets: number
  pendingCount: number
  completedCount: number
  cancelledCount: number
  avgResponseTimeMs: number | null
  avgSatisfaction: number | null
  hotCategories: Array<{ category: string; count: number }>
}
