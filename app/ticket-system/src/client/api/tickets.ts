import { apiRequest } from '../platform/api-client'
import { buildQuery } from './query'
import type {
  CreatedTicket,
  PagedResult,
  SlaPriority,
  SubmitterInfo,
  TicketDetail,
  TicketListItem,
  TicketLog,
  TicketRating,
  TicketQuery,
} from './types'

export const ticketsApi = {
  list: (query: TicketQuery) => apiRequest<PagedResult<TicketListItem>>(`/api/tickets${buildQuery({ ...query })}`),
  get: (id: number) => apiRequest<TicketDetail>(`/api/tickets/${id}`),
  create: (body: { title: string; description: string; categoryId: number; slaPriority: SlaPriority }) =>
    apiRequest<CreatedTicket>('/api/tickets', { method: 'POST', body: JSON.stringify(body) }),
  reply: (id: number, content: string) =>
    apiRequest<{ id: number; content: string; replierName: string; createdAt: string }>(`/api/tickets/${id}/replies`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  transfer: (id: number, target: { targetGroupId?: number; targetUserId?: number }) =>
    apiRequest<{ id: number; businessGroupId: number | null; handlerUserId: number | null; status: string }>(
      `/api/tickets/${id}/transfer`,
      { method: 'POST', body: JSON.stringify(target) },
    ),
  assign: (id: number, businessGroupId: number) =>
    apiRequest<{ id: number; businessGroupId: number; status: string }>(`/api/tickets/${id}/assign`, {
      method: 'POST',
      body: JSON.stringify({ businessGroupId }),
    }),
  complete: (id: number) =>
    apiRequest<{ id: number; status: string; handlerName: string; completedAt: string }>(`/api/tickets/${id}/complete`, { method: 'POST' }),
  cancel: (id: number) =>
    apiRequest<{ id: number; status: string; cancelledAt: string }>(`/api/tickets/${id}/cancel`, { method: 'POST' }),
  submitterInfo: (id: number) => apiRequest<SubmitterInfo>(`/api/tickets/${id}/submitter-info`),
  logs: (id: number) => apiRequest<{ items: TicketLog[] }>(`/api/tickets/${id}/logs`),
  rate: (id: number, body: { score: number; comment?: string }) =>
    apiRequest<TicketRating>(`/api/tickets/${id}/rating`, { method: 'POST', body: JSON.stringify(body) }),
}
