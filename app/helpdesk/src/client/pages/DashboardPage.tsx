import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../domain/api'
import { useAsync } from '../domain/hooks'
import type { BreakdownRow, DashboardSummary, TicketStatus } from '../domain/types'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../components/ui'
import { useLocale, usePlatformText } from '../platform/i18n'

// 草稿不计入任何统计（需求 §6.11）：下钻状态集合与统计口径一致，排除草稿
const NON_DRAFT_STATUSES: TicketStatus[] = [
  'pending_assign',
  'assigned',
  'in_progress',
  'on_hold',
  'pending_confirm',
  'cancelled',
  'closed',
]

interface KpiCard {
  key: string
  value: (kpis: DashboardSummary['kpis']) => number
  statuses: TicketStatus[]
  sort?: string
}

const KPI_CARDS: KpiCard[] = [
  { key: 'total', value: (k) => k.total, statuses: NON_DRAFT_STATUSES },
  { key: 'todayCreated', value: (k) => k.todayCreated, statuses: NON_DRAFT_STATUSES, sort: 'created_at:desc' },
  { key: 'inProgress', value: (k) => k.inProgress, statuses: ['in_progress'] },
  { key: 'onHold', value: (k) => k.onHold, statuses: ['on_hold'] },
  { key: 'closed', value: (k) => k.closed, statuses: ['closed'] },
]

type Dimension = 'category' | 'priority' | 'department'
const DIMENSIONS: Dimension[] = ['category', 'priority', 'department']

function kpiTo(card: KpiCard): string {
  const search = new URLSearchParams()
  search.set('status', card.statuses.join(','))
  if (card.sort) search.set('sort', card.sort)
  return `/tickets?${search.toString()}`
}

/** Dashboard（需求 §6.11）：KPI + SLA 告警卡 + 三维排行，全部点击下钻到工单列表 */
export function DashboardPage() {
  const t = usePlatformText()
  const { locale } = useLocale()
  const navigate = useNavigate()
  const summary = useAsync(() => api.dashboardSummary(), [])
  const [dimension, setDimension] = useState<Dimension>('category')
  const breakdown = useAsync(() => api.dashboardBreakdown(dimension), [dimension])

  function rowTo(row: BreakdownRow): string {
    if (dimension === 'priority') return `/tickets?priority=${row.key}`
    if (dimension === 'category') return `/tickets?category=${row.key}`
    return `/tickets?department=${row.key}`
  }

  return (
    <div className="space-y-5 p-6">
      <h1 className="text-lg font-semibold text-slate-800">{t('dashboard.title')}</h1>

      {summary.loading && !summary.data ? (
        <LoadingBlock label={t('common.loading')} />
      ) : summary.error ? (
        <ErrorBlock error={summary.error} onRetry={summary.reload} retryLabel={t('common.retry')} />
      ) : summary.data ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {KPI_CARDS.map((card) => (
            <button
              key={card.key}
              type="button"
              onClick={() => void navigate(kpiTo(card))}
              className="rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-indigo-300"
            >
              <div className="text-xs font-medium text-slate-500">{t(`dashboard.kpi.${card.key}`)}</div>
              <div className="mt-1 text-2xl font-semibold text-slate-800">{card.value(summary.data!.kpis)}</div>
            </button>
          ))}
          <button
            type="button"
            onClick={() => void navigate('/tickets?sla=alert')}
            className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-left transition-colors hover:border-amber-400"
          >
            <div className="text-xs font-medium text-amber-700">{t('dashboard.kpi.slaAlerts')}</div>
            <div className="mt-1 text-2xl font-semibold text-amber-800">{summary.data.slaAlerts.count}</div>
          </button>
        </div>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-700">{t('dashboard.breakdown')}</h2>
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {DIMENSIONS.map((dim) => (
              <button
                key={dim}
                type="button"
                onClick={() => setDimension(dim)}
                className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                  dimension === dim ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                {t(`dashboard.dim.${dim}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 space-y-1">
          {breakdown.loading && !breakdown.data ? (
            <LoadingBlock label={t('common.loading')} />
          ) : breakdown.error ? (
            <ErrorBlock error={breakdown.error} onRetry={breakdown.reload} retryLabel={t('common.retry')} />
          ) : !breakdown.data || breakdown.data.length === 0 ? (
            <EmptyBlock label={t('dashboard.breakdownEmpty')} icon="dashboard" />
          ) : (
            (() => {
              const rows = breakdown.data!
              const max = Math.max(...rows.map((row) => row.count), 1)
              return rows.map((row) => (
                <button
                  key={row.key}
                  type="button"
                  onClick={() => void navigate(rowTo(row))}
                  className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-slate-50"
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">{locale === 'zh' ? row.labelZh : row.labelEn}</span>
                    <span className="font-medium text-slate-500">{row.count}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded bg-slate-100">
                    <div className="h-1.5 rounded bg-indigo-500" style={{ width: `${Math.round((row.count / max) * 100)}%` }} />
                  </div>
                </button>
              ))
            })()
          )}
        </div>
      </section>
    </div>
  )
}
