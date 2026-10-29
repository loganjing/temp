import { useEffect, useState } from 'react'
import type { TicketSummary, UserDetail } from '../types'
import { apiGet } from '../platform/api-client'
import { LoadingState, ErrorState } from './States'
import { StatusBadge, PriorityBadge } from './Badges'

interface Props {
  submitterId: string
  /** 排除当前工单 ID，历史列表中不重复显示。 */
  excludeTicketId?: string
  onSelectTicket?: (id: string) => void
}

export default function SubmitterInfoPanel({ submitterId, excludeTicketId, onSelectTicket }: Props) {
  const [user, setUser] = useState<UserDetail | null>(null)
  const [tickets, setTickets] = useState<TicketSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      apiGet<UserDetail>(`/api/users/${submitterId}`),
      apiGet<{ items: TicketSummary[] }>(`/api/users/${submitterId}/tickets`),
    ])
      .then(([u, t]) => {
        if (cancelled) return
        setUser(u)
        setTickets(t.items ?? [])
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : '加载提交人信息失败')
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [submitterId])

  if (loading) return <LoadingState label="加载提交人信息…" />
  if (error) return <ErrorState message={error} />
  if (!user) return null

  const history = excludeTicketId ? tickets.filter((t) => t.id !== excludeTicketId) : tickets

  return (
    <div className="space-y-4">
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">提交人信息</h4>
        <dl className="space-y-1.5 text-xs">
          <div className="flex justify-between">
            <dt className="text-slate-400">姓名</dt>
            <dd className="font-medium text-slate-700">{user.name}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-400">邮箱</dt>
            <dd className="text-slate-600">{user.email}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-400">公司</dt>
            <dd className="text-slate-600">{user.companyName ?? '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-400">部门</dt>
            <dd className="text-slate-600">{user.department ?? '—'}</dd>
          </div>
        </dl>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          历史工单 ({history.length})
        </h4>
        {history.length === 0 ? (
          <p className="text-xs text-slate-400">暂无其他工单</p>
        ) : (
          <ul className="space-y-1.5">
            {history.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => onSelectTicket?.(t.id)}
                  className="w-full rounded-md border border-slate-100 bg-slate-50 px-2.5 py-1.5 text-left transition-colors hover:border-indigo-100 hover:bg-indigo-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium text-slate-700">{t.title}</span>
                    <StatusBadge status={t.status} />
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400">
                    <PriorityBadge priority={t.priority} />
                    <span>{t.categoryName}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
