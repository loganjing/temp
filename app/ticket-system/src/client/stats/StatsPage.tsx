import { useMemo, useState } from 'react'
import { readList } from '../platform/api-client'
import { useApiResource } from '../platform/use-api'
import { useSession } from '../platform/session'
import { EmptyState, ErrorNotice, LoadingBlock } from '../components/Feedback'
import { daysAgo, formatDate, formatMinutes, formatRatio, toDateInput } from '../tickets/format'
import type { Company, StatsDashboard, StatsDistribution } from '../tickets/types'
import { priorityLabels, statusLabels } from '../tickets/types'

type ListResponse<T> = T[] | { items: T[] }
type RangePreset = '7' | '30' | '90' | 'custom'

const rangeOptions: { value: RangePreset; label: string }[] = [
  { value: '7', label: '最近 7 天' },
  { value: '30', label: '最近 30 天' },
  { value: '90', label: '最近 90 天' },
  { value: 'custom', label: '自定义' },
]

const presetDays: Record<Exclude<RangePreset, 'custom'>, number> = { '7': 6, '30': 29, '90': 89 }

export default function StatsPage() {
  const user = useSession()
  const isOps = user.role === 'ops'
  const [preset, setPreset] = useState<RangePreset>('30')
  const [from, setFrom] = useState(toDateInput(daysAgo(29)))
  const [to, setTo] = useState(toDateInput(new Date()))
  const [dimension, setDimension] = useState<'company' | 'department'>('company')
  const [companyId, setCompanyId] = useState('')

  const companies = useApiResource<ListResponse<Company>>(isOps ? '/api/meta/companies' : null)
  const invalidRange = Boolean(from && to && from > to)
  const effectiveCompanyId = isOps ? companyId : user.companyId

  const distributionPath = useMemo(() => {
    if (invalidRange) return null
    const params = new URLSearchParams({ dimension })
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (effectiveCompanyId) params.set('companyId', effectiveCompanyId)
    return `/api/stats/distribution?${params.toString()}`
  }, [dimension, from, to, effectiveCompanyId, invalidRange])

  const dashboardPath = useMemo(() => {
    if (invalidRange) return null
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (effectiveCompanyId) params.set('companyId', effectiveCompanyId)
    return `/api/stats/dashboard?${params.toString()}`
  }, [from, to, effectiveCompanyId, invalidRange])

  const distribution = useApiResource<StatsDistribution>(distributionPath)
  const dashboard = useApiResource<StatsDashboard>(dashboardPath)

  const choosePreset = (value: RangePreset) => {
    setPreset(value)
    if (value !== 'custom') {
      setFrom(toDateInput(daysAgo(presetDays[value])))
      setTo(toDateInput(new Date()))
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>统计分析</h1>
          <p className="page-hint">统计口径遵循当前身份的可见范围；切换时间范围后指标与分布会同步更新。</p>
        </div>
      </header>

      <section className="filter-bar card" aria-label="统计范围">
        <div className="segmented" role="group" aria-label="时间范围">
          {rangeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={preset === option.value ? 'segment active' : 'segment'}
              aria-pressed={preset === option.value}
              onClick={() => choosePreset(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <label>开始日期<input type="date" value={from} max={to || undefined} onChange={(event) => { setFrom(event.currentTarget.value); setPreset('custom') }} /></label>
        <label>结束日期<input type="date" value={to} min={from || undefined} onChange={(event) => { setTo(event.currentTarget.value); setPreset('custom') }} /></label>
        {isOps && (
          <label>公司
            <select value={companyId} onChange={(event) => setCompanyId(event.currentTarget.value)}>
              <option value="">全部公司</option>
              {readList(companies.data).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </label>
        )}
      </section>

      {invalidRange && <div className="notice notice-error" role="alert">开始日期不能晚于结束日期，请调整时间范围。</div>}

      <section aria-labelledby="dashboard-heading">
        <div className="section-heading"><h2 id="dashboard-heading">运营指标</h2><span className="subtext">{from} 至 {to}</span></div>
        {dashboard.error ? <ErrorNotice error={dashboard.error} title="运营指标加载失败" onRetry={dashboard.reload} /> : null}
        {dashboard.loading && !dashboard.data
          ? <LoadingBlock label="正在加载运营指标…" rows={3} />
          : dashboard.data && <>
            <div className="kpi-grid">
              <Kpi label="工单量" value={String(dashboard.data.ticketCount)} hint="范围内创建的工单数" />
              <Kpi label="平均响应时间" value={formatMinutes(dashboard.data.avgFirstResponseMinutes)} hint="创建至首次非提交人回复" />
              <Kpi
                label="满意度"
                value={dashboard.data.satisfaction.average === null ? '暂无评价' : `${dashboard.data.satisfaction.average.toFixed(1)} / 5`}
                hint={`${dashboard.data.satisfaction.ratedCount} 条评价`}
              />
              <Kpi
                label="热点问题"
                value={dashboard.data.hotCategories[0]?.categoryName ?? '暂无数据'}
                hint={dashboard.data.hotCategories[0] ? `${dashboard.data.hotCategories[0].count} 张工单` : '范围内暂无工单'}
              />
            </div>

            <div className="chart-grid">
              <div className="card chart-card">
                <h3>热点问题 Top 5</h3>
                {dashboard.data.hotCategories.length === 0
                  ? <EmptyState title="暂无热点问题" hint="范围内暂无工单数据。" />
                  : <BarList items={dashboard.data.hotCategories.map((item) => ({ label: item.categoryName, count: item.count }))} />}
              </div>
              <div className="card chart-card">
                <h3>状态分布</h3>
                {dashboard.data.statusBreakdown.length === 0
                  ? <EmptyState title="暂无状态数据" />
                  : <BarList items={dashboard.data.statusBreakdown.map((item) => ({ label: statusLabels[item.status] ?? item.status, count: item.count }))} />}
              </div>
              <div className="card chart-card">
                <h3>优先级分布</h3>
                {dashboard.data.priorityBreakdown.length === 0
                  ? <EmptyState title="暂无优先级数据" />
                  : <BarList items={dashboard.data.priorityBreakdown.map((item) => ({ label: priorityLabels[item.priority] ?? item.priority, count: item.count }))} />}
              </div>
            </div>
          </>}
      </section>

      <section aria-labelledby="distribution-heading">
        <div className="section-heading">
          <h2 id="distribution-heading">工单分布</h2>
          <div className="segmented" role="group" aria-label="统计维度">
            <button type="button" className={dimension === 'company' ? 'segment active' : 'segment'} aria-pressed={dimension === 'company'} onClick={() => setDimension('company')}>按公司</button>
            <button type="button" className={dimension === 'department' ? 'segment active' : 'segment'} aria-pressed={dimension === 'department'} onClick={() => setDimension('department')}>按部门</button>
          </div>
        </div>

        {distribution.error ? <ErrorNotice error={distribution.error} title="分布统计加载失败" onRetry={distribution.reload} /> : null}
        {distribution.loading && !distribution.data
          ? <LoadingBlock label="正在加载分布统计…" rows={4} />
          : distribution.data && <>
            <p className="subtext">统计范围：{formatDate(from)} 至 {formatDate(to)} · 合计 {distribution.data.total} 张工单</p>
            {distribution.data.items.length === 0
              ? <EmptyState title="暂无分布数据" hint="范围内暂无可统计的工单。" />
              : <div className="card table-card">
                <div className="table-scroll">
                  <table>
                    <caption className="sr-only">{dimension === 'company' ? '按公司' : '按部门'}维度的工单数量与占比</caption>
                    <thead><tr><th>{dimension === 'company' ? '公司' : '部门'}</th><th>工单数</th><th>占比</th><th className="ratio-cell">分布</th></tr></thead>
                    <tbody>
                      {distribution.data.items.map((item) => (
                        <tr key={item.key}>
                          <td title={item.label}>{item.label}</td>
                          <td className="numeric">{item.count}</td>
                          <td className="numeric">{formatRatio(item.ratio)}</td>
                          <td className="ratio-cell"><span className="bar" aria-hidden="true"><span style={{ width: `${Math.min(Math.max(item.ratio * 100, 0), 100)}%` }} /></span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>}
          </>}
      </section>
    </div>
  )
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="card kpi">
      <span className="kpi-label">{label}</span>
      <strong className="kpi-value">{value}</strong>
      <span className="kpi-hint">{hint}</span>
    </div>
  )
}

function BarList({ items }: { items: { label: string; count: number }[] }) {
  const max = Math.max(...items.map((item) => item.count), 1)
  return (
    <ul className="bar-list">
      {items.map((item) => (
        <li key={item.label}>
          <span className="bar-label" title={item.label}>{item.label}</span>
          <span className="bar" aria-hidden="true"><span style={{ width: `${(item.count / max) * 100}%` }} /></span>
          <span className="bar-value numeric">{item.count}</span>
        </li>
      ))}
    </ul>
  )
}
