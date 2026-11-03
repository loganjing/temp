// API 契约类型 — 依据 docs/wi-t1000076/technical-contract.md 定义，不臆造 API 行为。

export type TicketStatus = 'created' | 'pending_assign' | 'pending_process' | 'completed' | 'cancelled'
export type SlaPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'
export type DistributionDimension = 'company' | 'department'

/** 当前用户信息（GET /api/auth/me）。 */
export type CurrentUser = {
  id: string
  name: string
  email: string
  phone?: string | null
  companyId?: string | null
  departmentId?: string | null
  passwordChangeRequired?: boolean
}

/** 工单（POST/GET /api/tickets 单项）。 */
export type Ticket = {
  id: string
  companyId: string
  subject: string
  description: string
  category: string
  slaPriority: SlaPriority
  status: TicketStatus
  submitterUserId: string
  submitterName: string
  assignedGroupId: string | null
  assignedGroupName: string | null
  assignedUserId: string | null
  handlerUserId: string | null
  createdAt: number
  processedAt: number | null
}

/** 工单列表查询参数。 */
export type TicketListQuery = {
  status?: TicketStatus
  category?: string
  slaPriority?: SlaPriority
  companyId?: string
  search?: string
  sort?: 'created_at' | 'sla_priority'
  order?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export type TicketListResponse = {
  items: Ticket[]
  total: number
  page: number
  pageSize: number
}

export type CreateTicketBody = {
  subject: string
  description: string
  category: string
  slaPriority: SlaPriority
}

export type PatchTicketBody = {
  status?: 'pending_process' | 'completed' | 'cancelled'
  assignedGroupId?: string | null
  assignedUserId?: string | null
}

export type TransferTicketBody = {
  toGroupId: string | null
  toUserId: string | null
}

/** 工单回复。 */
export type TicketReply = {
  id: string
  ticketId: string
  userId: string
  userFullName: string
  content: string
  createdAt: number
}

/** 提交人完整信息与历史工单。 */
export type SubmitterInfo = {
  user: {
    id: string
    fullName: string
    email: string
    companyId: string
    companyName: string
    departmentId: string | null
    departmentName: string | null
  }
  historyTickets: Array<{
    id: string
    subject: string
    status: string
    category: string
    createdAt: number
  }>
}

/** 工单评价。 */
export type TicketEvaluation = {
  id: string
  ticketId: string
  userId: string
  rating: number
  createdAt: number
}

/** 公司。 */
export type Company = {
  id: string
  name: string
  createdAt: number
}

/** 部门。 */
export type Department = {
  id: string
  companyId: string
  name: string
  createdAt: number
}

/** 业务组。 */
export type BusinessGroup = {
  id: string
  companyId: string
  name: string
  memberCount: number
  createdAt: number
}

/** 业务组成员。 */
export type GroupMember = {
  id: string
  groupId: string
  userId: string
  fullName: string
  email: string
  createdAt: number
}

/** 用户（GET /api/users）。 */
export type UserItem = {
  id: string
  username: string
  email: string
  fullName: string
  companyId: string
  departmentId: string | null
}

/** 分类分配规则。 */
export type AssignmentRule = {
  id: string
  companyId: string
  category: string
  groupId: string
  groupName: string
  createdAt: number
}

/** 工单分布统计项。 */
export type DistributionItem = {
  dimensionKey: string
  dimensionName: string
  total: number
  pendingProcess: number
  completed: number
  cancelled: number
}

/** 运营仪表盘。 */
export type Dashboard = {
  ticketCount: {
    total: number
    created: number
    pendingAssign: number
    pendingProcess: number
    completed: number
    cancelled: number
  }
  avgResponseTimeMs: number
  satisfaction: { average: number; count: number }
  hotCategories: Array<{ category: string; count: number }>
}

/** 审计日志项。 */
export type AuditLogItem = {
  id: string
  eventType: string
  actorId: string
  actorName: string
  targetType: string
  targetId: string
  metadata: Record<string, unknown>
  createdAt: number
}

export type AuditLogListResponse = {
  items: AuditLogItem[]
  total: number
  page: number
  pageSize: number
}
