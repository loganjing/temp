// 工单系统客户端契约类型。
// 字段与枚举以 docs/wi-t1000327/technical-contract.md 第 2、3 节为唯一来源，
// 在客户端边界内建模，不发明 API 行为。

export type Priority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'
export type Status = 'pending_assign' | 'processing' | 'completed' | 'cancelled'
export type Role = 'submitter' | 'agent' | 'company_admin' | 'platform_ops'
export type LogAction =
  | 'created'
  | 'auto_assigned'
  | 'assigned'
  | 'transferred'
  | 'replied'
  | 'completed'
  | 'cancelled'
  | 'rated'
export type SortField = 'created_at' | 'priority'
export type SortOrder = 'asc' | 'desc'
export type ListScope = 'group' | 'company'
export type StatsDimension = 'company' | 'department'

export interface UserProfileSummary {
  id: number
  displayName: string
  email: string
  department: string
  companyName: string
  role: Role
}

export interface TicketSummary {
  id: number
  ticketNo: string
  subject: string
  priority: Priority
  status: Status
  createdAt: string
}

export interface UserProfileDetail extends UserProfileSummary {
  historyTickets: TicketSummary[]
}

export interface Rating {
  score: number
  comment: string | null
  raterId: number
  createdAt: string
}

export interface Ticket {
  id: number
  ticketNo: string
  companyId: number
  companyName: string
  subject: string
  description: string
  categoryId: number
  categoryName: string
  priority: Priority
  status: Status
  submitter: UserProfileSummary
  groupId: number | null
  groupName: string | null
  handlerId: number | null
  handlerName: string | null
  firstReplyAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  createdAt: string
  rating: Rating | null
}

export interface TicketReply {
  id: number
  ticketId: number
  author: UserProfileSummary
  content: string
  createdAt: string
}

// 契约未为回复列表提供独立读取端点（GET /api/tickets/:id 仅标注“工单详情”），
// 客户端按“工单详情承载多轮回复”建模为 Ticket 的扩展形态；详见实现报告。
export interface TicketDetail extends Ticket {
  replies: TicketReply[]
}

export interface TicketLog {
  id: number
  ticketId: number
  actor: { id: number; displayName: string } | null
  action: LogAction
  detail: string
  createdAt: string
}

export interface BusinessGroup {
  id: number
  companyId: number
  name: string
  memberCount: number
  members?: UserProfileSummary[]
}

export interface Category {
  id: number
  companyId: number
  name: string
}

export interface AssignmentRule {
  id: number
  categoryId: number
  categoryName: string
  groupId: number
  groupName: string
}

export interface TicketNotification {
  id: number
  ticketId: number
  ticketNo: string
  subject: string
  body: string
  createdAt: string
}

export interface DashboardStats {
  totalTickets: number
  byStatus: { pending_assign: number; processing: number; completed: number; cancelled: number }
  respondedTickets: number
  avgResponseSeconds: number | null
  ratedTickets: number
  avgRating: number | null
  topCategories: { categoryId: number; name: string; count: number }[]
}

export interface DistributionItem {
  key: string
  label: string
  count: number
}

export interface CompanyOption {
  id: number
  name: string
}

export const statuses: Status[] = ['pending_assign', 'processing', 'completed', 'cancelled']
export const priorities: Priority[] = ['P0', 'P1', 'P2', 'P3', 'P4']

export const statusLabels: Record<Status, string> = {
  pending_assign: '待分配',
  processing: '待处理',
  completed: '已完成',
  cancelled: '已取消',
}

export const statusTones: Record<Status, 'amber' | 'blue' | 'green' | 'slate'> = {
  pending_assign: 'amber',
  processing: 'blue',
  completed: 'green',
  cancelled: 'slate',
}

export const priorityTones: Record<Priority, 'red' | 'orange' | 'amber' | 'blue' | 'slate'> = {
  P0: 'red',
  P1: 'orange',
  P2: 'amber',
  P3: 'blue',
  P4: 'slate',
}

export const roleLabels: Record<Role, string> = {
  submitter: '提交人',
  agent: '处理人',
  company_admin: '公司管理者',
  platform_ops: '平台运营',
}

export const logActionLabels: Record<LogAction, string> = {
  created: '创建工单',
  auto_assigned: '自动分配',
  assigned: '人工分配',
  transferred: '转派',
  replied: '回复',
  completed: '完成',
  cancelled: '取消',
  rated: '评价',
}

export const terminalStatuses: Status[] = ['completed', 'cancelled']

export function isTerminal(status: Status): boolean {
  return status === 'completed' || status === 'cancelled'
}
