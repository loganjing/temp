// Platform-neutral API request/response contracts shared by server and client.
// IDs are string (UUID v4). Times are ISO 8601 strings.

export type TicketStatus =
  | 'created'
  | 'pending_assignment'
  | 'pending_processing'
  | 'completed'
  | 'cancelled'

export type TicketPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'

export type Role = 'submitter' | 'handler' | 'admin'

export interface TicketRecord {
  id: string
  company_id: string
  subject: string
  description: string | null
  category: string
  priority: TicketPriority
  status: TicketStatus
  submitter_id: string
  assigned_group_id: string | null
  assigned_handler_id: string | null
  completed_at: string | null
  completed_by: string | null
  first_assigned_at: string | null
  created_at: string
}

export interface CreateTicketRequest {
  subject: string
  description: string
  category: string
  priority: TicketPriority
}

export interface UpdateTicketRequest {
  subject?: string
  description?: string
  category?: string
  priority?: TicketPriority
}

export interface TicketStatusActionRequest {
  action: 'assign' | 'process' | 'complete' | 'cancel'
  assigned_group_id?: string
  assigned_handler_id?: string
}

export interface TicketReplyRecord {
  id: string
  ticket_id: string
  author_id: string
  content: string
  created_at: string
}

export interface CreateReplyRequest {
  content: string
}

export interface TicketTransferRequest {
  to_handler_id?: string
  to_group_id?: string
  reason?: string
}

export interface TicketTransferRecord {
  id: string
  ticket_id: string
  from_handler_id: string | null
  from_group_id: string | null
  to_handler_id: string | null
  to_group_id: string | null
  reason: string | null
  created_at: string
}

export interface TicketEvaluationRecord {
  id: string
  ticket_id: string
  rating: number
  comment: string | null
  created_at: string
}

export interface SubmitEvaluationRequest {
  rating: number
  comment?: string
}

export interface CancelTicketRequest {
  reason?: string
}

export interface BusinessGroupRecord {
  id: string
  company_id: string
  name: string
  created_at: string
}

export interface BusinessGroupMemberRecord {
  id: string
  group_id: string
  user_id: string
  created_at: string
}

export interface AssignmentRuleRecord {
  id: string
  company_id: string
  category: string
  business_group_id: string
  created_at: string
}

export interface SubmitterInfo {
  display_name: string
  email: string
  company: { id: string; name: string }
  department: { id: string | null; name: string | null }
  history_tickets: Array<{
    id: string
    subject: string
    status: string
    priority: string
    created_at: string
  }>
}

export interface DashboardMetrics {
  ticket_count: number
  avg_response_time_hours: number
  avg_satisfaction: number
  hot_topics: Array<{ category: string; count: number }>
}

export interface DistributionResponse {
  distribution: Array<{ dimension: string; count: number }>
}

export interface PaginationMeta {
  page: number
  limit: number
  total: number
}

export interface PaginatedList<T> {
  data: T[]
  pagination: PaginationMeta
}

export interface TicketLogEntry {
  id: string
  action: string
  actor_id: string
  created_at: string
}

export interface ApiError {
  error: { code: string; message: string }
}
