import { apiRequest } from '../platform/api-client'
import type {
  AssignmentRule,
  AuditLogListResponse,
  BusinessGroup,
  CreateTicketBody,
  CreateTicketResponse,
  DashboardData,
  DistributionData,
  SubmitterInfo,
  TicketDetail,
  TicketListResponse,
  TicketReply,
} from './types'

function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value).trim() !== '') sp.set(key, String(value))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

export const getCategories = () =>
  apiRequest<{ items: { id: string; name: string }[] }>('/api/categories')

export const listTickets = (params: {
  page?: number
  pageSize?: number
  search?: string
  status?: string
  categoryId?: string
  priority?: string
  companyId?: string
  sort?: string
}) => apiRequest<TicketListResponse>(`/api/tickets${qs(params)}`)

export const getTicket = (id: string) =>
  apiRequest<TicketDetail>(`/api/tickets/${encodeURIComponent(id)}`)

export const createTicket = (body: CreateTicketBody) =>
  apiRequest<CreateTicketResponse>('/api/tickets', { method: 'POST', body: JSON.stringify(body) })

export const addReply = (id: string, content: string) =>
  apiRequest<TicketReply>(`/api/tickets/${encodeURIComponent(id)}/replies`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  })

export const transferTicket = (
  id: string,
  body: { targetGroupId?: string; targetUserId?: string },
) =>
  apiRequest<TicketDetail>(`/api/tickets/${encodeURIComponent(id)}/transfer`, {
    method: 'POST',
    body: JSON.stringify(body),
  })

export const completeTicket = (id: string) =>
  apiRequest<TicketDetail>(`/api/tickets/${encodeURIComponent(id)}/complete`, { method: 'POST' })

export const cancelTicket = (id: string) =>
  apiRequest<TicketDetail>(`/api/tickets/${encodeURIComponent(id)}/cancel`, { method: 'POST' })

export const rateTicket = (id: string, rating: number) =>
  apiRequest<{ id: string; ticketId: string; rating: number; submittedAt: string }>(
    `/api/tickets/${encodeURIComponent(id)}/rating`,
    { method: 'POST', body: JSON.stringify({ rating }) },
  )

export const getSubmitterInfo = (id: string) =>
  apiRequest<SubmitterInfo>(`/api/tickets/${encodeURIComponent(id)}/submitter-info`)

export const listBusinessGroups = () =>
  apiRequest<{ items: BusinessGroup[] }>('/api/business-groups')

export const createBusinessGroup = (name: string) =>
  apiRequest<BusinessGroup>('/api/business-groups', { method: 'POST', body: JSON.stringify({ name }) })

export const addMember = (groupId: string, userId: string) =>
  apiRequest<{ id: string; groupId: string; userId: string; userName: string }>(
    `/api/business-groups/${encodeURIComponent(groupId)}/members`,
    { method: 'POST', body: JSON.stringify({ userId }) },
  )

export const removeMember = (groupId: string, userId: string) =>
  apiRequest<{ ok: boolean }>(
    `/api/business-groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
  )

export const listAssignmentRules = () =>
  apiRequest<{ items: AssignmentRule[] }>('/api/assignment-rules')

export const createAssignmentRule = (categoryId: string, targetGroupId: string) =>
  apiRequest<AssignmentRule>('/api/assignment-rules', {
    method: 'POST',
    body: JSON.stringify({ categoryId, targetGroupId }),
  })

export const deleteAssignmentRule = (id: string) =>
  apiRequest<{ ok: boolean }>(`/api/assignment-rules/${encodeURIComponent(id)}`, { method: 'DELETE' })

export const getDashboard = (companyId?: string) =>
  apiRequest<DashboardData>(`/api/statistics/dashboard${qs({ companyId })}`)

export const getDistribution = (dimension: 'company' | 'department', companyId?: string) =>
  apiRequest<DistributionData>(
    `/api/statistics/distribution${qs({ dimension, companyId })}`,
  )

export const listAuditLogs = (params: {
  ticketId?: string
  eventType?: string
  page?: number
  pageSize?: number
}) => apiRequest<AuditLogListResponse>(`/api/audit-logs${qs(params)}`)
