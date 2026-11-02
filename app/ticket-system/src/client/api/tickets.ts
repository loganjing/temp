import { apiRequest } from '../platform/api-client'
import type {
  PagedResult,
  SLAPriority,
  Ticket,
  TicketDetail,
  TicketEvaluation,
  TicketReply,
  TicketStatus,
  TicketTransfer,
} from '../types'

export interface TicketListQuery {
  page?: number
  pageSize?: number
  status?: TicketStatus
  slaPriority?: SLAPriority
  categoryId?: string
  keyword?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface TicketCreateBody {
  title: string
  description: string
  categoryId: string
  slaPriority: SLAPriority
}

export interface TicketUpdateBody {
  title?: string
  description?: string
  categoryId?: string
  slaPriority?: SLAPriority
}

export interface AssignBody {
  targetType: 'user' | 'group'
  targetUserId?: string
  targetGroupId?: string
}

export interface TransferBody extends AssignBody {
  reason?: string
}

function toQuery(params: Record<string, unknown>): string {
  const sp = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    sp.set(key, String(value))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

export const ticketsApi = {
  list: (query: TicketListQuery = {}) =>
    apiRequest<PagedResult<Ticket>>(`/api/tickets${toQuery(query as Record<string, unknown>)}`),

  detail: (id: string) => apiRequest<TicketDetail>(`/api/tickets/${encodeURIComponent(id)}`),

  create: (body: TicketCreateBody) =>
    apiRequest<Ticket>('/api/tickets', { method: 'POST', body: JSON.stringify(body) }),

  update: (id: string, body: TicketUpdateBody) =>
    apiRequest<Ticket>(`/api/tickets/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) }),

  replies: (id: string) =>
    apiRequest<TicketReply[]>(`/api/tickets/${encodeURIComponent(id)}/replies`),

  addReply: (id: string, content: string) =>
    apiRequest<TicketReply>(`/api/tickets/${encodeURIComponent(id)}/replies`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),

  assign: (id: string, body: AssignBody) =>
    apiRequest<Ticket>(`/api/tickets/${encodeURIComponent(id)}/assign`, { method: 'POST', body: JSON.stringify(body) }),

  transfer: (id: string, body: TransferBody) =>
    apiRequest<Ticket>(`/api/tickets/${encodeURIComponent(id)}/transfer`, { method: 'POST', body: JSON.stringify(body) }),

  complete: (id: string, summary?: string) =>
    apiRequest<Ticket>(`/api/tickets/${encodeURIComponent(id)}/complete`, {
      method: 'POST',
      body: JSON.stringify({ summary }),
    }),

  cancel: (id: string, reason?: string) =>
    apiRequest<Ticket>(`/api/tickets/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  submitterInfo: (id: string) =>
    apiRequest<import('../types').SubmitterInfo>(`/api/tickets/${encodeURIComponent(id)}/submitter-info`),

  logs: (id: string) =>
    apiRequest<import('../types').OperationLog[]>(`/api/tickets/${encodeURIComponent(id)}/logs`),

  evaluation: (id: string) =>
    apiRequest<TicketEvaluation>(`/api/tickets/${encodeURIComponent(id)}/evaluation`),

  submitEvaluation: (id: string, rating: number, comment?: string) =>
    apiRequest<TicketEvaluation>(`/api/tickets/${encodeURIComponent(id)}/evaluation`, {
      method: 'POST',
      body: JSON.stringify({ rating, comment }),
    }),
}

export type { TicketTransfer }
