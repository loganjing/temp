import { useState } from 'react'
import { statsApi } from '../platform/api-client'
import type { SessionUser } from '../components/contracts'
import { Card, EmptyState, Spinner, useAsync } from '../components/ui'

interface Props { currentUser: SessionUser }

export default function StatsPage({ currentUser }: Props) {
  const [dimension, setDimension] = useState<'company' | 'department'>('company')
  const dist = useAsync(() => statsApi.distribution(dimension), [dimension])
  const dash = useAsync(() => statsApi.dashboard(), [])

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi label="工单量" value={dash.data ? String(dash.data.ticketCount) : '—'} loading={dash.loading} />
        <Kpi label="平均响应时间" value={dash.data ? (dash.data.avgResponseMinutes === null ? '无样本' : `${dash.data.avgResponseMinutes.toFixed(1)} 分钟`) : '—'} loading={dash.loading} />
        <Kpi label="满意度" value={dash.data ? (dash.data.satisfaction === null ? '无样本' : `${dash.data.satisfaction.toFixed(1)} / 5`) : '—'} loading={dash.loading} />
        <Kpi label="热点问题 Top" value={dash.data && dash.data.topCategories[0] ? `${dash.data.topCategories[0].category} (${dash.data.topCategories[0].count})` : '—'} loading={dash.loading} />
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">工单分布</h2>
          <div className="flex gap-1 rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
            {(['company', 'department'] as const).map((d) => (
              <button
                key={d}
                className={`rounded-md px-3 py-1 text-xs ${dimension === d ? 'bg-blue-600 text-white' : 'text-slate-600 dark:text-slate-300'}`}
                onClick={() => setDimension(d)}
              >
                {d === 'company' ? '公司' : '部门'}
              </button>
            ))}
          </div>
        </div>
        <p className="mb-3 text-xs text-slate-400">公司：{currentUser.company.name}</p>
        {dist.loading ? <Spinner /> : dist.error ? <p className="text-sm text-red-600 dark:text-red-400">{dist.error}</p> : dist.data ? (
          dist.data.rows.length === 0 ? <EmptyState title="暂无分布数据" /> : (
            <div className="flex flex-col gap-2">
              {dist.data.rows.map((row) => {
                const max = dist.data!.rows[0].count || 1
                return (
                  <div key={row.key} className="flex items-center gap-3 text-sm">
                    <span className="w-32 shrink-0 truncate" title={row.label}>{row.label}</span>
                    <div className="h-4 min-w-0 flex-1 rounded bg-slate-100 dark:bg-slate-700">
                      <div className="h-4 rounded bg-blue-500" style={{ width: `${Math.max(2, (row.count / max) * 100)}%` }} />
                    </div>
                    <span className="w-10 shrink-0 text-right tabular-nums">{row.count}</span>
                  </div>
                )
              })}
            </div>
          )
        ) : null}
      </Card>

      {dash.data && dash.data.topCategories.length > 0 && (
        <Card>
          <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-slate-100">热点问题</h2>
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">
            {dash.data.topCategories.map((c, i) => (
              <li key={`${c.category}-${i}`} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span><span className="mr-2 text-slate-400">{i + 1}.</span>{c.category}</span>
                <span className="tabular-nums text-slate-500">{c.count}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

function Kpi({ label, value, loading }: { label: string; value: string; loading: boolean }) {
  return (
    <Card>
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">{loading ? '…' : value}</p>
    </Card>
  )
}
