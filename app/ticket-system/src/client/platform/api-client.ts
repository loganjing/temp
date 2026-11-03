export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

export async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('platform-token')
  const headers = new Headers(options?.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (options?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(path, { ...options, headers })
  const data: unknown = response.status === 204 ? undefined : await response.json().catch(() => undefined)
  if (response.ok) return data as T
  const body = data && typeof data === 'object' ? data as Record<string, unknown> : undefined
  const error = body?.error
  const detail = error && typeof error === 'object' ? error as Record<string, unknown> : undefined
  throw new ApiRequestError(typeof detail?.message === 'string' ? detail.message : typeof error === 'string' ? error : `HTTP ${response.status}`, response.status, typeof detail?.code === 'string' ? detail.code : typeof error === 'string' ? error : undefined)
}

// ---- Domain types (mirrors technical-contract.md) ----

export type TicketStatus = 'created' | 'pending_assignment' | 'pending_processing' | 'completed' | 'cancelled'
export type Priority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'

export type TicketListItem = {
  id: string
  subject: string
  category: string
  priority: Priority
  status: TicketStatus
  companyId: string
  submitterName: string
  assigneeName: string | null
  businessGroupName: string | null
  createdAt: string
}

export type ListResult<T> = { items: T[]; total: number }

export type TicketSubmitter = {
  id: string
  name: string
  email: string
  companyName: string | null
  departmentName: string | null
  historicalTickets: { id: string; subject: string; status: TicketStatus; createdAt: string }[]
}

export type TicketReply = {
  id: string
  replierId: string
  replierName: string
  content: string
  repliedAt: string
}

export type TicketEvaluation = {
  rating: number
  comment: string | null
  evaluatedAt: string
}

export type AuditLog = {
  id: string
  eventType: string
  actorUserId: string
  occurredAt: string
  metadata: Record<string, unknown>
}

export type TicketDetail = {
  id: string
  subject: string
  description: string
  category: string
  priority: Priority
  status: TicketStatus
  companyId: string
  submitter: TicketSubmitter
  businessGroupId: string | null
  businessGroupName: string | null
  assigneeId: string | null
  assigneeName: string | null
  handlerId: string | null
  handlerName: string | null
  createdAt: string
  handledAt: string | null
  replies: TicketReply[]
  evaluation: TicketEvaluation | null
  recentLogs: AuditLog[]
}

export type Company = { id: string; name: string }
export type Department = { id: string; name: string; companyId: string }

export type BusinessGroup = {
  id: string
  name: string
  companyId: string
  members: { userId: string; userName: string }[]
}

export type RoutingRule = {
  id: string
  companyId: string
  category: string
  businessGroupId: string
  businessGroupName?: string
}

export type UserListItem = {
  id: string
  name: string
  email: string
  phone: string | null
  companyId: string | null
  departmentName: string | null
}

export type DashboardStats = {
  totalTickets: number
  pendingCount: number
  completedCount: number
  cancelledCount: number
  avgResponseTimeMs: number | null
  avgSatisfaction: number | null
  hotCategories: { category: string; count: number }[]
}

export type DistributionStats = {
  dimension: 'company' | 'department'
  items: { label: string; count: number; companyId?: string }[]
}

export type CurrentUser = {
  id: string
  name: string
  email: string
  phone?: string | null
  companyId?: string | null
  roles?: string[]
  department?: { id: string; name: string } | null
  passwordChangeRequired?: boolean
}

// ---- Query helpers ----

function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') sp.set(key, String(value))
  }
  const qs = sp.toString()
  return qs ? `?${qs}` : ''
}

// ---- Auth ----

