import { apiJsonRequest, apiRequest } from '../platform/api-client'
import { buildQuery } from './helpers'
import type {
  PageResult,
  Reply,
  SubmitterInfo,
  Ticket,
  TicketListQuery,
  TicketListItem,
  TicketLog,
  TicketNotification,
} from './types'

export function createTicket(input: { title: string; description: string; category: string; priority: string }): Promise<Ticket> {
  return apiJsonRequest('/api/tickets', 'POST', input)
}

export function fetchTickets(query: TicketListQuery): Promise<PageResult<TicketListItem>> {
  return apiRequest(`/api/tickets${buildQuery({
    status: query.status,
    company: query.company,
    category: query.category,
    priority: query.priority,
    q: query.q,
    sort: query.sort,
    order: query.order,
    page: query.page,
    pageSize: query.pageSize,
  })}`)
}

export function fetchTicket(id: string): Promise<Ticket> {
  return apiRequest(`/api/tickets/${encodeURIComponent(id)}`)
}

export function assignTicket(id: string, groupId: string, assigneeId?: string): Promise<Ticket> {
  return apiJsonRequest(`/api/tickets/${encodeURIComponent(id)}/assign`, 'POST', { groupId, assigneeId })
}

export function reassignTicket(id: string, target: { groupId?: string; assigneeId?: string }): Promise<Ticket> {
  return apiJsonRequest(`/api/tickets/${encodeURIComponent(id)}/reassign`, 'POST', target)
}

export function completeTicket(id: string, resolution?: string): Promise<Ticket> {
  return apiJsonRequest(`/api/tickets/${encodeURIComponent(id)}/complete`, 'POST', { resolution })
}

export function cancelTicket(id: string, reason?: string): Promise<Ticket> {
  return apiJsonRequest(`/api/tickets/${encodeURIComponent(id)}/cancel`, 'POST', { reason })
}

export function fetchSubmitterInfo(id: string): Promise<SubmitterInfo> {
  return apiRequest(`/api/tickets/${encodeURIComponent(id)}/submitter`)
}

export function fetchReplies(id: string): Promise<{ items: Reply[] }> {
  return apiRequest(`/api/tickets/${encodeURIComponent(id)}/replies`)
}

export function createReply(id: string, content: string): Promise<Reply> {
  return apiJsonRequest(`/api/tickets/${encodeURIComponent(id)}/replies`, 'POST', { content })
}

export interface RatingResult {
  score: number
  comment: string | null
  ratedAt: string
}

export function submitRating(id: string, score: number, comment?: string): Promise<RatingResult> {
  return apiJsonRequest(`/api/tickets/${encodeURIComponent(id)}/rating`, 'POST', { score, comment })
}

export function fetchLogs(id: string): Promise<{ items: TicketLog[] }> {
  return apiRequest(`/api/tickets/${encodeURIComponent(id)}/logs`)
}

export function fetchNotifications(id: string): Promise<{ items: TicketNotification[] }> {
  return apiRequest(`/api/tickets/${encodeURIComponent(id)}/notifications`)
}
