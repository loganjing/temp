// 服务端层契约类型（docs/wi-t1000333/technical-contract.md）。
// 契约类型按任务边界分别落在 server/client 各层，不写入 src/shared/。

export type TicketStatus = 'awaiting_assignment' | 'pending' | 'completed' | 'cancelled'
export type Priority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'
export type ReplySide = 'submitter' | 'handler'

export type TicketSummary = {
  id: number
  subject: string
  status: TicketStatus
  priority: Priority
  category: { id: number; name: string }
  company: { id: number; name: string }
  submitter: { id: string; name: string; email: string; department: string }
  createdAt: string
  assignedGroup: { id: number; name: string } | null
  handler: { id: string; name: string } | null
  handledAt: string | null
  ratingScore: number | null
}

export type Reply = {
  id: number
  author: { id: string; name: string }
  side: ReplySide
  content: string
  createdAt: string
}

export type TicketDetail = TicketSummary & {
  description: string
  replies: Reply[]
  rating: { score: number; createdAt: string } | null
}

export type Group = {
  id: number
  companyId: number
  name: string
  members: { userId: string; name: string }[]
}

export type Rule = {
  id: number
  companyId: number
  category: { id: number; name: string }
  group: { id: number; name: string }
}

export type TicketAuditEvent = {
  id: number
  type: string
  actor: { id: string; name: string } | null
  createdAt: string
  ticketId: number
  detail: Record<string, unknown> | null
}

export const TICKET_STATUSES: readonly TicketStatus[] = ['awaiting_assignment', 'pending', 'completed', 'cancelled']
export const PRIORITIES: readonly Priority[] = ['P0', 'P1', 'P2', 'P3', 'P4']

export type TicketSort = 'created_at_desc' | 'created_at_asc' | 'priority_asc' | 'priority_desc'
export const TICKET_SORTS: readonly TicketSort[] = ['created_at_desc', 'created_at_asc', 'priority_asc', 'priority_desc']
