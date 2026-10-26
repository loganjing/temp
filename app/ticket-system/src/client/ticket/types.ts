// 工单系统前端类型契约
// 依据 docs/wi-t1000050/technical-contract.md 定义，所有实体 ID 均为 string(UUID)。

export type TicketStatus =
  | 'created'
  | 'pending_assignment'
  | 'pending_processing'
  | 'completed'
  | 'cancelled'

export type Priority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'

export type Role = 'submitter' | 'admin' | 'processor'

export type SortKey = 'created_desc' | 'priority_desc'

export interface Category {
  id: string
  name: string
}

export interface TicketListItem {
  id: string
  title: string
  categoryId: string
  categoryName: string
  priority: Priority
  status: TicketStatus
  submitterId: string
  submitterName: string
  assignedGroupId: string | null
  assigneeId: string | null
  createdAt: string
  processedAt: string | null
}

export interface TicketReply {
  id: string
  replierId: string
  replierName: string
  content: string
  createdAt: string
}

export interface TicketDetail {
  id: string
  title: string
  description: string
  categoryId: string
  categoryName: string
  priority: Priority
  status: TicketStatus
  submitterId: string
  submitterName: string
  companyId: string
  assignedGroupId: string | null
  assigneeId: string | null
  processorId: string | null
  processorName: string | null
  createdAt: string
  processedAt: string | null
  replies: TicketReply[]
  rating: number | null
}

export interface CreateTicketResponse {
  id: string
  title: string
  description: string
  categoryId: string
  priority: Priority
  status: TicketStatus
  submitterId: string
  companyId: string
  assignedGroupId: string | null
  createdAt: string
}

export interface TicketListResponse {
  items: TicketListItem[]
  total: number
  page: number
  pageSize: number
}

export interface CreateTicketBody {
  title: string
  description: string
  categoryId: string
  priority: Priority
}

export interface SubmitterInfo {
  name: string
  companyName: string
  department: string | null
  historyTickets: {
    id: string
    title: string
    status: TicketStatus
    createdAt: string
  }[]
}

export interface BusinessGroupMember {
  id: string
  name: string
}

export interface BusinessGroup {
  id: string
  name: string
  companyId: string
  members: BusinessGroupMember[]
}

export interface AssignmentRule {
  id: string
  companyId: string
  categoryId: string
  categoryName: string
  targetGroupId: string
  targetGroupName: string
}

export interface DashboardData {
  totalTickets: number
  avgResponseTimeHours: number
  avgSatisfaction: number | null
  hotCategories: {
    categoryId: string
    categoryName: string
    ticketCount: number
  }[]
}

export interface DistributionData {
  dimension: string
  items: {
    key: string
    label: string
    ticketCount: number
  }[]
}

export interface AuditLog {
  id: string
  eventType: string
  actorId: string
  actorName: string
  ticketId: string
  detail: Record<string, unknown>
  createdAt: string
}

export interface AuditLogListResponse {
  items: AuditLog[]
  total: number
  page: number
  pageSize: number
}

export const TICKET_STATUSES: TicketStatus[] = [
  'created',
  'pending_assignment',
  'pending_processing',
  'completed',
  'cancelled',
]

export const PRIORITIES: Priority[] = ['P0', 'P1', 'P2', 'P3', 'P4']

export const SORT_OPTIONS: SortKey[] = ['created_desc', 'priority_desc']
