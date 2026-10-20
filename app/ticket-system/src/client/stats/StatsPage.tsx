import { useCallback, useState } from 'react'
import { fetchDashboard, fetchDistribution } from '../api/stats'
import { useResource } from '../hooks/useResource'
import { STATUS_LABELS, formatMinutes } from '../domain/labels'
import { StatusBadge } from '../components/badges'
import { EmptyState, ErrorBanner, LoadingIndicator, PageHeader, SectionCard, buttonSecondaryClass } from '../components/feedback'

type Dimension = 'department' | 'company'

const DIMENSION_LABELS: Record<Dimension, string> = {
  department: '按部门',
  company: '按公司',
}

export default function StatsPage() {
  const [dimension, setDimension] = useState<Dimension>('department')

  const dashboard = useResource(() => fetchDashboard(), '仪表盘数据加载失败')
  const distributionLoader = useCallback(() => fetchDistribution(dimension), [dimension])
  const distribution = useResource(distributionLoader, '分布数据加载失败')

  const statusEntries = Object.entries(dashboard.data?.statusBreakdown ?? {})
  const hotCategories = dashboard.data?.hotCategories ?? []
  const hotMax = hotCategories[0]?.count ?? 0
  const distributionItems = distribution.data?.items ?? []
  const distributionMax = distributionItems[0]?.count ?? 0

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title="统计分析" description="本公司范围内的运营仪表盘与工单分布（公司隔离）。" />

      {dashboard.error && <ErrorBanner message={`仪表盘数据加载失败：${dashboard.error}`} />}
      {dashboard.loading && <LoadingIndicator label="加载仪表盘数据…" />}

      {dashboard.data && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <p className="text-sm text-slate-500">工单量</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{dashboard.data.totalTickets}</p>
              <p className="mt-1 text-xs text-slate-400">本公司全部工单（含已取消）</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <p className="text-sm text-slate-500">平均响应时间</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{formatMinutes(dashboard.data.avgResponseMinutes)}</p>
              <p className="mt-1 text-xs text-slate-400">创建到首次回复的平均时长</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <p className="text-sm text-slate-500">满意度</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">
                {dashboard.data.avgRating === null ? '暂无数据' : `${dashboard.data.avgRating.toFixed(2)} / 5`}
              </p>
              <p className="mt-1 text-xs text-slate-400">已评价工单 {dashboard.data.ratedCount} 条的平均分</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <p className="text-sm text-slate-500">热点问题</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{hotCategories[0]?.category ?? '暂无数据'}</p>
              <p className="mt-1 text-xs text-slate-400">{hotCategories[0] ? `该分类工单 ${hotCategories[0].count} 条，居首` : '暂无分类聚合数据'}</p>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <SectionCard title="状态分布">
              {statusEntries.length === 0 ? (
                <EmptyState title="暂无工单数据" />
              ) : (
                <ul className="space-y-2">
                  {statusEntries.map(([status, count]) => (
                    <li key={status} className="flex items-center justify-between gap-3 text-sm">
                      <StatusBadge status={status} />
                      <span className="font-medium text-slate-700">{count} 条</span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="热点问题（按分类工单量降序，前 10）">
              {hotCategories.length === 0 ? (
                <EmptyState title="暂无分类聚合数据" />
              ) : (
                <ul className="space-y-2.5">
                  {hotCategories.map((item) => (
                    <li key={item.category} className="text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-slate-700" title={item.category}>
                          {item.category}
                        </span>
                        <span className="font-medium text-slate-700">{item.count} 条</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                        <div
                          className="h-1.5 rounded-full bg-indigo-500"
                          style={{ width: hotMax > 0 ? `${Math.max((item.count / hotMax) * 100, 2)}%` : '0%' }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>
        </>
      )}

      <SectionCard
        title="工单分布"
        actions={
          <div className="flex items-center gap-2">
            {(Object.keys(DIMENSION_LABELS) as Dimension[]).map((option) => (
              <button
                key={option}
                type="button"
                className={`${buttonSecondaryClass} ${dimension === option ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : ''}`}
                aria-pressed={dimension === option}
                onClick={() => setDimension(option)}
              >
                {DIMENSION_LABELS[option]}
              </button>
            ))}
          </div>
        }
      >
        {distribution.error && <ErrorBanner message={`分布数据加载失败：${distribution.error}`} />}
        {distribution.loading && !distribution.data && <LoadingIndicator label="加载分布数据…" />}
        {distribution.data && distributionItems.length === 0 && <EmptyState title="暂无分布数据" />}
        {distribution.data && distributionItems.length > 0 && (
          <ul className="space-y-3">
            {distributionItems.map((item) => (
              <li key={item.label} className="text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-slate-700" title={item.label}>
                    {item.label}
                  </span>
                  <span className="font-medium text-slate-700">{item.count} 条</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-sky-500"
                    style={{ width: distributionMax > 0 ? `${Math.max((item.count / distributionMax) * 100, 2)}%` : '0%' }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        {dimension === 'company' && <p className="mt-3 text-xs text-slate-400">公司维度受公司隔离约束，展示本公司聚合结果。</p>}
      </SectionCard>
    </div>
  )
}
