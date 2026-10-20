import { apiRequest } from '../platform/api-client'
import type {
  CreateTicketRequest,
  NotificationEntry,
  Rating,
  RatingRequest,
  Reply,
  Ticket,
  TicketDetailResponse,
  TicketListResponse,
  TicketSort,
  TicketView,
  TransferRequest,
} from '../platform/types'

export interface TicketListParams {
  view?: TicketView
  status?: string[]
  category?: string
  priority?: string
  group?: number
  q?: string
  sort?: TicketSort
  order?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

function buildTicketQuery(params: TicketListParams): string {
  const search = new URLSearchParams()
  if (params.view) search.set('view', params.view)
  if (params.status && params.status.length > 0) search.set('status', params.status.join(','))
  if (params.category) search.set('category', params.category)
  if (params.priority) search.set('priority', params.priority)
  if (params.group) search.set('group', String(params.group))
  if (params.q) search.set('q', params.q)
  if (params.sort) search.set('sort', params.sort)
  if (params.order) search.set('order', params.order)
  if (params.page) search.set('page', String(params.page))
  if (params.pageSize) search.set('pageSize', String(params.pageSize))
  const query = search.toString()
  return query ? `?${query}` : ''
}

export function listTickets(params: TicketListParams): Promise<TicketListResponse> {
  return apiRequest<TicketListResponse>(`/api/tickets${buildTicketQuery(params)}`)
}

export function createTicket(body: CreateTicketRequest): Promise<{ ticket: Ticket }> {
  return apiRequest<{ ticket: Ticket }>('/api/tickets', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function dispatchTicket(id: number): Promise<{ ticket: Ticket }> {
  return apiRequest<{ ticket: Ticket }>(`/api/tickets/${id}/dispatch`, { method: 'POST' })
}

export function fetchTicketDetail(id: number): Promise<TicketDetailResponse> {
  return apiRequest<TicketDetailResponse>(`/api/tickets/${id}`)
}

export function replyTicket(id: number, content: string): Promise<{ reply: Reply }> {
  return apiRequest<{ reply: Reply }>(`/api/tickets/${id}/replies`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  })
}

export function transferTicket(id: number, body: TransferRequest): Promise<{ ticket: Ticket }> {
  return apiRequest<{ ticket: Ticket }>(`/api/tickets/${id}/transfer`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function completeTicket(id: number, resolution: string | null): Promise<{ ticket: Ticket; notification: NotificationEntry }> {
  return apiRequest<{ ticket: Ticket; notification: NotificationEntry }>(`/api/tickets/${id}/complete`, {
    method: 'POST',
    body: JSON.stringify({ resolution }),
  })
}

export function cancelTicket(id: number, reason: string | null): Promise<{ ticket: Ticket }> {
  return apiRequest<{ ticket: Ticket }>(`/api/tickets/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

export function rateTicket(id: number, body: RatingRequest): Promise<{ rating: Rating }> {
  return apiRequest<{ rating: Rating }>(`/api/tickets/${id}/rating`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}
