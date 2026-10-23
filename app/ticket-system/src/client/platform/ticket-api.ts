import { apiRequest } from './api-client'
import type {
  AdminUser, AssignmentRule, AuditEvent, BusinessGroup, Category, Company,
  CurrentUser, DashboardStats, Department, DistributionResult, GroupMember,
  LoginResult, SatisfactionRating, SubmitterInfo, Ticket, TicketReply,
} from '../types'

function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  if (!entries.length) return ''
  return '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&')
}

// ── Auth ──
export const getBootstrapStatus = () =>
  apiRequest<{ required: boolean }>('/api/auth/bootstrap-status')

export const bootstrap = (body: { name: string; email: string; password: string }) =>
  apiRequest('/api/auth/bootstrap', { method: 'POST', body: JSON.stringify(body) })

export const login = (body: { email: string; password: string }) =>
  apiRequest<LoginResult>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) })

export const getMe = () => apiRequest<CurrentUser>('/api/auth/me')

export const changePassword = (body: { password: string }) =>
  apiRequest<{ ok: true; passwordChangeRequired: false }>('/api/auth/password', { method: 'POST', body: JSON.stringify(body) })

// ── Companies & Departments ──
export const getCompanies = () => apiRequest<{ companies: Company[] }>('/api/companies')
export const createCompany = (body: { name: string }) =>
  apiRequest<{ company: Company }>('/api/companies', { method: 'POST', body: JSON.stringify(body) })

export const getDepartments = (companyId: string) =>
  apiRequest<{ departments: Department[] }>(`/api/companies/${encodeURIComponent(companyId)}/departments`)
export const createDepartment = (companyId: string, body: { name: string }) =>
  apiRequest<{ department: Department }>(`/api/companies/${encodeURIComponent(companyId)}/departments`, { method: 'POST', body: JSON.stringify(body) })

// ── Categories ──
export const getCategories = (companyId: string) =>
  apiRequest<{ categories: Category[] }>(`/api/companies/${encodeURIComponent(companyId)}/categories`)
export const createCategory = (companyId: string, body: { name: string }) =>
  apiRequest<{ category: Category }>(`/api/companies/${encodeURIComponent(companyId)}/categories`, { method: 'POST', body: JSON.stringify(body) })

// ── Business Groups ──
export const getGroups = (companyId: string) =>
  apiRequest<{ groups: BusinessGroup[] }>(`/api/companies/${encodeURIComponent(companyId)}/groups`)
export const createGroup = (companyId: string, body: { name: string }) =>
  apiRequest<{ group: BusinessGroup }>(`/api/companies/${encodeURIComponent(companyId)}/groups`, { method: 'POST', body: JSON.stringify(body) })

export const getMembers = (groupId: string) =>
  apiRequest<{ members: GroupMember[] }>(`/api/groups/${encodeURIComponent(groupId)}/members`)
export const addMember = (groupId: string, body: { user_id: string }) =>
  apiRequest('/api/groups/' + encodeURIComponent(groupId) + '/members', { method: 'POST', body: JSON.stringify(body) })
export const removeMember = (groupId: string, userId: string) =>
  apiRequest('/api/groups/' + encodeURIComponent(groupId) + '/members/' + encodeURIComponent(userId), { method: 'DELETE' })

// ── Assignment Rules ──
export const getAssignmentRules = (companyId: string) =>
  apiRequest<{ rules: AssignmentRule[] }>(`/api/companies/${encodeURIComponent(companyId)}/assignment-rules`)
export const createAssignmentRule = (companyId: string, body: { category_id: string; target_group_id: string }) =>
  apiRequest('/api/companies/' + encodeURIComponent(companyId) + '/assignment-rules', { method: 'POST', body: JSON.stringify(body) })

// ── Tickets ──
export interface TicketListParams {
  status?: string; priority?: string; category_id?: string; company_id?: string
  search?: string; sort?: string; order?: string; limit?: number; offset?: number
}

export const createTicket = (body: { title: string; description: string; category_id: string | null; priority: string }) =>
  apiRequest<{ ticket: Ticket }>('/api/tickets', { method: 'POST', body: JSON.stringify(body) })

