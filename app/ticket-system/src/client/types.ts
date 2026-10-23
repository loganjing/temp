export type TicketStatus = 'created' | 'pending_assignment' | 'pending_processing' | 'completed' | 'cancelled'
export type Priority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'

export interface Ticket {
  id: string
  company_id: string
  title: string
  description: string
  category_id: string | null
  category_name: string | null
  status: TicketStatus
  priority: Priority
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

export interface AuditEvent {
  id: string
  occurred_at: string
  event_type: string
  actor_user_id: string | null
  metadata_json: string
}

export interface Company {
  id: string
  name: string
  created_at: string
}

export interface Department {
  id: string
  company_id: string
  name: string
  created_at: string
}

export interface Category {
  id: string
  company_id: string
  name: string
  created_at: string
}

export interface BusinessGroup {
  id: string
  company_id: string
  name: string
  created_at: string
}

export interface GroupMember {
  user_id: string
  name: string
  email: string
  created_at: string
}

export interface AssignmentRule {
  id: string
  company_id: string
  category_id: string
  category_name: string
  target_group_id: string
  target_group_name: string
  created_at: string
}

export interface AdminUser {
  id: string
  name: string
  email: string
  phone: string | null
  enabled: boolean
  company_id: string | null
  created_at: string
}

export interface DashboardStats {
  total_tickets: number
  by_status: Record<TicketStatus, number>
  by_priority: Record<Priority, number>
  avg_response_time_ms: number | null
  avg_satisfaction: number | null
  satisfaction_count: number
  hot_categories: Array<{ category_id: string; category_name: string; count: number }>
}

export interface DistributionItem {
  key: string
  label: string
  total: number
  by_status: Record<TicketStatus, number>
}

export interface DistributionResult {
  dimension: 'company' | 'department'
  items: DistributionItem[]
}

export interface CurrentUser {
  id: string
  name: string
  email: string
  phone: string | null
  companyId: string | null
  roles: string[]
  passwordChangeRequired: boolean
}

export interface LoginResult {
  token: string
  user: CurrentUser
}
