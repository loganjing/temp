import { useState, type ReactNode } from 'react'
import { useAsyncData, type AsyncHandle } from '../app/useAsyncData'
import { useCompanyOptions } from '../app/useCompanyOptions'
import { useCurrentUser } from '../app/session'
import { fetchDashboard, fetchDistribution } from '../api'
import {
  TICKET_STATUSES,
  type AuthUser,
  type DashboardStats,
  type DistributionDimension,
  type DistributionStats,
} from '../contract'
import { STATUS_LABELS, categoryLabel, formatMinutes } from '../labels'
import { Card, DataState, Field } from '../components/ui'

export default function StatsPage() {
  const me = useCurrentUser()
  const [companyScope, setCompanyScope] = useState<number | undefined>(undefined)
  const [dimension, setDimension] = useState<DistributionDimension>(me.crossCompanyView ? 'company' : 'department')
  const companyOptions = useCompanyOptions(me)
  const dashboard = useAsyncData(() => fetchDashboard(companyScope), [companyScope])
  const distribution = useAsyncData(
    () => fetchDistribution(dimension, companyScope),
    [dimension, companyScope],
    { enabled: dimension === 'department' || me.crossCompanyView },
  )

  const changeDimension = (next: DistributionDimension) => {
    if (next === 'company' && !me.crossCompanyView) return
    setDimension(next)
  }

  return (
    <StatsView
      me={me}
      dashboard={dashboard}
      distribution={distribution}
      dimension={dimension}
      onDimensionChange={changeDimension}
      companyScope={companyScope}
      onCompanyScopeChange={setCompanyScope}
      companyOptions={companyOptions}
    />
  )
}

export interface StatsViewProps {
  me: AuthUser
  dashboard: AsyncHandle<DashboardStats>
  distribution: AsyncHandle<DistributionStats>
  dimension: DistributionDimension
  onDimensionChange: (dimension: DistributionDimension) => void
  companyScope: number | undefined
  onCompanyScopeChange: (companyId: number | undefined) => void
  companyOptions: AsyncHandle<DistributionStats> | null
}

export function StatsView(props: StatsViewProps) {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-base font-semibold text-slate-900">统计分析</h1>
        {props.companyOptions !== null && (
          <div className="w-56">
            <Field label="统计范围">
              <select
                className="input-base"
                value={props.companyScope === undefined ? '' : props.companyScope}
                onChange={(event) =>
                  props.onCompanyScopeChange(event.currentTarget.value === '' ? undefined : Number(event.currentTarget.value))
                }
              >
                <option value="">全部公司</option>
                {props.companyOptions.phase === 'ready'
                  ? props.companyOptions.data.items.map((item) => (
                    <option key={String(item.key)} value={item.key}>{item.label}</option>
                  ))
                  : null}
              </select>
            </Field>
          </div>
        )}
      </div>
      <DataState state={props.dashboard}>
        {(stats) => (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="工单量" note="按生命周期状态汇总">
              <p className="text-2xl font-semibold text-slate-900">{stats.ticketCount.total}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {TICKET_STATUSES.map((status) => (
                  <span key={status} className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {STATUS_LABELS[status]} {stats.ticketCount.byStatus[status]}
                  </span>
                ))}
              </div>
            </MetricCard>
            <MetricCard title="平均响应时间" note="创建到首次回复的分钟均值">
              <p className="text-2xl font-semibold text-slate-900">{formatMinutes(stats.avgResponseMinutes)}</p>
            </MetricCard>
            <MetricCard title="满意度" note="已完成工单的提交人评分均值">
              <p className="text-2xl font-semibold text-slate-900">
                {stats.satisfaction.avgScore === null ? '暂无评价' : `${stats.satisfaction.avgScore} / 5`}
              </p>
              <p className="mt-1 text-xs text-slate-500">{`${stats.satisfaction.ratedCount} 条评价`}</p>
            </MetricCard>
            <MetricCard title="热点问题" note="按问题分类聚合的工单量排行（Top 10）">
              {stats.hotCategories.length === 0 ? (
                <p className="text-sm text-slate-400">暂无数据</p>
              ) : (
                <ul className="space-y-1.5">
                  {stats.hotCategories.map((item) => {
                    const max = stats.hotCategories[0].count
                    return (
                      <li key={item.category} className="flex items-center gap-2 text-xs">
                        <span className="w-14 shrink-0 text-slate-600">{categoryLabel(item.category)}</span>
                        <span className="min-w-0 flex-1">
                          <span
                            className="block h-2 rounded bg-indigo-200"
                            style={{ width: max === 0 ? 0 : Math.max(4, Math.round((item.count / max) * 100)) + '%' }}
                          />
                        </span>
                        <span className="w-7 shrink-0 text-right text-slate-500">{item.count}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </MetricCard>
          </div>
        )}
      </DataState>
      <DistributionCard
        me={props.me}
        distribution={props.distribution}
        dimension={props.dimension}
        onDimensionChange={props.onDimensionChange}
      />
    </div>
  )
}

function MetricCard(props: { title: string; note: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-xs font-medium text-slate-500">{props.title}</h3>
      <div className="mt-2">{props.children}</div>
      <p className="mt-2 text-xs text-slate-400">{props.note}</p>
    </section>
  )
}

function DistributionCard(props: {
  me: AuthUser
  distribution: AsyncHandle<DistributionStats>
  dimension: DistributionDimension
  onDimensionChange: (dimension: DistributionDimension) => void
}) {
  const items = props.distribution.phase === 'ready' ? props.distribution.data.items : []
  const max = items.reduce((current, item) => Math.max(current, item.count), 0)
  return (
    <Card
      title="工单分布"
      actions={
        <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
          <button
            type="button"
            disabled={!props.me.crossCompanyView}
            title={props.me.crossCompanyView ? undefined : '仅跨公司视角可用'}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              props.dimension === 'company' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
            } ${props.me.crossCompanyView ? '' : 'cursor-not-allowed opacity-50'}`}
            onClick={() => props.onDimensionChange('company')}
          >
            按公司
          </button>
          <button
            type="button"
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              props.dimension === 'department' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
            }`}
            onClick={() => props.onDimensionChange('department')}
          >
            按部门
          </button>
        </div>
      }
    >
      {!props.me.crossCompanyView && (
        <p className="mb-3 text-xs text-slate-400">公司维度需跨公司视角权限，当前仅可查看部门维度。</p>
      )}
      <DataState state={props.distribution} isEmpty={(data) => data.items.length === 0} empty="暂无分布数据">
        {(data) => (
          <ul className="space-y-2">
            {data.items.map((item) => (
              <li key={String(item.key)} className="flex items-center gap-3 text-sm">
                <span className="w-36 shrink-0 truncate text-slate-700" title={item.label}>{item.label}</span>
                <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded bg-slate-100">
                  <span
                    className="block h-full rounded bg-indigo-500"
                    style={{ width: max === 0 ? 0 : Math.max(3, Math.round((item.count / max) * 100)) + '%' }}
                  />
                </span>
                <span className="w-10 shrink-0 text-right text-xs text-slate-500">{item.count}</span>
              </li>
            ))}
          </ul>
        )}
      </DataState>
      <p className="mt-3 text-xs text-slate-400">
        {props.dimension === 'department' ? '部门维度按提交人所属部门聚合' : '公司维度按工单所属公司聚合'}
      </p>
    </Card>
  )
}
