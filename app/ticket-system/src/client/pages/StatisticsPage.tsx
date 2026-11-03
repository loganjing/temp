/** 统计分析 — command-center-dashboard：KPI 卡片 + 分布图表 + 热点列表 */
import { useCallback, useEffect, useState } from 'react'
import { statsApi } from '../platform/ticket-api'
import type { StatisticsOverview, StatisticsDistribution, StatisticsDimension, Role } from '../types'
import { Skeleton, ErrorState } from '../components'
import { ChartIcon, ClockIcon, StarIcon, TicketIcon } from '../icons'

interface Props {
  role: Role
  companyId: string
}

export default function StatisticsPage({ role, companyId }: Props) {
  const [overview, setOverview] = useState<StatisticsOverview | null>(null)
  const [distribution, setDistribution] = useState<StatisticsDistribution | null>(null)
  const [dimension, setDimension] = useState<StatisticsDimension>('company')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const cid = role === 'admin' ? undefined : companyId
      const [ov, dist] = await Promise.all([
        statsApi.overview(cid),
        statsApi.distribution(dimension, cid),
      ])
      setOverview(ov)
      setDistribution(dist)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载统计数据失败')
    } finally {
      setLoading(false)
    }
  }, [role, companyId, dimension])

  useEffect(() => { void load() }, [load])

  if (loading) return (
    <div className="stats-page">
      <h2>统计分析</h2>
      <div className="kpi-grid">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="kpi-skeleton" />)}
      </div>
      <Skeleton className="skeleton-block" />
    </div>
  )

  if (error) return (
    <div className="stats-page">
      <h2>统计分析</h2>
      <ErrorState message={error} onRetry={load} />
    </div>
  )

  if (!overview) return null

  const maxCount = distribution?.items.reduce((max, item) => Math.max(max, item.count), 0) || 1

  return (
    <div className="stats-page">
      <div className="section-heading">
        <h2>统计分析</h2>
        <div className="dimension-switch">
          <button className={`secondary ${dimension === 'company' ? 'active' : ''}`} onClick={() => setDimension('company')}>按公司</button>
          <button className={`secondary ${dimension === 'department' ? 'active' : ''}`} onClick={() => setDimension('department')}>按部门</button>
        </div>
      </div>

      {/* KPI 卡片行 */}
      <div className="kpi-grid">
        <div className="card kpi-card">
          <div className="kpi-icon"><TicketIcon size={20} /></div>
          <div>
            <p className="kpi-label">工单总量</p>
            <p className="kpi-value">{overview.totalTickets}</p>
            <p className="subtext">待处理 {overview.pendingTickets} · 已完成 {overview.completedTickets} · 已取消 {overview.cancelledTickets}</p>
          </div>
        </div>

        <div className="card kpi-card">
          <div className="kpi-icon"><ClockIcon size={20} /></div>
          <div>
            <p className="kpi-label">平均响应时间</p>
            <p className="kpi-value">{overview.avgResponseTimeHours != null ? `${overview.avgResponseTimeHours.toFixed(1)}h` : '—'}</p>
            <p className="subtext">从创建到首次回复</p>
          </div>
        </div>

        <div className="card kpi-card">
          <div className="kpi-icon"><StarIcon size={20} filled /></div>
          <div>
            <p className="kpi-label">平均满意度</p>
            <p className="kpi-value">{overview.avgSatisfaction != null ? overview.avgSatisfaction.toFixed(1) : '—'}</p>
            <p className="subtext">1-5 星</p>
          </div>
        </div>

        <div className="card kpi-card">
          <div className="kpi-icon"><ChartIcon size={20} /></div>
          <div>
            <p className="kpi-label">热点分类</p>
            <p className="kpi-value">{overview.hotCategories[0]?.category ?? '—'}</p>
            <p className="subtext">{overview.hotCategories[0] ? `${overview.hotCategories[0].count} 工单` : ''}</p>
          </div>
        </div>
      </div>

      {/* 分布图表 */}
      <section className="card stats-section">
        <h3>工单分布（{dimension === 'company' ? '按公司' : '按部门'}）</h3>
        {distribution && distribution.items.length > 0 ? (
          <div className="bar-chart">
            {distribution.items.map((item) => (
              <div key={item.key} className="bar-row">
                <span className="bar-label" title={item.label}>{item.label}</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${(item.count / maxCount) * 100}%` }} />
                </div>
                <span className="bar-count">{item.count}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="subtext">暂无分布数据</p>
        )}
      </section>

      {/* 热点分类列表 */}
      <section className="card stats-section">
        <h3>热点分类 Top 5</h3>
        {overview.hotCategories.length > 0 ? (
          <div className="hot-list">
            {overview.hotCategories.map((cat, idx) => (
              <div key={cat.category} className="hot-item">
                <span className="hot-rank">#{idx + 1}</span>
                <span className="hot-category">{cat.category}</span>
                <span className="hot-count">{cat.count} 工单</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="subtext">暂无分类数据</p>
        )}
      </section>
    </div>
  )
}
