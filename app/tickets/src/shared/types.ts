// Platform-neutral API contract types shared by server and client.
// No Hono, Node, React, or DOM imports allowed here.

export type TicketStatus =
  | 'created'
  | 'pending_assignment'
  | 'pending_processing'
  | 'completed'
  | 'cancelled'

export type SlaPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'

export type UserRole = 'submitter' | 'handler' | 'admin'

export const SLA_PRIORITIES: readonly SlaPriority[] = ['P0', 'P1', 'P2', 'P3', 'P4']
export const TICKET_STATUSES: readonly TicketStatus[] = [
  'created',
  'pending_assignment',
  'pending_processing',
  'completed',
  'cancelled',
]
export const USER_ROLES: readonly UserRole[] = ['submitter', 'handler', 'admin']

// ---- Auth ----

export interface AuthUser {
  id: string
  companyId: string
  name: string
  email: string
  roles: string[]
}

// ---- Request DTOs ----

export interface LoginRequest {
  email: string
  password: string
}

export interface TicketCreateRequest {
  title: string
  description: string
  category: string
  slaPriority: SlaPriority
}

export interface TicketStatusUpdateRequest {
  status: 'pending_assignment' | 'pending_processing' | 'cancelled'
}

export interface ReplyCreateRequest {
  content: string
}

export interface BusinessGroupCreateRequest {
  name: string
}

export interface AddMemberRequest {
  userId: string
}

export interface AssignmentRuleCreateRequest {
  category: string
  groupId: string
}

export interface TransferRequest {
  toGroupId?: string
  toUserId?: string
  reason: string
}

export interface EvaluationCreateRequest {
  rating: number
  comment?: string
}

// ---- Response DTOs ----

export interface LoginResponse {
  token: string
  user: {
    id: string
    name: string
    email: string
    companyId: string
    roles: string[]
  }
}

export interface TicketReplyResponse {
  id: string
  ticketId: string
  replierId: string
  replierName: string
  content: string
  createdAt: string
}

export interface TicketResponse {
  id: string
  title: string
  description: string
  category: string
  slaPriority: string
  status: TicketStatus
  companyId: string
  submitterId: string
  submitterName: string
  submitterEmail: string
  submitterDepartment?: string | null
  handlerId?: string | null
  handlerName?: string | null
  assignedGroupName?: string | null
  createdAt: string
  handledAt?: string | null
  replies?: TicketReplyResponse[]
}

export interface TicketListItem {
  id: string
  title: string
  category: string
  slaPriority: string
  status: TicketStatus
  submitterName: string
  handlerName?: string | null
  createdAt: string
}

export interface TicketListResponse {
  items: TicketListItem[]
  total: number
  page: number
  pageSize: number
}

export interface BusinessGroupResponse {
  id: string
  companyId: string
  name: string
  createdAt: string
}

export interface BusinessGroupMemberResponse {
  userId: string
  userName: string
  email: string
}

export interface BusinessGroupWithMembersResponse {
  id: string
  name: string
  members: BusinessGroupMemberResponse[]
}

export interface AddMemberResponse {
  groupId: string
  userId: string
  userName: string
}

export interface AssignmentRuleResponse {
  id: string
  companyId: string
  category: string
  groupId: string
  groupName: string
}

export interface TransferResponse {
  ticketId: string
  fromUserId: string
  toGroupId: string | null
  toUserId: string | null
  reason: string
  createdAt: string
}

export interface HistoryTicketItem {
  id: string
  title: string
  status: TicketStatus
  createdAt: string
}

export interface SubmitterInfoResponse {
  userId: string
  name: string
  email: string
  companyName: string
  department: string | null
  historyTickets: HistoryTicketItem[]
}

export interface CompleteTicketResponse {
  id: string
  status: 'completed'
  handlerId: string
  handlerName: string
  handledAt: string
}

export interface EvaluationResponse {
  id: string
  ticketId: string
  rating: number
  comment: string | null
  createdAt: string
}

export interface DistributionItem {
  label: string
  total: number
  pending: number
  completed: number
  cancelled: number
}

export interface DistributionResponse {
  dimension: 'company' | 'department'
  items: DistributionItem[]
}

export interface DashboardResponse {
  totalTickets: number
  pendingTickets: number
  completedTickets: number
  cancelledTickets: number
  avgResponseTimeHours: number
  satisfactionScore: number
  hotCategories: { category: string; count: number }[]
}

export interface AuditLogItem {
  id: string
  actorId: string
  actorName: string
  action: string
  entityType: string
  entityId: string
  metadata: Record<string, unknown>
  createdAt: string
}

export interface AuditLogResponse {
  items: AuditLogItem[]
  total: number
  page: number
  pageSize: number
}

export interface ErrorResponse {
  error: string
  details?: Record<string, unknown>
}
