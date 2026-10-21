import { apiRequest } from '../platform/api-client'
import type {
  Category,
  CompanyUser,
  DashboardStats,
  GroupInfo,
  MailOutboxResult,
  RuleInfo,
  TicketDetailBundle,
  TicketListResult,
  UserSummary,
} from './types'

export async function login(username: string, password: string): Promise<{ token: string; user: UserSummary }> {
  return apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export async function logout(): Promise<void> {
  await apiRequest('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) })
}

export async function fetchCurrentUser(): Promise<UserSummary> {
  return apiRequest('/api/auth/me')
}

export type TicketListQuery = {
  scope: 'company' | 'mine'
  status?: string
  categoryId?: number
  priority?: string
  companyId?: number
  q?: string
  sort?: 'createdAt' | 'priority'
  order?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export async function listTickets(query: TicketListQuery): Promise<TicketListResult> {
  const params = new URLSearchParams()
  params.set('scope', query.scope)
  if (query.status) params.set('status', query.status)
  if (query.categoryId != null) params.set('categoryId', String(query.categoryId))
  if (query.priority) params.set('priority', query.priority)
  if (query.companyId != null) params.set('companyId', String(query.companyId))
  if (query.q) params.set('q', query.q)
  if (query.sort) params.set('sort', query.sort)
  if (query.order) params.set('order', query.order)
  if (query.page != null) params.set('page', String(query.page))
  if (query.pageSize != null) params.set('pageSize', String(query.pageSize))
  return apiRequest(`/api/tickets?${params.toString()}`)
}

export async function createTicket(input: {
  subject: string
  categoryId: number
  priority: string
  description?: string
}): Promise<TicketDetailBundle> {
  return apiRequest('/api/tickets', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function fetchTicketDetail(ticketId: number): Promise<TicketDetailBundle> {
  return apiRequest(`/api/tickets/${ticketId}`)
}

export async function addTicketReply(ticketId: number, content: string): Promise<void> {
  await apiRequest(`/api/tickets/${ticketId}/replies`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  })
}

export async function assignTicket(ticketId: number, groupId: number): Promise<void> {
  await apiRequest(`/api/tickets/${ticketId}/assign`, {
    method: 'POST',
    body: JSON.stringify({ groupId }),
  })
}

export async function transferTicket(ticketId: number, toGroupId: number): Promise<void> {
  await apiRequest(`/api/tickets/${ticketId}/transfer`, {
    method: 'POST',
    body: JSON.stringify({ toGroupId }),
  })
}

export async function completeTicket(ticketId: number): Promise<void> {
  await apiRequest(`/api/tickets/${ticketId}/complete`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function cancelTicket(ticketId: number): Promise<void> {
  await apiRequest(`/api/tickets/${ticketId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function rateTicket(ticketId: number, rating: number): Promise<void> {
  await apiRequest(`/api/tickets/${ticketId}/rating`, {
    method: 'POST',
    body: JSON.stringify({ rating }),
  })
}

export async function listGroups(): Promise<{ items: GroupInfo[] }> {
  return apiRequest('/api/groups')
}

export async function createGroup(name: string, description: string): Promise<void> {
  await apiRequest('/api/groups', {
    method: 'POST',
    body: JSON.stringify({ name, description }),
  })
}

export async function addGroupMembers(groupId: number, userIds: number[]): Promise<void> {
  await apiRequest(`/api/groups/${groupId}/members`, {
    method: 'POST',
    body: JSON.stringify({ userIds }),
  })
}

export async function removeGroupMember(groupId: number, userId: number): Promise<void> {
  await apiRequest(`/api/groups/${groupId}/members/${userId}`, { method: 'DELETE' })
}

export async function listRules(): Promise<{ items: RuleInfo[] }> {
  return apiRequest('/api/assignment-rules')
}

export async function upsertRule(categoryId: number, groupId: number): Promise<void> {
  await apiRequest('/api/assignment-rules', {
    method: 'PUT',
    body: JSON.stringify({ categoryId, groupId }),
  })
}

export async function deleteRule(categoryId: number): Promise<void> {
  await apiRequest(`/api/assignment-rules/${categoryId}`, { method: 'DELETE' })
}

export async function listCategories(): Promise<{ items: Category[] }> {
  return apiRequest('/api/categories')
}

export async function listCompanyUsers(): Promise<{ items: CompanyUser[] }> {
  return apiRequest('/api/users')
}

export async function fetchDashboard(params: {
  companyId?: number
  department?: string
}): Promise<DashboardStats> {
  const search = new URLSearchParams()
  if (params.companyId != null) search.set('companyId', String(params.companyId))
  if (params.department) search.set('department', params.department)
  const suffix = search.toString() ? `?${search.toString()}` : ''
  return apiRequest(`/api/stats/dashboard${suffix}`)
}

export async function listMailOutbox(params: {
  ticketId?: number
  page?: number
  pageSize?: number
}): Promise<MailOutboxResult> {
  const search = new URLSearchParams()
  if (params.ticketId != null) search.set('ticketId', String(params.ticketId))
  if (params.page != null) search.set('page', String(params.page))
  if (params.pageSize != null) search.set('pageSize', String(params.pageSize))
  return apiRequest(`/api/mail-outbox?${search.toString()}`)
}
