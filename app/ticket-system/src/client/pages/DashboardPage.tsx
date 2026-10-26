import { useState } from 'react'
import { apiRequest, buildQuery } from '../platform/api-client'
import { useAsync } from '../hooks/useAsync'
import { Skeleton, EmptyState, ErrorState } from '../components/StateViews'
import type { DashboardStats, Distribution } from '../types/ticket'

// 统计仪表盘：KPI 卡片、工单分布图表、热点问题列表。
export default function DashboardPage() {
  const [companyId, setCompanyId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [groupBy, setGroupBy] = useState<'company' | 'department'>('company')

  const dashboardQuery = buildQuery({ company_id: companyId, department_id: departmentId })
  const distributionQuery = buildQuery({ group_by: groupBy, company_id: companyId })

  const dashboardState = useAsync<DashboardStats>(
    () => apiRequest(`/api/stats/dashboard${dashboardQuery}`),
    [dashboardQuery],
  )
  const distributionState = useAsync<Distribution>(
    () => apiRequest(`/api/stats/distribution${distributionQuery}`),
    [distributionQuery],
  )

  return (
    <div className="flex flex-col gap-4">
      <section className="card">
        <div className="section-heading"><h2>筛选</h2></div>
        <div className="form-grid">
          <label>公司 ID（可选）<input value={companyId} onChange={(e) => setCompanyId(e.currentTarget.value)} /></label>
          <label>部门 ID（可选）<input value={departmentId} onChange={(e) => setDepartmentId(e.currentTarget.value)} /></label>
          <label>分布维度
            <select value={groupBy} onChange={(e) => setGroupBy(e.currentTarget.value as 'company' | 'department')}>
              <option value="company">按公司</option>
              <option value="department">按部门</option>
            </select>
          </label>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <KpiCard title="工单量" value={dashboardState.data?.ticket_count} loading={dashboardState.loading} />
        <KpiCard title="平均响应时间（小时）" value={dashboardState.data?.avg_response_time_hours} loading={dashboardState.loading} />
        <KpiCard title="平均满意度" value={dashboardState.data?.avg_satisfaction} loading={dashboardState.loading} />
      </section>

      <section className="card">
        <div className="section-heading"><h2>工单分布</h2></div>
        {distributionState.loading && <Skeleton lines={4} />}
        {distributionState.error && <ErrorState message={distributionState.error} onRetry={distributionState.reload} />}
        {distributionState.data && distributionState.data.distribution.length === 0 && <EmptyState title="暂无分布数据" />}
        {distributionState.data && distributionState.data.distribution.length > 0 && (
          <DistributionBars distribution={distributionState.data.distribution} />
        )}
      </section>

      <section className="card">
        <div className="section-heading"><h2>热点问题（Top 10）</h2></div>
        {dashboardState.loading && <Skeleton lines={5} />}
        {dashboardState.error && <ErrorState message={dashboardState.error} onRetry={dashboardState.reload} />}
        {dashboardState.data && dashboardState.data.hot_topics.length === 0 && <EmptyState title="暂无热点问题" />}
        {dashboardState.data && dashboardState.data.hot_topics.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead><tr><th>分类</th><th>工单数</th></tr></thead>
              <tbody>{dashboardState.data.hot_topics.map((topic) => (
                <tr key={topic.category}>
                  <td>{topic.category}</td>
                  <td>{topic.count}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function KpiCard({ title, value, loading }: { title: string; value: number | undefined; loading: boolean }) {
  return (
    <div className="card">
      <p className="text-sm text-[var(--muted)]">{title}</p>
      {loading ? <Skeleton lines={1} /> : <p className="mt-1 text-2xl font-semibold">{value === undefined ? '—' : value.toFixed(2)}</p>}
    </div>
  )
}

function DistributionBars({ distribution }: { distribution: { dimension: string; count: number }[] }) {
  const max = Math.max(...distribution.map((d) => d.count), 1)
  return (
    <div className="flex flex-col gap-2">
      {distribution.map((item) => (
        <div key={item.dimension} className="flex items-center gap-3">
          <span className="w-32 truncate text-sm" title={item.dimension}>{item.dimension}</span>
          <div className="h-5 flex-1 overflow-hidden rounded bg-[var(--border)]">
            <div className="h-full rounded bg-[var(--accent)]" style={{ width: `${(item.count / max) * 100}%` }} />
          </div>
          <span className="w-10 text-right text-sm">{item.count}</span>
        </div>
      ))}
    </div>
  )
}
