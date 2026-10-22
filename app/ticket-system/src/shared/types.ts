// Shared DTO types for the ticket system, used by both server and client.
// Field names and nullability follow docs/wi-t1000016/technical-contract.md §7.

export type TicketStatus = 'created' | 'unassigned' | 'pending' | 'completed' | 'cancelled'
export type TicketPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'
export type UserRole = 'submitter' | 'handler' | 'admin'

export interface TicketDTO {
  id: string
  subject: string
  description: string
  categoryId: string
  categoryName: string
  priority: TicketPriority
  status: TicketStatus
  submitterId: string
  submitterName: string
  handlerId: string | null
  handlerName: string | null
  groupId: string | null
  groupName: string | null
  createdAt: string
  completedAt: string | null
}

export interface TicketReplyDTO {
  id: string
  ticketId: string
  replierId: string
  replierName: string
  content: string
  createdAt: string
}

export interface EvaluationDTO {
  id: string
  ticketId: string
  rating: number
  comment: string | null
  createdAt: string
}

export interface TicketDetailDTO extends TicketDTO {
  replies: TicketReplyDTO[]
  evaluation: EvaluationDTO | null
}

export interface UserDTO {
  id: string
  name: string
  email: string
  companyId: string
  companyName: string
  department: string
  role: UserRole
}

export interface SubmitterInfoDTO {
  user: UserDTO
  historyTickets: TicketDTO[]
}

export interface BusinessGroupDTO {
  id: string
  name: string
  companyId: string
  members: MemberDTO[]
  createdAt: string
}

export interface MemberDTO {
  id: string
  groupId: string
  userId: string
  userName: string
  email: string
}

export interface CategoryDTO {
  id: string
  name: string
  companyId: string
}

export interface AssignmentRuleDTO {
  id: string
  companyId: string
  categoryId: string
  categoryName: string
  groupId: string
  groupName: string
}

export interface LogEntryDTO {
  id: string
  ticketId: string
  action: string
  operatorId: string
  operatorName: string
  createdAt: string
}

export interface CategoryStatDTO {
  categoryId: string
  categoryName: string
  ticketCount: number
}

export interface DashboardStatsDTO {
  totalTickets: number
  pendingCount: number
  completedCount: number
  avgResponseTime: number
  satisfactionScore: number
  hotCategories: CategoryStatDTO[]
}

export interface DistributionDTO {
  label: string
  count: number
}

// Unified API response shapes (§1.3)
export interface ApiSingle<T> { data: T }
export interface ApiList<T> { data: T[]; total: number; page: number; pageSize: number }
export interface ApiError { error: { code: string; message: string } }
