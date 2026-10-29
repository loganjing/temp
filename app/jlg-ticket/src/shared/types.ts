// Platform-neutral API type definitions shared by server and client.

export interface TicketSummary {
  id: string
  subject: string
  category: string
  slaPriority: string
  status: string
  submitterName: string
  currentGroupName: string | null
  createdAt: string
}

export interface TicketDetail {
  id: string
  subject: string
  description: string
  category: string
  slaPriority: string
  submitterName: string
  submitterCompanyId: string
  submitterDepartment: string
  submitterEmail: string
  status: string
  currentGroupId: string | null
  currentGroupName: string | null
  handlerMemberId: string | null
  handlerName: string | null
  processedAt: string | null
  createdAt: string
  submitterCompanyName: string
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

export interface SubmitterInfo {
  name: string
  company: string
  companyId: string
  department: string
  email: string
  historyTickets: TicketSummary[]
}
