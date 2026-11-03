// ===== 枚举 =====
export type TicketStatus = 'pending_assignment' | 'pending_processing' | 'completed' | 'cancelled'
export type SLAPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'
export type UserRole = 'submitter' | 'handler' | 'admin'
export type AuditAction =
  | 'ticket.created'
  | 'ticket.assigned'
  | 'ticket.transferred'
  | 'ticket.completed'
  | 'ticket.cancelled'

// ===== Auth =====
export interface CurrentUser {
  profileId: string
  userId: string
  username: string
  displayName: string
  email: string
  companyId: string
  companyName: string
  departmentId: string | null
  departmentName: string | null
  role: UserRole
}

export interface LoginResponse {
  token: string
  user: CurrentUser
}

export interface RegisterRequest {
  username: string
  password: string
  displayName: string
  email: string
  companyId: string
  departmentId: string | null
  role: UserRole
}

// ===== Ticket =====
export interface Ticket {
  id: string
  companyId: string
  submitterProfileId: string
  subject: string
  description: string
  category: string
  slaPriority: SLAPriority
  status: TicketStatus
  assignedGroupId: string | null
  assignedHandlerId: string | null
  createdAt: string
  completedAt: string | null
  completedBy: string | null
}

export interface TicketListItem {
  id: string
  subject: string
  category: string
  slaPriority: SLAPriority
  status: TicketStatus
  submitterProfileId: string
  submitterName: string
  assignedGroupId: string | null
  assignedGroupName: string | null
  assignedHandlerId: string | null
  assignedHandlerName: string | null
  createdAt: string
  completedAt: string | null
}

export interface TicketListResponse {
  items: TicketListItem[]
  total: number
  page: number
  pageSize: number
}

export interface TicketDetail {
  ticket: TicketDetailTicket
  submitter: SubmitterInfo
  submitterHistory: SubmitterHistoryItem[]
  replies: TicketReply[]
  recentLogs: AuditLogEntry[]
  evaluation: TicketEvaluation | null
}

export interface TicketDetailTicket {
  id: string
  subject: string
  description: string
  category: string
  slaPriority: SLAPriority
  status: TicketStatus
  companyId: string
  companyName: string
  submitterProfileId: string
  assignedGroupId: string | null
  assignedGroupName: string | null
  assignedHandlerId: string | null
  assignedHandlerName: string | null
  createdAt: string
  completedAt: string | null
  completedBy: string | null
  completedByName: string | null
}

export interface SubmitterInfo {
  profileId: string
  displayName: string
  email: string
  companyName: string
  departmentName: string | null
}

export interface SubmitterHistoryItem {
  id: string
  subject: string
  category: string
  status: TicketStatus
  createdAt: string
}

export interface TicketReply {
  id: string
  ticketId: string
  replierProfileId: string
  replierName: string
  content: string
  createdAt: string
}

export interface TicketEvaluation {
  id: string
  ticketId: string
  evaluatorProfileId: string
  satisfactionScore: number
  comment: string | null
  createdAt: string
}

export interface AuditLogEntry {
  id: string
  actorId: string
  actorName: string
  action: AuditAction
  targetId: string
  metadata: Record<string, unknown>
  createdAt: string
}

// ===== Business Groups =====
export interface BusinessGroupMember {
  id: string
  profileId: string
  displayName: string
  email: string
}

export interface BusinessGroup {
  id: string
  name: string
  companyId: string
  memberCount: number
  members: BusinessGroupMember[]
}

export interface BusinessGroupMemberResponse {
  id: string
  groupId: string
  profileId: string
  displayName: string
}

// ===== Routing Rules =====
export interface RoutingRule {
  id: string
  companyId: string
  category: string
  targetGroupId: string
  targetGroupName: string
}

// ===== Statistics =====
export interface DistributionItem {
  dimensionKey: string
  dimensionName: string
  total: number
  pendingAssignment: number
  pendingProcessing: number
  completed: number
  cancelled: number
}

export interface DashboardData {
  totalTickets: number
  pendingTickets: number
  completedTickets: number
  cancelledTickets: number
  avgResponseTimeMinutes: number
  avgSatisfactionScore: number
  hotCategories: { category: string; count: number }[]
}

// ===== 辅助映射 =====
export const STATUS_LABELS: Record<TicketStatus, string> = {
  pending_assignment: '待分配',
  pending_processing: '待处理',
  completed: '已完成',
  cancelled: '已取消',
}

export const PRIORITY_LABELS: Record<SLAPriority, string> = {
  P0: 'P0',
  P1: 'P1',
  P2: 'P2',
  P3: 'P3',
  P4: 'P4',
}

export const ROLE_LABELS: Record<UserRole, string> = {
  submitter: '提交人',
  handler: '处理人',
  admin: '管理员',
}

export const ACTION_LABELS: Record<AuditAction, string> = {
  'ticket.created': '创建工单',
  'ticket.assigned': '分配工单',
  'ticket.transferred': '转派工单',
  'ticket.completed': '完成工单',
  'ticket.cancelled': '取消工单',
}
