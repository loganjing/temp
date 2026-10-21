import { useEffect, useState } from 'react'
import { listNotifications } from '../api'
import { EmptyState, ErrorState, ListSkeleton, formatDateTime } from '../components/ui'
import type { TicketNotification } from '../types'

export default function NotificationsPage() {
  const [items, setItems] = useState<TicketNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    listNotifications()
      .then((result) => {
        if (!cancelled) setItems(result.items)
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : '加载失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
      <p className="px-1 text-xs text-slate-500">
        工单完成后，系统会向提交人发送完成通知；此处展示当前账号作为收件人的全部通知。
      </p>
      {error ? (
        <ErrorState message={error} onRetry={() => setReloadKey((key) => key + 1)} />
      ) : loading ? (
        <ListSkeleton rows={3} />
      ) : items.length === 0 ? (
        <EmptyState title="暂无通知" hint="您提交的工单完成处理后，完成通知会出现在这里。" />
      ) : (
        items.map((notification) => (
          <article key={notification.id} className="panel p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="break-words text-sm font-semibold text-slate-800">{notification.subject}</p>
              <time className="shrink-0 text-xs text-slate-400" title={notification.createdAt}>
                {formatDateTime(notification.createdAt)}
              </time>
            </div>
            <p className="mt-1 font-mono text-xs text-slate-400">{notification.ticketNo}</p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-600">
              {notification.body}
            </p>
          </article>
        ))
      )}
    </div>
  )
}
