import { useState } from 'react'
import { apiRequest } from '../platform/api-client'
import { useAsyncData } from '../components/useAsyncData'
import { ExpandableText } from '../components/ExpandableText'
import {
  EmptyState,
  ErrorNotice,
  MAIL_CHANNEL_LABELS,
  MAIL_STATUS_LABELS,
  PageHeader,
  Pagination,
  SkeletonList,
  buildQuery,
  formatDateTime,
} from '../components/ui'
import type { MailStatus, OutboxItem, Page } from '../types'

const PAGE_SIZE = 20

const MAIL_STATUS_BADGE: Record<MailStatus, string> = {
  queued: 'border-slate-200 bg-slate-50 text-slate-600',
  sent: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  failed: 'border-red-200 bg-red-50 text-red-700',
}

/** 发件箱：完成通知邮件记录（本地发件箱 / SMTP 投递），作为送达证据与失败可见性入口。 */
export default function OutboxPage() {
  const [page, setPage] = useState(1)
  const [ticketIdFilter, setTicketIdFilter] = useState('')
  const query = buildQuery({ ticketId: ticketIdFilter, page, pageSize: PAGE_SIZE })
  const outbox = useAsyncData<Page<OutboxItem>>(() => apiRequest(`/api/outbox?${query}`), [query])

  const items = outbox.data?.items ?? []

  return (
    <div>
      <PageHeader
        title="发件箱"
        description="工单完成通知邮件的投递记录：未配置 SMTP 时写入本地发件箱，配置后经 SMTP 真实发送；发送失败不影响工单完成。"
      />
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-700">通知记录（{outbox.data?.total ?? 0}）</h2>
          <label className="field" style={{ maxWidth: '16rem' }}>
            <span className="label">按工单 ID 过滤（可选）</span>
            <input
              type="number"
              className="input"
              min={1}
              placeholder="输入工单 ID（数字）"
              value={ticketIdFilter}
              onChange={(event) => {
                setTicketIdFilter(event.target.value.trim())
                setPage(1)
              }}
            />
          </label>
        </div>
        {outbox.loading ? (
          <SkeletonList rows={6} />
        ) : outbox.error ? (
          <div className="p-4">
            <ErrorNotice error={outbox.error} onRetry={outbox.reload} />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="暂无通知记录"
            hint={ticketIdFilter ? '该工单暂无完成通知记录，可清空过滤条件后查看全部。' : '完成工单后，将在此生成完成通知邮件记录。'}
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((item) => (
              <li key={item.outboxId} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono font-medium text-slate-600">{item.ticketNo}</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-500" title={item.toEmail}>
                      收件人 {item.toEmail}
                    </span>
                    <span className="badge border-slate-200 bg-slate-50 text-slate-500">
                      {MAIL_CHANNEL_LABELS[item.channel]}
                    </span>
                    <span className={`badge ${MAIL_STATUS_BADGE[item.status]}`}>
                      {MAIL_STATUS_LABELS[item.status]}
                    </span>
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">
                    创建于 {formatDateTime(item.createdAt)}
                    {item.sentAt ? ` · 发送于 ${formatDateTime(item.sentAt)}` : ''}
                  </span>
                </div>
                <p className="mt-1.5 text-sm font-medium text-slate-800" title={item.subject}>
                  {item.subject}
                </p>
                <ExpandableText text={item.body} limit={160} className="mt-1 text-xs text-slate-600" />
                {item.error && (
                  <p className="mt-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" title={item.error}>
                    发送失败原因：{item.error}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        {!outbox.loading && !outbox.error && (
          <Pagination
            page={outbox.data?.page ?? page}
            pageSize={outbox.data?.pageSize ?? PAGE_SIZE}
            total={outbox.data?.total ?? 0}
            onPage={setPage}
          />
        )}
      </section>
    </div>
  )
}
