import { apiRequest } from './api-client'
import type {
  AssignmentRule,
  BootstrapData,
  BusinessGroup,
  CreateTicketInput,
  GroupSummary,
  HistoricalTicket,
  Ticket,
  TicketDetail,
  TicketListItem,
  TicketTransfer,
  TicketEvaluation,
  User,
} from './contracts'

// 前端唯一请求边界 apiRequest 之上的端点封装；页面不直接拼路径或持有响应转换逻辑。

const json = { 'Content-Type': 'application/json' }

function post<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, { method: 'POST', headers: json, body: JSON.stringify(body) })
}

export const api = {
  bootstrap: () => apiRequest<BootstrapData>('/api/bootstrap'),

  createUser: (body: { name: string; email: string; companyId: string; department: string | null }) =>
    post<User>('/api/users', body),

  userTickets: (userId: string) =>
    apiRequest<{ tickets: HistoricalTicket[] }>(`/api/users/${encodeURIComponent(userId)}/tickets`),

  groups: (companyId: string) =>
    apiRequest<{ groups: GroupSummary[] }>(`/api/companies/${encodeURIComponent(companyId)}/groups`),

  createGroup: (companyId: string, name: string) =>
    post<BusinessGroup>(`/api/companies/${encodeURIComponent(companyId)}/groups`, { name }),

  setGroupMembers: (groupId: string, userIds: string[]) =>
    post<{ id: string; memberIds: string[] }>(`/api/groups/${encodeURIComponent(groupId)}/members`, { userIds }),

  assignmentRules: (companyId: string) =>
    apiRequest<{ rules: AssignmentRule[] }>(`/api/companies/${encodeURIComponent(companyId)}/assignment-rules`),

  createAssignmentRule: (companyId: string, category: string, groupId: string) =>
    post<AssignmentRule>(`/api/companies/${encodeURIComponent(companyId)}/assignment-rules`, { category, groupId }),

  tickets: (params: { companyId?: string; status?: string; category?: string; submitterId?: string; groupId?: string; keyword?: string }) => {
    const query = new URLSearchParams()
    if (params.companyId) query.set('companyId', params.companyId)
    if (params.status) query.set('status', params.status)
    if (params.category) query.set('category', params.category)
    if (params.submitterId) query.set('submitterId', params.submitterId)
    if (params.groupId) query.set('groupId', params.groupId)
    if (params.keyword) query.set('keyword', params.keyword)
    const suffix = query.toString() ? `?${query.toString()}` : ''
    return apiRequest<{ tickets: TicketListItem[] }>(`/api/tickets${suffix}`)
  },

  createTicket: (input: CreateTicketInput) => post<Ticket>('/api/tickets', input),

  ticketDetail: (ticketId: string) =>
    apiRequest<TicketDetail>(`/api/tickets/${encodeURIComponent(ticketId)}`),

  createReply: (ticketId: string, operatorId: string, content: string) =>
    post<{ id: string; ticketId: string; authorId: string; content: string; createdAt: string }>(
      `/api/tickets/${encodeURIComponent(ticketId)}/replies`,
      { operatorId, content },
    ),

  assignTicket: (ticketId: string, operatorId: string, groupId: string) =>
    post<Ticket>(`/api/tickets/${encodeURIComponent(ticketId)}/assign`, { operatorId, groupId }),

  transferTicket: (ticketId: string, body: { operatorId: string; toGroupId?: string; toUserId?: string; note?: string | null }) =>
    post<{ ticket: Ticket; transfer: TicketTransfer }>(`/api/tickets/${encodeURIComponent(ticketId)}/transfer`, body),

  completeTicket: (ticketId: string, operatorId: string) =>
    post<Ticket>(`/api/tickets/${encodeURIComponent(ticketId)}/complete`, { operatorId }),

  cancelTicket: (ticketId: string, operatorId: string, note: string | null) =>
    post<Ticket>(`/api/tickets/${encodeURIComponent(ticketId)}/cancel`, { operatorId, note }),

  submitEvaluation: (ticketId: string, operatorId: string, rating: number, comment: string | null) =>
    apiRequest<TicketEvaluation>(`/api/tickets/${encodeURIComponent(ticketId)}/evaluation`, {
      method: 'PUT',
      headers: json,
      body: JSON.stringify({ operatorId, rating, comment }),
    }),
}
