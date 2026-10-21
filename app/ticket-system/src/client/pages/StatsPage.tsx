import { useState } from 'react'
import { apiRequest } from '../platform/api-client'
import { useAsyncData } from '../components/useAsyncData'
import {
  EmptyState,
  ErrorNotice,
  PageHeader,
  SkeletonList,
  STATUS_META,
} from '../components/ui'
import type { DashboardStats, Distribution, StatsDimension, TicketStatus } from '../types'

const STATUS_BREAKDOWN_FIELDS: { key: keyof DashboardStats['statusBreakdown']; status: TicketStatus }[] = [
  { key: 'created', status: 'created' },
  { key: 'pendingAssignment', status: 'pending_assignment' },
  { key: 'pendingProcessing', status: 'pending_processing' },
  { key: 'completed', status: 'completed' },
  { key: 'cancelled', status: 'cancelled' },
]

const DIMENSIONS: { value: StatsDimension; label: string }[] = [
  { value: 'company', label: '公司维度' },
  { value: 'department', label: '部门维度' },
]

function formatMinutes(value: number | null) {
  return value === null ? '暂无' : `${value} 分钟`
}

function formatSatisfaction(value: number | null) {
  return value === null ? '暂无' : `${value} / 5`
}

/** 统计分析：KPI 指标行 + 状态分布 + 公司/部门维度分布与明细表（不做营销式首屏）。 */
export default function StatsPage() {
  const [dimension, setDimension] = useState<StatsDimension>('company')
  const dashboard = useAsyncData<DashboardStats>(() => apiRequest('/api/stats/dashboard'), [])
  const distribution = useAsyncData<Distribution>(
    () => apiRequest(`/api/stats/distribution?dimension=${dimension}`),
    [dimension],
  )

  const stats = dashboard.data
  const items = distribution.data?.items ?? []
  const totalOfItems = items.reduce((sum, item) => sum + item.count, 0)

  return (
    <div>
      <PageHeader
        title="统计分析"
        description="跨公司聚合的工单分布与运营指标（仅输出聚合数字，不提供跨公司明细下钻）。"
      />

      <section className="mb-4">
        {dashboard.loading ? (
          <div className="card">
            <SkeletonList rows={4} />
          </div>
        ) : dashboard.error ? (
          <div className="card p-4">
            <ErrorNotice error={dashboard.error} onRetry={dashboard.reload} />
          </div>
        ) : stats ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="card p-4">
                <p className="text-xs font-medium text-slate-500">工单量</p>
                <p className="mt-1 text-2xl font-semibold text-slate-800">{stats.totalTickets}</p>
                <p className="mt-0.5 text-xs text-slate-400">全部公司工单总数</p>
              </div>
              <div className="card p-4">
                <p className="text-xs font-medium text-slate-500">平均响应时间</p>
                <p className="mt-1 text-2xl font-semibold text-slate-800">{formatMinutes(stats.avgResponseMinutes)}</p>
                <p className="mt-0.5 text-xs text-slate-400">创建至首次回复的平均时长</p>
              </div>
              <div className="card p-4">
                <p className="text-xs font-medium text-slate-500">满意度</p>
                <p className="mt-1 text-2xl font-semibold text-slate-800">{formatSatisfaction(stats.avgSatisfaction)}</p>
                <p className="mt-0.5 text-xs text-slate-400">已评价工单的平均分</p>
              </div>
              <div className="card p-4">
                <p className="text-xs font-medium text-slate-500">热点问题</p>
                <p className="mt-1 truncate text-2xl font-semibold text-slate-800">
                  {stats.hotCategories[0]?.category ?? '暂无'}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {stats.hotCategories[0] ? `工单量最多的分类（${stats.hotCategories[0].count} 单）` : '暂无分类数据'}
                </p>
              </div>
            </div>

            <div className="card mt-3 p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-700">状态分布</h2>
              <div className="space-y-2.5">
                {STATUS_BREAKDOWN_FIELDS.map(({ key, status }) => {
                  const count = stats.statusBreakdown[key]
                  const width = stats.totalTickets === 0 ? 0 : Math.round((count / stats.totalTickets) * 100)
                  return (
                    <div key={key} className="flex items-center gap-3 text-xs">
                      <span className="w-16 shrink-0 text-slate-500">{STATUS_META[status].label}</span>
                      <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded bg-slate-100">
                        <div className="h-full rounded bg-indigo-500" style={{ width: `${width}%` }} />
                      </div>
                      <span className="w-16 shrink-0 text-right font-medium text-slate-700">{count} 单</span>
                    </div>
                  )
                })}
              </div>
              {stats.hotCategories.length > 0 && (
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <h3 className="mb-2 text-xs font-medium text-slate-500">热点问题 Top 5（按工单量）</h3>
                  <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                    {stats.hotCategories.map((hot, index) => (
                      <li key={hot.category}>
                        {index + 1}. {hot.category}（{hot.count} 单）
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </>
        ) : null}
      </section>

      <section className="card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-700">工单分布</h2>
          <div className="flex gap-1.5" role="tablist" aria-label="分布维度">
            {DIMENSIONS.map((item) => (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={dimension === item.value}
                className={dimension === item.value ? 'btn btn-sm' : 'btn-secondary btn-sm'}
                onClick={() => setDimension(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        {distribution.loading ? (
          <SkeletonList rows={4} />
        ) : distribution.error ? (
          <ErrorNotice error={distribution.error} onRetry={distribution.reload} />
        ) : items.length === 0 ? (
          <EmptyState title="暂无分布数据" hint="提交工单后可查看公司/部门维度分布。" />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2.5">
              {items.map((item) => {
                const width = totalOfItems === 0 ? 0 : Math.round((item.count / totalOfItems) * 100)
                return (
                  <div key={item.key}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate font-medium text-slate-700" title={item.label}>
                        {item.label}
                      </span>
                      <span className="shrink-0 text-xs text-slate-500">
                        {item.count} 单 · {width}%
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded bg-slate-100">
                      <div className="h-full rounded bg-indigo-500" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">
                      {dimension === 'company' ? '公司' : '提交人部门'}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">工单数</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item, index) => (
                    <tr key={item.key}>
                      <td className="px-3 py-2 text-slate-400">{index + 1}</td>
                      <td className="px-3 py-2 text-slate-700" title={item.label}>
                        {item.label}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-slate-700">{item.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
