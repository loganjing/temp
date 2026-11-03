import { useCallback, useEffect, useState } from 'react'
import { apiRequest } from '../platform/api-client'
import { LoadingView, ErrorView } from '../components/StateViews'
import type { DistributionItem, DashboardData } from '../types'

type Dimension = 'company' | 'department'

export function StatisticsPage() {
  const [dimension, setDimension] = useState<Dimension>('company')
  const [distribution, setDistribution] = useState<DistributionItem[]>([])
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [dist, dash] = await Promise.all([
        apiRequest<DistributionItem[]>(`/api/statistics/distribution?dimension=${dimension}`),
        apiRequest<DashboardData>('/api/statistics/dashboard'),
      ])
      setDistribution(dist)
      setDashboard(dash)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [dimension])

  useEffect(() => { void load() }, [load])

  const maxTotal = Math.max(1, ...distribution.map((d) => d.total))

  return (
    <div className="page-container">
      <div className="page-header"><h1>统计分析</h1></div>

      {loading ? <LoadingView /> :
       error ? <ErrorView message={error} onRetry={load} /> : (
        <>
          {/* 仪表盘指标卡片 */}
          {dashboard && (
            <div className="dashboard-cards">
              <div className="metric-card">
                <span className="metric-value">{dashboard.totalTickets}</span>
                <span className="metric-label">工单总量</span>
              </div>
              <div className="metric-card">
                <span className="metric-value">{dashboard.pendingTickets}</span>
                <span className="metric-label">待处理数</span>
              </div>
              <div className="metric-card">
                <span className="metric-value">{dashboard.completedTickets}</span>
                <span className="metric-label">已完成数</span>
              </div>
              <div className="metric-card">
                <span className="metric-value">{dashboard.cancelledTickets}</span>
                <span className="metric-label">已取消数</span>
              </div>
              <div className="metric-card">
                <span className="metric-value">{dashboard.avgResponseTimeMinutes.toFixed(1)}</span>
                <span className="metric-label">平均响应时间（分钟）</span>
              </div>
              <div className="metric-card">
                <span className="metric-value">{dashboard.avgSatisfactionScore.toFixed(1)}</span>
                <span className="metric-label">平均满意度评分</span>
              </div>
            </div>
          )}

          {/* 热点问题分类 */}
          {dashboard && dashboard.hotCategories.length > 0 && (
            <section className="card section-block">
              <h2>热点问题分类（前 5）</h2>
              <div className="table-scroll">
                <table className="data-table">
                  <thead><tr><th>分类</th><th>工单数</th></tr></thead>
                  <tbody>
                    {dashboard.hotCategories.map((c) => (
                      <tr key={c.category}>
                        <td><strong>{c.category}</strong></td>
                        <td>{c.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* 工单分布 */}
          <section className="card section-block">
            <div className="section-heading">
              <h2>工单分布</h2>
              <div className="dimension-tabs">
                <button className={`tab-btn${dimension === 'company' ? ' active' : ''}`} onClick={() => setDimension('company')}>按公司</button>
                <button className={`tab-btn${dimension === 'department' ? ' active' : ''}`} onClick={() => setDimension('department')}>按部门</button>
              </div>
            </div>
            {distribution.length === 0 ? (
              <p className="muted">暂无分布数据</p>
            ) : (
              <div className="distribution-list">
                {distribution.map((d) => (
                  <div key={d.dimensionKey} className="distribution-row">
                    <div className="dist-label">{d.dimensionName}</div>
                    <div className="dist-bar-container">
                      <div className="dist-bar" style={{ width: `${(d.total / maxTotal) * 100}%` }} />
                      <span className="dist-total">{d.total}</span>
                    </div>
                    <div className="dist-breakdown">
                      <span className="badge badge-status-pending-assignment">待分配 {d.pendingAssignment}</span>
                      <span className="badge badge-status-pending-processing">待处理 {d.pendingProcessing}</span>
                      <span className="badge badge-status-completed">已完成 {d.completed}</span>
                      <span className="badge badge-status-cancelled">已取消 {d.cancelled}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
