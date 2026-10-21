// 统计分析（admin | viewer）：公司/部门维度分布切换 + 运营仪表盘（工单量、平均响应时间、满意度、热点问题）。
// 指标口径由服务端计算（契约第 7 节），本页只做展示。
import { useState } from 'react'
import { getDashboard, getDistribution } from '../api/stats'
import {
  Badge,
  Card,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Skeleton,
  StatusBadge,
  TableSkeleton,
} from '../components/ui'
import { IconBarChart3, IconClock, IconStar, IconTicket } from '../components/icons'
import { dimensionLabels, statusLabels } from '../contracts/labels'
import type { StatsDimension, TicketStatus } from '../contracts/types'
import { useAsync } from '../hooks/useAsync'

const DIMENSIONS: StatsDimension[] = ['company', 'department']
const STATUS_ORDER: TicketStatus[] = [
  'created',
  'pending_assignment',
  'in_progress',
  'completed',
  'cancelled',
]

export function StatsPage() {
  const [dimension, setDimension] = useState<StatsDimension>('company')
  const distribution = useAsync(() => getDistribution(dimension), [dimension])
  const dashboard = useAsync(() => getDashboard(), [])

  return (
    <div className="space-y-6">
      <PageHeader
        title="统计分析"
        description="工单分布统计与运营指标仪表盘（运营视角，跨公司汇总）"
      />

      <Card
        title="工单分布统计"
        description="切换维度查看各公司 / 各部门（提交人所属部门）的工单分布"
        actions={<IconBarChart3 className="size-4 text-slate-400" />}
      >
        <div className="mb-4 inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
          {DIMENSIONS.map((value) => (
            <button
              key={value}
              type="button"
              className={`rounded px-3.5 py-1.5 text-sm font-medium transition-colors ${
                dimension === value
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              onClick={() => setDimension(value)}
            >
              {dimensionLabels[value]}
            </button>
          ))}
        </div>
        <ErrorBanner message={distribution.error} />
        {distribution.loading && !distribution.data ? (
          <TableSkeleton rows={4} cols={3} />
        ) : !distribution.data || distribution.data.items.length === 0 ? (
          <EmptyState title="暂无分布数据" description="当前维度下还没有可统计的工单。" />
        ) : (
          <DistributionList items={distribution.data.items} />
        )}
      </Card>

      <Card
        title="运营仪表盘"
        description="工单量、平均响应时间（创建到业务组首次回复的平均间隔）、满意度、热点问题"
        actions={<IconTicket className="size-4 text-slate-400" />}
      >
        <ErrorBanner message={dashboard.error} />
        {dashboard.loading && !dashboard.data ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
            <Skeleton className="h-40" />
          </div>
        ) : !dashboard.data ? (
          <EmptyState title="仪表盘数据加载失败" />
        ) : (
          <DashboardBody data={dashboard.data} />
        )}
      </Card>
    </div>
  )
}

function DistributionList({ items }: { items: { key: string; name: string; count: number }[] }) {
  const max = Math.max(...items.map((item) => item.count), 1)
  return (
    <ul className="space-y-3" role="table" aria-label="工单分布明细">
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-3">
          <span className="w-40 shrink-0 truncate text-sm text-slate-700" title={item.name}>
            {item.name}
          </span>
          <div className="h-5 min-w-0 flex-1 overflow-hidden rounded bg-slate-100">
            <div
              className="h-full rounded bg-blue-500/80"
              style={{ width: `${Math.max(2, Math.round((item.count / max) * 100))}%` }}
            />
          </div>
          <span className="w-12 shrink-0 text-right text-sm font-medium text-slate-800">{item.count}</span>
        </li>
      ))}
    </ul>
  )
}

function DashboardBody({
  data,
}: {
  data: {
    ticketVolume: { total: number; byStatus: Record<TicketStatus, number> }
    avgResponseMinutes: number | null
    satisfaction: { average: number | null; ratedCount: number }
    hotCategories: { categoryId: number; name: string; count: number }[]
  }
}) {
  const { ticketVolume, avgResponseMinutes, satisfaction, hotCategories } = data
  const statusTotal = Math.max(
    STATUS_ORDER.reduce((sum, status) => sum + (ticketVolume.byStatus[status] ?? 0), 0),
    1,
  )
  const hotMax = Math.max(...hotCategories.map((item) => item.count), 1)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <IconTicket className="size-4" />
            工单量
          </div>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{ticketVolume.total}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {STATUS_ORDER.map((status) => (
              <span key={status} className="inline-flex items-center gap-1 text-xs text-slate-500">
                <StatusBadge status={status} />
                {ticketVolume.byStatus[status] ?? 0}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <IconClock className="size-4" />
            平均响应时间
          </div>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {avgResponseMinutes === null ? '—' : `${avgResponseMinutes}`}
            {avgResponseMinutes !== null && (
              <span className="ml-1 text-sm font-normal text-slate-500">分钟</span>
            )}
          </p>
          <p className="mt-2 text-xs text-slate-400">
            {avgResponseMinutes === null ? '暂无业务组回复样本' : '工单创建到业务组首次回复的平均间隔'}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <IconStar className="size-4 text-amber-400" />
            满意度
          </div>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {satisfaction.average === null ? '—' : satisfaction.average.toFixed(2)}
            {satisfaction.average !== null && (
              <span className="ml-1 text-sm font-normal text-slate-500">/ 5</span>
            )}
          </p>
          <p className="mt-2 text-xs text-slate-400">已评价工单 {satisfaction.ratedCount} 张</p>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-900">按状态分布</h3>
          <ul className="space-y-3">
            {STATUS_ORDER.map((status) => {
              const count = ticketVolume.byStatus[status] ?? 0
              return (
                <li key={status} className="flex items-center gap-3">
                  <span className="w-16 shrink-0">
                    <StatusBadge status={status} />
                  </span>
                  <div className="h-5 min-w-0 flex-1 overflow-hidden rounded bg-slate-100">
                    <div
                      className="h-full rounded bg-blue-500/80"
                      style={{ width: `${Math.max(2, Math.round((count / statusTotal) * 100))}%` }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right text-sm font-medium text-slate-800">{count}</span>
                </li>
              )
            })}
          </ul>
        </div>
        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-900">热点问题 Top 5</h3>
          {hotCategories.length === 0 ? (
            <EmptyState title="暂无热点数据" description="还没有可聚合的工单分类。" />
          ) : (
            <ol className="space-y-3">
              {hotCategories.map((item, index) => (
                <li key={item.categoryId} className="flex items-center gap-3">
                  <Badge tone="bg-slate-100 text-slate-600 ring-slate-300">#{index + 1}</Badge>
                  <span className="w-28 shrink-0 truncate text-sm text-slate-700" title={item.name}>
                    {item.name}
                  </span>
                  <div className="h-5 min-w-0 flex-1 overflow-hidden rounded bg-slate-100">
                    <div
                      className="h-full rounded bg-blue-500/80"
                      style={{ width: `${Math.max(2, Math.round((item.count / hotMax) * 100))}%` }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right text-sm font-medium text-slate-800">
                    {item.count}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  )
}
