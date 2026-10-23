import { useCallback, useEffect, useState } from 'react'
import { getDashboard, getDistribution, getCompanies } from '../platform/ticket-api'
import type { DashboardStats, DistributionResult, DistributionItem, Company, TicketStatus } from '../types'
import { Skeleton, EmptyState, ErrorState, Badge } from '../components/Feedback'

const STATUS_LABELS: Record<string, string> = {
  created: '创建', pending_assignment: '待分配', pending_processing: '待处理', completed: '已完成', cancelled: '已取消',
}
const PRIORITY_LABELS: Record<string, string> = { P0: 'P0 紧急', P1: 'P1 高', P2: 'P2 中', P3: 'P3 普通', P4: 'P4 低' }
const STATUSES: TicketStatus[] = ['created', 'pending_assignment', 'pending_processing', 'completed', 'cancelled']

function fmtDuration(ms: number | null): string {
  if (ms == null) return '—'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  if (h > 0) return `${h}h ${m}m`
  const s = Math.floor((ms % 60000) / 1000)
  return `${m}m ${s}s`
}

export default function StatsPage() {
  const [dashboard, setDashboard] = useState<DashboardStats | null>(null)
  const [dist, setDist] = useState<DistributionResult | null>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dimension, setDimension] = useState<'company' | 'department'>('company')
  const [companyFilter, setCompanyFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [dash, distribution] = await Promise.all([
        getDashboard({ company_id: companyFilter || undefined }),
        getDistribution({ dimension, company_id: companyFilter || undefined }),
      ])
      setDashboard(dash)
      setDist(distribution)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [dimension, companyFilter])

  useEffect(() => { void getCompanies().then((r) => setCompanies(r.companies)).catch(() => {}) }, [])
  useEffect(() => { void load() }, [load])

  if (loading) return <Skeleton lines={6} />
  if (error) return <ErrorState message={error} onRetry={() => void load()} />
  if (!dashboard || !dist) return <EmptyState title="暂无统计数据" />

  return (
    <div className="stack">
      <div className="section-heading">
        <h2>统计仪表盘</h2>
        <div className="row-actions">
          <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
            <option value="">全部公司</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">工单总量</div>
          <div className="kpi-value">{dashboard.total_tickets}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">平均响应时间</div>
          <div className="kpi-value">{fmtDuration(dashboard.avg_response_time_ms)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">满意度 ({dashboard.satisfaction_count})</div>
          <div className="kpi-value">{dashboard.avg_satisfaction != null ? `${dashboard.avg_satisfaction.toFixed(1)} ⭐` : '—'}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">热点问题</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.5rem' }}>
            {dashboard.hot_categories.length === 0 ? <span className="subtext">暂无数据</span> : dashboard.hot_categories.map((c) => (
              <div key={c.category_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span>{c.category_name}</span><Badge variant="info">{c.count}</Badge>
              </div>
            ))}
          </div>
        </div>
      </div>

      <section className="card">
        <h3 style={{ marginTop: 0 }}>状态分布</h3>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {STATUSES.map((s) => (
            <Badge key={s} variant={s === 'completed' ? 'success' : s === 'cancelled' ? 'danger' : 'info'}>
              {STATUS_LABELS[s]}: {dashboard.by_status[s] ?? 0}
            </Badge>
          ))}
        </div>
      </section>

      <section className="card">
        <h3 style={{ marginTop: 0 }}>优先级分布</h3>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {(['P0', 'P1', 'P2', 'P3', 'P4'] as const).map((p) => (
            <Badge key={p} variant={p === 'P0' || p === 'P1' ? 'danger' : p === 'P2' ? 'warning' : 'neutral'}>
              {PRIORITY_LABELS[p]}: {dashboard.by_priority[p] ?? 0}
            </Badge>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="section-heading">
          <h3 style={{ margin: 0 }}>{dimension === 'company' ? '公司' : '部门'}维度分布</h3>
          <div className="row-actions">
            <button className={`secondary${dimension === 'company' ? '' : ' ghost'}`} onClick={() => setDimension('company')}>按公司</button>
            <button className={`secondary${dimension === 'department' ? '' : ' ghost'}`} onClick={() => setDimension('department')}>按部门</button>
          </div>
        </div>
        {dist.items.length === 0 ? <EmptyState title="暂无分布数据" /> : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{dimension === 'company' ? '公司' : '部门'}</th>
                  <th>总量</th>
                  {STATUSES.map((s) => <th key={s}>{STATUS_LABELS[s]}</th>)}
                </tr>
              </thead>
              <tbody>{dist.items.map((item: DistributionItem) => (
                <tr key={item.key}>
                  <td>{item.label}</td>
                  <td><strong>{item.total}</strong></td>
                  {STATUSES.map((s) => <td key={s}>{item.by_status[s] ?? 0}</td>)}
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
