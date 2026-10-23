// 统计分析页 — 工单分布统计 + 运营指标仪表盘
import { useCallback, useEffect, useState } from 'react'
import { statisticsApi } from '../api'
import type { Dashboard, DistributionEntry, TicketStatus } from '../types'
import { STATUS_LABELS } from '../types'
import { ErrorBanner, Loading, formatDuration, useToast } from '../components'

export default function StatisticsPage() {
  const [dimension, setDimension] = useState<'company' | 'department'>('company')
  const [companyId, setCompanyId] = useState('')
  const [distribution, setDistribution] = useState<DistributionEntry[]>([])
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [, , toastView] = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [dist, dash] = await Promise.all([
        statisticsApi.distribution({
          dimension,
          companyId: dimension === 'department' ? companyId || undefined : undefined,
        }),
        statisticsApi.dashboard(),
      ])
      setDistribution(dist)
      setDashboard(dash)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载统计数据失败')
    } finally {
      setLoading(false)
    }
  }, [dimension, companyId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>统计分析</h1>
        <p>工单分布统计与运营指标仪表盘</p>
      </div>
      {toastView}
      <ErrorBanner error={error} onClose={() => setError('')} />

      {/* 仪表盘指标 */}
      <div className="metrics-grid">
        {loading ? (
          <Loading message="加载指标中…" />
        ) : dashboard ? (
          <>
            <div className="metric-card">
              <span className="metric-label">工单总量</span>
              <span className="metric-value">{dashboard.totalTickets}</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">平均响应时间</span>
              <span className="metric-value">{formatDuration(dashboard.avgResponseTimeMs)}</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">平均满意度</span>
              <span className="metric-value">
                {dashboard.avgSatisfaction !== null
                  ? `${dashboard.avgSatisfaction.toFixed(2)} / 5`
                  : '暂无评价'}
              </span>
            </div>
            <div className="metric-card">
              <span className="metric-label">热点问题分类</span>
              <span className="metric-value">{dashboard.hotCategories.length}</span>
            </div>
          </>
        ) : null}
      </div>

      {dashboard && (
        <>
          {/* 状态分布 */}
          <section className="card">
            <div className="section-heading">
              <h2>状态分布</h2>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>状态</th>
                    <th>工单数</th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(STATUS_LABELS) as TicketStatus[]).map((status) => (
                    <tr key={status}>
                      <td>{STATUS_LABELS[status]}</td>
                      <td>{dashboard.statusBreakdown[status] ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 热点分类 */}
          <section className="card">
            <div className="section-heading">
              <h2>热点问题分类</h2>
            </div>
            {dashboard.hotCategories.length === 0 ? (
              <p className="empty-inline">暂无分类数据</p>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>分类</th>
                      <th>工单数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.hotCategories.map((c) => (
                      <tr key={c.categoryId}>
                        <td>{c.categoryName}</td>
                        <td>{c.ticketCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {/* 工单分布 */}
      <section className="card">
        <div className="section-heading">
          <h2>工单分布</h2>
          <div className="filter-inline">
            <label>
              维度
              <select
                value={dimension}
                onChange={(e) => setDimension(e.currentTarget.value as 'company' | 'department')}
              >
                <option value="company">按公司</option>
                <option value="department">按部门</option>
              </select>
            </label>
            {dimension === 'department' && (
              <label>
                公司 ID（留空为全部）
                <input
                  value={companyId}
                  onChange={(e) => setCompanyId(e.currentTarget.value)}
                  placeholder="公司 ID"
                />
              </label>
            )}
          </div>
        </div>
        {loading ? (
          <Loading message="加载分布数据中…" />
        ) : distribution.length === 0 ? (
          <p className="empty-inline">暂无分布数据</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {dimension === 'company' ? <th>公司</th> : <th>部门</th>}
                  <th>工单数</th>
                </tr>
              </thead>
              <tbody>
                {distribution.map((entry, i) => (
                  <tr key={i}>
                    <td>
                      {'companyName' in entry ? entry.companyName : entry.department}
                    </td>
                    <td>{entry.ticketCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
