// 132-ticket 工单系统 — 前端契约类型。
// 唯一来源：docs/wi-t1000329/technical-contract.md（字段级 API 契约）。
// 前端不发明契约外的接口行为；数据域过滤与授权全部由服务端承担。

export type Role = 'submitter' | 'agent' | 'admin' | 'viewer'
export type Priority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'
export type TicketStatus = 'created' | 'pending_assignment' | 'in_progress' | 'completed' | 'cancelled'
export type TicketSortField = 'createdAt' | 'priority' | 'ticketNo'
export type SortOrder = 'asc' | 'desc'

export function isRole(value: string | null | undefined): value is Role {
  return value === 'submitter' || value === 'agent' || value === 'admin' || value === 'viewer'
}

/** 通用分页响应（契约第 0 节）。 */
export interface Paged<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

// ── 认证与当前用户 ──────────────────────────────────────────────

export interface LoginRequest {
  username: string
  password: string
}

/** POST /api/auth/login 响应中的用户对象（业务档案未设置时对应字段为 null）。 */
export interface LoginUser {
  userId: number
  username: string
  displayName: string
  email: string | null
  companyId: number | null
  department: string | null
  role: string | null
}

export interface LoginResponse {
  token: string
  user: LoginUser
}

/** GET /api/me 响应（业务档案字段非空，companyName 可空）。 */
export interface CurrentUser {
  userId: number
  username: string
  displayName: string
  email: string
  companyId: number
  companyName: string | null
  department: string
  role: string
}

// ── 用户管理（admin） ───────────────────────────────────────────

export interface UserItem {
  userId: number
  username: string
  displayName: string
  email: string
  companyId: number
  companyName: string
  department: string
  role: string
}

export interface CreateUserRequest {
  username: string
  password: string
  displayName: string
  email: string
  companyId: number
  department: string
  role: Role
}

export interface UpdateUserProfileRequest {
  displayName?: string
  email?: string
  companyId?: number
  department?: string
  role?: Role
}

// ── 公司与分类 ──────────────────────────────────────────────────

export interface Company {
  id: number
  name: string
}

export interface Category {
  id: number
  name: string
}

// ── 业务组、成员与分类自动分配规则 ──────────────────────────────

export interface GroupSummary {
  id: number
  name: string
  memberCount: number
}

export interface GroupMember {
  userId: number
  displayName: string
  email: string
  department: string
}

export interface RoutingRule {
  id: number
  categoryId: number
  categoryName: string
  groupId: number
  groupName: string
}

// ── 工单 ────────────────────────────────────────────────────────

export interface TicketSummary {
  id: number
  ticketNo: string
  subject: string
  categoryName: string
  priority: Priority
  status: TicketStatus
  companyId: number
  companyName: string
  submitterName: string
  assignedGroupName: string | null
  createdAt: string
}

/** 工单对象 = 工单摘要 + 详情扩展字段（见 GET /api/tickets/{id} 的 ticket）。 */
export interface TicketObject extends TicketSummary {
  description: string
  assignedGroupId: number | null
  completedByName: string | null
  completedAt: string | null
  cancelledByName: string | null
  cancelledAt: string | null
}

export interface TicketSubmitterInfo {
  userId: number
  displayName: string
  email: string
  companyName: string
  department: string
  historyTotal: number
}

export interface SubmitterHistoryItem {
  ticketNo: string
  subject: string
  status: TicketStatus
  createdAt: string
}

export interface TicketReply {
  id: number
  authorName: string
  authorSide: 'submitter' | 'agent'
  content: string
  createdAt: string
}

export interface Satisfaction {
  rating: number
  comment: string | null
  ratedAt: string
}

export interface EmailLog {
  toEmail: string
  status: string
  sentAt: string
}

export interface TicketDetail {
  ticket: TicketObject
  submitter: TicketSubmitterInfo
  submitterHistory: SubmitterHistoryItem[]
  replies: TicketReply[]
  satisfaction: Satisfaction | null
  emailLog: EmailLog | null
}

export interface TicketListQuery {
  status?: TicketStatus
  priority?: Priority
  categoryId?: number
  companyId?: number
  search?: string
  sort?: TicketSortField
  order?: SortOrder
  page?: number
  pageSize?: number
}

export interface CreateTicketRequest {
  subject: string
  description: string
  categoryId: number
  priority: Priority
}

export interface TicketLogEntry {
  id: number
  action: string
  operatorName: string
  detail: string | null
  createdAt: string
}

export interface CompleteTicketResponse {
  ticket: TicketObject
  emailLog: {
    toEmail: string
    status: string
    error: string | null
  }
}

export interface SatisfactionResponse {
  rating: number
  comment: string | null
  ratedAt: string
}

// ── 统计分析 ────────────────────────────────────────────────────

export type StatsDimension = 'company' | 'department'

export interface DistributionItem {
  key: string
  name: string
  count: number
}

export interface DistributionResponse {
  dimension: StatsDimension
  items: DistributionItem[]
}

export interface DashboardResponse {
  ticketVolume: {
    total: number
    byStatus: Record<TicketStatus, number>
  }
  avgResponseMinutes: number | null
  satisfaction: {
    average: number | null
    ratedCount: number
  }
  hotCategories: {
    categoryId: number
    name: string
    count: number
  }[]
}
