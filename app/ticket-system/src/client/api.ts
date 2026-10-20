// 契约端点封装：路径、请求/响应字段与类型均来自 docs/wi-t1000313/technical-contract.md。
// 所有请求都经由 platform/api-client.ts 的唯一边界发出。

import { apiRequest } from './platform/api-client'
import type {
  AdminUser,
  AssignmentRule,
  AuditEvent,
  BusinessGroup,
  Company,
  CurrentUser,
  DashboardResponse,
  DistributionResponse,
  GroupMember,
  Paged,
  RatingResult,
  Reply,
  SubmitterView,
  TicketCreateBody,
  TicketDetail,
  TicketListQuery,
  TicketSummary,
} from './contracts'

type QueryParams = Record<string, string | number | undefined>

function withQuery(base: string, params: QueryParams): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value))
  }
  const query = search.toString()
  return query ? `${base}?${query}` : base
}

// —— 认证与当前用户（契约第 4 节；首个账户初始化遵循 starter 生成流程） ——

export function fetchBootstrapStatus(): Promise<{ required: boolean }> {
  return apiRequest<{ required: boolean }>('/api/auth/bootstrap-status')
}

export function bootstrapFirstAccount(body: { name: string; email: string; password: string }): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>('/api/auth/bootstrap', { method: 'POST', body: JSON.stringify(body) })
}

export function login(body: { email: string; password: string }): Promise<{ token: string; user: CurrentUser }> {
  return apiRequest<{ token: string; user: CurrentUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) })
}

export function logout(): Promise<void> {
  return apiRequest<void>('/api/auth/logout', { method: 'POST' })
}

export function fetchCurrentUser(): Promise<CurrentUser> {
  return apiRequest<CurrentUser>('/api/auth/me')
}

// —— 管理端（契约第 5 节，仅 ops） ——

export function listCompanies(): Promise<{ items: Company[] }> {
  return apiRequest<{ items: Company[] }>('/api/admin/companies')
}

export function createCompany(body: { name: string }): Promise<Company> {
  return apiRequest<Company>('/api/admin/companies', { method: 'POST', body: JSON.stringify(body) })
}

export function listUsers(companyId: number): Promise<{ items: AdminUser[] }> {
  return apiRequest<{ items: AdminUser[] }>(withQuery('/api/admin/users', { company_id: companyId }))
}

export function createUser(body: {
  email: string
  password: string
  display_name: string
  company_id: number
  department?: string
  role: 'submitter' | 'handler' | 'ops'
}): Promise<AdminUser> {
  return apiRequest<AdminUser>('/api/admin/users', { method: 'POST', body: JSON.stringify(body) })
}

export function updateUser(
  userId: number,
  body: { display_name?: string; department?: string; role?: 'submitter' | 'handler' | 'ops' },
): Promise<AdminUser> {
  return apiRequest<AdminUser>(`/api/admin/users/${userId}`, { method: 'PATCH', body: JSON.stringify(body) })
}

// —— 业务组与分配规则（契约第 6 节） ——

export function listBusinessGroups(companyId: number): Promise<{ items: BusinessGroup[] }> {
  return apiRequest<{ items: BusinessGroup[] }>(withQuery('/api/business-groups', { company_id: companyId }))
}

export function createBusinessGroup(body: { company_id: number; name: string }): Promise<BusinessGroup> {
  return apiRequest<BusinessGroup>('/api/business-groups', { method: 'POST', body: JSON.stringify(body) })
}

