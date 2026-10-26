import { useCallback, useEffect, useState } from 'react'
import * as api from './api'
import type { DashboardData, DistributionData } from './types'
import { ErrorCard, SectionCard, Skeleton, formatTime } from './ui'

export default function StatisticsPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [distribution, setDistribution] = useState<DistributionData | null>(null)
  const [dimension, setDimension] = useState<'company' | 'department'>('company')
  const [companyId, setCompanyId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [dash, dist] = await Promise.all([
        api.getDashboard(companyId.trim() || undefined),
        api.getDistribution(dimension, companyId.trim() || undefined),
      ])
      setDashboard(dash)
      setDistribution(dist)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '统计加载失败 / Failed to load statistics')
    } finally {
      setLoading(false)
    }
  }, [dimension, companyId])

  useEffect(() => {
    void load()
  }, [load])

  const maxCount = distribution ? Math.max(1, ...distribution.items.map((i) => i.ticketCount)) : 1

  return (
    <div className="admin-grid">
      <SectionCard title="统计仪表盘 / Dashboard">
        <div className="form-grid">
          <label>维度 / Dimension
            <select value={dimension} onChange={(e) => setDimension(e.target.value as 'company' | 'department')}>
              <option value="company">按公司 / By company</option>
              <option value="department">按部门 / By department</option>
            </select>
          </label>
          <label>公司 ID 筛选 / Company filter（可选）
            <input value={companyId} onChange={(e) => setCompanyId(e.target.value)} placeholder="公司 ID" />
          </label>
          <div style={{ alignSelf: 'end' }}>
            <button className="secondary" onClick={() => void load()}>刷新 / Refresh</button>
          </div>
        </div>
      </SectionCard>

      {loading ? (
        <Skeleton lines={4} />
      ) : error ? (
        <ErrorCard message={error} onRetry={() => void load()} />
      ) : dashboard ? (
        <>
          <div className="kpi-row">
            <section className="card kpi-card">
              <div className="kpi-label">工单量 / Total tickets</div>
              <div className="kpi-value">{dashboard.totalTickets}</div>
            </section>
            <section className="card kpi-card">
              <div className="kpi-label">平均响应时间(小时) / Avg response (h)</div>
              <div className="kpi-value">{dashboard.avgResponseTimeHours.toFixed(1)}</div>
            </section>
            <section className="card kpi-card">
              <div className="kpi-label">满意度 / Satisfaction</div>
              <div className="kpi-value">{dashboard.avgSatisfaction === null ? '—' : `${dashboard.avgSatisfaction.toFixed(1)} / 5`}</div>
            </section>
          </div>

          <SectionCard title="热点问题 / Hot categories">
            {dashboard.hotCategories.length === 0 ? (
              <p className="subtext">暂无数据 / No data</p>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead><tr><th>分类 / Category</th><th>工单量 / Count</th></tr></thead>
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
          </SectionCard>

          <SectionCard title={`工单分布 / Distribution（${dimension === 'company' ? '公司' : '部门'}）`}>
            {!distribution || distribution.items.length === 0 ? (
              <p className="subtext">暂无数据 / No data</p>
            ) : (
              distribution.items.map((item) => (
                <div key={item.key} className="dist-row">
                  <span>{item.label}</span>
                  <div className="dist-bar">
                    <span style={{ width: `${(item.ticketCount / maxCount) * 100}%` }} />
                  </div>
                  <span className="subtext">{item.ticketCount}</span>
                </div>
              ))
            )}
          </SectionCard>
        </>
      ) : null}

      <p className="subtext">最近更新 / Updated: {formatTime(new Date().toISOString())}</p>
    </div>
  )
}
