/** Platform-neutral TypeScript types and enums shared by server and client. */

export const TICKET_STATUSES = ['created', 'pending_assignment', 'pending_processing', 'completed', 'cancelled'] as const
export type TicketStatus = (typeof TICKET_STATUSES)[number]

export const TICKET_PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'P4'] as const
export type TicketPriority = (typeof TICKET_PRIORITIES)[number]

export const RATING_VALUES = [1, 2, 3, 4, 5] as const
export type RatingValue = (typeof RATING_VALUES)[number]

export const ROLE_KEYS = ['submitter', 'handler', 'admin'] as const
export type RoleKey = (typeof ROLE_KEYS)[number]

export interface Ticket {
  id: string
  company_id: string
  title: string
  description: string
  category_id: string | null
  category_name: string | null
  status: TicketStatus
  priority: TicketPriority
  submitter_id: string
  submitter_name: string
  submitter_email: string
  assigned_group_id: string | null
  assigned_group_name: string | null
  assigned_user_id: string | null
  processed_by: string | null
  processed_at: string | null
  created_at: string
  updated_at: string
}

export interface PaginatedTickets {
  tickets: Ticket[]
  total: number
}

export interface TicketReply {
  id: string
  ticket_id: string
  author_id: string
  author_name: string
  content: string
  created_at: string
}

export interface SubmitterInfo {
  submitter: {
    id: string
    name: string
    email: string
    phone: string | null
    company_id: string | null
    company_name: string | null
    department_id: string | null
    department_name: string | null
  }
  history_tickets: Array<{
    id: string
    title: string
    status: string
    priority: string
    created_at: string
    completed_at: string | null
  }>
}

export interface SatisfactionRating {
  id: string
  ticket_id: string
  rating: number
  comment: string | null
  created_at: string
}

export interface DistributionResponse {
  dimension: 'company' | 'department'
  items: Array<{
    key: string
    label: string
    total: number
    by_status: Record<string, number>
  }>
}

export interface DashboardResponse {
  total_tickets: number
  by_status: Record<string, number>
  by_priority: Record<string, number>
  avg_response_time_ms: number | null
  avg_satisfaction: number | null
  satisfaction_count: number
  hot_categories: Array<{
    category_id: string
    category_name: string
    count: number
  }>
}

export interface AuditEventItem {
  id: string
  occurred_at: string
  event_type: string
  actor_user_id: string | null
  metadata_json: string
}
