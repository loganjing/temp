import { useCallback, useEffect, useState } from 'react'
import { describeApiError } from '../api/errors'
import { statisticsApi } from '../api/statistics'
import type { DashboardMetrics, DistributionResult } from '../api/types'
import { EmptyState, Loading, Notice } from '../components/ui'
import { formatMinutes, formatScore } from '../format'

const dimensions = [
  { value: 'company' as const, label: '按公司' },
  { value: 'department' as const, label: '按部门' },
]

export default function StatisticsPage() {
  const [dimension, setDimension] = useState<'company' | 'department'>('company')
  const [distribution, setDistribution] = useState<DistributionResult | null>(null)
  const [dashboard, setDashboard] = useState<DashboardMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [distributionResult, dashboardResult] = await Promise.all([
        statisticsApi.distribution(dimension),
        statisticsApi.dashboard(),
      ])
      setDistribution(distributionResult)
      setDashboard(dashboardResult)
    } catch (cause) {
      setError(describeApiError(cause, '无法加载统计数据。'))
    } finally {
      setLoading(false)
    }
  }, [dimension])

  useEffect(() => { void load() }, [load])

  const maxCount = distribution && distribution.items.length > 0
    ? Math.max(...distribution.items.map((item) => item.count))
    : 0

  return (
    <div className="stack">
      <section className="card">
        <div className="section-heading">
          <h2>统计分析</h2>
          <div className="row-actions horizontal">
            {dimensions.map((item) => (
              <button key={item.value} className={dimension === item.value ? '' : 'secondary'} aria-pressed={dimension === item.value} onClick={() => setDimension(item.value)}>{item.label}</button>
            ))}
            <button className="secondary" onClick={() => void load()} disabled={loading}>刷新</button>
          </div>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        {loading ? <Loading label="加载统计…" /> : (
          <div className="metrics">
            <div className="metric"><span className="muted">工单量</span><strong>{dashboard?.totalTickets ?? 0}</strong></div>
            <div className="metric"><span className="muted">平均响应时间</span><strong>{formatMinutes(dashboard?.avgResponseTimeMinutes)}</strong></div>
            <div className="metric"><span className="muted">满意度</span><strong>{formatScore(dashboard?.satisfactionScore)}</strong></div>
            <div className="metric"><span className="muted">热点分类</span><strong>{dashboard?.hotCategories[0] ? `${dashboard.hotCategories[0].categoryName}（${dashboard.hotCategories[0].count}）` : '—'}</strong></div>
          </div>
        )}
      </section>

      <section className="card">
        <h3>工单分布（{dimension === 'company' ? '按公司' : '按部门'}）</h3>
        {loading ? <Loading label="加载分布…" /> : !distribution || distribution.items.length === 0 ? <EmptyState>暂无可统计的工单数据。</EmptyState> : (
          <ul className="bars">
            {distribution.items.map((item) => (
              <li key={item.label}>
                <span className="bar-label" title={item.label}>{item.label}</span>
                <span className="bar-track"><span className="bar-fill" style={{ width: `${maxCount > 0 ? Math.round((item.count / maxCount) * 100) : 0}%` }} /></span>
                <span className="bar-value">{item.count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h3>热点分类排行</h3>
        {loading ? <Loading label="加载排行…" /> : !dashboard || dashboard.hotCategories.length === 0 ? <EmptyState>暂无分类工单数据。</EmptyState> : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>分类</th><th>工单量</th></tr></thead>
              <tbody>{dashboard.hotCategories.map((item) => <tr key={item.categoryId}><td>{item.categoryName}</td><td>{item.count}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}