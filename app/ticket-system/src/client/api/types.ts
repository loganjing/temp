// 与 docs/wi-t1000002/technical-contract.md 对齐的请求/响应类型。

export type SlaPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'
export type TicketStatus = 'created' | 'pending_assignment' | 'pending_processing' | 'completed' | 'cancelled'
export type TicketSort = 'createdAt' | 'slaPriority' | 'status'

export type ListResult<T> = { items: T[] }
export type PagedResult<T> = { items: T[]; total: number; page: number; size: number }

export type AuthUser = { id: number; email: string; passwordChangeRequired?: boolean }
export type Profile = {
  id: number
  userId: number
  displayName: string
  email: string
  companyId: number | null
  departmentId: number | null
}
export type MeResult = { user: AuthUser; profile: Profile | null }
export type LoginResult = MeResult & { token: string }

export type UserSummary = {
  id: number
  email: string
  profile: { displayName: string; companyId: number | null; departmentId: number | null }
}
export type UserListResult = { items: UserSummary[]; total: number }

export type Company = { id: number; name: string }
export type Department = { id: number; name: string }
export type Category = { id: number; name: string }

export type BusinessGroupMember = { userId: number; displayName: string }
export type BusinessGroup = { id: number; name: string; companyId: number; members: BusinessGroupMember[] }
export type AssignmentRule = {
  id: number
  companyId: number
  categoryId: number
  categoryName: string
  targetGroupId: number
  targetGroupName: string
}

export type TicketListItem = {
  id: number
  title: string
  status: TicketStatus
  slaPriority: SlaPriority
  categoryId: number
  categoryName: string
  companyName: string
  businessGroupId: number | null
  createdAt: string
}

export type CreatedTicket = {
  id: number
  title: string
  description: string
  categoryId: number
  slaPriority: SlaPriority
  status: TicketStatus
  businessGroupId: number | null
  createdAt: string
}

export type TicketReply = { id: number; content: string; replierName: string; createdAt: string }
export type TicketTransfer = {
  id: number
  fromGroupName: string | null
  toGroupName: string | null
  transferredBy: number
  transferredAt: string
}
export type TicketRating = { score: number; comment: string | null; ratedAt: string }

export type TicketDetail = {
  id: number
  title: string
  description: string
  categoryId: number
  categoryName: string
  slaPriority: SlaPriority
  companyId: number
  companyName: string
  submitterName: string
  submitterEmail: string
  submitterDepartment: string | null
  businessGroupId: number | null
  businessGroupName: string | null
  handlerUserId: number | null
  handlerName: string | null
  status: TicketStatus
  createdAt: string
  completedAt: string | null
  cancelledAt: string | null
  replies: TicketReply[]
  transfers: TicketTransfer[]
  rating: TicketRating | null
}

export type TicketLog = {
  id: string
  action: string
  operatorName: string
  createdAt: string
  details: Record<string, unknown>
}

export type SubmitterInfo = {
  name: string
  company: string
  department: string | null
  historyTickets: { id: number; title: string; status: TicketStatus; createdAt: string }[]
}

export type DistributionResult = { dimension: string; items: { label: string; count: number }[] }
export type DashboardMetrics = {
  totalTickets: number
  avgResponseTimeMinutes: number | null
  satisfactionScore: number | null
  hotCategories: { categoryId: number; categoryName: string; count: number }[]
}

export type TicketQuery = {
  status?: string
  companyId?: string
  categoryId?: string
  priority?: string
  q?: string
  sort?: TicketSort
  order?: 'asc' | 'desc'
  page?: number
  size?: number
}
