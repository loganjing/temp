// 统计分析（契约第 7 节，admin | viewer）。
import { apiRequest, buildQuery } from '../platform/api-client'
import type { DashboardResponse, DistributionResponse, StatsDimension } from '../contracts/types'

export async function getDistribution(dimension: StatsDimension): Promise<DistributionResponse> {
  return apiRequest<DistributionResponse>(`/api/stats/distribution${buildQuery({ dimension })}`)
}

export async function getDashboard(): Promise<DashboardResponse> {
  return apiRequest<DashboardResponse>('/api/stats/dashboard')
}
