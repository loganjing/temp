import { apiRequest } from '../platform/api-client'
import type { DistributionItem, Dashboard, DistributionDimension } from './types'

export function getDistribution(companyId: string | undefined, dimension: DistributionDimension): Promise<DistributionItem[]> {
  const params = new URLSearchParams()
  if (companyId) params.set('companyId', companyId)
  params.set('dimension', dimension)
  return apiRequest<DistributionItem[]>(`/api/statistics/distribution?${params.toString()}`)
}

export function getDashboard(companyId?: string): Promise<Dashboard> {
  const params = companyId ? `?companyId=${encodeURIComponent(companyId)}` : ''
  return apiRequest<Dashboard>(`/api/statistics/dashboard${params}`)
}
