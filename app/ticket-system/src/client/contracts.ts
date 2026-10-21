// 工单系统前端契约类型。
// 字段级契约唯一来源：docs/wi-t1000333/technical-contract.md；此处仅做客户端类型声明，不虚构接口行为。

export type TicketStatus = 'awaiting_assignment' | 'pending' | 'completed' | 'cancelled'
export type Priority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'
export type ReplySide = 'submitter' | 'handler'
export type TicketSort = 'created_at_desc' | 'created_at_asc' | 'priority_asc' | 'priority_desc'
export type StatsDimension = 'company' | 'department'

export type AuditEventType =
  | 'ticket_created'
  | 'ticket_auto_assigned'
  | 'ticket_manually_assigned'
  | 'ticket_transferred'
  | 'ticket_replied'
  | 'ticket_completed'
  | 'ticket_email_sent'
  | 'ticket_email_failed'
  | 'ticket_cancelled'
  | 'ticket_rated'

export type Category = { id: number; name: string }
export type CompanyRef = { id: number; name: string }
export type UserRef = { id: string; name: string }
export type GroupRef = { id: number; name: string }

export type TicketSubmitter = { id: string; name: string; email: string; department: string }

export type TicketSummary = {
  id: number
  subject: string
  status: TicketStatus
  priority: Priority
  category: Category
  company: CompanyRef
  submitter: TicketSubmitter
  createdAt: string
  assignedGroup: GroupRef | null
  handler: UserRef | null
  handledAt: string | null
  ratingScore: number | null
}

export type Reply = {
  id: number
  author: UserRef
  side: ReplySide
  content: string
  createdAt: string
}

export type TicketRating = { score: number; createdAt: string }

export type TicketDetail = TicketSummary & {
  description: string
  replies: Reply[]
  rating: TicketRating | null
}

export type MeUser = { id: string; name: string; email: string; passwordChangeRequired?: boolean }
export type MeOrg = { companyId: number; companyName: string; department: string; isCompanyAdmin: boolean }
export type MeGroup = { id: number; name: string; companyId: number }
export type MeResponse = { user: MeUser; org: MeOrg | null; groups: MeGroup[] }

export type LoginResponse = { token: string; user: MeUser }

export type GroupMember = { userId: string; name: string }
export type Group = { id: number; companyId: number; name: string; members: GroupMember[] }
export type Rule = { id: number; companyId: number; category: Category; group: GroupRef }

export type UserDirectoryEntry = {
  id: string
  name: string
  email: string
  org: { companyId: number; companyName: string; department: string; isCompanyAdmin: boolean } | null
}
export type OrgProfile = {
  userId: string
  companyId: number
  companyName: string
  department: string
  isCompanyAdmin: boolean
}

export type TicketListResponse = { tickets: TicketSummary[] }

export type SubmitterHistoryResponse = {
  submitter: { id: string; name: string; email: string; company: CompanyRef; department: string }
  tickets: { id: number; subject: string; status: TicketStatus; priority: Priority; createdAt: string }[]
}

export type AuditEvent = {
  id: number
  type: AuditEventType
  actor: UserRef
  createdAt: string
  ticketId: number
  detail: Record<string, unknown> | null
}
export type TicketLogsResponse = { events: AuditEvent[] }

export type CompleteResponse = {
  ticket: TicketSummary
  notification: { emailSent: boolean; error: string | null }
}
export type RatingResponse = { score: number; createdAt: string }

export type DistributionResponse = { items: { key: string; count: number }[] }
export type DashboardResponse = {
  volume: number
  avgResponseSeconds: number | null
  satisfactionAvg: number | null
  ratedCount: number
  hotCategories: { category: string; count: number }[]
}
