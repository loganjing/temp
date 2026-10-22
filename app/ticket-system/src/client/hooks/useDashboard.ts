import { useCallback, useEffect, useState } from 'react'
import { apiRequest } from '../platform/api-client'
import type { DashboardStatsDTO, DataResponse, DistributionDTO } from '../types'

export function useDashboard(dimension: string) {
  const [stats, setStats] = useState<DashboardStatsDTO | null>(null)
  const [distribution, setDistribution] = useState<DistributionDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [statsRes, distRes] = await Promise.all([
        apiRequest<DataResponse<DashboardStatsDTO>>('/api/dashboard/stats'),
        apiRequest<DataResponse<DistributionDTO[]>>(`/api/dashboard/distribution?dimension=${encodeURIComponent(dimension)}`),
      ])
      setStats(statsRes.data)
      setDistribution(distRes.data)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载仪表盘数据失败')
    } finally {
      setLoading(false)
    }
  }, [dimension])

  useEffect(() => { void load() }, [load])

  return { stats, distribution, loading, error, refresh: load }
}
