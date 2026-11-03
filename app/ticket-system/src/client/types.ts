/** 工单系统类型定义，基于 docs/wi-t1000078/technical-contract.md */

export type Priority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'
export type TicketStatus = 'created' | 'pending_assignment' | 'pending_processing' | 'completed' | 'cancelled'
export type Role = 'submitter' | 'handler' | 'admin'
export type SortField = 'created_at' | 'priority' | 'status'
export type SortOrder = 'asc' | 'desc'
export type StatisticsDimension = 'company' | 'department'

export interface Ticket {
  id: string
  subject: string
  description: string
  category: string
  priority: Priority
  status: TicketStatus
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

export interface Reply {
  id: string
  ticketId: string
  replierId: string
  replierName: string
  content: string
  createdAt: string
}

export interface Evaluation {
  id: string
  ticketId: string
  rating: number
  comment: string | null
  createdAt: string
}

export interface TicketLog {
  id: string
  action: string
  operatorId: string
  operatorName: string
  createdAt: string
  details: string
}

export interface RecentLog {
  id: string
  action: string
  operatorName: string
  createdAt: string
}

export interface TicketDetail extends Ticket {
  replies: Reply[]
  evaluation: Evaluation | null
  recentLogs: RecentLog[]
}

export interface TicketListResponse {
  items: Ticket[]
  total: number
  page: number
  pageSize: number
}

export interface LoginUser {
  id: string
  name: string
  role: Role
  companyId: string
  passwordChangeRequired?: boolean
}

export interface LoginResponse {
  token: string
  user: LoginUser
}

export interface CurrentUser {
  id: string
  name: string
  email: string
  role: Role
  companyId: string
  departmentId: string | null
}

export interface SubmitterProfile {
  id: string
  name: string
  email: string
  companyName: string
  departmentName: string | null
  ticketHistory: { id: string; subject: string; status: string; createdAt: string }[]
}

export interface BusinessGroup {
  id: string
  name: string
  companyId: string
  memberCount: number
  createdAt: string
}

export interface BusinessGroupMember {
  id: string
  groupId: string
  userId: string
  createdAt: string
}

export interface AssignmentRule {
  id: string
  companyId: string
  category: string
  targetGroupId: string
  targetGroupName: string
  createdAt: string
}

export interface StatisticsOverview {
  totalTickets: number
  pendingTickets: number
  completedTickets: number
  cancelledTickets: number
  avgResponseTimeHours: number | null
  avgSatisfaction: number | null
  hotCategories: { category: string; count: number }[]
}

export interface StatisticsDistribution {
  dimension: string
  items: { key: string; label: string; count: number }[]
}
