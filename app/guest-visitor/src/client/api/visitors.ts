import { apiRequest } from '../platform/api-client'
import type {
  VisitorDetail,
  VisitorListResponse,
  ReviewVisitorResponse,
} from '../../shared/visitor-types'

export interface FetchVisitorsParams {
  status?: 'pending' | 'approved' | 'rejected'
  page?: number
  limit?: number
}

/** GET /api/visitors — 查询访客列表 */
export function fetchVisitors(params: FetchVisitorsParams = {}): Promise<VisitorListResponse> {
  const query = new URLSearchParams()
  if (params.status) query.set('status', params.status)
  if (params.page != null) query.set('page', String(params.page))
  if (params.limit != null) query.set('limit', String(params.limit))
  const qs = query.toString()
  return apiRequest<VisitorListResponse>(`/api/visitors${qs ? `?${qs}` : ''}`)
}

/** GET /api/visitors/:id — 查询访客详情 */
export function fetchVisitorDetail(id: string): Promise<VisitorDetail> {
  return apiRequest<VisitorDetail>(`/api/visitors/${encodeURIComponent(id)}`)
}

/** POST /api/visitors/:id/approve — 审批通过 */
export function approveVisitor(id: string, comment?: string): Promise<ReviewVisitorResponse> {
  return apiRequest<ReviewVisitorResponse>(`/api/visitors/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment: comment ?? null }),
  })
}

/** POST /api/visitors/:id/reject — 审批驳回 */
export function rejectVisitor(id: string, comment?: string): Promise<ReviewVisitorResponse> {
  return apiRequest<ReviewVisitorResponse>(`/api/visitors/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment: comment ?? null }),
  })
}