export function renameBusinessGroup(groupId: number, body: { name: string }): Promise<BusinessGroup> {
  return apiRequest<BusinessGroup>(`/api/business-groups/${groupId}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export function deleteBusinessGroup(groupId: number): Promise<void> {
  return apiRequest<void>(`/api/business-groups/${groupId}`, { method: 'DELETE' })
}

export function addGroupMember(groupId: number, body: { user_id: string }): Promise<GroupMember> {
  return apiRequest<GroupMember>(`/api/business-groups/${groupId}/members`, { method: 'POST', body: JSON.stringify(body) })
}

export function removeGroupMember(groupId: number, userId: number): Promise<void> {
  return apiRequest<void>(`/api/business-groups/${groupId}/members/${userId}`, { method: 'DELETE' })
}

export function listAssignmentRules(companyId: number): Promise<{ items: AssignmentRule[] }> {
  return apiRequest<{ items: AssignmentRule[] }>(withQuery('/api/assignment-rules', { company_id: companyId }))
}

export function upsertAssignmentRule(body: {
  company_id: number
  category: string
  group_id: number
}): Promise<AssignmentRule> {
  return apiRequest<AssignmentRule>('/api/assignment-rules', { method: 'PUT', body: JSON.stringify(body) })
}

export function deleteAssignmentRule(ruleId: number): Promise<void> {
  return apiRequest<void>(`/api/assignment-rules/${ruleId}`, { method: 'DELETE' })
}

// —— 工单（契约第 7 节） ——

export function listTickets(query: TicketListQuery): Promise<Paged<TicketSummary>> {
  return apiRequest<Paged<TicketSummary>>(
    withQuery('/api/tickets', {
      scope: query.scope,
      status: query.status && query.status.length > 0 ? query.status.join(',') : undefined,
      category: query.category,
      priority: query.priority,
      company_id: query.company_id,
      q: query.q,
      sort: query.sort,
      order: query.order,
      page: query.page,
      page_size: query.page_size,
    }),
  )
}

export function fetchTicket(ticketId: number): Promise<TicketDetail> {
  return apiRequest<TicketDetail>(`/api/tickets/${ticketId}`)
}

export function createTicket(body: TicketCreateBody): Promise<TicketDetail> {
  return apiRequest<TicketDetail>('/api/tickets', { method: 'POST', body: JSON.stringify(body) })
}

export function replyTicket(ticketId: number, body: { content: string }): Promise<Reply> {
  return apiRequest<Reply>(`/api/tickets/${ticketId}/replies`, { method: 'POST', body: JSON.stringify(body) })
}

export function assignTicket(ticketId: number, body: { group_id: number; handler_id?: number }): Promise<TicketDetail> {
  return apiRequest<TicketDetail>(`/api/tickets/${ticketId}/assign`, { method: 'POST', body: JSON.stringify(body) })
}

export function transferTicket(
  ticketId: number,
  body: { to_group_id: number; to_handler_id?: number; reason?: string },
): Promise<TicketDetail> {
  return apiRequest<TicketDetail>(`/api/tickets/${ticketId}/transfer`, { method: 'POST', body: JSON.stringify(body) })
}

export function completeTicket(ticketId: number, body: { resolution?: string }): Promise<TicketDetail> {
  return apiRequest<TicketDetail>(`/api/tickets/${ticketId}/complete`, { method: 'POST', body: JSON.stringify(body) })
}

export function cancelTicket(ticketId: number, body: { reason?: string }): Promise<TicketDetail> {
  return apiRequest<TicketDetail>(`/api/tickets/${ticketId}/cancel`, { method: 'POST', body: JSON.stringify(body) })
}

export function rateTicket(ticketId: number, body: { score: number; comment?: string }): Promise<RatingResult> {
  return apiRequest<RatingResult>(`/api/tickets/${ticketId}/rating`, { method: 'POST', body: JSON.stringify(body) })
}

export function fetchSubmitterView(ticketId: number): Promise<SubmitterView> {
  return apiRequest<SubmitterView>(`/api/tickets/${ticketId}/submitter`)
}

// —— 统计分析（契约第 8 节） ——

export function fetchDistribution(dimension: 'company' | 'department', companyId?: number): Promise<DistributionResponse> {
  return apiRequest<DistributionResponse>(withQuery('/api/statistics/distribution', { dimension, company_id: companyId }))
}

export function fetchDashboard(companyId?: number): Promise<DashboardResponse> {
  return apiRequest<DashboardResponse>(withQuery('/api/statistics/dashboard', { company_id: companyId }))
}

// —— 审计日志（契约第 9.1 节） ——

export function listAuditEvents(query: {
  ticket_id?: number
  company_id?: number
  action?: string
  page?: number
  page_size?: number
}): Promise<Paged<AuditEvent>> {
  return apiRequest<Paged<AuditEvent>>(
    withQuery('/api/audit-events', {
      ticket_id: query.ticket_id,
      company_id: query.company_id,
      action: query.action,
      page: query.page,
      page_size: query.page_size,
    }),
  )
}
