import { apiRequest } from '../platform/api-client'
import { buildQuery } from './query'
import type { DashboardMetrics, DistributionResult } from './types'

export const statisticsApi = {
  distribution: (dimension: 'company' | 'department') =>
    apiRequest<DistributionResult>(`/api/statistics/distribution${buildQuery({ dimension })}`),
  dashboard: () => apiRequest<DashboardMetrics>('/api/statistics/dashboard'),
}
