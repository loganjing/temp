// 工单域接口（契约第 6 节）。视图域过滤与状态流转校验在服务端，前端只传查询参数。
import { apiRequest, buildQuery } from '../platform/api-client'
import type {
  CompleteTicketResponse,
  CreateTicketRequest,
  Paged,
  SatisfactionResponse,
  TicketDetail,
  TicketListQuery,
  TicketLogEntry,
  TicketObject,
  TicketReply,
  TicketSummary,
} from '../contracts/types'

export async function listTickets(query: TicketListQuery): Promise<Paged<TicketSummary>> {
  return apiRequest<Paged<TicketSummary>>(`/api/tickets${buildQuery({
    status: query.status,
    priority: query.priority,
    categoryId: query.categoryId,
    companyId: query.companyId,
    search: query.search,
    sort: query.sort,
    order: query.order,
    page: query.page,
    pageSize: query.pageSize,
  })}`)
}

export async function createTicket(body: CreateTicketRequest): Promise<TicketObject> {
  return apiRequest<TicketObject>('/api/tickets', { method: 'POST', body: JSON.stringify(body) })
}

export async function getTicket(ticketId: number): Promise<TicketDetail> {
  return apiRequest<TicketDetail>(`/api/tickets/${ticketId}`)
}

export async function addReply(ticketId: number, content: string): Promise<TicketReply> {
  return apiRequest<TicketReply>(`/api/tickets/${ticketId}/replies`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  })
}

export async function transferTicket(ticketId: number, targetGroupId: number): Promise<TicketObject> {
  return apiRequest<TicketObject>(`/api/tickets/${ticketId}/transfer`, {
    method: 'POST',
    body: JSON.stringify({ targetGroupId }),
  })
}

export async function completeTicket(ticketId: number): Promise<CompleteTicketResponse> {
  return apiRequest<CompleteTicketResponse>(`/api/tickets/${ticketId}/complete`, { method: 'POST' })
}

export async function cancelTicket(ticketId: number): Promise<TicketObject> {
  return apiRequest<TicketObject>(`/api/tickets/${ticketId}/cancel`, { method: 'POST' })
}

export async function rateSatisfaction(
  ticketId: number,
  rating: number,
  comment: string,
): Promise<SatisfactionResponse> {
  return apiRequest<SatisfactionResponse>(`/api/tickets/${ticketId}/satisfaction`, {
    method: 'POST',
    body: JSON.stringify({ rating, comment }),
  })
}

export async function listTicketLogs(
  ticketId: number,
  page = 1,
  pageSize = 100,
): Promise<Paged<TicketLogEntry>> {
  return apiRequest<Paged<TicketLogEntry>>(
    `/api/tickets/${ticketId}/logs${buildQuery({ page, pageSize })}`,
  )
}
