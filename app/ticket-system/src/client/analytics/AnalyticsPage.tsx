import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { describeError } from '../platform/api-client'
import { EmptyState, ErrorState, LoadingState } from '../platform/states'
import { fetchDistribution, fetchOverview, listGroups } from '../tickets/api'
import { formatDuration, label, statusLabels } from '../tickets/labels'
import { PERMISSIONS, TICKET_STATUSES, type BusinessGroupSummary, type DistributionResponse, type MeContext, type OverviewResponse, type TicketStatus } from '../../shared/contracts'

const statusOrder: readonly TicketStatus[] = TICKET_STATUSES
const ratingScores = ['1', '2', '3', '4', '5'] as const

function dayRange(from: string, to: string) {
  return {
    from: from ? `${from}T00:00:00.000Z` : undefined,
    to: to ? `${to}T23:59:59.999Z` : undefined,
  }
}

// 统计与分析：顶部筛选 → 运营指标 → 公司与部门维度分布。
export default function AnalyticsPage({ context }: { context: MeContext }) {
  const [inputs, setInputs] = useState({ from: '', to: '', groupId: '', category: '' })
  const [applied, setApplied] = useState({ from: '', to: '', groupId: '', category: '' })
  const [overview, setOverview] = useState<OverviewResponse | null>(null)
  const [companyDistribution, setCompanyDistribution] = useState<DistributionResponse | null>(null)
  const [departmentDistribution, setDepartmentDistribution] = useState<DistributionResponse | null>(null)
  const [groups, setGroups] = useState<BusinessGroupSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const canReadGroups = context.permissions.includes(PERMISSIONS.ORG_READ)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const range = dayRange(applied.from, applied.to)
    try {
      const [overviewResult, companyResult, departmentResult] = await Promise.all([
        fetchOverview({ ...range, groupId: applied.groupId || undefined, category: applied.category.trim() || undefined }),
        fetchDistribution({ by: 'company', ...range }),
        fetchDistribution({ by: 'department', ...range }),
      ])
      setOverview(overviewResult)
      setCompanyDistribution(companyResult)
      setDepartmentDistribution(departmentResult)
    } catch (cause) {
      setError(describeError(cause, '无法加载统计结果 / Could not load analytics'))
    } finally {
      setLoading(false)
    }
  }, [applied])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!canReadGroups) return
    let cancelled = false
    void listGroups().then((result) => { if (!cancelled) setGroups(result.items) }).catch(() => undefined)
    return () => { cancelled = true }
  }, [canReadGroups])

  const submitFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setApplied({ ...inputs })
  }

  const hotMax = Math.max(1, ...(overview?.hotCategories.map((item) => item.count) ?? [1]))
  const satisfactionMax = Math.max(1, ...ratingScores.map((score) => overview?.satisfaction.distribution[score] ?? 0))

  return (
    <div className="page">
      <div className="section-heading">
        <h1>统计与分析 / Analytics</h1>
        <span className="subtext">范围：{context.companyName}</span>
      </div>

      <section className="panel">
        <form className="filters" onSubmit={submitFilters}>
          <label>开始日期 / From<input type="date" value={inputs.from} onChange={(event) => setInputs({ ...inputs, from: event.currentTarget.value })} /></label>
          <label>结束日期 / To<input type="date" value={inputs.to} onChange={(event) => setInputs({ ...inputs, to: event.currentTarget.value })} /></label>
          {canReadGroups && (
            <label>业务组 / Group
              <select value={inputs.groupId} onChange={(event) => setInputs({ ...inputs, groupId: event.currentTarget.value })}>
                <option value="">全部 / All</option>
                {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </label>
          )}
          <label>分类 / Category<input value={inputs.category} onChange={(event) => setInputs({ ...inputs, category: event.currentTarget.value })} maxLength={50} /></label>
          <div className="filter-actions">
            <button disabled={loading}>应用筛选 / Apply</button>
          </div>
        </form>
      </section>

      {loading && <LoadingState />}
      {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}

      {!loading && !error && overview && (
        <>
          <section className="panel">
            <h2>运营指标 / Operational metrics</h2>
            <div className="metrics">
              <div className="metric"><span className="subtext">工单量 / Tickets</span><b>{overview.ticketCount}</b></div>
              <div className="metric"><span className="subtext">平均响应时间 / Avg first response</span><b>{formatDuration(overview.avgFirstResponseSeconds)}</b></div>
              <div className="metric"><span className="subtext">满意度 / Satisfaction</span><b>{overview.satisfaction.average === null ? '暂无评价' : overview.satisfaction.average.toFixed(2)}</b><span className="subtext">评价数：{overview.satisfaction.count}</span></div>
            </div>

            <div className="metric-columns">
              <div>
                <h3>状态分布 / Status breakdown</h3>
                <ul className="bar-list">
                  {statusOrder.map((status) => (
                    <li key={status} className="bar">
                      <span>{label(statusLabels, status)}</span>
                      <strong>{overview.statusBreakdown[status] ?? 0}</strong>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>热点问题 / Hot categories</h3>
                {overview.hotCategories.length === 0
                  ? <p className="subtext">暂无数据。/ No data.</p>
                  : (
                    <ul className="bar-list">
                      {overview.hotCategories.map((item) => (
                        <li key={item.category} className="bar">
                          <span>{item.category}</span>
                          <span className="bar-track"><span className="bar-fill" style={{ width: `${Math.round((item.count / hotMax) * 100)}%` }} /></span>
                          <strong>{item.count}</strong>
                        </li>
                      ))}
                    </ul>
                  )}
              </div>
              <div>
                <h3>评分分布 / Rating distribution</h3>
                {overview.satisfaction.count === 0
                  ? <p className="subtext">暂无评价。/ No ratings yet.</p>
                  : (
                    <ul className="bar-list">
                      {ratingScores.map((score) => (
                        <li key={score} className="bar">
                          <span>{score} 分</span>
                          <span className="bar-track"><span className="bar-fill" style={{ width: `${Math.round(((overview.satisfaction.distribution[score] ?? 0) / satisfactionMax) * 100)}%` }} /></span>
                          <strong>{overview.satisfaction.distribution[score] ?? 0}</strong>
                        </li>
                      ))}
                    </ul>
                  )}
              </div>
            </div>
          </section>

          <section className="panel">
            <h2>分布统计 / Distribution</h2>
            <div className="metric-columns">
              <div>
                <h3>按公司 / By company</h3>
                {!companyDistribution || companyDistribution.items.length === 0
                  ? <EmptyState message="当前范围内没有工单。/ No tickets in this scope." />
                  : (
                    <table className="data-table">
                      <thead><tr><th>公司</th><th>工单数</th></tr></thead>
                      <tbody>{companyDistribution.items.map((item) => <tr key={item.key}><td>{item.name}</td><td>{item.count}</td></tr>)}</tbody>
                    </table>
                  )}
                {companyDistribution && <p className="subtext">合计：{companyDistribution.total}</p>}
              </div>
              <div>
                <h3>按部门 / By department</h3>
                {!departmentDistribution || departmentDistribution.items.length === 0
                  ? <EmptyState message="当前范围内没有工单。/ No tickets in this scope." />
                  : (
                    <table className="data-table">
                      <thead><tr><th>部门</th><th>工单数</th></tr></thead>
                      <tbody>{departmentDistribution.items.map((item) => <tr key={item.key}><td>{item.name}</td><td>{item.count}</td></tr>)}</tbody>
                    </table>
                  )}
                {departmentDistribution && <p className="subtext">合计：{departmentDistribution.total}</p>}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
