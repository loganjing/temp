// 类型化 API 客户端边界：端点、请求与响应形态均按
// docs/wi-t1000327/technical-contract.md 第 4 节建模。
import { apiRequest } from './platform/api-client'
import type {
  AssignmentRule,
  BusinessGroup,
  Category,
  CompanyOption,
  DashboardStats,
  DistributionItem,
  ListScope,
  Priority,
  Rating,
  SortField,
  SortOrder,
  StatsDimension,
  Status,
  Ticket,
  TicketDetail,
  TicketLog,
  TicketNotification,
  TicketReply,
  UserProfileDetail,
  UserProfileSummary,
} from './types'

// ---------------------------------------------------------------------------
// 认证（契约 4.1，starter 提供）
// ---------------------------------------------------------------------------

/** 登录响应承载会话（AuthKit Cookie/Bearer）；若返回 token 则交由 api-client 携带。 */
export async function login(username: string, password: string): Promise<void> {
  const result: unknown = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  const token = (result as { token?: unknown } | null)?.token
  if (typeof token === 'string' && token) localStorage.setItem('platform-token', token)
}

export async function fetchCurrentUser(): Promise<UserProfileSummary> {
  const body = await apiRequest<{ user: UserProfileSummary }>('/api/auth/me')
  return body.user
}

export async function logout(): Promise<void> {
  try {
    await apiRequest('/api/auth/logout', { method: 'POST' })
  } finally {
    localStorage.removeItem('platform-token')
  }
}

// starter 首个账户初始化（账户引导；契约 4.6 保留入口）
export function fetchBootstrapStatus(): Promise<{ required: boolean }> {
  return apiRequest<{ required: boolean }>('/api/auth/bootstrap-status')
}

export function bootstrapFirstAccount(body: { name: string; email: string; password: string }): Promise<unknown> {
  return apiRequest('/api/auth/bootstrap', { method: 'POST', body: JSON.stringify(body) })
}

// ---------------------------------------------------------------------------
// 工单（契约 4.2）
// ---------------------------------------------------------------------------

export interface TicketListQuery {
  status?: Status
  priority?: Priority
  categoryId?: number
  groupId?: number
  /** 仅 platform_ops 有效；其他角色由服务端强制本公司。 */
  companyId?: number
  q?: string
  sort?: SortField
  order?: SortOrder
  scope?: ListScope
  mine?: 0 | 1
}

function ticketQueryString(query: TicketListQuery): string {
  const params = new URLSearchParams()
  if (query.status) params.set('status', query.status)
  if (query.priority) params.set('priority', query.priority)
  if (query.categoryId !== undefined && query.categoryId !== null) params.set('categoryId', String(query.categoryId))
  if (query.groupId !== undefined && query.groupId !== null) params.set('groupId', String(query.groupId))
  if (query.companyId !== undefined && query.companyId !== null) params.set('companyId', String(query.companyId))
  if (query.q) params.set('q', query.q.trim())
  if (query.sort) params.set('sort', query.sort)
  if (query.order) params.set('order', query.order)
  if (query.scope) params.set('scope', query.scope)
  if (query.mine !== undefined && query.mine !== null) params.set('mine', String(query.mine))
  const text = params.toString()
  return text ? `?${text}` : ''
}

export function listTickets(query: TicketListQuery): Promise<{ items: Ticket[]; total: number }> {
  return apiRequest(`/api/tickets${ticketQueryString(query)}`)
}

export function createTicket(body: {
  subject: string
  description: string
  categoryId: number
  priority: Priority
}): Promise<Ticket> {
  return apiRequest('/api/tickets', { method: 'POST', body: JSON.stringify(body) })
}

export function getTicketDetail(id: number): Promise<TicketDetail> {
  return apiRequest(`/api/tickets/${id}`)
}

export function getTicketLogs(id: number): Promise<{ items: TicketLog[] }> {
  return apiRequest(`/api/tickets/${id}/logs`)
}

export function getSubmitterProfile(id: number): Promise<UserProfileDetail> {
  return apiRequest(`/api/tickets/${id}/submitter`)
}

export function addTicketReply(id: number, content: string): Promise<TicketReply> {
  return apiRequest(`/api/tickets/${id}/replies`, { method: 'POST', body: JSON.stringify({ content }) })
}

