import { useCallback, useEffect, useState } from 'react'
import { apiRequest } from '../platform/api-client'
import { ErrorBanner, SkeletonRows, EmptyState } from '../components/common'
import type { DistributionResponse, DashboardData } from '../hooks/types'

type Dimension = 'company' | 'department'

export function StatsPage() {
  // Distribution
  const [dimension, setDimension] = useState<Dimension>('company')
  const [distribution, setDistribution] = useState<DistributionResponse | null>(null)
  const [distLoading, setDistLoading] = useState(true)
  const [distError, setDistError] = useState('')

  // Dashboard
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [dashLoading, setDashLoading] = useState(true)
  const [dashError, setDashError] = useState('')

  const fetchDist = useCallback(async () => {
    setDistLoading(true)
    setDistError('')
    try {
      const res = await apiRequest<DistributionResponse>(`/api/stats/distribution?dimension=${dimension}`)
      setDistribution(res)
    } catch (err) {
      setDistError(err instanceof Error ? err.message : '加载分布数据失败')
    } finally {
      setDistLoading(false)
    }
  }, [dimension])

  const fetchDashboard = useCallback(async () => {
    setDashLoading(true)
    setDashError('')
    try {
      const res = await apiRequest<DashboardData>('/api/stats/dashboard')
      setDashboard(res)
    } catch (err) {
      setDashError(err instanceof Error ? err.message : '加载仪表盘失败')
    } finally {
      setDashLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDist()
  }, [fetchDist])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">统计分析</h1>

      {/* Dashboard KPI cards (AC-08) */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">运营仪表盘</h2>
        {dashError ? (
          <ErrorBanner message={dashError} onRetry={fetchDashboard} />
        ) : dashLoading ? (
          <SkeletonRows count={2} />
        ) : dashboard ? (
          <div className="space-y-4">
            {/* KPI cards */}
            <div className="grid grid-cols-4 gap-4">
              <KpiCard label="工单总量" value={dashboard.totalTickets} color="blue" />
              <KpiCard label="待处理" value={dashboard.pendingTickets} color="amber" />
              <KpiCard label="已完成" value={dashboard.completedTickets} color="green" />
              <KpiCard label="已取消" value={dashboard.cancelledTickets} color="gray" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <KpiCard
                label="平均响应时间"
                value={`${dashboard.avgResponseTimeHours}h`}
                color="blue"
              />
              <KpiCard
                label="满意度评分"
                value={dashboard.satisfactionScore > 0 ? `${dashboard.satisfactionScore}/5` : '—'}
                color="green"
              />
              <KpiCard label="工单总量" value={dashboard.totalTickets} color="blue" />
            </div>

            {/* Hot categories */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">热点问题分类</h3>
              {dashboard.hotCategories.length === 0 ? (
                <EmptyState message="暂无数据" />
              ) : (
                <div className="space-y-2">
                  {dashboard.hotCategories.map((c, i) => {
                    const maxCount = dashboard.hotCategories[0]?.count || 1
                    return (
                      <div key={c.category} className="flex items-center gap-3">
                        <span className="text-xs text-gray-400 w-4">{i + 1}</span>
                        <span className="text-sm text-gray-700 w-24">{c.category}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                          <div
                            className="bg-blue-500 h-full rounded-full transition-all"
                            style={{ width: `${(c.count / maxCount) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 w-10 text-right">{c.count}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </section>

      {/* Distribution (AC-08) */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">工单分布统计</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setDimension('company')}
              className={`px-3 py-1 text-xs rounded ${
                dimension === 'company' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
              }`}
            >
              按公司
            </button>
            <button
              onClick={() => setDimension('department')}
              className={`px-3 py-1 text-xs rounded ${
                dimension === 'department' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
              }`}
            >
              按部门
            </button>
          </div>
        </div>
        {distError ? (
          <ErrorBanner message={distError} onRetry={fetchDist} />
        ) : distLoading ? (
          <SkeletonRows count={3} />
        ) : distribution && distribution.items.length > 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-left text-gray-500 font-medium">
                    {dimension === 'company' ? '公司' : '部门'}
                  </th>
                  <th className="px-4 py-2 text-right text-gray-500 font-medium">总计</th>
                  <th className="px-4 py-2 text-right text-gray-500 font-medium">待处理</th>
                  <th className="px-4 py-2 text-right text-gray-500 font-medium">已完成</th>
                  <th className="px-4 py-2 text-right text-gray-500 font-medium">已取消</th>
                </tr>
              </thead>
              <tbody>
                {distribution.items.map((item, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="px-4 py-2 text-gray-700">{item.label}</td>
                    <td className="px-4 py-2 text-right text-gray-700 font-medium">{item.total}</td>
                    <td className="px-4 py-2 text-right text-amber-600">{item.pending}</td>
                    <td className="px-4 py-2 text-right text-green-600">{item.completed}</td>
                    <td className="px-4 py-2 text-right text-gray-400">{item.cancelled}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState message="暂无分布数据" icon="📊" />
        )}
      </section>
    </div>
  )
}

const kpiColors: Record<string, string> = {
  blue: 'border-blue-200 bg-blue-50 text-blue-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-700',
  green: 'border-green-200 bg-green-50 text-green-700',
  gray: 'border-gray-200 bg-gray-50 text-gray-600',
}

function KpiCard({
  label,
  value,
  color,
}: {
  label: string
  value: string | number
  color: string
}) {
  return (
    <div className={`rounded-lg border p-4 ${kpiColors[color] ?? kpiColors.blue}`}>
      <div className="text-xs opacity-70 mb-1">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  )
}