export const authApi = {
  login: (email: string, password: string) =>
    apiRequest<{ token: string; user: CurrentUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => apiRequest<CurrentUser>('/api/auth/me'),
  bootstrapStatus: () => apiRequest<{ required: boolean }>('/api/auth/bootstrap-status'),
  bootstrap: (body: Record<string, string>) =>
    apiRequest('/api/auth/bootstrap', { method: 'POST', body: JSON.stringify(body) }),
  changePassword: (password: string) =>
    apiRequest('/api/auth/password', { method: 'POST', body: JSON.stringify({ password }) }),
}

// ---- Tickets ----

export type TicketListQuery = {
  companyId?: string
  status?: TicketStatus | ''
  priority?: Priority | ''
  category?: string
  search?: string
  sort?: string
  page?: number
  pageSize?: number
}

export const ticketApi = {
  list: (query: TicketListQuery) =>
    apiRequest<ListResult<TicketListItem>>(`/api/tickets${buildQuery(query)}`),
  get: (id: string) =>
    apiRequest<TicketDetail>(`/api/tickets/${encodeURIComponent(id)}`),
  create: (body: { subject: string; description: string; category: string; priority: Priority }) =>
    apiRequest<TicketListItem & { submitterId: string; businessGroupId: string | null }>('/api/tickets', { method: 'POST', body: JSON.stringify(body) }),
  addReply: (id: string, content: string) =>
    apiRequest<TicketReply>(`/api/tickets/${encodeURIComponent(id)}/replies`, { method: 'POST', body: JSON.stringify({ content }) }),
  transfer: (id: string, body: { targetUserId?: string; targetGroupId?: string }) =>
    apiRequest<{ id: string; status: TicketStatus; assigneeId: string | null; businessGroupId: string | null }>(`/api/tickets/${encodeURIComponent(id)}/transfer`, { method: 'POST', body: JSON.stringify(body) }),
  complete: (id: string) =>
    apiRequest<{ id: string; status: TicketStatus; handlerId: string; handlerName: string; handledAt: string; emailNotification: { status: string; reason?: string } }>(`/api/tickets/${encodeURIComponent(id)}/complete`, { method: 'POST', body: JSON.stringify({}) }),
  cancel: (id: string) =>
    apiRequest<{ id: string; status: TicketStatus }>(`/api/tickets/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: JSON.stringify({}) }),
  evaluate: (id: string, rating: number, comment: string) =>
    apiRequest<{ id: string; ticketId: string; rating: number; comment: string; evaluatedAt: string }>(`/api/tickets/${encodeURIComponent(id)}/evaluation`, { method: 'POST', body: JSON.stringify({ rating, comment }) }),
  logs: (id: string) =>
    apiRequest<ListResult<AuditLog>>(`/api/tickets/${encodeURIComponent(id)}/logs`),
}

export const workbenchApi = {
  list: (query: TicketListQuery) =>
    apiRequest<ListResult<TicketListItem>>(`/api/workbench/tickets${buildQuery(query)}`),
}

// ---- Companies & departments ----

export const companyApi = {
  list: () => apiRequest<ListResult<Company>>('/api/companies'),
  create: (name: string) =>
    apiRequest<Company>('/api/companies', { method: 'POST', body: JSON.stringify({ name }) }),
  departments: (companyId: string) =>
    apiRequest<ListResult<Department>>(`/api/companies/${encodeURIComponent(companyId)}/departments`),
  createDepartment: (companyId: string, name: string) =>
    apiRequest<Department>(`/api/companies/${encodeURIComponent(companyId)}/departments`, { method: 'POST', body: JSON.stringify({ name }) }),
}

// ---- Business groups & routing rules ----

export const businessGroupApi = {
  list: (companyId: string) =>
    apiRequest<ListResult<BusinessGroup>>(`/api/companies/${encodeURIComponent(companyId)}/business-groups`),
  create: (companyId: string, name: string) =>
    apiRequest<BusinessGroup>(`/api/companies/${encodeURIComponent(companyId)}/business-groups`, { method: 'POST', body: JSON.stringify({ name }) }),
  addMember: (groupId: string, userId: string) =>
    apiRequest<{ groupId: string; userId: string }>(`/api/business-groups/${encodeURIComponent(groupId)}/members`, { method: 'POST', body: JSON.stringify({ userId }) }),
  removeMember: (groupId: string, userId: string) =>
    apiRequest<{ groupId: string; userId: string }>(`/api/business-groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
}

export const routingRuleApi = {
  list: (companyId: string) =>
    apiRequest<ListResult<RoutingRule>>(`/api/companies/${encodeURIComponent(companyId)}/routing-rules`),
  create: (companyId: string, category: string, businessGroupId: string) =>
    apiRequest<RoutingRule>(`/api/companies/${encodeURIComponent(companyId)}/routing-rules`, { method: 'POST', body: JSON.stringify({ category, businessGroupId }) }),
}

// ---- Users ----

export const userApi = {
  list: (query: { companyId?: string; search?: string; page?: number; pageSize?: number }) =>
    apiRequest<ListResult<UserListItem>>(`/api/users${buildQuery(query)}`),
  create: (body: { name: string; email: string; phone?: string; password: string; companyId: string; departmentId?: string }) =>
    apiRequest<{ id: string; name: string; email: string; companyId: string }>('/api/users', { method: 'POST', body: JSON.stringify(body) }),
}

// ---- Stats ----

export const statsApi = {
  distribution: (dimension: 'company' | 'department') =>
    apiRequest<DistributionStats>(`/api/stats/distribution?dimension=${dimension}`),
  dashboard: () => apiRequest<DashboardStats>('/api/stats/dashboard'),
}