export function assignTicket(id: number, groupId: number): Promise<Ticket> {
  return apiRequest(`/api/tickets/${id}/assign`, { method: 'POST', body: JSON.stringify({ groupId }) })
}

export function transferTicket(id: number, groupId: number, reason?: string): Promise<Ticket> {
  const body = reason?.trim() ? { groupId, reason: reason.trim() } : { groupId }
  return apiRequest(`/api/tickets/${id}/transfer`, { method: 'POST', body: JSON.stringify(body) })
}

export function completeTicket(id: number, resolution?: string): Promise<Ticket> {
  const body = resolution?.trim() ? { resolution: resolution.trim() } : {}
  return apiRequest(`/api/tickets/${id}/complete`, { method: 'POST', body: JSON.stringify(body) })
}

export function cancelTicket(id: number, reason?: string): Promise<Ticket> {
  const body = reason?.trim() ? { reason: reason.trim() } : {}
  return apiRequest(`/api/tickets/${id}/cancel`, { method: 'POST', body: JSON.stringify(body) })
}

export function rateTicket(id: number, score: number, comment?: string): Promise<Rating> {
  const body = comment?.trim() ? { score, comment: comment.trim() } : { score }
  return apiRequest<{ rating: Rating }>(`/api/tickets/${id}/rating`, {
    method: 'POST',
    body: JSON.stringify(body),
  }).then((result) => result.rating)
}

// ---------------------------------------------------------------------------
// 组织与分配（契约 4.3）
// ---------------------------------------------------------------------------

export function listGroups(withMembers = false): Promise<{ items: BusinessGroup[] }> {
  return apiRequest(withMembers ? '/api/groups?members=1' : '/api/groups')
}

export function createGroup(name: string): Promise<BusinessGroup> {
  return apiRequest('/api/groups', { method: 'POST', body: JSON.stringify({ name }) })
}

export function addGroupMember(groupId: number, userProfileId: number): Promise<unknown> {
  return apiRequest(`/api/groups/${groupId}/members`, {
    method: 'POST',
    body: JSON.stringify({ userProfileId }),
  })
}

export function removeGroupMember(groupId: number, userProfileId: number): Promise<void> {
  return apiRequest(`/api/groups/${groupId}/members/${userProfileId}`, { method: 'DELETE' })
}

export function listCategories(): Promise<{ items: Category[] }> {
  return apiRequest('/api/categories')
}

export function createCategory(name: string): Promise<Category> {
  return apiRequest('/api/categories', { method: 'POST', body: JSON.stringify({ name }) })
}

export function listAssignmentRules(): Promise<{ items: AssignmentRule[] }> {
  return apiRequest('/api/assignment-rules')
}

export function createAssignmentRule(categoryId: number, groupId: number): Promise<AssignmentRule> {
  return apiRequest('/api/assignment-rules', { method: 'POST', body: JSON.stringify({ categoryId, groupId }) })
}

export function deleteAssignmentRule(id: number): Promise<void> {
  return apiRequest(`/api/assignment-rules/${id}`, { method: 'DELETE' })
}

export function listCompanies(): Promise<{ items: CompanyOption[] }> {
  return apiRequest('/api/companies')
}

// ---------------------------------------------------------------------------
// 统计分析（契约 4.4，只读）
// ---------------------------------------------------------------------------

export function getDistribution(
  dimension: StatsDimension,
  companyId?: number,
): Promise<{ dimension: string; items: DistributionItem[] }> {
  const params = new URLSearchParams({ dimension })
  if (companyId !== undefined && companyId !== null) params.set('companyId', String(companyId))
  return apiRequest(`/api/stats/distribution?${params.toString()}`)
}

export function getDashboard(companyId?: number): Promise<DashboardStats> {
  const suffix = companyId !== undefined && companyId !== null ? `?companyId=${companyId}` : ''
  return apiRequest(`/api/stats/dashboard${suffix}`)
}

// ---------------------------------------------------------------------------
// 通知（契约 4.5）
// ---------------------------------------------------------------------------

export function listNotifications(): Promise<{ items: TicketNotification[] }> {
  return apiRequest('/api/notifications')
}
