/** 前后端共享的 API 类型契约，对应 technical-contract.md 字级定义。 */

export interface Company {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface Department {
  id: string
  companyId: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface GroupMember {
  userId: string
  name: string
  email: string
}

export interface BusinessGroup {
  id: string
  companyId: string
  name: string
  members: GroupMember[]
  createdAt: string
  updatedAt: string
}

export interface Category {
  id: string
  companyId: string
  name: string
  createdAt: string
}

export interface AssignmentRule {
  id: string
  companyId: string
  categoryId: string
  categoryName: string
  groupId: string
  groupName: string
  createdAt: string
}

export type TicketStatus =
  | 'created'
  | 'pending_assignment'
  | 'pending_processing'
  | 'completed'
  | 'cancelled'

export type SlaPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'

export interface TicketReply {
  id: string
  ticketId: string
  replierId: string
  replierName: string
  content: string
  createdAt: string
}

export interface Ticket {
  id: string
  companyId: string
  subject: string
  description: string
  categoryId: string | null
  categoryName: string | null
  submitterId: string
  submitterName: string
  submitterEmail: string
  submitterDepartment: string | null
  slaPriority: string
  status: string
  groupId: string | null
  groupName: string | null
  handlerId: string | null
  handlerName: string | null
  assignedAt: string | null
  handledAt: string | null
  createdAt: string
  updatedAt: string
  replies: TicketReply[]
}

export type TicketListItem = Omit<Ticket, 'replies' | 'description'>

export interface TicketTransfer {
  id: string
  ticketId: string
  fromGroupId: string | null
  fromHandlerId: string | null
  toGroupId: string | null
  toHandlerId: string | null
  transferredBy: string
  createdAt: string
}

export interface Evaluation {
  id: string
  ticketId: string
  submitterId: string
  rating: number
  comment: string | null
  createdAt: string
}

export interface SubmitterInfo {
  userId: string
  name: string
  email: string
  phone: string | null
  companyName: string | null
  departmentName: string | null
  historyTickets: TicketListItem[]
}

export interface DistributionItem {
  key: string
  total: number
  byStatus: {
    created: number
    pending_assignment: number
    pending_processing: number
    completed: number
    cancelled: number
  }
}

export interface DistributionResponse {
  dimension: string
  items: DistributionItem[]
}

export interface HotCategory {
  categoryId: string
  categoryName: string
  count: number
}

export interface DashboardResponse {
  totalTickets: number
  avgResponseTimeHours: number
  avgSatisfaction: number | null
  hotCategories: HotCategory[]
}

export interface AuditLogEntry {
  id: string
  eventType: string
  actorUserId: string | null
  actorName: string | null
  occurredAt: string
  metadata: Record<string, unknown>
}

/** 分页列表响应通用结构 */
export interface ListResponse<T> {
  total: number
}
