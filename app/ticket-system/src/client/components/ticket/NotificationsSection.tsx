import { useCallback, useEffect, useState } from 'react'
import { apiErrorText } from '../../api/helpers'
import { fetchNotifications } from '../../api/tickets'
import type { TicketNotification } from '../../api/types'
import { formatDateTime } from '../../format'
import { EmptyState, ErrorBanner, NotificationStatusBadge, SkeletonBlock } from '../ui'

export function NotificationsSection({ ticketId }: { ticketId: string }) {
  const [items, setItems] = useState<TicketNotification[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const result = await fetchNotifications(ticketId)
      setItems(result.items)
    } catch (err) {
      setError(apiErrorText(err))
    }
  }, [ticketId])

  useEffect(() => {
    setItems(null)
    void refresh()
  }, [refresh])

  return (
    <div className="card-base p-4">
      <h3 className="section-title">通知记录</h3>
      <p className="mt-1 text-xs text-slate-400">工单完成后向提交人邮箱发送的完成通知邮件记录</p>
      <div className="mt-3 space-y-2">
        {error ? (
          <ErrorBanner message={error} onRetry={() => void refresh()} />
        ) : items === null ? (
          <SkeletonBlock className="h-12 w-full" />
        ) : items.length === 0 ? (
          <EmptyState title="暂无通知记录" description="工单完成后此处可见邮件发送记录" />
        ) : (
          items.map(item => (
            <div key={item.id} className="rounded-lg border border-slate-200 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <NotificationStatusBadge status={item.status} />
                <span className="min-w-0 flex-1 break-words text-slate-700">{item.subject}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-slate-400">
                <span>收件人：{item.toEmail}</span>
                <span>{formatDateTime(item.createdAt)}</span>
              </div>
              {item.error && <p className="mt-1 text-xs text-red-600">失败原因：{item.error}</p>}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
