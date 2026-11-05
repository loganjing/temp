// 平台中立的工单业务类型契约，供服务端与前端共享。
// 字段命名与 technical-contract.md 的 API JSON 结构一致（camelCase）。

export type TicketStatus =
  | 'created'
  | 'pending_assignment'
  | 'pending_processing'
  | 'completed'
  | 'cancelled'

export type SlaPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'

export type TicketRoleKey = 'ticket_submitter' | 'ticket_handler' | 'ticket_admin' | 'admin'

export interface Ticket {
  id: string
  companyId: string
  subject: string
  description: string
  category: string
  slaPriority: SlaPriority
  status: TicketStatus
  submitterId: string
  submitterName: string
  assignedGroupId: string | null
  assigneeId: string | null
  handlerId: string | null
  createdAt: string
  handledAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  cancelledBy: string | null
}

export interface TicketReply {
  id: string
  ticketId: string
  replierId: string
  replierName: string
  content: string
  repliedAt: string
}

export interface TicketTransfer {
  id: string
  ticketId: string
  fromGroupId: string | null
  fromAssigneeId: string | null
  toGroupId: string
  toAssigneeId: string | null
  transferredBy: string
  transferredAt: string
  reason: string | null
}

export interface TicketEvaluation {
  id: string
  ticketId: string
  submitterId: string
  rating: number
  comment: string | null
  evaluatedAt: string
}

export interface BusinessGroupMember {
  userId: string
  userName: string
  userEmail: string
}

export interface BusinessGroup {
  id: string
  companyId: string
  name: string
  createdAt: string
  members: BusinessGroupMember[]
}

export interface CategoryRule {
  id: string
  companyId: string
  category: string
  businessGroupId: string
  businessGroupName: string
  createdAt: string
}

export interface SubmitterInfo {
  submitter: {
    id: string
    name: string
    email: string
    phone: string | null
    companyId: string
    companyName: string
    departmentId: string | null
    departmentName: string | null
  }
  historyTickets: Array<{
    id: string
    subject: string
    status: TicketStatus
    category: string
    createdAt: string
  }>
}

export interface AuditEvent {
  id: string
  occurredAt: string
  eventType: string
  actorUserId: string | null
  actorName: string | null
  method: string | null
  route: string | null
  statusCode: number | null
  metadataJson: string
}

export interface StatisticsDistribution {
  label: string
  total: number
  pending: number
  completed: number
  cancelled: number
}

export interface StatisticsMetrics {
  totalTickets: number
  avgResponseTimeMinutes: number
  satisfactionScore: number
  hotspotCategories: Array<{ category: string; count: number }>
}

export interface Statistics {
  distribution: StatisticsDistribution[]
  metrics: StatisticsMetrics
}

export interface TicketListResponse {
  tickets: Ticket[]
  total: number
}

export interface ApiError {
  error: { code: string; message: string }
}
