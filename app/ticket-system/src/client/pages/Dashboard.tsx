import { useState } from 'react'
import { useDashboard } from '../hooks/useDashboard'

export default function Dashboard() {
  const [dimension, setDimension] = useState('company')
  const { stats, distribution, loading, error } = useDashboard(dimension)

  const maxCount = distribution.length > 0 ? Math.max(...distribution.map(d => d.count)) : 0

  if (loading) return <main className="shell"><p>加载中…</p></main>
  if (error) return <main className="shell"><p className="error">{error}</p></main>
  if (!stats) return <main className="shell"><p>暂无数据</p></main>

  return (
    <main className="shell">
      <div className="dashboard">
        {/* KPI cards */}
        <div className="kpi-cards">
          <div className="kpi-card">
            <span className="kpi-value">{stats.totalTickets}</span>
            <span className="kpi-label">工单总量</span>
          </div>
          <div className="kpi-card">
            <span className="kpi-value">{stats.pendingCount}</span>
            <span className="kpi-label">待处理</span>
          </div>
          <div className="kpi-card">
            <span className="kpi-value">{stats.completedCount}</span>
            <span className="kpi-label">已完成</span>
          </div>
          <div className="kpi-card">
            <span className="kpi-value">{stats.avgResponseTime.toFixed(1)}s</span>
            <span className="kpi-label">平均响应时间</span>
          </div>
          <div className="kpi-card">
            <span className="kpi-value">{stats.satisfactionScore.toFixed(1)}/5</span>
            <span className="kpi-label">满意度</span>
          </div>
        </div>

        {/* Distribution */}
        <section className="card dashboard-section">
          <div className="section-heading">
            <h2>工单分布</h2>
            <div className="dimension-toggle">
              <button className={dimension === 'company' ? '' : 'secondary'} onClick={() => setDimension('company')}>公司</button>
              <button className={dimension === 'department' ? '' : 'secondary'} onClick={() => setDimension('department')}>部门</button>
            </div>
          </div>
          {distribution.length > 0 ? (
            <div className="distribution-bars">
              {distribution.map(d => (
                <div key={d.label} className="dist-bar">
                  <span className="dist-label" title={d.label}>{d.label}</span>
                  <div className="dist-bar-track">
                    <div className="dist-bar-fill" style={{ width: `${maxCount > 0 ? (d.count / maxCount) * 100 : 0}%` }} />
                  </div>
                  <span className="dist-count">{d.count}</span>
                </div>
              ))}
            </div>
          ) : <p className="subtext">暂无分布数据</p>}
        </section>

        {/* Hot categories */}
        <section className="card dashboard-section">
          <div className="section-heading"><h2>热点问题排名</h2></div>
          {stats.hotCategories.length > 0 ? (
            <div className="table-scroll">
              <table>
                <thead><tr><th>排名</th><th>分类</th><th>工单数</th></tr></thead>
                <tbody>
                  {stats.hotCategories.map((c, i) => (
                    <tr key={c.categoryId}>
                      <td>{i + 1}</td>
                      <td><strong>{c.categoryName}</strong></td>
                      <td>{c.ticketCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="subtext">暂无热点数据</p>}
        </section>
      </div>
    </main>
  )
}
