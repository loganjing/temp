import type {
  AuditLog,
  BusinessGroup,
  Category,
  CategoryAssignmentRule,
  CompleteResult,
  CurrentUser,
  DashboardData,
  DistributionResult,
  Paginated,
  SatisfactionRating,
  SubmitterInfo,
  TicketDetail,
  TicketListItem,
  TicketReply,
  TicketTransfer,
  ListTicketsParams,
  WorkbenchTicketsParams,
} from './types'

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
  const body = data && typeof data === 'object' ? (data as Record<string, unknown>) : undefined
  const error = body?.error
  const detail = error && typeof error === 'object' ? (error as Record<string, unknown>) : undefined
  throw new ApiRequestError(
    typeof detail?.message === 'string' ? detail.message : typeof error === 'string' ? error : `HTTP ${response.status}`,
    response.status,
    typeof detail?.code === 'string' ? detail.code : undefined,
  )
}

function buildQuery(params: object): string {
  const sp = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') sp.set(key, String(value))
  }
  const result = sp.toString()
  return result ? `?${result}` : ''
}

export const authApi = {
  me: () => apiRequest<CurrentUser>('/api/auth/me'),
  logout: () => apiRequest<void>('/api/auth/logout', { method: 'POST' }),
}

export const ticketApi = {
  list: (params: ListTicketsParams = {}) =>
    apiRequest<Paginated<TicketListItem>>(`/api/tickets${buildQuery(params)}`),
  workbench: (params: WorkbenchTicketsParams = {}) =>
    apiRequest<Paginated<TicketListItem>>(`/api/workbench/tickets${buildQuery(params)}`),
  get: (id: string) => apiRequest<TicketDetail>(`/api/tickets/${encodeURIComponent(id)}`),
  create: (body: { subject: string; description: string; categoryId: string; slaPriority: string }) =>
    apiRequest<TicketDetail>('/api/tickets', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: { slaPriority?: string; assignedGroupId?: string; status?: string }) =>
    apiRequest<TicketDetail>(`/api/tickets/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  reply: (id: string, content: string) =>
    apiRequest<TicketReply>(`/api/tickets/${encodeURIComponent(id)}/replies`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  transfer: (id: string, body: { toGroupId: string; reason?: string }) =>
    apiRequest<TicketTransfer>(`/api/tickets/${encodeURIComponent(id)}/transfer`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  complete: (id: string, summary?: string) =>
    apiRequest<CompleteResult>(`/api/tickets/${encodeURIComponent(id)}/complete`, {
      method: 'POST',
      body: JSON.stringify({ summary }),
    }),
  submitter: (id: string) =>
    apiRequest<SubmitterInfo>(`/api/tickets/${encodeURIComponent(id)}/submitter`),
  rate: (id: string, body: { rating: number; comment?: string }) =>
    apiRequest<SatisfactionRating>(`/api/tickets/${encodeURIComponent(id)}/rating`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
}

export const groupApi = {
  list: () => apiRequest<{ items: BusinessGroup[] }>('/api/business-groups'),
  create: (name: string) =>
    apiRequest<BusinessGroup>('/api/business-groups', { method: 'POST', body: JSON.stringify({ name }) }),
  updateMembers: (id: string, memberUserIds: string[]) =>
    apiRequest<{ id: string; name: string; members: { id: string; userId: string; displayName: string }[] }>(
      `/api/business-groups/${encodeURIComponent(id)}/members`,
      { method: 'PATCH', body: JSON.stringify({ memberUserIds }) },
    ),
}

export const categoryRuleApi = {
  list: () => apiRequest<{ items: CategoryAssignmentRule[] }>('/api/category-rules'),
  create: (body: { categoryId: string; targetGroupId: string }) =>
    apiRequest<CategoryAssignmentRule>('/api/category-rules', { method: 'POST', body: JSON.stringify(body) }),
}

export const categoryApi = {
  list: () => apiRequest<{ items: Category[] }>('/api/categories'),
}

export const statsApi = {
  distribution: (dimension: 'company' | 'department', status?: string) =>
    apiRequest<DistributionResult>(`/api/statistics/distribution${buildQuery({ dimension, status })}`),
  dashboard: (params: { companyId?: string; startDate?: string; endDate?: string } = {}) =>
    apiRequest<DashboardData>(`/api/statistics/dashboard${buildQuery(params)}`),
}

export const auditApi = {
  list: (params: { ticketId?: string; eventType?: string; actorId?: string; page?: number; pageSize?: number } = {}) =>
    apiRequest<Paginated<AuditLog>>(`/api/audit-logs${buildQuery(params)}`),
}
