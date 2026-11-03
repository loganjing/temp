/** 工单系统 API 客户端，封装 technical-contract.md 定义的全部端点 */
import { apiRequest } from './api-client'
import type {
  Ticket, TicketDetail, TicketListResponse, LoginResponse, CurrentUser,
  SubmitterProfile, BusinessGroup, BusinessGroupMember, AssignmentRule,
  StatisticsOverview, StatisticsDistribution, Evaluation, Reply, TicketLog,
  Priority, SortField, SortOrder, StatisticsDimension, TicketStatus,
} from '../types'

// ── 认证 ──

export const authApi = {
  login: (username: string, password: string) =>
    apiRequest<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () =>
    apiRequest<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  me: () =>
    apiRequest<CurrentUser>('/api/auth/me'),
}

// ── 工单管理 ──

export interface TicketListParams {
  status?: TicketStatus
  category?: string
  companyId?: string
  keyword?: string
  sort?: SortField
  order?: SortOrder
  page?: number
  pageSize?: number
}

export const ticketApi = {
  list: (params: TicketListParams = {}) => {
    const q = new URLSearchParams()
    if (params.status) q.set('status', params.status)
    if (params.category) q.set('category', params.category)
    if (params.companyId) q.set('companyId', params.companyId)
    if (params.keyword) q.set('keyword', params.keyword)
    if (params.sort) q.set('sort', params.sort)
    if (params.order) q.set('order', params.order)
    if (params.page != null) q.set('page', String(params.page))
    if (params.pageSize != null) q.set('pageSize', String(params.pageSize))
    return apiRequest<TicketListResponse>(`/api/tickets?${q.toString()}`)
  },
  create: (data: { subject: string; description: string; category: string; priority: Priority }) =>
    apiRequest<Ticket>('/api/tickets', { method: 'POST', body: JSON.stringify(data) }),
  get: (id: string) =>
    apiRequest<TicketDetail>(`/api/tickets/${encodeURIComponent(id)}`),
  updateStatus: (id: string, status: TicketStatus) =>
    apiRequest<Ticket>(`/api/tickets/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  reply: (id: string, content: string) =>
    apiRequest<Reply>(`/api/tickets/${encodeURIComponent(id)}/replies`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  transfer: (id: string, targetGroupId: string) =>
    apiRequest<Ticket>(`/api/tickets/${encodeURIComponent(id)}/transfer`, {
      method: 'POST',
      body: JSON.stringify({ targetGroupId }),
    }),
  complete: (id: string, summary?: string) =>
    apiRequest<Ticket>(`/api/tickets/${encodeURIComponent(id)}/complete`, {
      method: 'POST',
      body: JSON.stringify({ summary }),
    }),
  getEvaluation: (id: string) =>
    apiRequest<Evaluation>(`/api/tickets/${encodeURIComponent(id)}/evaluation`),
  createEvaluation: (id: string, rating: number, comment: string | null) =>
    apiRequest<Evaluation>(`/api/tickets/${encodeURIComponent(id)}/evaluation`, {
      method: 'POST',
      body: JSON.stringify({ rating, comment }),
    }),
  getLogs: (id: string) =>
    apiRequest<{ items: TicketLog[] }>(`/api/tickets/${encodeURIComponent(id)}/logs`),
}

// ── 提交人信息 ──

export const userApi = {
  getProfile: (id: string) =>
    apiRequest<SubmitterProfile>(`/api/users/${encodeURIComponent(id)}/profile`),
}

// ── 业务组管理 ──

export const groupApi = {
  list: (companyId?: string) => {
    const q = companyId ? `?companyId=${encodeURIComponent(companyId)}` : ''
    return apiRequest<{ items: BusinessGroup[] }>(`/api/business-groups${q}`)
  },
  create: (name: string) =>
    apiRequest<BusinessGroup>('/api/business-groups', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  addMember: (groupId: string, userId: string) =>
    apiRequest<BusinessGroupMember>(
      `/api/business-groups/${encodeURIComponent(groupId)}/members`,
      { method: 'POST', body: JSON.stringify({ userId }) },
    ),
  removeMember: (groupId: string, userId: string) =>
    apiRequest<{ ok: boolean }>(
      `/api/business-groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`,
      { method: 'DELETE' },
    ),
}

// ── 分配规则 ──

export const ruleApi = {
  list: () =>
    apiRequest<{ items: AssignmentRule[] }>('/api/assignment-rules'),
  create: (category: string, targetGroupId: string) =>
    apiRequest<AssignmentRule>('/api/assignment-rules', {
      method: 'POST',
      body: JSON.stringify({ category, targetGroupId }),
    }),
  remove: (id: string) =>
    apiRequest<{ ok: boolean }>(`/api/assignment-rules/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
}

// ── 统计分析 ──

export const statsApi = {
  overview: (companyId?: string) => {
    const q = companyId ? `?companyId=${encodeURIComponent(companyId)}` : ''
    return apiRequest<StatisticsOverview>(`/api/statistics/overview${q}`)
  },
  distribution: (dimension: StatisticsDimension, companyId?: string) => {
    const q = new URLSearchParams({ dimension })
    if (companyId) q.set('companyId', companyId)
    return apiRequest<StatisticsDistribution>(`/api/statistics/distribution?${q.toString()}`)
  },
}
