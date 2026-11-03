import type { TicketPriorityValue, TicketStatusValue } from './constants'

export interface Ticket {
  id: string
  subject: string
  description: string
  category: string
  priority: TicketPriorityValue
  status: TicketStatusValue
  submitterId: string
  submitterName: string
  submitterEmail: string
  assignedGroupId: string | null
  handlerId: string | null
  companyId: string
  createdAt: string
  completedAt: string | null
  cancelledAt: string | null
}

export interface TicketReply {
  id: string
  ticketId: string
  replierId: string
  replierName: string
  content: string
  createdAt: string
}

export interface TicketEvaluation {
  id: string
  ticketId: string
  rating: number
  comment: string | null
  createdAt: string
}

export interface TicketLogEntry {
  id: string
  action: string
  operatorId: string
  operatorName: string
  createdAt: string
  details: string
}

export interface TicketDetail extends Ticket {
  replies: TicketReply[]
  evaluation: TicketEvaluation | null
  recentLogs: Pick<TicketLogEntry, 'id' | 'action' | 'operatorName' | 'createdAt'>[]
}

export interface TicketListResponse {
  items: Ticket[]
  total: number
  page: number
  pageSize: number
}

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  token: string
  user: {
    id: string
    name: string
    role: string
    companyId: string
  }
}

export interface CreateTicketRequest {
  subject: string
  description: string
  category: string
  priority: 'P0' | 'P1' | 'P2' | 'P3' | 'P4'
}

export interface UpdateTicketStatusRequest {
  status: 'pending_processing' | 'completed' | 'cancelled'
}

export interface CreateReplyRequest {
  content: string
}

export interface TransferTicketRequest {
  targetGroupId: string
}

export interface CompleteTicketRequest {
  summary?: string
}

export interface CreateEvaluationRequest {
  rating: 1 | 2 | 3 | 4 | 5
  comment?: string | null
}

export interface CreateBusinessGroupRequest {
  name: string
}

export interface AddMemberRequest {
  userId: string
}

export interface CreateAssignmentRuleRequest {
  category: string
  targetGroupId: string
}

export interface StatisticsOverview {
  totalTickets: number
  pendingTickets: number
  completedTickets: number
  cancelledTickets: number
  avgResponseTimeHours: number | null
  avgSatisfaction: number | null
  hotCategories: Array<{ category: string; count: number }>
}

export interface StatisticsDistribution {
  dimension: string
  items: Array<{ key: string; label: string; count: number }>
}

export interface UserProfile {
  id: string
  name: string
  email: string
  companyName: string
  departmentName: string | null
  ticketHistory: Array<{ id: string; subject: string; status: string; createdAt: string }>
}

export interface ApiError {
  error: {
    code: string
    message: string
    details?: string[]
  }
}
