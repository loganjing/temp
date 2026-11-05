// 浏览器端 wire 类型：与 docs/wi-t1000009/technical-contract.md 的 JSON 结构一一对应。

export type Priority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'
export type TicketStatus = 'pending_assignment' | 'pending' | 'completed' | 'cancelled'
export type TicketAction = 'reply' | 'assign' | 'transfer' | 'complete' | 'cancel' | 'rate' | 'retryNotification'
export type NotificationStatus = 'sent' | 'failed' | 'skipped'
export type StatsDimension = 'company' | 'department'

export interface UserProfile {
  id: string
  name: string
  email: string
  companyId: string
  companyName: string
  department: string
  roles: string[]
  groups: Array<{ id: string; name: string }>
}

export interface LoginResponse {
  token: string
  user: UserProfile
}

export interface Category {
  id: string
  name: string
  sortOrder: number
}

export interface GroupRef {
  id: string
  name: string
}

export interface ReferenceData {
  categories: Category[]
  groups: GroupRef[]
}

export interface TicketSummary {
  id: string
  code: string
  subject: string
  categoryId: string
  categoryName: string
  priority: Priority
  status: TicketStatus
  submitter: { id: string; name: string }
  companyId: string
  companyName: string
  department: string
  group: GroupRef | null
  assignee: { id: string; name: string } | null
  createdAt: string
  updatedAt: string
}

export interface TicketHistoryItem {
  id: string
  code: string
  subject: string
  categoryName: string
  status: string
  createdAt: string
}

export interface TicketReply {
  id: string
  author: { id: string; name: string }
  content: string
  createdAt: string
}

export interface TicketRating {
  score: number
  comment: string | null
  createdAt: string
}

export interface NotificationRecord {
  id: string
  recipientEmail: string
  status: NotificationStatus
  errorMessage: string | null
  attempt: number
  createdAt: string
  sentAt: string | null
}

export interface TicketDetail extends Omit<TicketSummary, 'submitter'> {
  description: string
  submitter: {
    id: string
    name: string
    email: string
    companyId: string
    companyName: string
    department: string
  }
  history: TicketHistoryItem[]
  replies: TicketReply[]
  rating: TicketRating | null
  notifications: NotificationRecord[]
  completedBy: { id: string; name: string } | null
  completedAt: string | null
  cancelledBy: { id: string; name: string } | null
  cancelledAt: string | null
  firstReplyAt: string | null
  allowedActions: TicketAction[]
}

export interface TicketLog {
  id: string
  action: string
  actionLabel: string
  summary: string
  actor: { id: string; name: string }
  detail: Record<string, unknown> | null
  createdAt: string
}

export interface PageResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface BusinessGroup {
  id: string
  name: string
  description: string | null
  enabled: boolean
  members: Array<{ id: string; name: string; email: string; department: string }>
}

export interface CategoryConfig {
  id: string
  name: string
  enabled: boolean
  sortOrder: number
}

export interface AssignmentRule {
  id: string
  categoryId: string
  categoryName: string
  groupId: string
  groupName: string
  enabled: boolean
}

export interface CompanyUser {
  id: string
  name: string
  email: string
  department: string
  enabled: boolean
  roles: string[]
  groups: GroupRef[]
}

export interface StatsOverview {
  range: { from: string; to: string }
  volume: number
  cancelledCount: number
  avgFirstResponseMinutes: number | null
  satisfaction: { average: number | null; count: number }
  hotCategories: Array<{ categoryId: string; name: string; count: number }>
}

export interface StatsDistribution {
  dimension: StatsDimension
  total: number
  groups: Array<{ key: string; label: string; count: number }>
}

export interface TicketListQuery {
  scope: 'mine' | 'workbench'
  status?: string[]
  priority?: Priority
  categoryId?: string
  groupId?: string
  companyId?: string
  submitterId?: string
  from?: string
  to?: string
  q?: string
  sort?: 'createdAt' | 'priority' | 'updatedAt'
  order?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}