// 按技术契约封装的浏览器 API 调用层；全部端点、参数与响应形状以契约为准。
import { apiRequest } from './platform/api-client'
import {
  buildLogQuery,
  buildTicketQuery,
  type AssignmentRule,
  type AuthUser,
  type CompleteResult,
  type CreateTicketPayload,
  type DashboardStats,
  type DistributionDimension,
  type DistributionStats,
  type Group,
  type LogEntry,
  type LogListQuery,
  type LogListResult,
  type LoginResult,
  type RatingResult,
  type Reply,
  type SubmitterContext,
  type Ticket,
  type TicketDetail,
  type TicketListQuery,
  type TicketListResult,
  type UserBrief,
} from './contract'

function companyParam(companyId: number | undefined): string {
  return companyId === undefined ? '' : `?companyId=${companyId}`
}

export function login(username: string, password: string): Promise<LoginResult> {
  return apiRequest('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })
}

export function logout(): Promise<void> {
  return apiRequest<void>('/api/auth/logout', { method: 'POST' })
}

export function fetchMe(): Promise<AuthUser> {
  return apiRequest('/api/auth/me')
}

export function fetchUsers(companyId?: number): Promise<UserBrief[]> {
  return apiRequest(`/api/users${companyParam(companyId)}`)
}

export function fetchTickets(query: TicketListQuery): Promise<TicketListResult> {
  return apiRequest(`/api/tickets?${buildTicketQuery(query)}`)
}

export function fetchTicketDetail(ticketId: number): Promise<TicketDetail> {
  return apiRequest(`/api/tickets/${ticketId}`)
}

export function createTicket(payload: CreateTicketPayload): Promise<Ticket> {
  return apiRequest('/api/tickets', { method: 'POST', body: JSON.stringify(payload) })
}

export function replyTicket(ticketId: number, content: string): Promise<Reply> {
  return apiRequest(`/api/tickets/${ticketId}/replies`, { method: 'POST', body: JSON.stringify({ content }) })
}

export function cancelTicket(ticketId: number): Promise<Ticket> {
  return apiRequest(`/api/tickets/${ticketId}/cancel`, { method: 'POST' })
}

export function fetchSubmitterContext(ticketId: number): Promise<SubmitterContext> {
  return apiRequest(`/api/tickets/${ticketId}/submitter`)
}

export function assignTicket(ticketId: number, groupId: number): Promise<Ticket> {
  return apiRequest(`/api/tickets/${ticketId}/assign`, { method: 'POST', body: JSON.stringify({ groupId }) })
}

export function claimTicket(ticketId: number): Promise<Ticket> {
  return apiRequest(`/api/tickets/${ticketId}/claim`, { method: 'POST' })
}

export function transferTicket(ticketId: number, targetUserId: number): Promise<Ticket> {
  return apiRequest(`/api/tickets/${ticketId}/transfer`, { method: 'POST', body: JSON.stringify({ targetUserId }) })
}

export function completeTicket(ticketId: number, resolution: string): Promise<CompleteResult> {
  return apiRequest(`/api/tickets/${ticketId}/complete`, { method: 'POST', body: JSON.stringify({ resolution }) })
}

export function rateTicket(ticketId: number, score: number): Promise<RatingResult> {
  return apiRequest(`/api/tickets/${ticketId}/rating`, { method: 'POST', body: JSON.stringify({ score }) })
}

export function fetchGroups(companyId?: number): Promise<Group[]> {
  return apiRequest(`/api/groups${companyParam(companyId)}`)
}

export function createGroup(name: string, memberIds: number[]): Promise<Group> {
  return apiRequest('/api/groups', { method: 'POST', body: JSON.stringify({ name, memberIds }) })
}

export function updateGroup(groupId: number, payload: { name?: string; memberIds?: number[] }): Promise<Group> {
  return apiRequest(`/api/groups/${groupId}`, { method: 'PUT', body: JSON.stringify(payload) })
}

export function deleteGroup(groupId: number): Promise<void> {
  return apiRequest<void>(`/api/groups/${groupId}`, { method: 'DELETE' })
}

export function fetchRules(companyId?: number): Promise<AssignmentRule[]> {
  return apiRequest(`/api/assignment-rules${companyParam(companyId)}`)
}

export function createRule(category: string, targetGroupId: number): Promise<AssignmentRule> {
  return apiRequest('/api/assignment-rules', { method: 'POST', body: JSON.stringify({ category, targetGroupId }) })
}

export function deleteRule(ruleId: number): Promise<void> {
  return apiRequest<void>(`/api/assignment-rules/${ruleId}`, { method: 'DELETE' })
}

export function fetchDashboard(companyId?: number): Promise<DashboardStats> {
  return apiRequest(`/api/stats/dashboard${companyParam(companyId)}`)
}

export function fetchDistribution(dimension: DistributionDimension, companyId?: number): Promise<DistributionStats> {
  return apiRequest(`/api/stats/distribution?dimension=${dimension}${companyId === undefined ? '' : `&companyId=${companyId}`}`)
}

export function fetchTicketLogs(ticketId: number): Promise<LogEntry[]> {
  return apiRequest(`/api/tickets/${ticketId}/logs`)
}

export function fetchLogs(query: LogListQuery): Promise<LogListResult> {
  return apiRequest(`/api/logs?${buildLogQuery(query)}`)
}
