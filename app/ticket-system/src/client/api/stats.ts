import { apiRequest } from '../platform/api-client'
import type { Dashboard, Distribution } from '../platform/types'

export function fetchDashboard(): Promise<Dashboard> {
  return apiRequest<Dashboard>('/api/stats/dashboard')
}

export function fetchDistribution(dimension: 'department' | 'company'): Promise<Distribution> {
  return apiRequest<Distribution>(`/api/stats/distribution?dimension=${dimension}`)
}
