/**
 * 工单系统共享契约层：枚举常量、错误码与 API 请求/响应 TypeScript 类型。
 * 平台中立，禁止导入 Node API、Hono、React 或数据库驱动。
 */

/** 工单状态 */
export const TicketStatus = {
  Created: 'created',
  PendingAssign: 'pending_assign',
  PendingProcess: 'pending_process',
  Completed: 'completed',
  Cancelled: 'cancelled',
} as const
export type TicketStatus = (typeof TicketStatus)[keyof typeof TicketStatus]

/** SLA 优先级 */
export const Priority = {
  P0: 'P0',
  P1: 'P1',
  P2: 'P2',
  P3: 'P3',
  P4: 'P4',
} as const
export type Priority = (typeof Priority)[keyof typeof Priority]

export const PRIORITY_VALUES: readonly Priority[] = ['P0', 'P1', 'P2', 'P3', 'P4']

/** 满意度评分范围 */
export const MIN_RATING = 1
export const MAX_RATING = 5

/** 错误码 */
export const ErrorCode = {
  Validation: 'VALIDATION_ERROR',
  NotFound: 'NOT_FOUND',
  Conflict: 'CONFLICT',
  Internal: 'INTERNAL_ERROR',
} as const
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]

// ---- API 请求体类型 ----

export interface CreateCompanyRequest {
  name: string
}

export interface CreateBusinessGroupRequest {
  name: string
}

export interface AddMemberRequest {
  userId: string
}

export interface CreateCategoryRequest {
  name: string
}

export interface CreateAssignmentRuleRequest {
  categoryId: string
  groupId: string
}

export interface CreateTicketRequest {
  title: string
  description: string
  categoryId: string
  submitterId: string
  priority: Priority
}

export interface CreateReplyRequest {
  replierId: string
  content: string
}

export interface AssignTicketRequest {
  groupId?: string
  handlerId?: string
}

export interface TransferTicketRequest {
  transferredBy: string
  toGroupId?: string
  toHandlerId?: string
}

export interface CompleteTicketRequest {
  processedBy: string
}

export interface CreateEvaluationRequest {
  submitterId: string
  rating: number
  comment?: string
}

// ---- API 响应类型 ----

export interface Company {
  id: string
  name: string
  createdAt: string
}

export interface BusinessGroup {
  id: string
  companyId: string
  name: string
  createdAt: string
  memberCount?: number
}

export interface Member {
  id: string
  groupId: string
  userId: string
  userName: string
  userEmail: string
  createdAt: string
}

export interface Category {
  id: string
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

export interface TicketSummary {
  id: string
  title: string
  categoryName: string
  priority: Priority
  status: TicketStatus
  submitterName: string
  assignedGroupName: string | null
  createdAt: string
}

export interface TicketDetail {
  id: string
  title: string
  description: string
  categoryId: string
  categoryName: string
  submitterId: string
  submitterName: string
  submitterEmail: string
  priority: Priority
  status: TicketStatus
  assignedGroupId: string | null
  assignedGroupName: string | null
  assignedHandlerId: string | null
  assignedHandlerName: string | null
  processedBy: string | null
  processedByName: string | null
  processedAt: string | null
  createdAt: string
  replies: Reply[]
  transfers: Transfer[]
  evaluation: Evaluation | null
}

export interface Reply {
  id: string
  ticketId: string
  replierId: string
  replierName: string
  content: string
  createdAt: string
}

export interface Transfer {
  id: string
  ticketId: string
  fromGroupName: string | null
  fromHandlerName: string | null
  toGroupName: string | null
  toHandlerName: string | null
  transferredByName: string
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

export interface UserDetail {
  id: string
  name: string
  email: string
  companyId: string
  companyName: string | null
  department: string | null
  createdAt: string
}

export interface ListResponse<T> {
  items: T[]
}

export interface ErrorResponse {
  error: { code: string; message: string }
}
