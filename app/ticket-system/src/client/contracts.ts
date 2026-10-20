// 契约推导类型与展示常量。
// 唯一来源：docs/wi-t1000313/technical-contract.md（字段、错误码、状态语义以契约为准，不发明 API 行为）。

export type Role = 'submitter' | 'handler' | 'ops'
export type TicketStatus = 'created' | 'pending_assignment' | 'in_progress' | 'completed' | 'cancelled'
export type TicketPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'
export type TicketScope = 'mine' | 'workbench'

// 推荐基线分类（迁移种子，契约第 3 节）
export const BASELINE_CATEGORIES = ['账户与权限', '功能使用', '数据问题', '性能问题', '集成对接', '其他'] as const

export const ROLE_LABELS: Record<Role, string> = {
  submitter: '提交人',
  handler: '处理人',
  ops: '运营',
}

export const STATUS_LABELS: Record<TicketStatus, string> = {
  created: '创建',
  pending_assignment: '待分配',
  in_progress: '待处理',
  completed: '已完成',
  cancelled: '已取消',
}

// created 为创建请求内的瞬态，列表筛选不提供该选项
export const TICKET_FILTER_STATUSES: TicketStatus[] = ['pending_assignment', 'in_progress', 'completed', 'cancelled']

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  P0: 'P0',
  P1: 'P1',
  P2: 'P2',
  P3: 'P3',
  P4: 'P4',
}

// 契约第 9.1 节动作枚举
export const AUDIT_ACTIONS = [
  'ticket.created',
  'ticket.auto_assigned',
  'ticket.assigned',
  'ticket.transferred',
  'ticket.replied',
  'ticket.completed',
  'ticket.cancelled',
  'ticket.rated',
  'email.notification_sent',
  'email.notification_failed',
] as const

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'ticket.created': '工单创建',
  'ticket.auto_assigned': '自动分配',
  'ticket.assigned': '手动分配',
  'ticket.transferred': '转派',
  'ticket.replied': '回复',
  'ticket.completed': '完成处理',
  'ticket.cancelled': '取消工单',
  'ticket.rated': '满意度评价',
  'email.notification_sent': '邮件通知成功',
  'email.notification_failed': '邮件通知失败',
}

export interface CurrentUser {
  id: number
  email: string
  display_name: string
  company_id: number
  department: string | null
  role: Role
}

export interface Company {
  id: number
  name: string
  created_at: string
}

export interface AdminUser {
  user_id: number
  email: string
  display_name: string
  company_id: number
  department: string | null
  role: Role
}

export interface GroupMember {
  user_id: number
  display_name: string
  department: string | null
}

export interface BusinessGroup {
  id: number
  company_id: number
  name: string
  members: GroupMember[]
}

export interface AssignmentRule {
  id: number
  company_id: number
  category: string
  group_id: number
  group_name: string
}

export interface TicketRating {
  score: number
  comment: string | null
  created_at: string
}

export interface Reply {
  id: number
  author_user_id: number
  author_name: string
  content: string
  created_at: string
}

export interface TicketSummary {
  id: number
  ticket_no: string
  subject: string
  category: string
  priority: TicketPriority
  status: TicketStatus
  company_id: number
  company_name: string
  submitter_name: string
  created_at: string
  assigned_group_id: number | null
  assigned_group_name: string | null
  assigned_handler_id: number | null
  handled_at: string | null
}

export interface TicketDetail extends TicketSummary {
  description: string
  submitter_user_id: number
  submitter_department: string | null
  submitter_email: string
  handled_by: number | null
  handled_by_name: string | null
  completed_at: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  rating: TicketRating | null
  replies: Reply[]
}

export interface TicketCreateBody {
  subject: string
  description: string
  category: string
  priority: TicketPriority
}

export interface RatingResult {
  ticket_id: number
  score: number
  comment: string | null
  created_at: string
}

export interface SubmitterTicketHistory {
  ticket_no: string
  subject: string
  status: TicketStatus
  priority: TicketPriority
  created_at: string
}

export interface SubmitterView {
  user_id: number
  display_name: string
  email: string
  company: { id: number; name: string }
  department: string | null
  history: SubmitterTicketHistory[]
}

export interface Paged<T> {
  items: T[]
  page: number
  page_size: number
  total: number
}

export interface TicketListQuery {
  scope: TicketScope
  status?: TicketStatus[]
  category?: string
  priority?: string
  company_id?: number
  q?: string
  sort?: 'created_at' | 'priority'
  order?: 'asc' | 'desc'
  page?: number
  page_size?: number
}

export interface DistributionItem {
  key: string | number
  label: string
  count: number
}

export interface DistributionResponse {
  dimension: 'company' | 'department'
  items: DistributionItem[]
}

export interface DashboardResponse {
  ticket_volume: {
    total: number
    by_status: Record<TicketStatus, number>
  }
  avg_response_time_minutes: number | null
  satisfaction: {
    average: number | null
    rated_count: number
    completed_count: number
  }
  hot_categories: Array<{ category: string; count: number }>
}

export interface AuditEvent {
  id: number
  action: string
  actor_user_id: number
  actor_name: string
  occurred_at: string
  ticket_id: number | null
  company_id: number | null
  details: Record<string, unknown>
}
