export type TicketStatus = 'pending_assignment' | 'pending_processing' | 'completed' | 'cancelled'
export type SLAPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'
export type UserRole = 'submitter' | 'handler' | 'admin'

export interface CurrentUser {
  id: string
  profileId: string | null
  userId: string
  companyId: string | null
  role: string
  displayName: string | null
  email: string
  departmentId: string | null
  companyName: string | null
  departmentName: string | null
  passwordChangeRequired: boolean
}

export interface TicketResponse {
  id: string
  companyId: string
  submitterProfileId: string
  subject: string
  description: string | null
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