export const getTickets = (params: TicketListParams) =>
  apiRequest<{ tickets: Ticket[]; total: number }>(`/api/tickets${buildQuery(params as Record<string, string | number | undefined | null>)}`)

export const getTicket = (id: string) =>
  apiRequest<{ ticket: Ticket }>(`/api/tickets/${encodeURIComponent(id)}`)

export const getReplies = (id: string) =>
  apiRequest<{ replies: TicketReply[] }>(`/api/tickets/${encodeURIComponent(id)}/replies`)

export const addReply = (id: string, body: { content: string }) =>
  apiRequest<{ reply: TicketReply }>(`/api/tickets/${encodeURIComponent(id)}/replies`, { method: 'POST', body: JSON.stringify(body) })

export const assignTicket = (id: string, body: { group_id?: string; user_id?: string }) =>
  apiRequest<{ ticket: Ticket }>(`/api/tickets/${encodeURIComponent(id)}/assign`, { method: 'POST', body: JSON.stringify(body) })

export const transferTicket = (id: string, body: { target_user_id?: string; target_group_id?: string }) =>
  apiRequest<{ ticket: Ticket }>(`/api/tickets/${encodeURIComponent(id)}/transfer`, { method: 'POST', body: JSON.stringify(body) })

export const completeTicket = (id: string) =>
  apiRequest<{ ticket: Ticket }>(`/api/tickets/${encodeURIComponent(id)}/complete`, { method: 'POST', body: JSON.stringify({}) })

export const cancelTicket = (id: string, body: { reason?: string }) =>
  apiRequest<{ ticket: Ticket }>(`/api/tickets/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: JSON.stringify(body) })

export const getSubmitterInfo = (id: string) =>
  apiRequest<SubmitterInfo>(`/api/tickets/${encodeURIComponent(id)}/submitter-info`)

// ── Rating ──
export const getRating = (id: string) =>
  apiRequest<{ rating: SatisfactionRating | null }>(`/api/tickets/${encodeURIComponent(id)}/rating`)

export const submitRating = (id: string, body: { rating: number; comment?: string }) =>
  apiRequest<{ rating: SatisfactionRating }>(`/api/tickets/${encodeURIComponent(id)}/rating`, { method: 'POST', body: JSON.stringify(body) })

// ── Workbench ──
export const getWorkbenchTickets = (params: TicketListParams) =>
  apiRequest<{ tickets: Ticket[]; total: number }>(`/api/workbench/tickets${buildQuery(params as Record<string, string | number | undefined | null>)}`)

// ── Stats ──
export const getDashboard = (params: { company_id?: string; start_date?: string; end_date?: string }) =>
  apiRequest<DashboardStats>(`/api/stats/dashboard${buildQuery(params)}`)

export const getDistribution = (params: { dimension: string; company_id?: string; start_date?: string; end_date?: string }) =>
  apiRequest<DistributionResult>(`/api/stats/distribution${buildQuery(params)}`)

// ── Audit ──
export const getAuditEvents = (id: string) =>
  apiRequest<{ events: AuditEvent[] }>(`/api/audit/tickets/${encodeURIComponent(id)}`)

// ── Admin Users ──
export const getUsers = (params: { search?: string; limit?: number; offset?: number }) =>
  apiRequest<{ users: AdminUser[]; total: number }>(`/api/admin/users${buildQuery(params)}`)

export const createUser = (body: { name: string; email: string; password: string; phone?: string | null }) =>
  apiRequest('/api/admin/users', { method: 'POST', body: JSON.stringify(body) })

export const updateUser = (id: string, body: { name: string; email: string; phone?: string | null }) =>
  apiRequest(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) })

export const setUserStatus = (id: string, body: { enabled: boolean }) =>
  apiRequest(`/api/admin/users/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify(body) })

export const resetUserPassword = (id: string, body: { password: string }) =>
  apiRequest(`/api/admin/users/${encodeURIComponent(id)}/password`, { method: 'POST', body: JSON.stringify(body) })

export const setUserCompany = (id: string, body: { company_id: string | null; department_id?: string | null }) =>
  apiRequest(`/api/admin/users/${encodeURIComponent(id)}/company`, { method: 'PATCH', body: JSON.stringify(body) })
