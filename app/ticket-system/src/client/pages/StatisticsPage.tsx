import { useCallback, useEffect, useMemo, useState } from 'react'
import { statisticsApi } from '../api/statistics'
import { EmptyState, ErrorState, Skeleton } from '../components/States'
import { formatHours } from '../lib/format'
import { TICKET_STATUS_LABEL } from '../lib/constants'
import type { DashboardData, DistributionResult, TicketStatus, UserInfo } from '../types'

const STATUS_COLORS: Record<TicketStatus, string> = {
  created: '#94a3b8',
  pending_assignment: '#f59e0b',
  pending_processing: '#3b82f6',
  completed: '#10b981',
  cancelled: '#f43f5e',
}

export function StatisticsPage({ user }: { user: UserInfo }) {
  const [dimension, setDimension] = useState<'company' | 'department'>('company')
  const [distribution, setDistribution] = useState<DistributionResult | null>(null)
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [dist, dash] = await Promise.all([
        statisticsApi.distribution(dimension),
        statisticsApi.dashboard(user.companyId),
      ])
      setDistribution(dist)
      setDashboard(dash)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载统计数据失败')
    } finally {
      setLoading(false)
    }
  }, [dimension, user.companyId])

  useEffect(() => { void load() }, [load])

  const maxTotal = useMemo(
    () => (distribution ? Math.max(1, ...distribution.groups.map((g) => g.total)) : 1),
    [distribution],
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">统计分析仪表盘</h2>
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
          {(['company', 'department'] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDimension(d)}
              className={`!min-h-0 !px-3 !py-1.5 text-xs ${dimension === d ? 'bg-blue-600 text-white' : 'text-slate-600'}`}
            >
              {d === 'company' ? '按公司' : '按部门'}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <>
          {/* 运营指标卡片 */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="工单总量" value={dashboard?.totalTickets ?? 0} />
            <MetricCard label="平均响应时间" value={formatHours(dashboard?.averageResponseTimeHours)} />
            <MetricCard label="平均满意度" value={dashboard ? `${dashboard.satisfactionScore.toFixed(1)} / 5` : '—'} hint={dashboard ? `共 ${dashboard.totalEvaluations} 条评价` : ''} />
            <MetricCard label="已完成工单" value={dashboard?.byStatus.completed ?? 0} />
          </div>

          {/* 工单状态分布 */}
          {dashboard && (
            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-700">工单状态分布</h3>
              <div className="flex flex-wrap gap-4">
                {(Object.keys(TICKET_STATUS_LABEL) as TicketStatus[]).map((s) => {
                  const count = dashboard.byStatus[s] ?? 0
                  const pct = dashboard.totalTickets > 0 ? Math.round((count / dashboard.totalTickets) * 100) : 0
                  return (
                    <div key={s} className="min-w-[140px] flex-1">
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLORS[s] }} />
                          {TICKET_STATUS_LABEL[s]}
                        </span>
                        <span className="font-medium text-slate-700">{count}</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: STATUS_COLORS[s] }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* 维度分布柱状图（纯 CSS） */}
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">
              工单分布（{dimension === 'company' ? '按公司' : '按部门'}）
            </h3>
            {!distribution || distribution.groups.length === 0 ? (
              <EmptyState title="暂无分布数据" />
            ) : (
              <div className="space-y-2.5">
                {distribution.groups.map((g) => (
                  <div key={g.key} className="flex items-center gap-3 text-xs">
                    <span className="w-32 shrink-0 truncate text-slate-600" title={g.label}>{g.label}</span>
                    <div className="relative h-6 flex-1 overflow-hidden rounded bg-slate-100">
                      <div className="absolute inset-y-0 left-0 flex items-center rounded bg-blue-500/80 px-2 text-white" style={{ width: `${Math.max(8, (g.total / maxTotal) * 100)}%` }}>
                        {g.total}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 热点问题 */}
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">热点问题</h3>
            {!dashboard || dashboard.topCategories.length === 0 ? (
              <EmptyState title="暂无热点数据" />
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-slate-500">
                  <tr><th className="px-2 py-2">分类</th><th className="px-2 py-2">工单数</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dashboard.topCategories.map((c) => (
                    <tr key={c.categoryId}>
                      <td className="px-2 py-2.5 font-medium text-slate-800">{c.categoryName}</td>
                      <td className="px-2 py-2.5 text-slate-600">{c.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function MetricCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-800">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
    </div>
  )
}
