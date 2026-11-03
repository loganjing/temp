import { apiRequest } from '../platform/api-client'
import type {
  Ticket, TicketListQuery, TicketListResponse, CreateTicketBody,
  PatchTicketBody, TransferTicketBody, TicketReply, SubmitterInfo, TicketEvaluation,
} from './types'

export function listTickets(query: TicketListQuery): Promise<TicketListResponse> {
  const params = new URLSearchParams()
  if (query.status) params.set('status', query.status)
  if (query.category) params.set('category', query.category)
  if (query.slaPriority) params.set('slaPriority', query.slaPriority)
  if (query.companyId) params.set('companyId', query.companyId)
  if (query.search) params.set('search', query.search)
  if (query.sort) params.set('sort', query.sort)
  if (query.order) params.set('order', query.order)
  if (query.page) params.set('page', String(query.page))
  if (query.pageSize) params.set('pageSize', String(query.pageSize))
  return apiRequest<TicketListResponse>(`/api/tickets?${params.toString()}`)
}

export function getTicket(id: string): Promise<Ticket> {
  return apiRequest<Ticket>(`/api/tickets/${encodeURIComponent(id)}`)
}

export function createTicket(body: CreateTicketBody): Promise<Ticket> {
  return apiRequest<Ticket>('/api/tickets', { method: 'POST', body: JSON.stringify(body) })
}

export function patchTicket(id: string, body: PatchTicketBody): Promise<Ticket> {
  return apiRequest<Ticket>(`/api/tickets/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export function transferTicket(id: string, body: TransferTicketBody): Promise<Ticket> {
  return apiRequest<Ticket>(`/api/tickets/${encodeURIComponent(id)}/transfer`, { method: 'POST', body: JSON.stringify(body) })
}

export function listReplies(id: string): Promise<TicketReply[]> {
  return apiRequest<TicketReply[]>(`/api/tickets/${encodeURIComponent(id)}/replies`)
}

export function addReply(id: string, content: string): Promise<TicketReply> {
  return apiRequest<TicketReply>(`/api/tickets/${encodeURIComponent(id)}/replies`, { method: 'POST', body: JSON.stringify({ content }) })
}

export function getSubmitter(id: string): Promise<SubmitterInfo> {
  return apiRequest<SubmitterInfo>(`/api/tickets/${encodeURIComponent(id)}/submitter`)
}

export function submitEvaluation(id: string, rating: number): Promise<TicketEvaluation> {
  return apiRequest<TicketEvaluation>(`/api/tickets/${encodeURIComponent(id)}/evaluation`, { method: 'POST', body: JSON.stringify({ rating }) })
}
