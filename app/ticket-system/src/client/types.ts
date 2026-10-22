export type TicketStatus = 'created' | 'unassigned' | 'pending' | 'completed' | 'cancelled'
export type Priority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'
export type UserRole = 'submitter' | 'handler' | 'admin'

export interface TicketDTO {
  id: string
  subject: string
  description: string
  categoryId: string
  categoryName: string
  priority: Priority
  status: TicketStatus
  submitterId: string
  submitterName: string
  handlerId: string | null
  handlerName: string | null
  groupId: string | null
  groupName: string | null
  createdAt: string
  completedAt: string | null
}

export interface TicketReplyDTO {
  id: string
  ticketId: string
  replierId: string
  replierName: string
  content: string
  createdAt: string
}

export interface EvaluationDTO {
  id: string
  ticketId: string
  rating: number
  comment: string | null
  createdAt: string
}

export interface TicketDetailDTO extends TicketDTO {
  replies: TicketReplyDTO[]
  evaluation: EvaluationDTO | null
}

export interface UserDTO {
  id: string
  name: string
  email: string
  companyId: string
  companyName: string
  department: string
  role: UserRole
}

export interface SubmitterInfoDTO {
  user: UserDTO
  historyTickets: TicketDTO[]
}

export interface MemberDTO {
  id: string
  groupId: string
  userId: string
  userName: string
  email: string
}

export interface BusinessGroupDTO {
  id: string
  name: string
  companyId: string
  members: MemberDTO[]
  createdAt: string
}

export interface CategoryDTO {
  id: string
  name: string
  companyId: string
}

export interface AssignmentRuleDTO {
  id: string
  companyId: string
  categoryId: string
  categoryName: string
  groupId: string
  groupName: string
}

export interface LogEntryDTO {
  id: string
  ticketId: string
  action: string
  operatorId: string
  operatorName: string
  createdAt: string
}

export interface CategoryStatDTO {
  categoryId: string
  categoryName: string
  ticketCount: number
}

export interface DashboardStatsDTO {
  totalTickets: number
  pendingCount: number
  completedCount: number
  avgResponseTime: number
  satisfactionScore: number
  hotCategories: CategoryStatDTO[]
}

export interface DistributionDTO {
  label: string
  count: number
}

export interface AuthUser {
  id: string
  name: string
  email: string
  companyId?: string
  companyName?: string
  department?: string
  role?: UserRole
  passwordChangeRequired?: boolean
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

export interface DataResponse<T> {
  data: T
}

export const STATUS_LABELS: Record<string, string> = {
  created: '创建',
  unassigned: '待分配',
  pending: '待处理',
  completed: '完成',
  cancelled: '取消',
}

export const PRIORITY_OPTIONS: Priority[] = ['P0', 'P1', 'P2', 'P3', 'P4']

export const STATUS_OPTIONS: TicketStatus[] = ['created', 'unassigned', 'pending', 'completed', 'cancelled']

export const LOG_ACTION_LABELS: Record<string, string> = {
  ticket_created: '创建工单',
  ticket_assigned: '分配工单',
  ticket_transferred: '转派工单',
  ticket_replied: '回复工单',
  ticket_completed: '完成工单',
  ticket_cancelled: '取消工单',
}
