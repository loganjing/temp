// 工单系统前端类型定义，基于 technical-contract.md 契约。
// 实体 ID 全程为 string，无需类型转换。

export type TicketStatus =
  | 'created'
  | 'pending_assignment'
  | 'pending_processing'
  | 'completed'
  | 'cancelled'

export type SLAPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'

export type UserRole = 'submitter' | 'handler' | 'admin'

export type TransferTargetType = 'user' | 'group'

export interface UserInfo {
  id: string
  username: string
  email: string
  fullName: string
  name?: string // 兼容当前服务端返回的 name 字段
  phone?: string | null
  companyId: string
  companyName: string
  departmentId: string | null
  departmentName: string | null
  role: UserRole
  roles?: string[] // 兼容当前服务端返回的多角色数组
  createdAt: string
  passwordChangeRequired?: boolean
}

export interface Ticket {
  id: string
  title: string
  description: string
  categoryId: string
  categoryName: string
  companyId: string
  submitterId: string
  submitterName: string
  slaPriority: SLAPriority
  status: TicketStatus
  assignedGroupId: string | null
  assignedGroupName: string | null
  assignedHandlerId: string | null
  assignedHandlerName: string | null
  handlerId: string | null
  handlerName: string | null
  handledAt: string | null
  createdAt: string
  updatedAt: string
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
  evaluatorId: string
  evaluatorName: string
  rating: number
  comment: string | null
  createdAt: string
}

export interface TicketTransfer {
  id: string
  ticketId: string
  transferredBy: string
  transferredByName: string
  targetType: TransferTargetType
  targetUserId: string | null
  targetUserName: string | null
  targetGroupId: string | null
  targetGroupName: string | null
  reason: string | null
  createdAt: string
}

export interface TicketDetail extends Ticket {
  replies: TicketReply[]
  evaluation: TicketEvaluation | null
  transfers?: TicketTransfer[]
}

export interface SubmitterInfo {
  id: string
  fullName: string
  email: string
  companyId: string
  companyName: string
  departmentId: string | null
  departmentName: string | null
  ticketCount: number
  historyTickets: {
    id: string
    title: string
    status: TicketStatus
    slaPriority: SLAPriority
    createdAt: string
  }[]
}

export interface OperationLog {
  id: string
  actorId: string
  actorName: string
  actionType: string
  targetType: string
  targetId: string
  detail: string | null
  createdAt: string
}

export interface BusinessGroup {
  id: string
  companyId: string
  name: string
  memberCount: number
  createdAt: string
}

export interface BusinessGroupMember {
  id: string
  groupId: string
  userId: string
  userName: string
  userEmail: string
  createdAt: string
}

export interface AutoAssignRule {
  id: string
  companyId: string
  categoryId: string
  categoryName: string
  targetGroupId: string
  targetGroupName: string
  createdAt: string
}

export interface TicketCategory {
  id: string
  companyId: string
  name: string
  createdAt: string
}

export interface PagedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface DistributionGroup {
  key: string
  label: string
  total: number
  byStatus: Record<TicketStatus, number>
}

export interface DistributionResult {
  dimension: string
  groups: DistributionGroup[]
}

export interface DashboardData {
  totalTickets: number
  byStatus: Record<TicketStatus, number>
  averageResponseTimeHours: number
  satisfactionScore: number
  totalEvaluations: number
  topCategories: { categoryId: string; categoryName: string; count: number }[]
}

export interface UserListItem {
  id: string
  name: string
  email: string
  phone?: string | null
}
