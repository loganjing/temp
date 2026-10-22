import { useState, useCallback, useEffect } from 'react'
import { getDistribution, getDashboard } from '../api'
import type { StatsDistribution, StatsDashboard as DashboardData, StatsDimension } from '../api/types'
import { Loading, ErrorState, EmptyState } from '../components/common'

export default function StatsDashboard() {
  const [dimension, setDimension] = useState<StatsDimension>('company')
  const [dist, setDist] = useState<StatsDistribution | null>(null)
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [d, dash] = await Promise.all([getDistribution(dimension), getDashboard()])
      setDist(d)
      setDashboard(dash)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [dimension])

  useEffect(() => { fetchData() }, [fetchData])

  const maxCount = dist ? Math.max(...dist.items.map(i => i.count), 1) : 1

  return (
    <div>
      <div className="page-header">
        <div className="page-title">统计与分析仪表盘</div>
      </div>

      {loading ? <Loading /> :
        error ? <ErrorState message={error} onRetry={fetchData} /> :
        dashboard ? (
          <>
            {/* KPI cards */}
            <div className="stat-grid">
              <div className="stat-card">
                <div className="stat-card-label">工单总量</div>
                <div className="stat-card-value">{dashboard.ticketCount}</div>
                <div className="stat-card-sub">可见范围内工单总数</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-label">平均响应时间</div>
                <div className="stat-card-value">
                  {dashboard.avgResponseMinutes != null ? `${dashboard.avgResponseMinutes.toFixed(1)}` : '-'}
                </div>
                <div className="stat-card-sub">
                  {dashboard.avgResponseMinutes != null ? '分钟' : '无样本'}
                  {' '}· 样本 {dashboard.avgResponseSampleCount} 条
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-card-label">满意度</div>
                <div className="stat-card-value">
                  {dashboard.avgSatisfaction != null ? dashboard.avgSatisfaction.toFixed(1) : '-'}
                </div>
                <div className="stat-card-sub">
                  {' '}· 样本 {dashboard.ratingSampleCount} 条
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-card-label">热点分类</div>
                <div style={{ fontSize: 14, marginTop: 4 }}>
                  {dashboard.hotCategories.length > 0 ? (
                    dashboard.hotCategories.map((c, i) => (
                      <div key={i}>{i + 1}. {c.category} ({c.count})</div>
                    ))
                  ) : <span className="text-muted">暂无</span>}
                </div>
              </div>
            </div>

            {/* Distribution */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">工单分布</span>
                <div className="flex gap-8">
                  <button className={`btn btn-sm ${dimension === 'company' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setDimension('company')}>按公司</button>
                  <button className={`btn btn-sm ${dimension === 'department' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setDimension('department')}>按部门</button>
                </div>
              </div>
              <div className="card-body">
                {!dist || dist.items.length === 0 ? (
                  <EmptyState text="暂无分布数据" />
                ) : (
                  <div>
                    {dist.items.map(item => (
                      <div key={item.key} className="dist-bar-row">
                        <div className="dist-bar-label">{item.label}</div>
                        <div className="dist-bar-track">
                          <div className="dist-bar-fill" style={{ width: `${(item.count / maxCount) * 100}%` }}>
                            {item.count}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="text-muted mt-8">总计 {dist.total} 条</div>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : null
      }
    </div>
  )
}
