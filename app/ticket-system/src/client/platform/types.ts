// 工单系统前端类型定义，依据 docs/wi-t1000392/technical-contract.md 字段级契约。

export type TicketStatus =
  | 'created'
  | 'pending_assignment'
  | 'pending_processing'
  | 'completed'
  | 'cancelled'

export type SlaPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface CurrentUser {
  id: string
  email: string
  name?: string
  displayName?: string
  companyId?: string | null
  departmentId?: string | null
  role?: string
  passwordChangeRequired?: boolean
}

export interface Category {
  id: string
  name: string
  description?: string | null
}

export interface TicketListItem {
  id: string
  subject: string
  categoryName: string
  slaPriority: SlaPriority
  status: TicketStatus
  submitterName: string
  assignedGroupName: string | null
  createdAt: string
  updatedAt: string
}

export interface TicketReply {
  id: string
  ticketId?: string
  replierId: string
  replierName: string
  content: string
  createdAt: string
}

export interface TicketDetail {
  id: string
  companyId: string
  subject: string
  description: string
  categoryId: string
  categoryName: string
  slaPriority: SlaPriority
  submitterId: string
  submitterName: string
  submitterEmail: string
  status: TicketStatus
  assignedGroupId: string | null
  assignedGroupName: string | null
  handlerId: string | null
  createdAt: string
  updatedAt: string
  replies: TicketReply[]
}

export interface TicketTransfer {
  id: string
  ticketId: string
  fromGroupId: string | null
  toGroupId: string
  transferredBy: string
  transferredAt: string
  reason: string | null
}

export interface CompleteResult {
  id: string
  ticketId: string
  handlerId: string
  handlerName: string
  processedAt: string
  emailSent: boolean
  ticketStatus: 'completed'
}

export interface SubmitterHistoryTicket {
  id: string
  subject: string
  status: TicketStatus
  slaPriority: SlaPriority
  createdAt: string
  updatedAt: string
}

export interface SubmitterInfo {
  userId: string
  displayName: string
  email: string
  companyName: string
  departmentName: string | null
  historyTickets: SubmitterHistoryTicket[]
}

export interface SatisfactionRating {
  id: string
  ticketId: string
  rating: number
  comment: string | null
  createdAt: string
}

export interface BusinessGroupMember {
  id: string
  userId: string
  displayName: string
}

export interface BusinessGroup {
  id: string
  name: string
  companyId: string
  memberCount?: number
  members?: BusinessGroupMember[]
  createdAt: string
}

export interface CategoryAssignmentRule {
  id: string
  companyId: string
  categoryId: string
  categoryName?: string
  targetGroupId: string
  targetGroupName?: string
  createdAt: string
}

export interface DashboardData {
  totalTickets: number
  pendingTickets: number
  completedTickets: number
  averageResponseTimeMinutes: number
  averageSatisfactionScore: number
  hotCategories: { categoryId: string; categoryName: string; ticketCount: number }[]
  byPriority: Record<SlaPriority, number>
}

export interface DistributionItem {
  dimensionId: string
  dimensionName: string
  ticketCount: number
  byStatus: Record<TicketStatus, number>
}

export interface DistributionResult {
  dimension: 'company' | 'department'
  items: DistributionItem[]
}

export interface AuditLog {
  id: string
  eventType: string
  entityType: string
  entityId: string
  actorId: string
  actorName: string
  payload: Record<string, unknown>
  createdAt: string
}

export interface ListTicketsParams {
  status?: TicketStatus
  categoryId?: string
  slaPriority?: SlaPriority
  companyId?: string
  search?: string
  sort?: 'created_at' | 'sla_priority' | 'updated_at'
  order?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export interface WorkbenchTicketsParams {
  companyId?: string
  assignedGroupId?: string
  slaPriority?: SlaPriority
  search?: string
  sort?: 'created_at' | 'sla_priority'
  order?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}
