// 前端类型定义，依据 docs/wi-t1000077/technical-contract.md。
// src/shared/ 由后端任务（T01）拥有，前端在 src/client/ 内镜像契约类型。
// 所有 ID 为 TEXT（string），匹配 userkit/authkit/auditkit 平台实现。

export type Role = 'submitter' | 'handler' | 'admin'

export type TicketStatus =
  | 'pending_assignment'
  | 'pending_processing'
  | 'completed'
  | 'cancelled'

export type SlaPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'

export type LogAction =
  | 'ticket_created'
  | 'ticket_assigned'
  | 'ticket_transferred'
  | 'ticket_processed'
  | 'ticket_completed'
  | 'ticket_cancelled'
  | 'ticket_rated'
  | 'ticket_replied'

export interface CurrentUser {
  id: string
  displayName: string
  email: string
  role: Role
  companyId: string | null
  companyName: string
  departmentId: string | null
  departmentName: string | null
  passwordChangeRequired?: boolean
}

export interface TicketListItem {
  id: string
  title: string
  status: TicketStatus
  slaPriority: SlaPriority
  categoryName: string
  submitterName: string
  createdAt: string
}

export interface TicketListResponse {
  items: TicketListItem[]
  total: number
}

export interface TicketReply {
  id: string
  replierId: string
  replierName: string
  content: string
  createdAt: string
}

export interface TicketSatisfaction {
  rating: number
  comment: string | null
  createdAt: string
}

export interface TicketSubmitter {
  id: string
  displayName: string
  email: string
  companyName: string
  departmentName: string | null
}

export interface TicketDetail {
  id: string
  title: string
  description: string
  categoryId: string
  categoryName: string
  slaPriority: SlaPriority
  status: TicketStatus
  companyId: string
  submitter: TicketSubmitter
  businessGroupId: string | null
  handlerId: string | null
  handlerName: string | null
  replies: TicketReply[]
  createdAt: string
  assignedAt: string | null
  processedAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  satisfaction: TicketSatisfaction | null
}

export interface TicketCreateResponse {
  id: string
  title: string
  description: string
  categoryId: string
  slaPriority: SlaPriority
  status: TicketStatus
  businessGroupId: string | null
  createdAt: string
}

export interface BusinessGroupMember {
  userId: string
  displayName: string
}

export interface BusinessGroup {
  id: string
  name: string
  companyId: string
  members: BusinessGroupMember[] | null
}

export interface Category {
  id: string
  name: string
  companyId: string
}

export interface AssignmentRule {
  id: string
  categoryId: string
  categoryName: string
  businessGroupId: string
  businessGroupName: string
}

export interface UserHistoryTicket {
  id: string
  title: string
  status: TicketStatus
  slaPriority: SlaPriority
  createdAt: string
}

export interface UserHistoryResponse {
  items: UserHistoryTicket[]
  total: number
}

export interface DistributionItem {
  name: string
  count: number
  pendingCount: number
  completedCount: number
}

export interface HotCategory {
  categoryId: string
  categoryName: string
  count: number
}

export interface StatisticsDashboard {
  totalTickets: number
  avgResponseTime: number
  avgSatisfaction: number
  hotCategories: HotCategory[]
}

export interface LogEntry {
  id: string
  action: string
  ticketId: string
  userId: string
  userName: string
  createdAt: string
  details: Record<string, unknown> | null
}

export interface LogListResponse {
  items: LogEntry[]
  total: number
}

export interface TicketListParams {
  page?: number
  pageSize?: number
  status?: string
  slaPriority?: string
  categoryId?: string
  companyId?: string
  search?: string
  sortBy?: string
  sortOrder?: string
}
