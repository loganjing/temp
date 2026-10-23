// 工单系统 API 封装 — 每个函数对齐 technical-contract.md 中的接口定义
import { apiRequest } from './platform/api-client'
import type {
  AssignmentRule,
  AuditLog,
  BusinessGroup,
  CurrentUser,
  Dashboard,
  DistributionEntry,
  PaginatedResult,
  SubmitterInfo,
  Ticket,
  TicketCategory,
  TicketDetail,
  TicketEvaluation,
  TicketListParams,
  TicketPriority,
  TicketReply,
  WorkbenchParams,
} from './types'

/** 构建查询字符串，过滤 undefined / null / 空字符串 */
function qs(params: Record<string, string | number | undefined | null>): string {
  const entries = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
  return entries.join('&')
}

// ─── 认证 ──────────────────────────────────────────────

export const auth = {
  me: () => apiRequest<CurrentUser>('/api/auth/me'),
  login: (email: string, password: string) =>
    apiRequest<{ token: string; user: CurrentUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => apiRequest('/api/auth/logout', { method: 'POST' }),
  bootstrapStatus: () => apiRequest<{ required: boolean }>('/api/auth/bootstrap-status'),
  bootstrap: (body: { name: string; email: string; password: string }) =>
    apiRequest('/api/auth/bootstrap', { method: 'POST', body: JSON.stringify(body) }),
  changePassword: (password: string) =>
    apiRequest('/api/auth/password', { method: 'POST', body: JSON.stringify({ password }) }),
}

// ─── 工单管理 ──────────────────────────────────────────

export const ticketsApi = {
  list: (params: TicketListParams = {}) =>
    apiRequest<PaginatedResult<Ticket>>(`/api/tickets?${qs(params)}`),
  get: (id: string) =>
    apiRequest<TicketDetail>(`/api/tickets/${encodeURIComponent(id)}`),
  create: (body: { subject: string; description: string; categoryId: string; priority: TicketPriority }) =>
    apiRequest<Ticket>('/api/tickets', { method: 'POST', body: JSON.stringify(body) }),
  cancel: (id: string) =>
    apiRequest<Ticket>(`/api/tickets/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'cancelled' }),
    }),
  addReply: (id: string, content: string) =>
    apiRequest<TicketReply>(`/api/tickets/${encodeURIComponent(id)}/replies`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  complete: (id: string) =>
    apiRequest<Ticket>(`/api/tickets/${encodeURIComponent(id)}/complete`, { method: 'POST' }),
  transfer: (id: string, toUserId: string) =>
    apiRequest<Ticket>(`/api/tickets/${encodeURIComponent(id)}/transfer`, {
      method: 'POST',
      body: JSON.stringify({ toUserId }),
    }),
  getSubmitter: (id: string) =>
    apiRequest<SubmitterInfo>(`/api/tickets/${encodeURIComponent(id)}/submitter`),
  getEvaluation: (id: string) =>
    apiRequest<TicketEvaluation>(`/api/tickets/${encodeURIComponent(id)}/evaluation`),
  createEvaluation: (id: string, body: { rating: number; comment: string | null }) =>
    apiRequest<TicketEvaluation>(`/api/tickets/${encodeURIComponent(id)}/evaluation`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
}

// ─── 工单工作台 ────────────────────────────────────────

export const workbenchApi = {
  list: (params: WorkbenchParams = {}) =>
    apiRequest<PaginatedResult<Ticket>>(`/api/workbench/tickets?${qs(params)}`),
}

// ─── 业务组 / 分类 / 分配规则 ──────────────────────────

export const businessGroupsApi = {
  list: () => apiRequest<BusinessGroup[]>('/api/business-groups'),
  create: (name: string) =>
    apiRequest<BusinessGroup>('/api/business-groups', { method: 'POST', body: JSON.stringify({ name }) }),
  addMember: (id: string, userId: string) =>
    apiRequest<{ id: string; groupId: string; userId: string }>(
      `/api/business-groups/${encodeURIComponent(id)}/members`,
      { method: 'POST', body: JSON.stringify({ userId }) },
    ),
  removeMember: (id: string, userId: string) =>
    apiRequest(`/api/business-groups/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    }),
}

export const categoriesApi = {
  list: () => apiRequest<TicketCategory[]>('/api/ticket-categories'),
  create: (name: string) =>
    apiRequest<TicketCategory>('/api/ticket-categories', { method: 'POST', body: JSON.stringify({ name }) }),
}

export const assignmentRulesApi = {
  list: () => apiRequest<AssignmentRule[]>('/api/assignment-rules'),
  create: (body: { categoryId: string; groupId: string }) =>
    apiRequest<AssignmentRule>('/api/assignment-rules', { method: 'POST', body: JSON.stringify(body) }),
}

// ─── 统计分析 ──────────────────────────────────────────

export const statisticsApi = {
  distribution: (params: { dimension: 'company' | 'department'; companyId?: string }) =>
    apiRequest<DistributionEntry[]>(`/api/statistics/distribution?${qs(params)}`),
  dashboard: () => apiRequest<Dashboard>('/api/statistics/dashboard'),
}

// ─── 操作日志 ──────────────────────────────────────────

export const auditLogsApi = {
  list: (params: { ticketId?: string; action?: string; page?: number; pageSize?: number } = {}) =>
    apiRequest<PaginatedResult<AuditLog>>(`/api/audit-logs?${qs(params)}`),
}
