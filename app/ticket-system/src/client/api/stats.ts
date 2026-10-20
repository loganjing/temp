import { apiRequest } from '../platform/api-client'
import { buildQuery } from './helpers'
import type { DashboardStats, DistributionResult } from './types'

export function fetchDistribution(dimension: 'company' | 'department', company?: string): Promise<DistributionResult> {
  return apiRequest(`/api/stats/distribution${buildQuery({ dimension, company })}`)
}

export function fetchDashboard(company?: string): Promise<DashboardStats> {
  return apiRequest(`/api/stats/dashboard${buildQuery({ company })}`)
}
