// 工单系统领域类型，依据技术契约 docs/wi-t1000051/technical-contract.md 定义。
// 所有 ID 在 API JSON 中均为 string，前端收发无需类型转换。

export type TicketStatus =
  | 'created'
  | 'pending_assignment'
  | 'pending_processing'
  | 'completed'
  | 'cancelled'

export type Priority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'

export const TICKET_STATUSES: TicketStatus[] = [
  'created',
  'pending_assignment',
  'pending_processing',
  'completed',
  'cancelled',
]

export const PRIORITIES: Priority[] = ['P0', 'P1', 'P2', 'P3', 'P4']

export interface Ticket {
  id: string
  subject: string
  description: string
  category: string
  priority: Priority
  status: TicketStatus
  company_id: string
  submitter_id: string
  assigned_group_id: string | null
  assigned_handler_id: string | null
  completed_at: string | null
  completed_by: string | null
  created_at: string
  first_assigned_at: string | null
}

export interface TicketReply {
  id: string
  ticket_id: string
  author_id: string
  content: string
  created_at: string
}

export interface SubmitterInfo {
  display_name: string
  email: string
  company: { id: string; name: string }
  department: { id: string | null; name: string | null }
  history_tickets: {
    id: string
    subject: string
    status: TicketStatus
    priority: Priority
    created_at: string
  }[]
}

export interface BusinessGroup {
  id: string
  company_id: string
  name: string
  created_at: string
}

export interface GroupMember {
  id: string
  group_id: string
  user_id: string
  created_at: string
}

export interface AssignmentRule {
  id: string
  company_id: string
  category: string
  business_group_id: string
  created_at: string
}

export interface TicketEvaluation {
  id: string
  ticket_id: string
  rating: number
  comment: string | null
  created_at: string
}

export interface DashboardStats {
  ticket_count: number
  avg_response_time_hours: number
  avg_satisfaction: number
  hot_topics: { category: string; count: number }[]
}

export interface Distribution {
  distribution: { dimension: string; count: number }[]
}

export interface AuditLog {
  id: string
  action: string
  actor_id: string
  created_at: string
}

export interface TicketTransfer {
  id: string
  ticket_id: string
  from_handler_id: string | null
  from_group_id: string | null
  to_handler_id: string | null
  to_group_id: string | null
  reason: string | null
  created_at: string
}

export const STATUS_LABELS: Record<TicketStatus, string> = {
  created: '已创建',
  pending_assignment: '待分配',
  pending_processing: '待处理',
  completed: '已完成',
  cancelled: '已取消',
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  P0: 'P0 紧急',
  P1: 'P1 高',
  P2: 'P2 中',
  P3: 'P3 普通',
  P4: 'P4 低',
}
