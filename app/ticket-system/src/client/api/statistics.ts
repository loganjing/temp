import { apiRequest } from '../platform/api-client'
import type { DashboardData, DistributionResult, PagedResult, Ticket } from '../types'

export interface DistributionQuery {
  dimension: 'company' | 'department'
}

export interface DashboardQuery {
  companyId?: string
}

export const statisticsApi = {
  distribution: (dimension: 'company' | 'department') =>
    apiRequest<DistributionResult>(`/api/statistics/distribution?dimension=${dimension}`),

  dashboard: (companyId?: string) =>
    apiRequest<DashboardData>(
      `/api/statistics/dashboard${companyId ? `?companyId=${encodeURIComponent(companyId)}` : ''}`,
    ),
}

export interface WorkbenchQuery {
  page?: number
  pageSize?: number
  status?: Ticket['status']
  slaPriority?: Ticket['slaPriority']
  categoryId?: string
  companyId?: string
  keyword?: string
  sortBy?: 'slaPriority' | 'createdAt' | 'updatedAt'
  sortOrder?: 'asc' | 'desc'
}

export const workbenchApi = {
  list: (query: WorkbenchQuery = {}) => {
    const sp = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue
      sp.set(k, String(v))
    }
    const s = sp.toString()
    return apiRequest<PagedResult<Ticket>>(`/api/workbench/tickets${s ? `?${s}` : ''}`)
  },
}
