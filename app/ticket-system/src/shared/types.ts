// 单系统共享类型与常量

export const TICKET_STATUSES = ['created', 'pending_assign', 'pending_process', 'completed', 'cancelled'] as const
export type TicketStatus = typeof TICKET_STATUSES[number]

export const SLA_PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'P4'] as const
export type SlaPriority = typeof SLA_PRIORITIES[number]

export const USER_ROLES = ['submitter', 'handler', 'admin'] as const
export type UserRole = typeof USER_ROLES[number]

export type Ticket = {
  id: string
  subject: string
  description: string
  category: string
  sla_priority: SlaPriority
  status: TicketStatus
  submitter_id: string
  submitter_name: string
  submitter_email: string
  submitter_company: string | null
  submitter_department: string | null
  assigned_group_id: string | null
  assigned_handler_id: string | null
  handler_id: string | null
  handler_name: string | null
  processed_at: string | null
  created_at: string
  updated_at: string
}

export type TicketReply = {
  id: string
  ticket_id: string
  user_id: string
  user_name: string
  content: string
  created_at: string
}

export type TicketTransfer = {
  id: string
  ticket_id: string
  from_user_id: string
  from_user_name: string
  to_group_id: string | null
  to_user_id: string | null
  to_user_name: string | null
  reason: string | null
  created_at: string
}

export type TicketEvaluation = {
  id: string
  ticket_id: string
  rating: number
  comment: string | null
  created_at: string
}

export type Company = {
  id: string
  name: string
  created_by: string
  created_at: string
}

export type BusinessGroup = {
  id: string
  company_id: string
  name: string
  created_at: string
}

export type BusinessGroupMember = {
  id: string
  group_id: string
  user_id: string
  user_name: string
}

export type CategoryAssignmentRule = {
  id: string
  company_id: string
  category: string
  group_id: string
  group_name: string
  created_at: string
}

export type TicketDetail = Ticket & {
  replies: TicketReply[]
  transfers: TicketTransfer[]
  evaluation: { rating: number; comment: string | null; created_at: string } | null
}

export type SubmitterInfo = {
  name: string
  email: string
  company: string | null
  department: string | null
  history_tickets: Array<{
    id: string
    subject: string
    category: string
    sla_priority: string
    status: string
    created_at: string
  }>
}

export type AuthUser = {
  id: string
  name: string
  email: string
  role: UserRole
  company: string | null
  department: string | null
}
