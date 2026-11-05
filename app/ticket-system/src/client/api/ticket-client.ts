import { apiRequest } from '../platform/api-client'
import type {
  AuditEvent,
  BusinessGroup,
  CategoryRule,
  CurrentUser,
  Statistics,
  SubmitterInfo,
  Ticket,
  TicketEvaluation,
  TicketListQuery,
  TicketListResult,
  TicketReply,
  TicketTransfer,
  WorkbenchQuery,
} from './types'

function buildQuery(params: Record<string, unknown>): string {
  const sp = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') sp.set(key, String(value))
  }
  const qs = sp.toString()
  return qs ? `?${qs}` : ''
}

export interface LoginResult {
  token: string
  user: CurrentUser
}

export const authApi = {
  login: (email: string, password: string) =>
    apiRequest<LoginResult>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => apiRequest<CurrentUser>('/api/auth/me'),
  bootstrapStatus: () => apiRequest<{ required: boolean }>('/api/auth/bootstrap-status'),
  bootstrap: (name: string, email: string, password: string) =>
    apiRequest<{ ok: true }>('/api/auth/bootstrap', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),
  changePassword: (password: string) =>
    apiRequest<{ ok: true }>('/api/auth/password', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
}

export const ticketApi = {
  list: (query: TicketListQuery = {}) =>
    apiRequest<TicketListResult>(`/api/tickets${buildQuery(query as Record<string, unknown>)}`),
  create: (body: {
    subject: string
    description: string
    category: string
    slaPriority?: string
  }) => apiRequest<{ ticket: Ticket }>('/api/tickets', { method: 'POST', body: JSON.stringify(body) }),
  get: (id: string) => apiRequest<{ ticket: Ticket; replies: TicketReply[] }>(`/api/tickets/${encodeURIComponent(id)}`),
  updatePriority: (id: string, slaPriority: string) =>
    apiRequest<{ ticket: Ticket }>(`/api/tickets/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ slaPriority }),
    }),
  reply: (id: string, content: string) =>
    apiRequest<{ reply: TicketReply }>(`/api/tickets/${encodeURIComponent(id)}/replies`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  assign: (id: string, businessGroupId: string, assigneeId?: string) =>
    apiRequest<{ ticket: Ticket }>(`/api/tickets/${encodeURIComponent(id)}/assign`, {
      method: 'POST',
      body: JSON.stringify({ businessGroupId, assigneeId }),
    }),
  transfer: (id: string, body: { toGroupId: string; toAssigneeId?: string; reason?: string }) =>
    apiRequest<{ ticket: Ticket; transfer: TicketTransfer }>(`/api/tickets/${encodeURIComponent(id)}/transfer`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  complete: (id: string, resolution?: string) =>
    apiRequest<{ ticket: Ticket }>(`/api/tickets/${encodeURIComponent(id)}/complete`, {
      method: 'POST',
      body: JSON.stringify({ resolution }),
    }),
  cancel: (id: string, reason?: string) =>
    apiRequest<{ ticket: Ticket }>(`/api/tickets/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  evaluate: (id: string, rating: number, comment?: string) =>
    apiRequest<{ evaluation: TicketEvaluation }>(`/api/tickets/${encodeURIComponent(id)}/evaluation`, {
      method: 'POST',
      body: JSON.stringify({ rating, comment }),
    }),
  submitterInfo: (id: string) =>
    apiRequest<SubmitterInfo>(`/api/tickets/${encodeURIComponent(id)}/submitter-info`),
  logs: (id: string) => apiRequest<{ logs: AuditEvent[] }>(`/api/tickets/${encodeURIComponent(id)}/logs`),
}

export const businessGroupApi = {
  list: () => apiRequest<{ groups: BusinessGroup[] }>('/api/business-groups'),
  create: (name: string) =>
    apiRequest<{ group: BusinessGroup }>('/api/business-groups', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  addMember: (groupId: string, userId: string) =>
    apiRequest<{ ok: true }>(`/api/business-groups/${encodeURIComponent(groupId)}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),
  removeMember: (groupId: string, userId: string) =>
    apiRequest<{ ok: true }>(`/api/business-groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    }),
}

export const categoryRuleApi = {
  list: () => apiRequest<{ rules: CategoryRule[] }>('/api/category-rules'),
  create: (category: string, businessGroupId: string) =>
    apiRequest<{ rule: CategoryRule }>('/api/category-rules', {
      method: 'POST',
      body: JSON.stringify({ category, businessGroupId }),
    }),
  remove: (id: string) =>
    apiRequest<{ ok: true }>(`/api/category-rules/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}

export const workbenchApi = {
  list: (query: WorkbenchQuery = {}) => apiRequest<TicketListResult>(`/api/workbench${buildQuery(query as Record<string, unknown>)}`),
}

export const statisticsApi = {
  get: (dimension?: 'company' | 'department') =>
    apiRequest<Statistics>(`/api/statistics${buildQuery({ dimension })}`),
}

export { apiRequest } from '../platform/api-client'
