/**
 * 工单系统平台中立的类型与枚举定义。
 * 遵循 technical-contract.md 字段级契约，服务端与客户端共享。
 */

export type TicketStatus =
  | 'created'
  | 'pending_assignment'
  | 'pending_processing'
  | 'completed'
  | 'cancelled'

export type SLAPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'

export type UserRole = 'submitter' | 'handler' | 'admin'

export type TransferTargetType = 'user' | 'group'

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

export interface TicketDetail extends Ticket {
  replies: TicketReply[]
  evaluation: TicketEvaluation | null
}

export interface TicketCategory {
  id: string
  companyId: string
  name: string
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

export interface TicketEvaluation {
  id: string
  ticketId: string
  evaluatorId: string
  evaluatorName: string
  rating: number
  comment: string | null
  createdAt: string
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

export interface UserInfo {
  id: string
  username: string
  email: string
  fullName: string
  companyId: string
  companyName: string
  departmentId: string | null
  departmentName: string | null
  role: UserRole
  createdAt: string
}

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
