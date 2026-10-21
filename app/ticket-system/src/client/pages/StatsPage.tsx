import { useEffect, useState, type ReactNode } from 'react'
import { getDashboard, getDistribution, listCompanies } from '../api'
import { EmptyState, ErrorState, Panel, Skeleton, apiErrorMessage, formatDuration } from '../components/ui'
import { useSession } from '../session'
import {
  statusLabels,
  statuses,
  type CompanyOption,
  type DashboardStats,
  type DistributionItem,
  type StatsDimension,
} from '../types'

export default function StatsPage() {
  const { user } = useSession()
  const isOps = user.role === 'platform_ops'

  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [companyId, setCompanyId] = useState('')
  const [dimension, setDimension] = useState<StatsDimension>('company')
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [distribution, setDistribution] = useState<DistributionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!isOps) return
    void listCompanies()
      .then((result) => setCompanies(result.items))
      .catch(() => setCompanies([]))
  }, [isOps])

  useEffect(() => {
    const id = companyId === '' ? undefined : Number(companyId)
    const distributionBlocked = dimension === 'department' && isOps && id === undefined
    let cancelled = false
    setLoading(true)
    setError('')
    setStats(null)
    Promise.all([
      getDashboard(id),
      distributionBlocked ? Promise.resolve([]) : getDistribution(dimension, id).then((result) => result.items),
    ])
      .then(([dashboard, items]) => {
        if (cancelled) return
        setStats(dashboard)
        setDistribution(items)
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(apiErrorMessage(cause))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [companyId, dimension, isOps, reloadKey])

  const departmentHint = dimension === 'department' && isOps && companyId === ''

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
      {isOps && (
        <div className="panel flex flex-wrap items-center gap-3 p-3">
          <span className="text-sm font-medium text-slate-700">统计范围</span>
          <select
            className="input w-48"
            aria-label="公司范围"
            value={companyId}
            onChange={(event) => setCompanyId(event.currentTarget.value)}
          >
            <option value="">全平台（全部公司）</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-400">公司内角色固定统计本公司数据</span>
        </div>
      )}

      {error ? (
        <ErrorState message={error} onRetry={() => setReloadKey((key) => key + 1)} />
      ) : loading ? (
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="panel space-y-3 p-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-3 w-28" />
            </div>
          ))}
        </div>
      ) : stats ? (
        <>
          <div className="grid grid-cols-4 gap-4">
            <KpiCard title="工单量" value={String(stats.totalTickets)} hint="统计范围内工单总数">
              <div className="mt-2 flex flex-wrap gap-1">
                {statuses.map((status) => (
                  <span key={status} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                    {statusLabels[status]} {stats.byStatus[status]}
                  </span>
                ))}
              </div>
            </KpiCard>
            <KpiCard
              title="平均响应时间"
              value={stats.avgResponseSeconds === null ? '—' : formatDuration(stats.avgResponseSeconds)}
              hint={`${stats.respondedTickets} 张工单已响应`}
            >
              <p className="mt-2 text-xs text-slate-400">口径：创建时间至首次回复的平均时长</p>
            </KpiCard>
            <KpiCard
              title="满意度"
              value={stats.avgRating === null ? '—' : `${stats.avgRating.toFixed(2)} / 5`}
              hint={`${stats.ratedTickets} 张工单已评价`}
            >
              <p className="mt-2 text-xs text-slate-400">口径：已评价工单的评分平均（1–5）</p>
            </KpiCard>
            <KpiCard
              title="待处理占比"
              value={stats.totalTickets === 0 ? '—' : `${Math.round((stats.byStatus.processing / stats.totalTickets) * 100)}%`}
              hint={`待处理 ${stats.byStatus.processing} / ${stats.totalTickets} 张`}
            >
              <p className="mt-2 text-xs text-slate-400">口径：待处理工单占总量比例</p>
            </KpiCard>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Panel
              title="工单分布"
              actions={
                <div className="flex rounded-lg border border-slate-300 bg-white p-0.5" role="group" aria-label="分布维度">
                  {(['company', 'department'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`min-h-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        dimension === value ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                      onClick={() => setDimension(value)}
                    >
                      {value === 'company' ? '按公司' : '按部门'}
                    </button>
                  ))}
                </div>
              }
            >
              {departmentHint ? (
                <EmptyState title="请先选择公司" hint="平台运营视角查看部门维度分布时，需要先在上方选择具体公司。" />
              ) : distribution.length === 0 ? (
                <EmptyState title="暂无分布数据" hint="当前统计范围内还没有工单。" />
              ) : (
                <BarList items={distribution} />
              )}
            </Panel>

            <Panel title="热点问题（按工单量前 5）">
              {stats.topCategories.length === 0 ? (
                <EmptyState title="暂无分类数据" hint="当前统计范围内还没有工单。" />
              ) : (
                <ol className="space-y-2.5">
                  {stats.topCategories.map((category, index) => {
                    const max = stats.topCategories[0].count || 1
                    return (
                      <li key={category.categoryId} className="flex items-center gap-3 text-sm">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-medium text-slate-500">
                          {index + 1}
                        </span>
                        <span className="w-36 shrink-0 truncate text-slate-700" title={category.name}>
                          {category.name}
                        </span>
                        <div className="h-5 min-w-0 flex-1 overflow-hidden rounded bg-slate-100">
                          <div
                            className="h-full rounded bg-amber-400/80"
                            style={{ width: `${(category.count / max) * 100}%` }}
                          />
                        </div>
                        <span className="w-10 shrink-0 text-right font-medium text-slate-700">{category.count}</span>
                      </li>
                    )
                  })}
                </ol>
              )}
            </Panel>
          </div>
        </>
      ) : (
        <EmptyState title="暂无统计数据" />
      )}
    </div>
  )
}

function KpiCard({ title, value, hint, children }: { title: string; value: string; hint: string; children?: ReactNode }) {
  return (
    <div className="panel p-4">
      <p className="text-xs font-medium text-slate-400">{title}</p>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{hint}</p>
      {children}
    </div>
  )
}

function BarList({ items }: { items: DistributionItem[] }) {
  const max = Math.max(...items.map((item) => item.count), 1)
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-3 text-sm">
          <span className="w-36 shrink-0 truncate text-slate-700" title={item.label}>
            {item.label}
          </span>
          <div className="h-5 min-w-0 flex-1 overflow-hidden rounded bg-slate-100">
            <div className="h-full rounded bg-blue-500/80" style={{ width: `${(item.count / max) * 100}%` }} />
          </div>
          <span className="w-10 shrink-0 text-right font-medium text-slate-700">{item.count}</span>
        </li>
      ))}
    </ul>
  )
}
