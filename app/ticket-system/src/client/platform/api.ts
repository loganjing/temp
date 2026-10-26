import { apiRequest, ApiRequestError } from '../platform/api-client'
import type { Ticket, TicketDetail, TicketReply, TicketEvaluation, SubmitterInfo, Company, BusinessGroup, CategoryAssignmentRule, UserRole } from '../../shared/types'

export type CurrentUser = {
  id: string
  name: string
  email: string
  role: UserRole
  company: string | null
  department: string | null
  passwordChangeRequired?: boolean
}

// Auth
export const authApi = {
  bootstrapStatus: () => apiRequest<{ required: boolean }>('/api/auth/bootstrap-status'),
  bootstrap: (body: { name: string; email: string; password: string; role?: string; company?: string; department?: string }) =>
    apiRequest('/api/auth/bootstrap', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    apiRequest<{ token: string; user: CurrentUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  me: () => apiRequest<CurrentUser>('/api/auth/me'),
  changePassword: (body: { password: string }) =>
    apiRequest('/api/auth/password', { method: 'POST', body: JSON.stringify(body) }),
}

// Tickets
export const ticketApi = {
  create: (body: { subject: string; description: string; category: string; sla_priority: string }) =>
    apiRequest<Ticket>('/api/tickets', { method: 'POST', body: JSON.stringify(body) }),
  list: (params?: { status?: string; category?: string; page?: number; page_size?: number }) => {
    const qs = new URLSearchParams()
    if (params?.status) qs.set('status', params.status)
    if (params?.category) qs.set('category', params.category)
    if (params?.page) qs.set('page', String(params.page))
    if (params?.page_size) qs.set('page_size', String(params.page_size))
    return apiRequest<{ items: Ticket[]; total: number; page: number; page_size: number }>(`/api/tickets?${qs}`)
  },
  detail: (id: string) => apiRequest<TicketDetail>(`/api/tickets/${encodeURIComponent(id)}`),
  reply: (id: string, content: string) =>
    apiRequest<TicketReply>(`/api/tickets/${encodeURIComponent(id)}/replies`, { method: 'POST', body: JSON.stringify({ content }) }),
  cancel: (id: string) =>
    apiRequest<Ticket>(`/api/tickets/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) }),
  complete: (id: string) =>
    apiRequest<Ticket>(`/api/tickets/${encodeURIComponent(id)}/complete`, { method: 'POST' }),
  transfer: (id: string, body: { to_group_id?: string; to_user_id?: string; reason?: string }) =>
    apiRequest<Ticket>(`/api/tickets/${encodeURIComponent(id)}/transfer`, { method: 'POST', body: JSON.stringify(body) }),
  evaluate: (id: string, body: { rating: number; comment?: string }) =>
    apiRequest<TicketEvaluation>(`/api/tickets/${encodeURIComponent(id)}/evaluation`, { method: 'POST', body: JSON.stringify(body) }),
  submitterInfo: (id: string) =>
    apiRequest<SubmitterInfo>(`/api/tickets/${encodeURIComponent(id)}/submitter-info`),
}

// Companies & Groups
export const companyApi = {
  list: () => apiRequest<{ items: Company[] }>('/api/companies'),
  create: (name: string) =>
    apiRequest<Company>('/api/companies', { method: 'POST', body: JSON.stringify({ name }) }),
  groups: (companyId: string) =>
    apiRequest<{ items: Array<BusinessGroup & { members: { id: string; user_id: string; user_name: string }[] }> }>(`/api/companies/${encodeURIComponent(companyId)}/business-groups`),
  createGroup: (companyId: string, name: string) =>
    apiRequest<BusinessGroup & { members: never[] }>(`/api/companies/${encodeURIComponent(companyId)}/business-groups`, { method: 'POST', body: JSON.stringify({ name }) }),
  addMember: (groupId: string, userId: string) =>
    apiRequest<{ id: string; group_id: string; user_id: string; user_name: string }>(`/api/business-groups/${encodeURIComponent(groupId)}/members`, { method: 'POST', body: JSON.stringify({ user_id: userId }) }),
  rules: (companyId: string) =>
    apiRequest<{ items: CategoryAssignmentRule[] }>(`/api/companies/${encodeURIComponent(companyId)}/assignment-rules`),
  createRule: (body: { company_id: string; category: string; group_id: string }) =>
    apiRequest<CategoryAssignmentRule>('/api/assignment-rules', { method: 'POST', body: JSON.stringify(body) }),
}

// Users (admin)
export const userApi = {
  create: (body: { name: string; email: string; password: string; role: string; company?: string; department?: string }) =>
    apiRequest<{ id: string; name: string; email: string; role: string; company: string | null; department: string | null }>('/api/users', { method: 'POST', body: JSON.stringify(body) }),
  list: (search: string, limit = 50, offset = 0) =>
    apiRequest<{ users: { id: string; name: string; email: string; phone: string | null }[]; total: number }>(`/api/admin/users?search=${encodeURIComponent(search)}&limit=${limit}&offset=${offset}`),
}

export { ApiRequestError }
