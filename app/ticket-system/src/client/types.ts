// 工单系统前端类型定义 — 严格对齐 technical-contract.md 中的 API 契约

export type TicketStatus = 'created' | 'pending_assignment' | 'pending_processing' | 'completed' | 'cancelled'

export type TicketPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'

export const TICKET_STATUSES: TicketStatus[] = [
  'created',
  'pending_assignment',
  'pending_processing',
  'completed',
  'cancelled',
]

export const TICKET_PRIORITIES: TicketPriority[] = ['P0', 'P1', 'P2', 'P3', 'P4']

export const STATUS_LABELS: Record<TicketStatus, string> = {
  created: '创建',
  pending_assignment: '待分配',
  pending_processing: '待处理',
  completed: '完成',
  cancelled: '取消',
}

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  P0: 'P0 紧急',
  P1: 'P1 高',
  P2: 'P2 中',
  P3: 'P3 低',
  P4: 'P4 最低',
}

export const AUDIT_ACTIONS = [
  'ticket_create',
  'ticket_assign',
  'ticket_transfer',
  'ticket_complete',
  'ticket_cancel',
  'ticket_evaluate',
] as const

export type AuditAction = (typeof AUDIT_ACTIONS)[number]

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  ticket_create: '创建工单',
  ticket_assign: '分配工单',
  ticket_transfer: '转派工单',
  ticket_complete: '完成工单',
  ticket_cancel: '取消工单',
  ticket_evaluate: '评价工单',
}

/** 当前登录用户（GET /api/auth/me） */
export type CurrentUser = {
  id: string
  name: string
  email: string
  companyId?: string
  department?: string | null
  phone?: string | null
  roles?: string[]
  passwordChangeRequired?: boolean
}

/** 工单列表项 / 创建响应（POST /api/tickets, GET /api/tickets, GET /api/workbench/tickets） */
export type Ticket = {
  id: string
  subject: string
  description: string
  categoryId: string | null
  priority: TicketPriority
  status: TicketStatus
  submitterId: string
  submitterName: string
  submitterEmail: string
  submitterCompany: string
  submitterDepartment: string | null
  assignedGroupId: string | null
  createdAt: string
  // 以下字段在详情响应中存在，列表响应中可能存在
  categoryName?: string | null
  assignedGroupName?: string | null
  assignedHandlerId?: string | null
  assignedHandlerName?: string | null
  processedAt?: string | null
  completedAt?: string | null
  completedBy?: string | null
}

/** 工单回复（GET /api/tickets/:id, POST /api/tickets/:id/replies） */
export type TicketReply = {
  id: string
  ticketId?: string
  replierId: string
  replierName: string
  content: string
  createdAt: string
}

/** 工单详情（GET /api/tickets/:id） */
export type TicketDetail = Ticket & {
  replies: TicketReply[]
}

/** 提交人完整信息（GET /api/tickets/:id/submitter） */
export type SubmitterInfo = {
  id: string
  name: string
  email: string
  companyId: string
  companyName: string
  department: string | null
  historyTickets: {
    id: string
    subject: string
    status: string
    priority: string
    createdAt: string
  }[]
}

/** 满意度评价（GET/POST /api/tickets/:id/evaluation） */
export type TicketEvaluation = {
  id: string
  ticketId: string
  evaluatorId: string
  rating: number
  comment: string | null
  createdAt: string
}

/** 分页结果 */
export type PaginatedResult<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
}

/** 业务组（GET /api/business-groups） */
export type BusinessGroup = {
  id: string
  companyId: string
  name: string
  members: { id: string; userId: string; userName: string }[]
}

/** 问题分类（GET /api/ticket-categories） */
export type TicketCategory = {
  id: string
  companyId: string
  name: string
}

/** 分配规则（GET /api/assignment-rules） */
export type AssignmentRule = {
  id: string
  companyId: string
  categoryId: string
  categoryName: string
  groupId: string
  groupName: string
}

/** 统计分布条目 */
export type DistributionEntry =
  | { companyId: string; companyName: string; ticketCount: number }
  | { department: string; ticketCount: number }

/** 仪表盘指标（GET /api/statistics/dashboard） */
export type Dashboard = {
  totalTickets: number
  avgResponseTimeMs: number | null
  avgSatisfaction: number | null
  hotCategories: { categoryId: string; categoryName: string; ticketCount: number }[]
  statusBreakdown: Record<TicketStatus, number>
}

/** 操作日志（GET /api/audit-logs） */
export type AuditLog = {
  id: string
  actorId: string
  actorName: string
  action: string
  targetTicketId: string
  createdAt: string
  details: string | null
}

/** 列表查询参数 */
export type TicketListParams = {
  status?: string
  priority?: string
  categoryId?: string
  companyId?: string
  search?: string
  sort?: string
  page?: number
  pageSize?: number
}

export type WorkbenchParams = {
  companyId?: string
  priority?: string
  categoryId?: string
  search?: string
  sort?: string
  page?: number
  pageSize?: number
}
