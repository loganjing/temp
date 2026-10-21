// 前端契约类型 —— 严格依据 docs/wi-t1000335/technical-contract.md 第 2、3 节定义。
// src/shared/ 由 T01 拥有，前端在不等待后端完成的前提下独立开发，故在 client 内复刻契约类型，
// 待 T01 产出 src/shared 契约后由集成阶段替换为共享导入。

export type TicketStatus = 'pending_assignment' | 'processing' | 'completed' | 'cancelled'
export type Priority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'
export type NotificationStatus = 'sent' | 'failed'
export type AuditAction =
  | 'ticket_created'
  | 'ticket_assigned'
  | 'ticket_replied'
  | 'ticket_transferred'
  | 'ticket_completed'
  | 'ticket_cancelled'
  | 'ticket_rated'

export interface CompanyRef { id: number; name: string }
export interface UserRef { id: number; name: string; email: string; department: string }
export interface GroupRef { id: number; name: string }
export interface HandlerRef { id: number; name: string }
export interface OperatorRef { id: number; name: string }

export interface Ticket {
  ticketNo: string
  subject: string
  description: string
  category: string
  priority: Priority
  status: TicketStatus
  company: CompanyRef
  submitter: UserRef
  currentGroup: GroupRef | null
  handler: HandlerRef | null
  handledAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Reply {
  id: number
  author: { id: number; name: string }
  content: string
  createdAt: string
}

export interface Rating {
  score: number
  comment: string | null
  raterId: number
  createdAt: string
}

export interface NotificationRecord {
  id: number
  recipientEmail: string
  subject: string
  status: NotificationStatus
  sentAt: string
  detail: string | null
}

export interface GroupMember { id: number; name: string; email: string; department: string }

export interface Group {
  id: number
  name: string
  companyId: number
  members: GroupMember[]
}

export interface AssignmentRule {
  id: number
  category: string
  groupId: number
  groupName: string
}

export interface AuditEntry {
  id: number
  action: AuditAction
  operator: OperatorRef
  ticketNo: string
  detail: string | null
  createdAt: string
}

export interface CurrentUser {
  id: number
  name: string
  email: string
  company: { id: number; name: string }
  department: string
  groupIds: number[]
}

// 认证会话用户：契约 CurrentUser 之上保留登录流程所需的临时密码标记（authkit starter 行为）
export interface SessionUser extends CurrentUser {
  passwordChangeRequired?: boolean
}

// 查询参数类型
export type TicketSortField = 'created_at' | 'priority'
export type SortOrder = 'asc' | 'desc'

export interface TicketListQuery {
  status?: TicketStatus | ''
  category?: string
  priority?: Priority | ''
  companyId?: number
  q?: string
  sort?: TicketSortField
  order?: SortOrder
  mine?: boolean
}

export interface WorkbenchQuery {
  companyId?: number
  category?: string
  priority?: Priority | ''
  q?: string
  sort?: TicketSortField
  order?: SortOrder
  group?: boolean
}

export interface TicketDetailResponse {
  ticket: Ticket
  replies: Reply[]
  rating: Rating | null
  notifications: NotificationRecord[]
}

export interface SubmitterInfoResponse {
  submitter: UserRef & { company: CompanyRef }
  history: Ticket[]
}

export interface DistributionResponse {
  dimension: 'company' | 'department'
  rows: { key: string; label: string; count: number }[]
}

export interface DashboardResponse {
  ticketCount: number
  avgResponseMinutes: number | null
  satisfaction: number | null
  topCategories: { category: string; count: number }[]
}

export interface AuditLogQuery {
  action?: AuditAction | ''
  ticketNo?: string
  from?: string
  to?: string
}

// 枚举常量与展示映射（技术契约第 2 节）
export const PRIORITIES: Priority[] = ['P0', 'P1', 'P2', 'P3', 'P4']

export const PRIORITY_LABEL: Record<Priority, string> = {
  P0: 'P0', P1: 'P1', P2: 'P2', P3: 'P3', P4: 'P4',
}

// P0 红 / P1 橙 / P2 黄 / P3 蓝 / P4 灰
export const PRIORITY_BADGE_CLASS: Record<Priority, string> = {
  P0: 'badge badge-p0',
  P1: 'badge badge-p1',
  P2: 'badge badge-p2',
  P3: 'badge badge-p3',
  P4: 'badge badge-p4',
}

export const TICKET_STATUSES: TicketStatus[] = ['pending_assignment', 'processing', 'completed', 'cancelled']

export const STATUS_LABEL: Record<TicketStatus, string> = {
  pending_assignment: '待分配',
  processing: '待处理',
  completed: '完成',
  cancelled: '取消',
}

export const STATUS_BADGE_CLASS: Record<TicketStatus, string> = {
  pending_assignment: 'badge badge-status-pending',
  processing: 'badge badge-status-processing',
  completed: 'badge badge-status-completed',
  cancelled: 'badge badge-status-cancelled',
}

export const AUDIT_ACTIONS: AuditAction[] = [
  'ticket_created',
  'ticket_assigned',
  'ticket_replied',
  'ticket_transferred',
  'ticket_completed',
  'ticket_cancelled',
  'ticket_rated',
]

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  ticket_created: '创建',
  ticket_assigned: '分配',
  ticket_replied: '回复',
  ticket_transferred: '转派',
  ticket_completed: '处理完成',
  ticket_cancelled: '取消',
  ticket_rated: '评价',
}
