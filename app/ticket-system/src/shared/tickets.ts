// 工单系统共享契约：平台中立的常量与类型。
// 字段级定义的唯一来源是 docs/wi-t1000313/technical-contract.md；
// 用户 id 在运行时为 userkit 平台用户主键（TEXT UUID），
// 其余自增主键（company/group/ticket）为整数。
export const ROLES = ['submitter', 'handler', 'ops'] as const
export type Role = (typeof ROLES)[number]

export const TICKET_STATUSES = ['created', 'pending_assignment', 'in_progress', 'completed', 'cancelled'] as const
export type TicketStatus = (typeof TICKET_STATUSES)[number]

export const PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'P4'] as const
export type Priority = (typeof PRIORITIES)[number]

/** 允许回复的状态（契约 7.4）。 */
export const REPLYABLE_TICKET_STATUSES: readonly TicketStatus[] = ['pending_assignment', 'in_progress']

/** 允许取消的状态（契约 7.8 / 状态机第 11 节）。 */
export const CANCELLABLE_TICKET_STATUSES: readonly TicketStatus[] = ['created', 'pending_assignment', 'in_progress']

/** 推荐基线分类（由迁移种子提供，契约 3 节）。 */
export const RECOMMENDED_CATEGORIES = ['账户与权限', '功能使用', '数据问题', '性能问题', '集成对接', '其他'] as const

export type CurrentUser = {
  id: string
  email: string
  display_name: string
  company_id: number
  department: string | null
  role: Role
}

export type Company = {
  id: number
  name: string
  created_at: string
}

export type AdminUser = {
  user_id: string
  email: string
  display_name: string
  company_id: number
  department: string | null
  role: Role
}

export type BusinessGroupMember = {
  user_id: string
  display_name: string
  department: string | null
}

export type BusinessGroup = {
  id: number
  company_id: number
  name: string
  members: BusinessGroupMember[]
}

export type AssignmentRule = {
  id: number
  company_id: number
  category: string
  group_id: number
  group_name: string
}

export type TicketSummary = {
  id: number
  ticket_no: string
  subject: string
  category: string
  priority: Priority
  status: TicketStatus
  company_id: number
  company_name: string
  submitter_name: string
  created_at: string
  assigned_group_id: number | null
  assigned_group_name: string | null
  assigned_handler_id: string | null
  handled_at: string | null
}

export type TicketReply = {
  id: number
  author_user_id: string
  author_name: string
  content: string
  created_at: string
}

export type TicketRating = {
  score: number
  comment: string | null
  created_at: string
}

export type TicketDetail = TicketSummary & {
  description: string
  submitter_user_id: string
  submitter_department: string | null
  submitter_email: string
  handled_by: string | null
  handled_by_name: string | null
  completed_at: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  rating: TicketRating | null
  replies: TicketReply[]
}

export type TicketRatingResponse = {
  ticket_id: number
  score: number
  comment: string | null
  created_at: string
}

export type TicketListResponse = {
  items: TicketSummary[]
  page: number
  page_size: number
  total: number
}

export type SubmitterView = {
  user_id: string
  display_name: string
  email: string
  company: { id: number; name: string }
  department: string | null
  history: Array<{ ticket_no: string; subject: string; status: TicketStatus; priority: Priority; created_at: string }>
}

export type DistributionDimension = 'company' | 'department'

export type DistributionResponse = {
  dimension: DistributionDimension
  items: Array<{ key: number | string; label: string; count: number }>
}

export type DashboardResponse = {
  ticket_volume: {
    total: number
    by_status: { created: number; pending_assignment: number; in_progress: number; completed: number; cancelled: number }
  }
  avg_response_time_minutes: number | null
  satisfaction: { average: number | null; rated_count: number; completed_count: number }
  hot_categories: Array<{ category: string; count: number }>
}

export type AuditEventItem = {
  id: string
  action: string
  actor_user_id: string | null
  actor_name: string | null
  occurred_at: string
  ticket_id: number | null
  company_id: number | null
  details: Record<string, unknown>
}

export type AuditEventListResponse = {
  items: AuditEventItem[]
  page: number
  page_size: number
  total: number
}

export type ApiErrorBody = {
  error: { code: string; message: string }
}
