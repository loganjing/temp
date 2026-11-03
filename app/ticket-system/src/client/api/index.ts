import { apiRequest } from '../platform/api-client'
import type {
  AssignmentRule,
  BusinessGroup,
  Category,
  CurrentUser,
  DistributionItem,
  LogListResponse,
  StatisticsDashboard,
  TicketCreateResponse,
  TicketDetail,
  TicketListParams,
  TicketListResponse,
  TicketReply,
  TicketSatisfaction,
  UserHistoryResponse,
} from '../types'

function buildQuery(base: string, params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') sp.set(key, String(value))
  }
  const qs = sp.toString()
  return qs ? `${base}?${qs}` : base
}

/**
 * 将平台 /api/auth/me 扁平响应映射为前端 CurrentUser。
 * 平台 auth.ts responseTransform 返回：{ id, name, email, phone, companyId, roles, passwordChangeRequired }
 */
export function normalizeCurrentUser(raw: Record<string, unknown>): CurrentUser {
  const roles = Array.isArray(raw.roles) ? raw.roles.map(String) : []
  const role: CurrentUser['role'] = roles.includes('admin')
    ? 'admin'
    : roles.includes('handler')
      ? 'handler'
      : 'submitter'
  return {
    id: String(raw.id ?? ''),
    displayName: String(raw.name ?? raw.displayName ?? ''),
    email: String(raw.email ?? ''),
    role,
    companyId: raw.companyId != null ? String(raw.companyId) : null,
    companyName: String(raw.companyName ?? ''),
    departmentId: raw.departmentId != null ? String(raw.departmentId) : null,
    departmentName: (raw.departmentName as string) ?? null,
    passwordChangeRequired: raw.passwordChangeRequired as boolean | undefined,
  }
}

export const authApi = {
  me: async (): Promise<CurrentUser> => normalizeCurrentUser(await apiRequest<Record<string, unknown>>('/api/auth/me')),
  logout: () => apiRequest<void>('/api/auth/logout', { method: 'POST' }),
}

export const ticketApi = {
  list: (params: TicketListParams = {}) =>
    apiRequest<TicketListResponse>(buildQuery('/api/tickets', { ...params })),
  workbench: (params: TicketListParams = {}) =>
    apiRequest<TicketListResponse>(buildQuery('/api/workbench/tickets', { ...params })),
  get: (id: string) => apiRequest<TicketDetail>(`/api/tickets/${id}`),
  create: (body: { title: string; description: string; categoryId: string; slaPriority: string }) =>
    apiRequest<TicketCreateResponse>('/api/tickets', { method: 'POST', body: JSON.stringify(body) }),
  reply: (id: string, content: string) =>
    apiRequest<TicketReply>(`/api/tickets/${id}/replies`, { method: 'POST', body: JSON.stringify({ content }) }),
  transfer: (id: string, body: { toBusinessGroupId: string; reason?: string }) =>
    apiRequest<TicketDetail>(`/api/tickets/${id}/transfer`, { method: 'POST', body: JSON.stringify(body) }),
  complete: (id: string, summary?: string) =>
    apiRequest<TicketDetail>(`/api/tickets/${id}/complete`, { method: 'POST', body: JSON.stringify({ summary }) }),
  cancel: (id: string, reason?: string) =>
    apiRequest<TicketDetail>(`/api/tickets/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
  rate: (id: string, body: { rating: number; comment?: string }) =>
    apiRequest<TicketSatisfaction>(`/api/tickets/${id}/satisfaction`, { method: 'POST', body: JSON.stringify(body) }),
}

export const userApi = {
  get: (userId: string) => apiRequest<TicketDetail['submitter']>(`/api/users/${userId}`),
  history: (userId: string, page = 1, pageSize = 20) =>
    apiRequest<UserHistoryResponse>(buildQuery(`/api/users/${userId}/tickets`, { page, pageSize })),
}

export const businessGroupApi = {
  list: (companyId?: string) =>
    apiRequest<{ items: BusinessGroup[] }>(buildQuery('/api/business-groups', { companyId })),
  create: (body: { name: string; companyId?: string }) =>
    apiRequest<BusinessGroup>('/api/business-groups', { method: 'POST', body: JSON.stringify(body) }),
  addMember: (groupId: string, userId: string) =>
    apiRequest<{ id: string; businessGroupId: string; userId: string }>(
      `/api/business-groups/${groupId}/members`,
      { method: 'POST', body: JSON.stringify({ userId }) },
    ),
  removeMember: (groupId: string, userId: string) =>
    apiRequest<void>(`/api/business-groups/${groupId}/members/${userId}`, { method: 'DELETE' }),
}

export const categoryApi = {
  list: () => apiRequest<{ items: Category[] }>('/api/categories'),
  create: (name: string) =>
    apiRequest<Category>('/api/categories', { method: 'POST', body: JSON.stringify({ name }) }),
}

export const assignmentRuleApi = {
  list: () => apiRequest<{ items: AssignmentRule[] }>('/api/assignment-rules'),
  create: (body: { categoryId: string; businessGroupId: string }) =>
    apiRequest<AssignmentRule>('/api/assignment-rules', { method: 'POST', body: JSON.stringify(body) }),
}

export const statisticsApi = {
  distribution: (dimension: 'company' | 'department', companyId?: string) =>
    apiRequest<{ items: DistributionItem[] }>(
      buildQuery('/api/statistics/distribution', { dimension, companyId }),
    ),
  dashboard: (params: { companyId?: string; startDate?: string; endDate?: string }) =>
    apiRequest<StatisticsDashboard>(buildQuery('/api/statistics/dashboard', params)),
}

export const logApi = {
  list: (params: {
    ticketId?: string
    action?: string
    startDate?: string
    endDate?: string
    page?: number
    pageSize?: number
  }) => apiRequest<LogListResponse>(buildQuery('/api/logs', params)),
}
