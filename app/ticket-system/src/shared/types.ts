// Platform-neutral shared types and constants for the ticket system.
// No Node API, Hono, React, or DOM dependencies.

export const TICKET_STATUS = {
  CREATED: 'created',
  PENDING_ASSIGN: 'pending_assign',
  PENDING_PROCESS: 'pending_process',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const
export type TicketStatus = typeof TICKET_STATUS[keyof typeof TICKET_STATUS]

export const SLA_PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'P4'] as const
export type SlaPriority = typeof SLA_PRIORITIES[number]

export function isSlaPriority(value: unknown): value is SlaPriority {
  return typeof value === 'string' && (SLA_PRIORITIES as readonly string[]).includes(value)
}

export const AUDIT_EVENT_TYPES = {
  TICKET_CREATED: 'ticket.created',
  TICKET_ASSIGNED: 'ticket.assigned',
  TICKET_TRANSFERRED: 'ticket.transferred',
  TICKET_PROCESSED: 'ticket.processed',
  TICKET_COMPLETED: 'ticket.completed',
  TICKET_CANCELLED: 'ticket.cancelled',
} as const

// API response DTOs
export interface TicketDTO {
  id: string
  companyId: string
  subject: string
  description: string
  category: string
  slaPriority: string
  status: string
  submitterUserId: string
  submitterName: string
  assignedGroupId: string | null
  assignedGroupName: string | null
  assignedUserId: string | null
  handlerUserId: string | null
  createdAt: number
  processedAt: number | null
}

export interface TicketReplyDTO {
  id: string
  ticketId: string
  userId: string
  userFullName: string
  content: string
  createdAt: number
}

export interface TicketEvaluationDTO {
  id: string
  ticketId: string
  userId: string
  rating: number
  createdAt: number
}

export interface SubmitterInfoDTO {
  user: {
    id: string
    fullName: string
    email: string
    companyId: string
    companyName: string
    departmentId: string | null
    departmentName: string | null
  }
  historyTickets: Array<{
    id: string
    subject: string
    status: string
    category: string
    createdAt: number
  }>
}

export interface CompanyDTO {
  id: string
  name: string
  createdAt: number
}

export interface DepartmentDTO {
  id: string
  companyId: string
  name: string
  createdAt: number
}

export interface BusinessGroupDTO {
  id: string
  companyId: string
  name: string
  memberCount: number
  createdAt: number
}

export interface GroupMemberDTO {
  id: string
  groupId: string
  userId: string
  fullName: string
  email: string
  createdAt: number
}

export interface AssignmentRuleDTO {
  id: string
  companyId: string
  category: string
  groupId: string
  groupName: string
  createdAt: number
}

export interface DistributionItemDTO {
  dimensionKey: string
  dimensionName: string
  total: number
  pendingProcess: number
  completed: number
  cancelled: number
}

export interface DashboardDTO {
  ticketCount: {
    total: number
    created: number
    pendingAssign: number
    pendingProcess: number
    completed: number
    cancelled: number
  }
  avgResponseTimeMs: number
  satisfaction: { average: number; count: number }
  hotCategories: Array<{ category: string; count: number }>
}

export interface AuditLogDTO {
  id: string
  eventType: string
  actorId: string | null
  actorName: string | null
  targetType: string
  targetId: string
  metadata: Record<string, unknown>
  createdAt: number
}

export interface TicketListResponse {
  items: TicketDTO[]
  total: number
  page: number
  pageSize: number
}

export interface AuditLogListResponse {
  items: AuditLogDTO[]
  total: number
  page: number
  pageSize: number
}

// API error shape
export interface ApiError {
  error: { code: string; message: string }
}
