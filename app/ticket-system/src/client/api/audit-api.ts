import { apiRequest } from '../platform/api-client'
import type { AuditLogListResponse } from './types'

export function listAuditLogs(query: { ticketId?: string; eventType?: string; page?: number; pageSize?: number }): Promise<AuditLogListResponse> {
  const params = new URLSearchParams()
  if (query.ticketId) params.set('ticketId', query.ticketId)
  if (query.eventType) params.set('eventType', query.eventType)
  if (query.page) params.set('page', String(query.page))
  if (query.pageSize) params.set('pageSize', String(query.pageSize))
  return apiRequest<AuditLogListResponse>(`/api/audit-logs?${params.toString()}`)
}
