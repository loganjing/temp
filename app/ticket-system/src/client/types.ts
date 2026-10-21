// 契约类型定义：唯一来源 docs/wi-t1000332/technical-contract.md。
// 仅按契约字段建模，不虚构 API 行为；全部请求经 platform/api-client.ts 发出。

export type Priority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'

export type TicketStatus =
  | 'created'
  | 'pending_assignment'
  | 'pending_processing'
  | 'completed'
  | 'cancelled'

export type MailChannel = 'smtp' | 'local'
export type MailStatus = 'queued' | 'sent' | 'failed'
export type StatsDimension = 'company' | 'department'

export type SortField = 'createdAt' | 'priority' | 'ticketNo'
export type SortOrder = 'asc' | 'desc'

/** 契约第 1 节 UserProfile；passwordChangeRequired 为 starter 改密流程扩展字段。 */
export type CurrentUser = UserProfile & { passwordChangeRequired?: boolean }

export type UserProfile = {
  userId: number
  name: string
  email: string
  companyId: number
  companyName: string
  department: string
}

export type UserProfileSummary = {
  userId: number
  name: string
  email: string
  department: string
}

export type TicketListItem = {
  ticketId: number
  ticketNo: string
  subject: string
  category: string
  priority: Priority
  status: TicketStatus
  companyId: number
  companyName: string
  submitterName: string
  assignedGroupId: number | null
  assignedGroupName: string | null
  handlerId: number | null
  handlerName: string | null
  replyCount: number
  createdAt: string
  completedAt: string | null
}

export type HistoryTicket = {
  ticketNo: string
  subject: string
  status: TicketStatus
  priority: Priority
  createdAt: string
}

export type TicketReply = {
  replyId: number
  replierId: number
  replierName: string
  content: string
  repliedAt: string
}

export type TicketRating = {
  score: number
  comment: string | null
  ratedAt: string
}

export type TicketDetail = {
  ticket: TicketListItem
  description: string
  submitter: {
    userId: number
    name: string
    email: string
    companyName: string
    department: string
    historyTickets: HistoryTicket[]
  }
  replies: TicketReply[]
  rating: TicketRating | null
}

export type GroupMember = {
  userId: number
  name: string
  email: string
  department: string
}

export type Group = {
  groupId: number
  name: string
  createdAt: string
  members: GroupMember[]
}

export type CategoryRule = {
  ruleId: number
  category: string
  groupId: number
  groupName: string
}

export type DistributionItem = {
  key: string
  label: string
  count: number
}

export type Distribution = {
  dimension: StatsDimension
  items: DistributionItem[]
}

export type DashboardStats = {
  totalTickets: number
  statusBreakdown: {
    created: number
    pendingAssignment: number
    pendingProcessing: number
    completed: number
    cancelled: number
  }
  avgResponseMinutes: number | null
  avgSatisfaction: number | null
  hotCategories: { category: string; count: number }[]
}

export type OutboxItem = {
  outboxId: number
  ticketId: number | null
  ticketNo: string
  toEmail: string
  subject: string
  body: string
  channel: MailChannel
  status: MailStatus
  error: string | null
  createdAt: string
  sentAt: string | null
}

export type AuditEvent = {
  eventId: number
  action: string
  ticketId: number | null
  ticketNo: string | null
  operatorId: number
  operatorName: string
  detail: string
  occurredAt: string
}

export type Page<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export type CompleteResponse = {
  ticket: TicketListItem
  notification: {
    outboxId: number
    channel: MailChannel
    status: MailStatus
  }
}

export type RatingResponse = {
  score: number
  comment: string | null
  ratedAt: string
}

export type ReplyResponse = TicketReply
