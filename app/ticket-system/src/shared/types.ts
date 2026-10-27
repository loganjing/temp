// 工单系统共享类型定义。供 server 与 client 导入。
// 本文件保持平台中立：不依赖 Node、Hono、React 或数据库驱动。

/** 工单 SLA 优先级 */
export type SlaPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'

/** 工单状态 */
export type TicketStatus =
  | 'created'
  | 'pending_assignment'
  | 'pending_processing'
  | 'completed'
  | 'cancelled'

/** 统计维度 */
export type StatisticsDimension = 'company' | 'department'

/** 工单系统业务角色 */
export type TicketRole = 'submitter' | 'handler' | 'group_admin' | 'admin'

/** 工单审计事件类型 */
export const TicketAuditEventType = {
  created: 'ticket.created',
  updated: 'ticket.updated',
  replyAdded: 'ticket.reply_added',
  transferred: 'ticket.transferred',
  completed: 'ticket.completed',
  rated: 'ticket.rated',
  assigned: 'ticket.assigned',
  businessGroupCreated: 'business_group.created',
  businessGroupMembersUpdated: 'business_group.members_updated',
  categoryRuleCreated: 'category_rule.created',
  emailSent: 'email.sent',
  emailSendFailed: 'email.send_failed',
} as const

/** 通用 API 错误响应体 */
export interface ApiErrorBody {
  error: { code: string; message: string }
}

/** 分页列表响应 */
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

/** 创建工单请求 */
export interface CreateTicketRequest {
  subject: string
  description: string
  categoryId: string
  slaPriority: SlaPriority
}

/** 工单列表项 */
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

/** 工单回复 */
export interface TicketReplyView {
  id: string
  replierId: string
  replierName: string
  content: string
  createdAt: string
}

/** 工单详情 */
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
  replies: TicketReplyView[]
}

/** 更新工单请求 */
export interface UpdateTicketRequest {
  slaPriority?: SlaPriority
  assignedGroupId?: string | null
  status?: TicketStatus
}

/** 转派工单请求 */
export interface TransferTicketRequest {
  toGroupId: string
  reason?: string
}

/** 完成工单请求 */
export interface CompleteTicketRequest {
  summary?: string
}

/** 创建回复请求 */
export interface CreateReplyRequest {
  content: string
}

/** 评价请求 */
export interface CreateRatingRequest {
  rating: number
  comment?: string
}

/** 业务组成员视图 */
export interface BusinessGroupMemberView {
  id: string
  userId: string
  displayName: string
}

/** 业务组视图 */
export interface BusinessGroupView {
  id: string
  name: string
  companyId: string
  memberCount: number
  members: BusinessGroupMemberView[]
  createdAt: string
}

/** 创建业务组请求 */
export interface CreateBusinessGroupRequest {
  name: string
}

/** 更新业务组成员请求 */
export interface UpdateBusinessGroupMembersRequest {
  memberUserIds: string[]
}

/** 分类分配规则视图 */
export interface CategoryAssignmentRuleView {
  id: string
  companyId: string
  categoryId: string
  categoryName: string
  targetGroupId: string
  targetGroupName: string
  createdAt: string
}

/** 创建分类分配规则请求 */
export interface CreateCategoryRuleRequest {
  categoryId: string
  targetGroupId: string
}

/** 统计分布项 */
export interface StatisticsDistributionItem {
  dimensionId: string
  dimensionName: string
  ticketCount: number
  byStatus: Record<TicketStatus, number>
}

/** 统计分布响应 */
export interface StatisticsDistributionResponse {
  dimension: StatisticsDimension
  items: StatisticsDistributionItem[]
}

/** 仪表盘响应 */
export interface StatisticsDashboardResponse {
  totalTickets: number
  pendingTickets: number
  completedTickets: number
  averageResponseTimeMinutes: number
  averageSatisfactionScore: number
  hotCategories: Array<{ categoryId: string; categoryName: string; ticketCount: number }>
  byPriority: Record<SlaPriority, number>
}

/** 转派记录 */
export interface TicketTransferView {
  id: string
  ticketId: string
  fromGroupId: string | null
  toGroupId: string
  transferredBy: string
  transferredAt: string
  reason: string | null
}

/** 完成工单响应 */
export interface CompleteTicketResponse {
  id: string
  ticketId: string
  handlerId: string
  handlerName: string
  processedAt: string
  emailSent: boolean
  ticketStatus: 'completed'
}

/** 提交人信息（含历史工单） */
export interface SubmitterInfo {
  userId: string
  displayName: string
  email: string
  companyName: string
  departmentName: string | null
  historyTickets: Array<{
    id: string
    subject: string
    status: TicketStatus
    slaPriority: SlaPriority
    createdAt: string
    updatedAt: string
  }>
}

/** 评价视图 */
export interface SatisfactionRatingView {
  id: string
  ticketId: string
  rating: number
  comment: string | null
  createdAt: string
}

/** 审计日志项 */
export interface AuditLogItem {
  id: string
  eventType: string
  entityType: string
  entityId: string
  actorId: string
  actorName: string
  payload: Record<string, unknown>
  createdAt: string
}
