// /api 契约接口的客户端封装。统一经 platform/api-client 走浏览器请求边界。
import { apiRequest } from './platform/api-client'
import type {
  Category,
  CompleteResponse,
  DashboardResponse,
  DistributionResponse,
  Group,
  LoginResponse,
  MeResponse,
  OrgProfile,
  Priority,
  RatingResponse,
  Reply,
  Rule,
  StatsDimension,
  SubmitterHistoryResponse,
  TicketDetail,
  TicketListResponse,
  TicketLogsResponse,
  TicketSort,
  TicketStatus,
  TicketSummary,
  UserDirectoryEntry,
} from './contracts'

// --- 身份与账户（脚手架接口 + 契约第 2 节 /api/auth/me） ---

export const apiBootstrapStatus = () => apiRequest<{ required: boolean }>('/api/auth/bootstrap-status')

export const apiBootstrapAccount = (body: { name: string; email: string; password: string }) =>
  apiRequest<{ ok: true }>('/api/auth/bootstrap', { method: 'POST', body: JSON.stringify(body) })

export const apiLogin = (username: string, password: string) =>
  apiRequest<LoginResponse>('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })

export const apiLogout = () => apiRequest<void>('/api/auth/logout', { method: 'POST' })

export const apiChangePassword = (password: string) =>
  apiRequest<{ ok: true; passwordChangeRequired: false }>('/api/auth/password', {
    method: 'POST',
    body: JSON.stringify({ password }),
  })

export const apiMe = () => apiRequest<MeResponse>('/api/auth/me')

// --- 工单（契约第 3 节） ---

export type TicketListQuery = {
  status?: TicketStatus
  companyId?: number
  q?: string
  sort?: TicketSort
}

export function apiListTickets(query: TicketListQuery) {
  const params = new URLSearchParams()
  if (query.status) params.set('status', query.status)
  if (query.companyId != null) params.set('companyId', String(query.companyId))
  if (query.q) params.set('q', query.q)
  if (query.sort) params.set('sort', query.sort)
  const suffix = params.toString()
  return apiRequest<TicketListResponse>(suffix ? `/api/tickets?${suffix}` : '/api/tickets')
}

export const apiGetTicket = (id: number) => apiRequest<TicketDetail>(`/api/tickets/${id}`)

export const apiSubmitterHistory = (id: number) =>
  apiRequest<SubmitterHistoryResponse>(`/api/tickets/${id}/submitter-history`)

export const apiCreateTicket = (body: { subject: string; description: string; categoryId: number; priority: Priority }) =>
  apiRequest<TicketDetail>('/api/tickets', { method: 'POST', body: JSON.stringify(body) })

export const apiAddReply = (id: number, content: string) =>
  apiRequest<Reply>(`/api/tickets/${id}/replies`, { method: 'POST', body: JSON.stringify({ content }) })

export const apiAssignTicket = (id: number, groupId: number) =>
  apiRequest<TicketSummary>(`/api/tickets/${id}/assign`, { method: 'POST', body: JSON.stringify({ groupId }) })

export const apiTransferTicket = (id: number, targetGroupId: number) =>
  apiRequest<TicketSummary>(`/api/tickets/${id}/transfer`, {
    method: 'POST',
    body: JSON.stringify({ targetGroupId }),
  })

export const apiCompleteTicket = (id: number) =>
  apiRequest<CompleteResponse>(`/api/tickets/${id}/complete`, { method: 'POST' })

export const apiCancelTicket = (id: number) =>
  apiRequest<TicketSummary>(`/api/tickets/${id}/cancel`, { method: 'POST' })

export const apiRateTicket = (id: number, score: number) =>
  apiRequest<RatingResponse>(`/api/tickets/${id}/rating`, { method: 'POST', body: JSON.stringify({ score }) })

export const apiTicketLogs = (id: number) => apiRequest<TicketLogsResponse>(`/api/tickets/${id}/logs`)

// --- 组织与配置（契约第 4 节） ---

export const apiListCategories = () => apiRequest<Category[]>('/api/categories')

export const apiCreateGroup = (companyId: number, name: string) =>
  apiRequest<Group>('/api/groups', { method: 'POST', body: JSON.stringify({ companyId, name }) })

export const apiListGroups = (companyId: number) =>
  apiRequest<Group[]>(`/api/groups?companyId=${companyId}`)

export const apiSetGroupMembers = (groupId: number, userIds: string[]) =>
  apiRequest<Group>(`/api/groups/${groupId}/members`, { method: 'PUT', body: JSON.stringify({ userIds }) })

export const apiCreateRule = (companyId: number, categoryId: number, groupId: number) =>
  apiRequest<Rule>('/api/assignment-rules', {
    method: 'POST',
    body: JSON.stringify({ companyId, categoryId, groupId }),
  })

export const apiListRules = (companyId: number) =>
  apiRequest<Rule[]>(`/api/assignment-rules?companyId=${companyId}`)

export const apiSetUserOrg = (
  userId: string,
  body: { companyId: number; department: string; isCompanyAdmin?: boolean },
) =>
  apiRequest<OrgProfile>(`/api/users/${encodeURIComponent(userId)}/org`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })

export const apiListUsers = (companyId: number) =>
  apiRequest<UserDirectoryEntry[]>(`/api/users?companyId=${companyId}`)

// --- 统计（契约第 5 节） ---

export function apiDistribution(dimension: StatsDimension, companyId?: number) {
  const params = new URLSearchParams({ dimension })
  if (companyId != null) params.set('companyId', String(companyId))
  return apiRequest<DistributionResponse>(`/api/stats/distribution?${params.toString()}`)
}

export function apiDashboard(companyId?: number) {
  const suffix = companyId != null ? `?companyId=${companyId}` : ''
  return apiRequest<DashboardResponse>(`/api/stats/dashboard${suffix}`)
}
