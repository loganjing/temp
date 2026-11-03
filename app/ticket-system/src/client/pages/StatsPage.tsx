import { useCallback, useEffect, useState } from 'react'
import { statsApi, type DashboardStats, type DistributionStats } from '../platform/api-client'
import { Spinner, EmptyState, ErrorBanner, SectionCard, formatDuration } from '../components/ui'

export default function StatsPage() {
  const [dashboard, setDashboard] = useState<DashboardStats | null>(null)
  const [distribution, setDistribution] = useState<DistributionStats | null>(null)
  const [dimension, setDimension] = useState<'company' | 'department'>('company')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [d, dist] = await Promise.all([statsApi.dashboard(), statsApi.distribution(dimension)])
      setDashboard(d); setDistribution(dist)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载统计失败')
    } finally { setLoading(false) }
  }, [dimension])

  useEffect(() => { void reload() }, [reload])

  return (
    <div className="detail-stack">
      {error && <ErrorBanner message={error} />}
      {loading && !dashboard ? <Spinner /> : dashboard && (
        <>
          <div className="kpi-grid">
            <div className="card kpi"><span className="kpi-label">工单总量</span><strong className="kpi-value">{dashboard.totalTickets}</strong></div>
            <div className="card kpi"><span className="kpi-label">待处理</span><strong className="kpi-value">{dashboard.pendingCount}</strong></div>
            <div className="card kpi"><span className="kpi-label">已完成</span><strong className="kpi-value">{dashboard.completedCount}</strong></div>
            <div className="card kpi"><span className="kpi-label">已取消</span><strong className="kpi-value">{dashboard.cancelledCount}</strong></div>
            <div className="card kpi"><span className="kpi-label">平均响应时间</span><strong className="kpi-value">{formatDuration(dashboard.avgResponseTimeMs)}</strong></div>
            <div className="card kpi"><span className="kpi-label">满意度评分</span><strong className="kpi-value">{dashboard.avgSatisfaction === null ? '—' : `${dashboard.avgSatisfaction.toFixed(1)} / 5`}</strong></div>
          </div>

          <SectionCard title="热点问题分类">
            {dashboard.hotCategories.length === 0 ? <EmptyState message="暂无数据" /> : (
              <div className="table-scroll">
                <table>
                  <thead><tr><th>分类</th><th>工单量</th></tr></thead>
                  <tbody>{dashboard.hotCategories.map((c) => (
                    <tr key={c.category}><td>{c.category}</td><td>{c.count}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      )}

      <SectionCard title="工单分布统计" actions={
        <div className="tab-row">
          <button className={dimension === 'company' ? 'tab active' : 'tab secondary'} onClick={() => setDimension('company')}>按公司</button>
          <button className={dimension === 'department' ? 'tab active' : 'tab secondary'} onClick={() => setDimension('department')}>按部门</button>
        </div>
      }>
        {loading && !distribution ? <Spinner /> : distribution && distribution.items.length > 0 ? (
          <div className="table-scroll">
            <table>
              <thead><tr><th>{dimension === 'company' ? '公司' : '部门'}</th><th>工单量</th></tr></thead>
              <tbody>{distribution.items.map((i) => (
                <tr key={i.label + (i.companyId ?? '')}><td>{i.label}</td><td>{i.count}</td></tr>
              ))}</tbody>
            </table>
          </div>
        ) : <EmptyState message="暂无数据" />}
      </SectionCard>
    </div>
  )
}
