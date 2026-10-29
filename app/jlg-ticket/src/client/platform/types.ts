export type TicketStatus =
  | 'created'
  | 'pending_assignment'
  | 'pending_processing'
  | 'completed'
  | 'cancelled'

export type Priority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'

export interface Company {
  id: number
  name: string
  createdAt: string
}

export interface Submitter {
  id: number
  name: string
  email: string
  companyId: number
  companyName: string
  department: string | null
  createdAt: string
}

export interface HistoricalTicket {
  id: number
  ticketNo: string
  subject: string
  status: TicketStatus
  priority: Priority
  createdAt: string
}

export interface UserDetail extends Submitter {
  historicalTickets: HistoricalTicket[]
}

export interface TicketSummary {
  id: number
  ticketNo: string
  subject: string
  priority: Priority
  status: TicketStatus
  categoryId: number
  categoryName: string
  submitterId: number
  submitterName: string
  assignedGroupId: number | null
  assigneeId: number | null
  createdAt: string
}

export interface TicketReply {
  id: number
  ticketId: number
  replierId: number
  replierName: string
  content: string
  createdAt: string
}

export interface TicketTransfer {
  id: number
  ticketId: number
  fromUserId: number | null
  fromUserName: string | null
  toUserId: number | null
  toUserName: string | null
  toGroupId: number | null
  toGroupName: string | null
  reason: string | null
  createdAt: string
}

export interface TicketEvaluation {
  id: number
  ticketId: number
  rating: number
  comment: string | null
  createdAt: string
}

export interface AssignedGroup {
  id: number
  name: string
  companyId: number
}

export interface Assignee {
  id: number
  name: string
  email: string
}

export interface TicketDetail {
  id: number
  ticketNo: string
  subject: string
  description: string | null
  categoryId: number
  categoryName: string
  priority: Priority
  status: TicketStatus
  submitterId: number
  submitter: Submitter
  assignedGroupId: number | null
  assignedGroup: AssignedGroup | null
  assigneeId: number | null
  assignee: Assignee | null
  handledById: number | null
  handledAt: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
  replies: TicketReply[]
  transfers: TicketTransfer[]
  evaluation: TicketEvaluation | null
}

export interface BusinessGroup {
  id: number
  companyId: number
  name: string
  createdAt: string
}

export interface GroupMember {
  id: number
  groupId: number
  userId: number
  userName: string
  userEmail: string
  createdAt: string
}

export interface Category {
  id: number
  name: string
  createdAt: string
}

export interface CategoryGroupRule {
  id: number
  companyId: number
  companyName: string
  categoryId: number
  categoryName: string
  groupId: number
  groupName: string
  createdAt: string
}

// API response wrappers
export interface TicketsResponse { tickets: TicketSummary[] }
export interface TicketResponse { ticket: TicketDetail }
export interface CompaniesResponse { companies: Company[] }
export interface CompanyResponse { company: Company }
export interface GroupsResponse { groups: BusinessGroup[] }
export interface GroupResponse { group: BusinessGroup }
export interface MembersResponse { members: GroupMember[] }
export interface MemberResponse { member: GroupMember }
export interface CategoriesResponse { categories: Category[] }
export interface CategoryResponse { category: Category }
export interface RulesResponse { rules: CategoryGroupRule[] }
export interface RuleResponse { rule: CategoryGroupRule }
export interface UserResponse { user: UserDetail }
export interface ReplyResponse { reply: TicketReply }
export interface EvaluationResponse { evaluation: TicketEvaluation }

export const STATUS_LABELS: Record<TicketStatus, string> = {
  created: '创建',
  pending_assignment: '待分配',
  pending_processing: '待处理',
  completed: '完成',
  cancelled: '取消',
}

export const PRIORITY_OPTIONS: Priority[] = ['P0', 'P1', 'P2', 'P3', 'P4']

export const PRIORITY_LABELS: Record<Priority, string> = {
  P0: 'P0 最高',
  P1: 'P1 高',
  P2: 'P2 中',
  P3: 'P3 默认',
  P4: 'P4 低',
}

export const RATING_LABELS: Record<number, string> = {
  1: '非常不满意',
  2: '不满意',
  3: '一般',
  4: '满意',
  5: '非常满意',
}
