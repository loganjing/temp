export type UserSummary = {
  id: number
  username: string
  fullName: string
  email: string
  companyId: number
  companyName: string
  department: string
}

export type TicketStatus =
  | 'created'
  | 'pending_assignment'
  | 'pending_process'
  | 'completed'
  | 'cancelled'

export type TicketPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'

export type TicketListItem = {
  id: number
  ticketNo: string
  subject: string
  categoryId: number
  categoryName: string
  priority: string
  status: string
  companyName: string
  submitterName: string
  assignedGroupId: number | null
  assignedGroupName: string | null
  createdAt: string
  firstReplyAt: string | null
}

export type TicketDetail = TicketListItem & {
  description: string
  submitter: UserSummary
  completedBy: { id: number; fullName: string } | null
  completedAt: string | null
  updatedAt: string
}

export type ReplyItem = {
  id: number
  author: { id: number; fullName: string }
  content: string
  createdAt: string
}

export type TimelineOperator = { id: number; fullName: string } | 'system'

export type TimelineItem = {
  type: string
  operator: TimelineOperator
  payload: Record<string, unknown>
  occurredAt: string
}

export type HistoryTicketItem = {
  id: number
  ticketNo: string
  subject: string
  status: string
  createdAt: string
}

export type RatingInfo = {
  rating: number
  ratedAt: string
  ratedBy: { id: number; fullName: string }
}

export type TicketDetailBundle = {
  ticket: TicketDetail
  replies: ReplyItem[]
  timeline: TimelineItem[]
  submitterHistory: HistoryTicketItem[]
  rating: RatingInfo | null
}

export type TicketListResult = {
  items: TicketListItem[]
  total: number
  page: number
  pageSize: number
}

export type GroupMember = {
  id: number
  username: string
  fullName: string
  department: string
}

export type GroupInfo = {
  id: number
  name: string
  description: string
  memberCount: number
  members: GroupMember[]
  createdAt: string
}

export type RuleInfo = {
  id: number
  categoryId: number
  categoryName: string
  groupId: number
  groupName: string
  createdAt: string
}

export type Category = {
  id: number
  code: string
  name: string
}

export type CompanyUser = {
  id: number
  username: string
  fullName: string
  email: string
  department: string
}

export type DashboardStats = {
  volume: number
  avgResponseMinutes: number | null
  satisfaction: { average: number | null; ratedCount: number }
  hotCategories: { categoryId: number; categoryName: string; count: number }[]
  byCompany: { companyId: number; companyName: string; count: number }[]
  byDepartment: { companyId: number; companyName: string; department: string; count: number }[]
}

export type MailOutboxItem = {
  id: number
  ticketId: number
  ticketNo: string
  kind: string
  toEmail: string
  subject: string
  body: string
  status: string
  createdAt: string
}

export type MailOutboxResult = {
  items: MailOutboxItem[]
  total: number
  page: number
  pageSize: number
}
