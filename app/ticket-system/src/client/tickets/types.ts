// 工单接口契约类型，字段与 docs/wi-t1000072/technical-contract.md 第 3、4 节一致。

export type Role = 'submitter' | 'handler' | 'admin' | 'ops'
export type TicketStatus = 'unassigned' | 'in_progress' | 'completed' | 'cancelled'
export type TicketPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'

export const roles: Role[] = ['submitter', 'handler', 'admin', 'ops']
export const priorities: TicketPriority[] = ['P0', 'P1', 'P2', 'P3', 'P4']
export const statuses: TicketStatus[] = ['unassigned', 'in_progress', 'completed', 'cancelled']

export const roleLabels: Record<Role, string> = {
  submitter: '提交人',
  handler: '处理人',
  admin: '管理员',
  ops: '平台运营',
}

export const statusLabels: Record<TicketStatus, string> = {
  unassigned: '待分配',
  in_progress: '待处理',
  completed: '完成',
  cancelled: '取消',
}

export const priorityLabels: Record<TicketPriority, string> = {
  P0: 'P0 最紧急',
  P1: 'P1 紧急',
  P2: 'P2 较高',
  P3: 'P3 普通',
  P4: 'P4 较低',
}

export const notificationStatusLabels: Record<NotificationStatus, string> = {
  sent: '已发送',
  skipped: '已跳过（未配置邮件）',
  failed: '发送失败',
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (roles as string[]).includes(value)
}

export function isPriority(value: unknown): value is TicketPriority {
  return typeof value === 'string' && (priorities as string[]).includes(value)
}

export type CurrentUser = {
  id: string
  name: string
  email: string
  role: Role
  companyId: string
  companyName?: string
  departmentId: string
  departmentName?: string
  roles?: string[]
  passwordChangeRequired?: boolean
}

export type TicketListItem = {
  id: string
  title: string
  categoryId: string
  categoryName: string
  priority: TicketPriority
  status: TicketStatus
  companyId: string
  companyName: string
  departmentId: string
  departmentName: string
  submitterId: string
  submitterName: string
  groupId: string | null
  groupName: string | null
  assigneeId: string | null
  assigneeName: string | null
  createdAt: string
  satisfactionScore: number | null
}

export type TicketDetail = TicketListItem & {
  description: string
  submitterEmail: string
  updatedAt: string
  firstResponseAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  satisfactionComment: string | null
  satisfactionAt: string | null
  canReply: boolean
  canAssign: boolean
  canTransfer: boolean
  canComplete: boolean
  canCancel: boolean
  canRate: boolean
  canChangePriority: boolean
}

export type TicketReply = {
  id: string
  ticketId: string
  authorId: string
  authorName: string
  authorRole: string
  body: string
  createdAt: string
}

export type TicketEvent = {
  id: string
  action: string
  actorId: string | null
  actorName: string
  result: 'success' | 'failed'
  detail: Record<string, unknown> | null
  createdAt: string
}

export type NotificationStatus = 'sent' | 'skipped' | 'failed'

export type TicketNotification = {
  id: string
  kind: string
  recipientEmail: string
  subject: string
  status: NotificationStatus
  attempt: number
  errorMessage: string | null
  createdAt: string
  sentAt: string | null
}

export type SubmitterHistoryItem = {
  id: string
  title: string
  status: TicketStatus
  priority: TicketPriority
  createdAt: string
  categoryName: string
}

export type SubmitterProfile = {
  name: string
  email: string
  companyName: string
  departmentName: string
  history: SubmitterHistoryItem[]
}

export type GroupMember = {
  userId: string
  name: string
  email: string
  departmentName: string
}

export type BusinessGroup = {
  id: string
  name: string
  companyId: string
  memberCount: number
  members: GroupMember[]
  createdAt: string
}

export type Category = {
  id: string
  code: string
  name: string
}

export type AssignmentRule = {
  id: string
  categoryId: string
  categoryName: string
  groupId: string
  groupName: string
}

export type Company = { id: string; name: string }
export type Department = { id: string; name: string }

export type StatsDistribution = {
  dimension: 'company' | 'department'
  total: number
  items: { key: string; label: string; count: number; ratio: number }[]
}

export type StatsDashboard = {
  ticketCount: number
  avgFirstResponseMinutes: number | null
  satisfaction: { average: number | null; ratedCount: number }
  hotCategories: { categoryId: string; categoryName: string; count: number }[]
  statusBreakdown: { status: TicketStatus; count: number }[]
  priorityBreakdown: { priority: TicketPriority; count: number }[]
}

export const eventActionLabels: Record<string, string> = {
  created: '创建工单',
  assigned: '人工分配',
  auto_assigned: '自动分配',
  replied: '回复',
  transferred: '转派',
  priority_changed: '调整优先级',
  completed: '完成工单',
  cancelled: '取消工单',
  rated: '满意度评价',
  email_sent: '完成通知已发送',
  email_skipped: '完成通知已跳过',
  email_failed: '完成通知发送失败',
}

export const eventDetailLabels: Record<string, string> = {
  from: '原状态',
  to: '目标状态',
  fromStatus: '原状态',
  toStatus: '目标状态',
  fromGroupId: '原业务组',
  toGroupId: '目标业务组',
  fromGroupName: '原业务组',
  toGroupName: '目标业务组',
  groupId: '业务组',
  groupName: '业务组',
  fromPriority: '原优先级',
  toPriority: '目标优先级',
  priority: '优先级',
  score: '评分',
  recipientEmail: '收件邮箱',
  status: '通知状态',
  errorMessage: '错误信息',
}
