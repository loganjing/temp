import { BarChart3, Building2, Clock, Flame, Star, Ticket, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { fetchDashboard } from '../api/endpoints'
import type { DashboardStats } from '../api/types'
import { ErrorBanner, SkeletonBlock } from '../components/feedback'
import { PageHeader } from '../components/layout'

type Dimension = 'company' | 'department'

// 统计仪表盘：KPI + 热点分类 + 公司/部门分布；维度切换与过滤由前端基于聚合数据完成。
export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dimension, setDimension] = useState<Dimension>('company')
  const [companyFilter, setCompanyFilter] = useState<{ id: number; name: string } | null>(null)
  const [departmentFilter, setDepartmentFilter] = useState<string | null>(null)

  const reload = useCallback(
    async (companyId: number | null, department: string | null) => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetchDashboard({
          companyId: companyId ?? undefined,
          department: department ?? undefined,
        })
        setStats(response)
      } catch (err) {
        setStats(null)
        setError(err instanceof Error ? err.message : '加载统计数据失败')
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    void reload(companyFilter?.id ?? null, departmentFilter)
  }, [reload, companyFilter, departmentFilter])

  const toggleCompanyFilter = (companyId: number, companyName: string) => {
    setCompanyFilter((previous) => (previous?.id === companyId ? null : { id: companyId, name: companyName }))
  }

  const satisfaction = stats?.satisfaction
  const hotCategories = stats?.hotCategories ?? []
  const hotMax = hotCategories.length > 0 ? Math.max(...hotCategories.map((item) => item.count)) : 0
  const byCompany = stats?.byCompany ?? []
  const byDepartment = stats?.byDepartment ?? []
  const companyMax = byCompany.length > 0 ? Math.max(...byCompany.map((item) => item.count)) : 0
  const departmentMax = byDepartment.length > 0 ? Math.max(...byDepartment.map((item) => item.count)) : 0

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader
        title="统计仪表盘"
        subtitle="工单量、平均响应时间、满意度与热点问题运营指标；支持按公司/部门维度切换与联动"
        actions={
          companyFilter !== null || departmentFilter !== null ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {companyFilter !== null ? (
                <button
                  type="button"
                  onClick={() => setCompanyFilter(null)}
                  className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs text-indigo-700 transition-colors hover:bg-indigo-100"
                >
                  公司：{companyFilter.name}
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              ) : null}
              {departmentFilter !== null ? (
                <button
                  type="button"
                  onClick={() => setDepartmentFilter(null)}
                  className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs text-indigo-700 transition-colors hover:bg-indigo-100"
                >
                  部门：{departmentFilter}
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          ) : null
        }
      />

      <div className="mx-auto max-w-6xl space-y-5 px-6 py-5">
        {error !== null ? (
          <ErrorBanner message={error} retrying={loading} onRetry={() => void reload(companyFilter?.id ?? null, departmentFilter)} />
        ) : null}

        {loading && stats === null && error === null ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" role="status" aria-label="统计加载中">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
                <SkeletonBlock className="h-3 w-16" />
                <SkeletonBlock className="h-7 w-20" />
                <SkeletonBlock className="h-3 w-24" />
              </div>
            ))}
          </div>
        ) : null}

        {stats !== null ? (
          <>
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="核心指标">
              <KpiCard
                icon={Ticket}
                label="工单量"
                value={String(stats.volume)}
                hint="统计范围内工单总数"
              />
              <KpiCard
                icon={Clock}
                label="平均响应时间"
                value={stats.avgResponseMinutes == null ? '暂无数据' : `${stats.avgResponseMinutes.toFixed(1)} 分钟`}
                hint="创建 → 首条回复的平均时长"
              />
              <KpiCard
                icon={Star}
                label="满意度"
                value={satisfaction?.average == null ? '暂无评价' : `${satisfaction.average.toFixed(2)} / 5`}
                hint={`已评价 ${satisfaction?.ratedCount ?? 0} 单`}
              />
              <KpiCard
                icon={Flame}
                label="热点问题"
                value={hotCategories.length > 0 ? hotCategories[0].categoryName : '暂无数据'}
                hint={hotCategories.length > 0 ? `${hotCategories[0].categoryName} ${hotCategories[0].count} 单，居分类首位` : '按分类聚合的工单量排名'}
              />
            </section>

            <section className="rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-4 py-3">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">热点问题 · 按分类工单量排名（前 5）</h2>
              </div>
              {hotCategories.length === 0 ? (
                <p className="px-4 py-8 text-center text-xs text-slate-400">统计范围内暂无工单数据。</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {hotCategories.map((item, index) => (
                    <li key={item.categoryId} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="w-5 shrink-0 text-center text-xs font-medium text-slate-400">{index + 1}</span>
                      <span className="w-32 shrink-0 truncate text-sm text-slate-700" title={item.categoryName}>
                        {item.categoryName}
                      </span>
                      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                        <div
                          className="h-full rounded-full bg-indigo-500"
                          style={{ width: hotMax > 0 ? `${Math.round((item.count / hotMax) * 100)}%` : '0%' }}
                        />
                      </div>
                      <span className="w-14 shrink-0 text-right text-xs tabular-nums text-slate-600">{item.count} 单</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-lg border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">工单分布</h2>
                <div className="flex items-center gap-1" role="tablist" aria-label="分布维度切换">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={dimension === 'company'}
                    onClick={() => setDimension('company')}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      dimension === 'company' ? 'bg-indigo-600 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    按公司
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={dimension === 'department'}
                    onClick={() => setDimension('department')}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      dimension === 'department' ? 'bg-indigo-600 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    按部门
                  </button>
                </div>
              </div>

              {dimension === 'company' ? (
                byCompany.length === 0 ? (
                  <p className="px-4 py-8 text-center text-xs text-slate-400">暂无公司维度数据。</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                        <th scope="col" className="px-4 py-2.5 font-medium">公司</th>
                        <th scope="col" className="px-4 py-2.5 font-medium">工单量</th>
                        <th scope="col" className="px-4 py-2.5 font-medium">占比</th>
                        <th scope="col" className="px-4 py-2.5 text-right font-medium">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {byCompany.map((item) => {
                        const percentage = stats.volume > 0 ? Math.round((item.count / stats.volume) * 100) : 0
                        return (
                          <tr key={item.companyId} className="hover:bg-slate-50/60">
                            <td className="px-4 py-2.5">
                              <span className="inline-flex items-center gap-1.5 text-slate-700">
                                <Building2 className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                                {item.companyName}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                                  <div
                                    className="h-full rounded-full bg-indigo-500"
                                    style={{ width: companyMax > 0 ? `${Math.round((item.count / companyMax) * 100)}%` : '0%' }}
                                  />
                                </div>
                                <span className="text-xs tabular-nums text-slate-600">{item.count} 单</span>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-slate-500">{percentage}%</td>
                            <td className="px-4 py-2.5 text-right">
                              <button
                                type="button"
                                onClick={() => toggleCompanyFilter(item.companyId, item.companyName)}
                                className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                                  companyFilter?.id === item.companyId
                                    ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                                }`}
                              >
                                {companyFilter?.id === item.companyId ? '取消筛选' : '按此公司过滤'}
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )
              ) : byDepartment.length === 0 ? (
                <p className="px-4 py-8 text-center text-xs text-slate-400">暂无部门维度数据。</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                      <th scope="col" className="px-4 py-2.5 font-medium">公司</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">部门（提交人所属）</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">工单量</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {byDepartment.map((item) => (
                      <tr
                        key={`${item.companyId}-${item.department}`}
                        className={`hover:bg-slate-50/60 ${departmentFilter === item.department ? 'bg-indigo-50/40' : ''}`}
                      >
                        <td className="px-4 py-2.5 text-slate-700">{item.companyName}</td>
                        <td className="px-4 py-2.5 text-slate-700">{item.department}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                              <div
                                className="h-full rounded-full bg-indigo-500"
                                style={{
                                  width: departmentMax > 0 ? `${Math.round((item.count / departmentMax) * 100)}%` : '0%',
                                }}
                              />
                            </div>
                            <span className="text-xs tabular-nums text-slate-600">{item.count} 单</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              setDepartmentFilter((previous) => (previous === item.department ? null : item.department))
                            }
                            className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                              departmentFilter === item.department
                                ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {departmentFilter === item.department ? '取消筛选' : '按此部门过滤'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="border-t border-slate-100 px-4 py-2.5 text-[11px] leading-4 text-slate-400">
                选择分布行中的过滤操作后，上方全部指标将按所选公司/部门联动刷新（共 {stats.volume} 单）。
              </p>
            </section>
          </>
        ) : null}

        {loading && stats !== null ? (
          <p className="flex items-center gap-2 text-xs text-slate-400" role="status">
            <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
            正在刷新统计数据…
          </p>
        ) : null}
      </div>
    </div>
  )
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Ticket
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-slate-400">
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="mt-2 text-xl font-semibold tabular-nums text-slate-900">{value}</p>
      <p className="mt-1 text-[11px] leading-4 text-slate-400">{hint}</p>
    </div>
  )
}
