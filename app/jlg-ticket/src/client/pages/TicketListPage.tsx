import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Priority, TicketStatus, TicketSummary } from '../types'
import { PRIORITY_OPTIONS, STATUS_OPTIONS, STATUS_LABEL, PRIORITY_LABEL } from '../types'
import { apiGet } from '../platform/api-client'
import { useCurrentUser } from '../context/CurrentUser'
import { LoadingState, EmptyState, ErrorState } from '../components/States'
import { StatusBadge, PriorityBadge } from '../components/Badges'
import TicketDetailPanel from '../components/TicketDetailPanel'

export default function TicketListPage() {
  const { user } = useCurrentUser()
  const [statusFilter, setStatusFilter] = useState<TicketStatus | ''>('')
  const [priorityFilter, setPriorityFilter] = useState<Priority | ''>('')
  const [tickets, setTickets] = useState<TicketSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const fetchTickets = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await apiGet<{ items: TicketSummary[] }>('/api/tickets', {
        status: statusFilter || undefined,
        priority: priorityFilter || undefined,
      })
      setTickets(r.items ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载工单列表失败')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, priorityFilter])

  useEffect(() => {
    void fetchTickets()
  }, [fetchTickets])

  return (
    <div className="flex h-full">
      {/* 左侧工单队列 */}
      <div className="flex w-80 flex-shrink-0 flex-col border-r border-slate-200 bg-white">
        {/* 筛选 */}
        <div className="space-y-2 border-b border-slate-100 px-4 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">工单队列</h2>
            <Link
              to="/tickets/new"
              className="rounded-md bg-indigo-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-indigo-700"
            >
              + 新建
            </Link>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as TicketStatus | '')}
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-indigo-400 focus:outline-none"
          >
            <option value="">全部状态</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as Priority | '')}
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-indigo-400 focus:outline-none"
          >
            <option value="">全部优先级</option>
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </div>

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState message={error} onRetry={fetchTickets} />
          ) : tickets.length === 0 ? (
            <EmptyState
              title="暂无工单"
              hint="创建工单后将在此显示"
              action={
                <Link
                  to="/tickets/new"
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                >
                  创建工单
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-slate-50">
              {tickets.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => setSelectedId(t.id)}
                    className={`w-full px-4 py-3 text-left transition-colors ${
                      selectedId === t.id ? 'bg-indigo-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <StatusBadge status={t.status} />
                      <PriorityBadge priority={t.priority} />
                    </div>
                    <p className="truncate text-sm font-medium text-slate-800">{t.title}</p>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                      <span>{t.submitterName}</span>
                      <span>{t.categoryName}</span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-300">
                      {t.assignedGroupName ?? '未分配'} · {formatTime(t.createdAt)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 右侧详情 */}
      <div className="flex-1 overflow-hidden bg-slate-50">
        {!user ? (
          <EmptyState title="请先设置当前身份" hint="在顶部栏设置用户 ID 后即可查看和处理工单" />
        ) : !selectedId ? (
          <EmptyState title="选择左侧工单查看详情" hint="或在队列上方创建新工单" />
        ) : (
          <TicketDetailPanel
            key={selectedId}
            ticketId={selectedId}
            currentUser={user}
            onUpdated={fetchTickets}
            onSelectTicket={setSelectedId}
          />
        )}
      </div>
    </div>
  )
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}
