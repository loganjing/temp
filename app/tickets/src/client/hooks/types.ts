// Shared API types — aligned with technical-contract.md

export type TicketStatus =
  | 'created'
  | 'pending_assignment'
  | 'pending_processing'
  | 'completed'
  | 'cancelled'

export type SlaPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'

// --- Auth ---
export interface AuthUser {
  id: string
  name: string
  email: string
  role: 'submitter' | 'handler' | 'admin'
  companyId: string
  companyName: string
  department: string
}

export interface LoginResponse {
  token: string
  user: AuthUser
}

// --- Pagination ---
export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

// --- Ticket ---
export interface TicketListItem {
  id: string
  title: string
  category: string
  slaPriority: SlaPriority
  status: TicketStatus
  submitterName: string
  handlerName: string | null
  createdAt: string
}

export interface TicketReply {
  id: string
  replierId: string
  replierName: string
  content: string
  createdAt: string
}

export interface TicketDetail {
  id: string
  title: string
  description: string
  category: string
  slaPriority: SlaPriority
  status: TicketStatus
  companyId: string
  submitterId: string
  submitterName: string
  submitterEmail: string
  submitterDepartment: string
  handlerId: string | null
  handlerName: string | null
  assignedGroupName: string | null
  createdAt: string
  handledAt: string | null
  replies: TicketReply[]
}

export interface TicketCreateBody {
  title: string
  description: string
  category: string
  slaPriority: SlaPriority
}

// --- Submitter info ---
export interface HistoryTicket {
  id: string
  title: string
  status: TicketStatus
  createdAt: string
}

export interface SubmitterInfo {
  userId: string
  name: string
  email: string
  companyName: string
  department: string
  historyTickets: HistoryTicket[]
}

// --- Business groups ---
export interface GroupMember {
  userId: string
  userName: string
  email: string
}

export interface BusinessGroup {
  id: string
  name: string
  members: GroupMember[]
}

// --- Assignment rules ---
export interface AssignmentRule {
  id: string
  category: string
  groupId: string
  groupName: string
}

// --- Transfer ---
export interface TransferResult {
  ticketId: string
  fromUserId: string
  toGroupId: string | null
  toUserId: string | null
  reason: string
  createdAt: string
}

// --- Evaluation ---
export interface Evaluation {
  id: string
  ticketId: string
  rating: number
  comment: string | null
  createdAt: string
}

// --- Stats ---
export interface DistributionItem {
  label: string
  total: number
  pending: number
  completed: number
  cancelled: number
}

export interface DistributionResponse {
  dimension: string
  items: DistributionItem[]
}

export interface HotCategory {
  category: string
  count: number
}

export interface DashboardData {
  totalTickets: number
  pendingTickets: number
  completedTickets: number
  cancelledTickets: number
  avgResponseTimeHours: number
  satisfactionScore: number
  hotCategories: HotCategory[]
}

// --- Audit log ---
export interface AuditLog {
  id: string
  actorId: string
  actorName: string
  action: string
  entityType: string
  entityId: string
  metadata: Record<string, unknown>
  createdAt: string
}
