// 单一浏览器请求边界与工单系统业务端点集合。
// 请求/响应字段与可空性严格遵循 docs/wi-t1000335/technical-contract.md 第 3、4 节。
import type {
  AuditEntry,
  AuditLogQuery,
  AssignmentRule,
  CurrentUser,
  DashboardResponse,
  DistributionResponse,
  Group,
  NotificationRecord,
  Rating,
  Reply,
  SessionUser,
  SubmitterInfoResponse,
  Ticket,
  TicketDetailResponse,
  TicketListQuery,
  TicketSortField,
  WorkbenchQuery,
} from '../components/contracts'

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
  throw new ApiRequestError(
    typeof detail?.message === 'string' ? detail.message : typeof error === 'string' ? error : `HTTP ${response.status}`,
    response.status,
    typeof detail?.code === 'string' ? detail.code : undefined,
  )
}

const qs = (params: Record<string, string | number | boolean | undefined | null>): string => {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== '' && value !== null)
  if (entries.length === 0) return ''
  return '?' + entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&')
}

// 4.1 identity
export const identityApi = {
  login: (email: string, password: string) =>
    apiRequest<{ token: string; user: SessionUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => apiRequest<SessionUser>('/api/auth/me'),
  bootstrapStatus: () => apiRequest<{ required: boolean }>('/api/auth/bootstrap-status'),
  bootstrap: (body: { name: string; email: string; password: string }) =>
    apiRequest('/api/auth/bootstrap', { method: 'POST', body: JSON.stringify(body) }),
  changePassword: (password: string) =>
    apiRequest<{ ok: true; passwordChangeRequired: false }>('/api/auth/password', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
}

// 4.2 ticket
export const ticketApi = {
  list: (query: TicketListQuery) =>
    apiRequest<{ items: Ticket[] }>(`/api/tickets${qs({
      status: query.status, category: query.category, priority: query.priority,
      companyId: query.companyId, q: query.q, sort: query.sort, order: query.order, mine: query.mine,
    })}`),
  detail: (ticketNo: string) =>
    apiRequest<TicketDetailResponse>(`/api/tickets/${encodeURIComponent(ticketNo)}`),
  create: (body: { subject: string; description: string; category: string; priority: string }) =>
    apiRequest<{ ticket: Ticket }>('/api/tickets', { method: 'POST', body: JSON.stringify(body) }),
  reply: (ticketNo: string, content: string) =>
    apiRequest<{ reply: Reply }>(`/api/tickets/${encodeURIComponent(ticketNo)}/replies`, {
      method: 'POST', body: JSON.stringify({ content }),
    }),
  transfer: (ticketNo: string, toGroupId: number) =>
    apiRequest<{ ticket: Ticket }>(`/api/tickets/${encodeURIComponent(ticketNo)}/transfer`, {
      method: 'POST', body: JSON.stringify({ toGroupId }),
    }),
  complete: (ticketNo: string) =>
    apiRequest<{ ticket: Ticket }>(`/api/tickets/${encodeURIComponent(ticketNo)}/complete`, { method: 'POST' }),
  cancel: (ticketNo: string) =>
    apiRequest<{ ticket: Ticket }>(`/api/tickets/${encodeURIComponent(ticketNo)}/cancel`, { method: 'POST' }),
  rate: (ticketNo: string, score: number, comment?: string) =>
    apiRequest<{ rating: Rating }>(`/api/tickets/${encodeURIComponent(ticketNo)}/rating`, {
      method: 'POST', body: JSON.stringify({ score, comment: comment ?? null }),
    }),
  submitter: (ticketNo: string) =>
    apiRequest<SubmitterInfoResponse>(`/api/tickets/${encodeURIComponent(ticketNo)}/submitter`),
  auditLogs: (ticketNo: string) =>
    apiRequest<{ items: AuditEntry[] }>(`/api/tickets/${encodeURIComponent(ticketNo)}/audit-logs`),
  notifications: (ticketNo: string) =>
    apiRequest<{ items: NotificationRecord[] }>(`/api/tickets/${encodeURIComponent(ticketNo)}/notifications`),
}

// 4.3 workbench
export const workbenchApi = {
  list: (query: WorkbenchQuery) =>
    apiRequest<{ items: Ticket[] }>(`/api/workbench/tickets${qs({
      companyId: query.companyId, category: query.category, priority: query.priority,
      q: query.q, sort: query.sort, order: query.order, group: query.group,
    })}`),
}

// 4.4 assignment
export const assignmentApi = {
  listGroups: () => apiRequest<{ items: Group[] }>('/api/groups'),
  createGroup: (name: string) =>
    apiRequest<{ group: Group }>('/api/groups', { method: 'POST', body: JSON.stringify({ name }) }),
  updateGroup: (id: number, name: string) =>
    apiRequest<{ group: Group }>(`/api/groups/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
  deleteGroup: (id: number) =>
    apiRequest<{ ok: true }>(`/api/groups/${id}`, { method: 'DELETE' }),
  addMember: (groupId: number, userId: number) =>
    apiRequest<{ group: Group }>(`/api/groups/${groupId}/members`, {
      method: 'POST', body: JSON.stringify({ userId }),
    }),
  removeMember: (groupId: number, userId: number) =>
    apiRequest<{ group: Group }>(`/api/groups/${groupId}/members/${userId}`, { method: 'DELETE' }),
  listRules: () => apiRequest<{ items: AssignmentRule[] }>('/api/assignment-rules'),
  createRule: (category: string, groupId: number) =>
    apiRequest<{ rule: AssignmentRule }>('/api/assignment-rules', {
      method: 'POST', body: JSON.stringify({ category, groupId }),
    }),
  updateRule: (id: number, category: string, groupId: number) =>
    apiRequest<{ rule: AssignmentRule }>(`/api/assignment-rules/${id}`, {
      method: 'PUT', body: JSON.stringify({ category, groupId }),
    }),
  deleteRule: (id: number) =>
    apiRequest<{ ok: true }>(`/api/assignment-rules/${id}`, { method: 'DELETE' }),
}

// 4.5 stats
export const statsApi = {
  distribution: (dimension: 'company' | 'department') =>
    apiRequest<DistributionResponse>(`/api/stats/distribution?dimension=${dimension}`),
  dashboard: () => apiRequest<DashboardResponse>('/api/stats/dashboard'),
}

// 4.6 audit
export const auditApi = {
  list: (query: AuditLogQuery) =>
    apiRequest<{ items: AuditEntry[] }>(`/api/audit-logs${qs({
      action: query.action, ticketNo: query.ticketNo, from: query.from, to: query.to,
    })}`),
}

export type { CurrentUser, Ticket, TicketSortField }
