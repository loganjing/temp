import { useEffect, useState } from 'react'
import { ticketApi, type DistributionDimension, type DistributionResponse, type DashboardData } from '../api/ticket-api'

export default function Statistics() {
  const [dimension, setDimension] = useState<DistributionDimension>('company')
  const [distribution, setDistribution] = useState<DistributionResponse | null>(null)
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    Promise.all([
      ticketApi.getDistribution(dimension),
      ticketApi.getDashboard(),
    ])
      .then(([dist, dash]) => {
        if (cancelled) return
        setDistribution(dist)
        setDashboard(dash)
      })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : '加载统计数据失败') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [dimension])

  if (loading) return <div className="card"><p style={{ color: 'var(--muted)' }}>加载统计数据…</p></div>
  if (error) return <div className="card"><p className="error">{error}</p></div>

  const maxCount = distribution?.items.reduce((max, item) => Math.max(max, item.count), 0) ?? 1

  return (
    <div className="admin-grid">
      {/* Dashboard metrics */}
      {dashboard && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
          <section className="card">
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: 0 }}>工单总量</p>
            <p style={{ fontSize: '1.75rem', fontWeight: 700, margin: '0.25rem 0 0' }}>{dashboard.ticketCount}</p>
          </section>
          <section className="card">
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: 0 }}>平均响应时间</p>
            <p style={{ fontSize: '1.75rem', fontWeight: 700, margin: '0.25rem 0 0' }}>
              {dashboard.avgResponseTime.toFixed(1)}<span style={{ fontSize: '0.9rem', color: 'var(--muted)' }}> 小时</span>
            </p>
          </section>
          <section className="card">
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: 0 }}>满意度</p>
            <p style={{ fontSize: '1.75rem', fontWeight: 700, margin: '0.25rem 0 0' }}>
              {dashboard.satisfactionRate.toFixed(0)}<span style={{ fontSize: '0.9rem', color: 'var(--muted)' }}> %</span>
            </p>
          </section>
        </div>
      )}

      {/* Distribution */}
      <section className="card">
        <div className="section-heading" style={{ marginBottom: '0.75rem' }}>
          <h2 style={{ margin: 0 }}>工单分布</h2>
          <div className="row-actions">
            <button className={dimension === 'company' ? '' : 'secondary'} onClick={() => setDimension('company')}>按公司</button>
            <button className={dimension === 'department' ? '' : 'secondary'} onClick={() => setDimension('department')}>按部门</button>
          </div>
        </div>
        {!distribution || distribution.items.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>暂无分布数据</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {distribution.items.map((item) => (
              <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ minWidth: '100px', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.label}>
                  {item.label}
                </span>
                <div style={{ flex: 1, height: '24px', background: 'var(--page)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${(item.count / maxCount) * 100}%`,
                    height: '100%',
                    background: 'var(--accent)',
                    borderRadius: '4px',
                    transition: 'width 0.3s ease',
                    minWidth: '2px',
                  }} />
                </div>
                <span style={{ minWidth: '40px', textAlign: 'right', fontSize: '0.85rem', fontWeight: 600 }}>{item.count}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Hot categories */}
      {dashboard && (
        <section className="card">
          <h2 style={{ margin: '0 0 0.75rem' }}>热点问题分类</h2>
          {dashboard.hotCategories.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>暂无热点数据</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead><tr><th>分类</th><th>工单数</th></tr></thead>
                <tbody>
                  {dashboard.hotCategories.map((cat) => (
                    <tr key={cat.category}>
                      <td><strong>{cat.category}</strong></td>
                      <td>{cat.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
