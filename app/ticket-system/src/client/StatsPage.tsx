// 统计页：公司/部门分布与运营指标仪表盘（工单量、平均响应时间、满意度、热点问题）。
import { useEffect, useState } from 'react'
import { ChartColumn, Clock, Flame, Inbox, Star } from 'lucide-react'
import { apiDashboard, apiDistribution, apiListTickets } from './api'
import type { CompanyRef, DashboardResponse, StatsDimension } from './contracts'
import { formatDuration } from './labels'
import { apiErrorMessage, EmptyState, ErrorBanner, ListSkeleton, Skeleton } from './shared'

export function StatsPage() {
  const [dimension, setDimension] = useState<StatsDimension>('company')
  const [companyId, setCompanyId] = useState('')
  const [companies, setCompanies] = useState<CompanyRef[]>([])
  const [items, setItems] = useState<{ key: string; count: number }[]>([])
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 公司筛选选项来自可见工单集合（与统计范围一致的并集）。
  useEffect(() => {
    let cancelled = false
    void apiListTickets({})
      .then((result) => {
        if (cancelled) return
        const seen = new Map<number, string>()
        for (const ticket of result.tickets) seen.set(ticket.company.id, ticket.company.name)
        setCompanies(
          [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
        )
      })
      .catch(() => {
        // 主体统计请求失败会单独展示；此处仅影响公司筛选下拉。
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const cid = companyId ? Number(companyId) : undefined
    let cancelled = false
    setLoading(true)
    setError('')
    void Promise.all([apiDistribution(dimension, cid), apiDashboard(cid)])
      .then(([distribution, dash]) => {
        if (cancelled) return
        setItems(distribution.items)
        setDashboard(dash)
      })
      .catch((cause) => {
        if (!cancelled) setError(apiErrorMessage(cause, '统计数据加载失败'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [dimension, companyId])

  const maxCount = Math.max(1, ...items.map((item) => item.count))

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">统计分析</h1>
          <p className="text-xs text-slate-500">统计范围为当前身份可见的工单（业务组所辖与本公司管理员范围取并集）。</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-300 bg-white p-0.5" role="tablist" aria-label="统计维度">
            <button
              type="button"
              role="tab"
              aria-selected={dimension === 'company'}
              className={`dimension-tab ${dimension === 'company' ? 'dimension-tab-active' : ''}`}
              onClick={() => setDimension('company')}
            >
              按公司
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={dimension === 'department'}
              className={`dimension-tab ${dimension === 'department' ? 'dimension-tab-active' : ''}`}
              onClick={() => setDimension('department')}
            >
              按部门
            </button>
          </div>
          <select className="input w-44" aria-label="按公司筛选" value={companyId} onChange={(event) => setCompanyId(event.currentTarget.value)}>
            <option value="">全部公司</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>
      </header>

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="rounded-xl border border-slate-200 bg-white p-5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-3 h-8 w-16" />
            </div>
          ))}
        </div>
      ) : (
        dashboard != null && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard icon={<Inbox className="h-5 w-5 text-blue-600" />} label="工单量" value={String(dashboard.volume)} description="统计范围内工单总数" />
            <MetricCard
              icon={<Clock className="h-5 w-5 text-indigo-600" />}
              label="平均响应时间"
              value={formatDuration(dashboard.avgResponseSeconds)}
              description="创建至处理端首次回复的均值"
            />
            <MetricCard
              icon={<Star className="h-5 w-5 text-amber-500" />}
              label="满意度"
              value={dashboard.satisfactionAvg != null ? `${dashboard.satisfactionAvg.toFixed(1)} / 5` : '暂无评价'}
              description={`已完成且已评价 ${dashboard.ratedCount} 单`}
            />
            <MetricCard
              icon={<Flame className="h-5 w-5 text-orange-600" />}
              label="热点问题 TOP1"
              value={dashboard.hotCategories[0] ? `${dashboard.hotCategories[0].category}（${dashboard.hotCategories[0].count}）` : '暂无数据'}
              description="按问题分类的工单量排名"
            />
          </div>
        )
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="section-title flex items-center gap-1.5">
            <ChartColumn className="h-4 w-4 text-slate-400" />
            {dimension === 'company' ? '工单按公司分布' : '工单按提交人部门分布'}
          </h2>
          {loading ? (
            <ListSkeleton rows={4} />
          ) : items.length === 0 ? (
            <EmptyState title="暂无分布数据" description="统计范围内暂无工单，提交或分配工单后可查看分布。" />
          ) : (
            <ul className="space-y-2.5">
              {items.map((item) => (
                <li key={item.key}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-slate-700" title={item.key}>
                      {item.key}
                    </span>
                    <span className="shrink-0 font-medium text-slate-900">{item.count}</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100">
                    <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${Math.max(4, Math.round((item.count / maxCount) * 100))}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h2 className="section-title flex items-center gap-1.5">
            <Flame className="h-4 w-4 text-slate-400" />
            热点问题（按分类工单量，前 10）
          </h2>
          {loading ? (
            <ListSkeleton rows={4} />
          ) : !dashboard || dashboard.hotCategories.length === 0 ? (
            <EmptyState title="暂无分类数据" description="统计范围内暂无工单。" />
          ) : (
            <ul className="space-y-2.5">
              {dashboard.hotCategories.map((item, index) => (
                <li key={item.category} className="flex items-center gap-3 text-sm">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-500">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-slate-700" title={item.category}>
                    {item.category}
                  </span>
                  <span className="shrink-0 font-medium text-slate-900">{item.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}

function MetricCard({ icon, label, value, description }: { icon: React.ReactNode; label: string; value: string; description: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{description}</p>
    </div>
  )
}
