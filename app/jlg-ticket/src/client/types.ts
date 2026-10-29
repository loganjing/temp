// API types matching technical-contract.md

export type TicketStatus = 'created' | 'pending_assign' | 'pending_process' | 'completed' | 'cancelled'
export type SlaPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'

export interface TicketSummary {
  id: string
  subject: string
  category: string
  slaPriority: SlaPriority
  status: TicketStatus
  submitterName: string
  currentGroupName: string | null
  createdAt: string
}

export interface TicketDetail {
  id: string
  subject: string
  description: string
  category: string
  slaPriority: SlaPriority
  submitterName: string
  submitterCompanyId: string
  submitterCompanyName: string
  submitterDepartment: string
  submitterEmail: string
  status: TicketStatus
  currentGroupId: string | null
  currentGroupName: string | null
  handlerMemberId: string | null
  handlerName: string | null
  processedAt: string | null
  createdAt: string
}

export interface Reply {
  id: string
  ticketId: string
  replierName: string
  content: string
  createdAt: string
}

export interface TransferRecord {
  id: string
  ticketId: string
  fromGroupName: string
  toGroupName: string
  transferredBy: string
  createdAt: string
}

export interface Evaluation {
  id: string
  ticketId: string
  rating: number
  comment: string | null
  createdAt: string
}

export interface SubmitterInfo {
  name: string
  company: string
  companyId: string
  department: string
  email: string
  historyTickets: TicketSummary[]
}

export interface Company {
  id: string
  name: string
  createdAt: string
}

export interface BusinessGroup {
  id: string
  companyId: string
  name: string
  createdAt: string
}

export interface GroupMember {
  id: string
  groupId: string
  name: string
  email: string
  createdAt: string
}

export interface AssignmentRule {
  id: string
  companyId: string
  companyName: string
  category: string
  targetGroupId: string
  targetGroupName: string
  createdAt: string
}

export interface TicketListResponse {
  items: TicketSummary[]
  total: number
}

export interface ItemListResponse<T> {
  items: T[]
}
