import type { TicketStatus, Priority } from './enums'

export interface Ticket {
  id: string
  companyId: string
  subject: string
  description: string
  category: string
  priority: string
  status: string
  submitterId: string
  businessGroupId: string | null
  handlerId: string | null
  createdAt: string
  updatedAt: string
  handledAt: string | null
  completedAt: string | null
}

export interface TicketReply {
  id: string
  ticketId: string
  replierId: string
  replierName: string
  content: string
  createdAt: string
}

export interface TicketDetail extends Omit<Ticket, never> {
  replies: TicketReply[]
}

export interface BusinessGroupMember {
  id: string
  name: string
  email: string
}

export interface BusinessGroup {
  id: string
  companyId: string
  name: string
  members: BusinessGroupMember[]
  createdAt: string
}

export interface AssignmentRule {
  id: string
  companyId: string
  category: string
  businessGroupId: string
  createdAt: string
}

export interface TicketTransfer {
  id: string
  ticketId: string
  fromHandlerId: string | null
  toHandlerId: string
  reason: string | null
  createdAt: string
}

export interface TicketEvaluation {
  id: string
  ticketId: string
  rating: number
  comment: string | null
  createdAt: string
}

export interface SubmitterInfo {
  id: string
  name: string
  email: string
  companyId: string
  companyName: string
  department: string | null
  historyTickets: Array<{
    id: string
    subject: string
    status: string
    priority: string
    createdAt: string
  }>
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface WorkbenchTicket {
  id: string
  subject: string
  category: string
  priority: string
  status: string
  submitterName: string
  handlerName: string | null
  createdAt: string
}

export interface DistributionItem {
  key: string
  label: string
  count: number
}

export interface DashboardData {
  ticketCount: number
  avgResponseTime: number
  satisfactionRate: number
  hotCategories: Array<{ category: string; count: number }>
}

export interface LogEntry {
  id: string
  action: string
  actorId: string
  actorName: string
  details: string | null
  createdAt: string
}

export interface AuthUserResponse {
  id: string
  name: string
  email: string
  companyId: string | null
  department: string | null
  role: string
}

export interface CreateTicketRequest {
  subject: string
  description: string
  category: string
  priority: Priority
}

export type TicketStatusValue = TicketStatus
