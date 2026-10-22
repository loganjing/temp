import { apiFetch } from './client'
import type {
  Session, Ticket, TicketDetail, TicketListResponse, TicketQueryParams,
  Reply, BusinessGroup, AssignmentRule, StatsDistribution, StatsDashboard,
  Notification, UserProfile,
} from './types'

// Session
export const getSession = () => apiFetch<Session>('/api/session')
export const switchSession = (userId: string) =>
  apiFetch<Session>('/api/session', { method: 'POST', body: JSON.stringify({ userId }) })

// Tickets
export const createTicket = (data: { subject: string; description: string; category: string; priority: string; companyId?: string }) =>
  apiFetch<{ ticket: Ticket }>('/api/tickets', { method: 'POST', body: JSON.stringify(data) })

export const listTickets = (params: TicketQueryParams) => {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') q.append(k, String(v))
  })
  return apiFetch<TicketListResponse>(`/api/tickets?${q.toString()}`)
}

export const getTicket = (id: string) =>
  apiFetch<TicketDetail>(`/api/tickets/${encodeURIComponent(id)}`)

export const addReply = (id: string, content: string) =>
  apiFetch<{ reply: Reply }>(`/api/tickets/${encodeURIComponent(id)}/replies`, { method: 'POST', body: JSON.stringify({ content }) })

export const transferTicket = (id: string, data: { groupId?: string; assigneeId?: string; note?: string }) =>
  apiFetch<{ ticket: Ticket; transfer: import('./types').Transfer }>(`/api/tickets/${encodeURIComponent(id)}/transfer`, { method: 'POST', body: JSON.stringify(data) })

export const completeTicket = (id: string, resolution?: string) =>
  apiFetch<{ ticket: Ticket; notification: import('./types').Notification }>(`/api/tickets/${encodeURIComponent(id)}/complete`, { method: 'POST', body: JSON.stringify({ resolution }) })

export const cancelTicket = (id: string, reason?: string) =>
  apiFetch<{ ticket: Ticket }>(`/api/tickets/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) })

export const submitRating = (id: string, score: number) =>
  apiFetch<{ rating: import('./types').TicketRating }>(`/api/tickets/${encodeURIComponent(id)}/rating`, { method: 'POST', body: JSON.stringify({ score }) })

export const getTicketLogs = (id: string) =>
  apiFetch<{ items: import('./types').LogEntry[] }>(`/api/tickets/${encodeURIComponent(id)}/logs`)

// User profile
export const getUserProfile = (id: string) =>
  apiFetch<UserProfile>(`/api/users/${encodeURIComponent(id)}/profile`)

// Business groups
export const listBusinessGroups = (companyId?: string) => {
  const q = companyId ? `?companyId=${encodeURIComponent(companyId)}` : ''
  return apiFetch<{ items: BusinessGroup[] }>(`/api/business-groups${q}`)
}

export const createBusinessGroup = (name: string, companyId?: string) =>
  apiFetch<{ group: BusinessGroup }>('/api/business-groups', { method: 'POST', body: JSON.stringify({ name, companyId }) })

export const setGroupMembers = (id: string, memberIds: string[]) =>
  apiFetch<{ group: BusinessGroup }>(`/api/business-groups/${encodeURIComponent(id)}/members`, { method: 'PUT', body: JSON.stringify({ memberIds }) })

// Assignment rules
export const listAssignmentRules = () =>
  apiFetch<{ items: AssignmentRule[] }>('/api/assignment-rules')

export const createAssignmentRule = (data: { category: string; groupId: string; enabled: boolean }) =>
  apiFetch<{ rule: AssignmentRule }>('/api/assignment-rules', { method: 'POST', body: JSON.stringify(data) })

export const updateAssignmentRule = (id: string, data: { groupId?: string; enabled?: boolean }) =>
  apiFetch<{ rule: AssignmentRule }>(`/api/assignment-rules/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) })

// Stats
export const getDistribution = (dimension: 'company' | 'department') =>
  apiFetch<StatsDistribution>(`/api/stats/distribution?dimension=${dimension}`)

export const getDashboard = (companyId?: string) => {
  const q = companyId ? `?companyId=${encodeURIComponent(companyId)}` : ''
  return apiFetch<StatsDashboard>(`/api/stats/dashboard${q}`)
}

// Notifications
export const listNotifications = (params: { ticketId?: string; status?: string }) => {
  const q = new URLSearchParams()
  if (params.ticketId) q.append('ticketId', params.ticketId)
  if (params.status) q.append('status', params.status)
  return apiFetch<{ items: Notification[] }>(`/api/notifications?${q.toString()}`)
}
