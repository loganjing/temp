import { apiRequest } from '../platform/api-client'
import type {
  AssignmentRule,
  AuditEventRecord,
  BusinessGroup,
  BusinessGroupSummary,
  DistributionResponse,
  MeContext,
  OrgMember,
  OverviewResponse,
  Page,
  Priority,
  Ticket,
  TicketRating,
  TicketReply,
  TicketSummary,
} from '../../shared/contracts'

type QueryValue = string | number | boolean | undefined

function queryString(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue
    search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

export const fetchMeContext = () => apiRequest<MeContext>('/api/me/context')

export type TicketQuery = {
  status?: string
  category?: string
  priority?: string
  groupId?: string
  assigneeMemberId?: string
  companyId?: string
  q?: string
  sort?: string
  page?: number
  pageSize?: number
}

export const listTickets = (query: TicketQuery) =>
  apiRequest<Page<TicketSummary>>(`/api/tickets${queryString({ ...query })}`)

export const getTicket = (id: string) => apiRequest<{ ticket: Ticket }>(`/api/tickets/${encodeURIComponent(id)}`)

export const createTicket = (body: { subject: string; description: string; category: string; priority: Priority }) =>
  apiRequest<{ ticket: Ticket }>('/api/tickets', { method: 'POST', body: JSON.stringify(body) })

export const replyToTicket = (id: string, content: string) =>
  apiRequest<{ reply: TicketReply }>(`/api/tickets/${encodeURIComponent(id)}/replies`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  })

export const assignTicket = (id: string, body: { groupId: string; assigneeMemberId?: string }) =>
  apiRequest<{ ticket: Ticket }>(`/api/tickets/${encodeURIComponent(id)}/assign`, {
    method: 'POST',
    body: JSON.stringify(body),
  })

export const transferTicket = (id: string, body: { toMemberId: string; toGroupId?: string; reason?: string }) =>
  apiRequest<{ ticket: Ticket }>(`/api/tickets/${encodeURIComponent(id)}/transfer`, {
    method: 'POST',
    body: JSON.stringify(body),
  })

export const completeTicket = (id: string, body: { resolution?: string }) =>
  apiRequest<{
    ticket: Ticket
    notification: { id: string; status: string; error: string | null; sentAt: string | null }
  }>(`/api/tickets/${encodeURIComponent(id)}/complete`, { method: 'POST', body: JSON.stringify(body) })

export const cancelTicket = (id: string, body: { reason?: string }) =>
  apiRequest<{ ticket: Ticket }>(`/api/tickets/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    body: JSON.stringify(body),
  })

export const rateTicket = (id: string, body: { score: number; comment?: string }) =>
  apiRequest<{ rating: TicketRating }>(`/api/tickets/${encodeURIComponent(id)}/rating`, {
    method: 'POST',
    body: JSON.stringify(body),
  })

export const listGroups = () => apiRequest<{ items: BusinessGroupSummary[] }>('/api/org/groups')

export const createGroup = (body: { name: string; description?: string }) =>
  apiRequest<{ group: BusinessGroup }>('/api/org/groups', { method: 'POST', body: JSON.stringify(body) })

export const updateGroup = (id: string, body: { name?: string; description?: string }) =>
  apiRequest<{ group: BusinessGroup }>(`/api/org/groups/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })

export const setGroupMembers = (id: string, memberIds: string[]) =>
  apiRequest<{ group: BusinessGroup }>(`/api/org/groups/${encodeURIComponent(id)}/members`, {
    method: 'PUT',
    body: JSON.stringify({ memberIds }),
  })

export const listAssignmentRules = () => apiRequest<{ items: AssignmentRule[] }>('/api/org/assignment-rules')

export const createAssignmentRule = (body: { category: string; groupId: string }) =>
  apiRequest<{ rule: AssignmentRule }>('/api/org/assignment-rules', { method: 'POST', body: JSON.stringify(body) })

export const updateAssignmentRule = (id: string, body: { category?: string; groupId?: string }) =>
  apiRequest<{ rule: AssignmentRule }>(`/api/org/assignment-rules/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })

export const deleteAssignmentRule = (id: string) =>
  apiRequest<{ deleted: boolean }>(`/api/org/assignment-rules/${encodeURIComponent(id)}`, { method: 'DELETE' })

export const listOrgMembers = (query: { activeOnly?: boolean; q?: string } = {}) =>
  apiRequest<{ items: OrgMember[] }>(`/api/org/members${queryString({ ...query })}`)

export type AnalyticsQuery = { from?: string; to?: string; groupId?: string; category?: string }

export const fetchDistribution = (query: { by: 'company' | 'department'; from?: string; to?: string }) =>
  apiRequest<DistributionResponse>(`/api/analytics/distribution${queryString({ ...query })}`)

export const fetchOverview = (query: AnalyticsQuery) =>
  apiRequest<OverviewResponse>(`/api/analytics/overview${queryString({ ...query })}`)

export type AuditQuery = {
  objectType?: string
  objectId?: string
  actorMemberId?: string
  action?: string
  from?: string
  to?: string
  page?: number
  pageSize?: number
}

export const listAuditEvents = (query: AuditQuery) =>
  apiRequest<Page<AuditEventRecord>>(`/api/audit-events${queryString({ ...query })}`)
