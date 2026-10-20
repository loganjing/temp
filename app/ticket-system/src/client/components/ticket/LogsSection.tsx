import { useCallback, useEffect, useState } from 'react'
import { apiErrorText } from '../../api/helpers'
import { fetchLogs } from '../../api/tickets'
import type { TicketLog } from '../../api/types'
import { formatDateTime } from '../../format'
import { EmptyState, ErrorBanner, SkeletonBlock } from '../ui'

const actionLabels: Record<string, string> = {
  'ticket.created': '创建工单',
  'ticket.assigned': '分配',
  'ticket.reassigned': '转派',
  'ticket.replied': '回复',
  'ticket.completed': '完成',
  'ticket.cancelled': '取消',
  'ticket.rated': '评价',
}

export function LogsSection({ ticketId }: { ticketId: string }) {
  const [logs, setLogs] = useState<TicketLog[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const result = await fetchLogs(ticketId)
      setLogs(result.items)
    } catch (err) {
      setError(apiErrorText(err))
    }
  }, [ticketId])

  useEffect(() => {
    setLogs(null)
    void refresh()
  }, [refresh])

  return (
    <div className="card-base p-4">
      <h3 className="section-title">操作日志</h3>
      <div className="mt-3">
        {error ? (
          <ErrorBanner message={error} onRetry={() => void refresh()} />
        ) : logs === null ? (
          <div className="space-y-2">
            <SkeletonBlock className="h-4 w-full" />
            <SkeletonBlock className="h-4 w-2/3" />
            <SkeletonBlock className="h-4 w-1/2" />
          </div>
        ) : logs.length === 0 ? (
          <EmptyState title="暂无操作记录" />
        ) : (
          <div className="space-y-2.5">
            {logs.map(log => (
              <div key={log.id} className="flex items-start gap-3 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-medium text-slate-700">{log.actorName ?? '系统'}</span>
                    <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-700">
                      {actionLabels[log.action] ?? log.action}
                    </span>
                    <span className="text-xs text-slate-400">{formatDateTime(log.createdAt)}</span>
                  </div>
                  {log.detail && <p className="mt-0.5 break-words text-xs text-slate-500">{log.detail}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
