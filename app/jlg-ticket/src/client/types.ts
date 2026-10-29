// API 契约类型 — 严格依据 docs/wi-t1000484/technical-contract.md 定义。
// src/shared/ 由 T01 持有（并行任务），前端在 src/client/types.ts 内镜像契约，
// 待 T01 交付 src/shared/ 后可迁移至共享层。

/** 工单状态 */
export type TicketStatus =
  | 'created'
  | 'pending_assign'
  | 'pending_process'
  | 'completed'
  | 'cancelled'

/** SLA 优先级 */
export type Priority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'

/** 公司 */
export interface Company {
  id: string
  name: string
  createdAt: string
}

/** 业务组 */
export interface BusinessGroup {
  id: string
  companyId: string
  name: string
  createdAt: string
  memberCount: number
}

/** 业务组成员 */
export interface Member {
  id: string
  groupId: string
  userId: string
  userName: string
  userEmail: string
  createdAt: string
}

/** 问题分类 */
export interface Category {
  id: string
  name: string
  createdAt: string
}

/** 分类分配规则 */
export interface AssignmentRule {
  id: string
  companyId: string
  categoryId: string
  categoryName: string
  groupId: string
  groupName: string
  createdAt: string
}

/** 工单摘要 */
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

/** 工单回复 */
export interface Reply {
  id: string
  ticketId: string
  replierId: string
  replierName: string
  content: string
  createdAt: string
}

/** 转派记录 */
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

/** 工单评价 */
export interface Evaluation {
  id: string
  ticketId: string
  submitterId: string
  rating: number
  comment: string | null
  createdAt: string
}

/** 工单详情 */
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

/** 用户详情 */
export interface UserDetail {
  id: string
  name: string
  email: string
  companyId: string
  companyName: string | null
  department: string | null
  createdAt: string
}

// ---- 响应包裹 ----
export interface ListResponse<T> {
  items: T[]
}

// ---- 创建工单响应（同 TicketDetail 的部分字段）----
export interface CreateTicketResponse {
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
  createdAt: string
}

// ---- 操作响应 ----
export interface AssignResponse {
  id: string
  status: TicketStatus
  assignedGroupId: string | null
  assignedHandlerId: string | null
}

export interface TransferResponse {
  id: string
  status: TicketStatus
  assignedGroupId: string | null
  assignedHandlerId: string | null
  transferRecord: Transfer
}

export interface CompleteResponse {
  id: string
  status: TicketStatus
  processedBy: string
  processedAt: string
}

export interface CancelResponse {
  id: string
  status: TicketStatus
}

export interface ReplyResponse {
  id: string
  ticketId: string
  replierId: string
  replierName: string
  content: string
  createdAt: string
}

export interface EvaluationResponse {
  id: string
  ticketId: string
  submitterId: string
  rating: number
  comment: string | null
  createdAt: string
}

export interface RemovedResponse {
  removed: boolean
}

// ---- 请求体 ----
export interface CreateTicketBody {
  title: string
  description: string
  categoryId: string
  submitterId: string
  priority: Priority
}

export interface CreateReplyBody {
  replierId: string
  content: string
}

export interface AssignBody {
  groupId?: string
  handlerId?: string
}

export interface TransferBody {
  transferredBy: string
  toGroupId?: string
  toHandlerId?: string
}

export interface CompleteBody {
  processedBy: string
}

export interface CreateEvaluationBody {
  submitterId: string
  rating: number
  comment?: string
}

export interface TicketListQuery {
  status?: TicketStatus
  priority?: Priority
  categoryId?: string
  submitterId?: string
  assignedGroupId?: string
}

// ---- 标签映射 ----
export const STATUS_LABEL: Record<TicketStatus, string> = {
  created: '已创建',
  pending_assign: '待分配',
  pending_process: '待处理',
  completed: '已完成',
  cancelled: '已取消',
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  P0: 'P0 紧急',
  P1: 'P1 高',
  P2: 'P2 中',
  P3: 'P3 低',
  P4: 'P4 最低',
}

export const PRIORITY_OPTIONS: Priority[] = ['P0', 'P1', 'P2', 'P3', 'P4']
export const STATUS_OPTIONS: TicketStatus[] = [
  'pending_assign',
  'pending_process',
  'completed',
  'cancelled',
]
export const RATING_LABEL: Record<number, string> = {
  1: '非常不满意',
  2: '不满意',
  3: '一般',
  4: '满意',
  5: '非常满意',
}
