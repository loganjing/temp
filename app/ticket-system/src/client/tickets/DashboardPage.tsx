import { useState } from 'react'
import { statsApi } from '../platform/api-client'
import { useAsync } from '../platform/hooks'
import { PRIORITY_LABELS, PRIORITY_ORDER, STATUS_LABELS } from '../platform/labels'
import type { CurrentUser, TicketStatus } from '../platform/types'
import { ErrorBanner, Skeleton } from '../platform/ui'

export default function DashboardPage({ user }: { user: CurrentUser }) {
  const [dimension, setDimension] = useState<'company' | 'department'>('company')
  const dashboard = useAsync(() => statsApi.dashboard({ companyId: user.companyId ?? undefined }), [user.companyId])
  const distribution = useAsync(() => statsApi.distribution(dimension), [dimension])

  return (
    <div className="admin-grid">
      <section className="card">
        <div className="section-heading">
          <h2>运营指标 / Dashboard</h2>
        </div>
        {dashboard.loading ? <Skeleton lines={2} /> : dashboard.error ? <ErrorBanner message={dashboard.error} /> : dashboard.data ? (
          <div className="kpi-row">
            <div className="kpi"><span className="kpi-value">{dashboard.data.totalTickets}</span><span className="muted">工单总量</span></div>
            <div className="kpi"><span className="kpi-value">{dashboard.data.pendingTickets}</span><span className="muted">待处理</span></div>
            <div className="kpi"><span className="kpi-value">{dashboard.data.completedTickets}</span><span className="muted">已完成</span></div>
            <div className="kpi"><span className="kpi-value">{dashboard.data.averageResponseTimeMinutes.toFixed(1)}</span><span className="muted">平均响应(分钟)</span></div>
            <div className="kpi"><span className="kpi-value">{dashboard.data.averageSatisfactionScore.toFixed(2)}</span><span className="muted">平均满意度</span></div>
          </div>
        ) : null}

        {dashboard.data && (
          <div className="dashboard-grid">
            <div>
              <h3>优先级分布 / By priority</h3>
              <div className="table-scroll">
                <table>
                  <thead><tr><th>优先级</th><th>数量</th></tr></thead>
                  <tbody>
                    {PRIORITY_ORDER.map((priority) => (
                      <tr key={priority}><td>{PRIORITY_LABELS[priority]}</td><td>{dashboard.data!.byPriority[priority]}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <h3>热点问题分类 / Hot categories</h3>
              {dashboard.data.hotCategories.length === 0 ? <p className="muted">暂无数据</p> : (
                <div className="table-scroll">
                  <table>
                    <thead><tr><th>分类</th><th>工单量</th></tr></thead>
                    <tbody>
                      {dashboard.data.hotCategories.map((category) => (
                        <tr key={category.categoryId}><td>{category.categoryName}</td><td>{category.ticketCount}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <div className="section-heading">
          <h2>工单分布 / Distribution</h2>
          <label>维度 / Dimension
            <select value={dimension} onChange={(e) => setDimension(e.currentTarget.value as 'company' | 'department')}>
              <option value="company">公司</option>
              <option value="department">部门</option>
            </select>
          </label>
        </div>
        {distribution.loading ? <Skeleton lines={4} /> : distribution.error ? <ErrorBanner message={distribution.error} /> : distribution.data && distribution.data.items.length > 0 ? (
          <div className="table-scroll">
            <table>
              <thead><tr><th>{dimension === 'company' ? '公司' : '部门'}</th><th>总数</th>{(Object.keys(STATUS_LABELS) as TicketStatus[]).map((status) => <th key={status}>{STATUS_LABELS[status]}</th>)}</tr></thead>
              <tbody>
                {distribution.data.items.map((item) => (
                  <tr key={item.dimensionId}>
                    <td>{item.dimensionName}</td>
                    <td>{item.ticketCount}</td>
                    {(Object.keys(STATUS_LABELS) as TicketStatus[]).map((status) => <td key={status}>{item.byStatus[status]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="muted">暂无数据 / No data</p>}
      </section>
    </div>
  )
}
