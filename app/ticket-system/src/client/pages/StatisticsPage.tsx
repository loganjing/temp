import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { statisticsApi } from '../api'
import type { DistributionItem, StatisticsDashboard } from '../types'
import { ErrorState, PageCard, Skeleton } from '../components/common'

export default function StatisticsPage() {
  const [dashboard, setDashboard] = useState<StatisticsDashboard | null>(null)
  const [distribution, setDistribution] = useState<DistributionItem[]>([])
  const [dimension, setDimension] = useState<'company' | 'department'>('company')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [dash, dist] = await Promise.all([
        statisticsApi.dashboard({ startDate: startDate || undefined, endDate: endDate || undefined }),
        statisticsApi.distribution(dimension),
      ])
      setDashboard(dash)
      setDistribution(dist.items)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载统计数据失败')
    } finally {
      setLoading(false)
    }
  }, [dimension, startDate, endDate])

  useEffect(() => { void load() }, [load])

  const onDateSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    void load()
  }

  const maxDistCount = Math.max(1, ...distribution.map((d) => d.count))

  return (
    <div className="admin-grid">
      {error && <ErrorState message={error} />}

      {/* KPI 卡片 */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <p className="kpi-label">工单总量</p>
          <p className="kpi-value">{loading ? '…' : (dashboard?.totalTickets ?? 0)}</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-label">平均响应时间（秒）</p>
          <p className="kpi-value">{loading ? '…' : (dashboard?.avgResponseTime ?? 0)}</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-label">平均满意度</p>
          <p className="kpi-value">{loading ? '…' : (dashboard?.avgSatisfaction?.toFixed(2) ?? '—')}</p>
        </div>
      </div>

      {/* 热点问题 Top 5 */}
      <PageCard title="热点问题 Top 5">
        {loading ? <Skeleton lines={4} /> : !dashboard || dashboard.hotCategories.length === 0 ? (
          <p className="subtext">暂无数据</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>分类</th><th>工单数</th></tr></thead>
              <tbody>{dashboard.hotCategories.map((h) => (
                <tr key={h.categoryId}><td>{h.categoryName}</td><td>{h.count}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </PageCard>

      {/* 工单分布 */}
      <PageCard
        title="工单分布"
        actions={
          <label className="filter-field">
            <select value={dimension} onChange={(e) => setDimension(e.target.value as 'company' | 'department')}>
              <option value="company">按公司</option>
              <option value="department">按部门</option>
            </select>
          </label>
        }
      >
        {loading ? <Skeleton lines={5} /> : distribution.length === 0 ? (
          <p className="subtext">暂无分布数据</p>
        ) : (
          <div className="chart-list">
            {distribution.map((d) => (
              <div key={d.name} className="chart-row">
                <span className="chart-label">{d.name}</span>
                <div className="chart-bar-track">
                  <div className="chart-bar" style={{ width: `${(d.count / maxDistCount) * 100}%` }} />
                </div>
                <span className="chart-count">{d.count}</span>
                <span className="subtext">待处理 {d.pendingCount} · 完成 {d.completedCount}</span>
              </div>
            ))}
          </div>
        )}
      </PageCard>

      {/* 时间范围筛选 */}
      <PageCard title="时间范围筛选">
        <form className="form-grid" onSubmit={onDateSubmit}>
          <label>起始日期<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
          <label>截止日期<input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
          <button className="secondary">应用筛选</button>
        </form>
      </PageCard>
    </div>
  )
}
