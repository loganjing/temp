import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  assignmentApi,
  ApiRequestError,
  ticketApi,
} from '../platform/api-client'
import {
  AUDIT_ACTION_LABEL,
  type AuditEntry,
  type Group,
  type Rating,
  type Reply,
  type SessionUser,
  type SubmitterInfoResponse,
  type Ticket,
  type TicketDetailResponse,
} from './contracts'
import {
  Card,
  EmptyState,
  ErrorInline,
  formatDateTime,
  PriorityBadge,
  SectionHeading,
  Spinner,
  StatusBadge,
  useAsync,
  useToast,
} from './ui'

interface Props {
  ticketNo: string
  currentUser: SessionUser
  detail: TicketDetailResponse
  groups: Group[] | undefined
  onTicketChanged: () => void
}

function isSubmitter(ticket: Ticket, user: SessionUser) {
  return ticket.submitter.id === user.id
}
function isCurrentGroupMember(ticket: Ticket, user: SessionUser) {
  return ticket.currentGroup !== null && user.groupIds.includes(ticket.currentGroup.id)
}

export default function TicketDetail({ ticketNo, currentUser, detail, groups, onTicketChanged }: Props) {
  const toast = useToast()
  const navigate = useNavigate()
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [transferTarget, setTransferTarget] = useState('')
  const [ratingScore, setRatingScore] = useState(0)
  const [ratingComment, setRatingComment] = useState('')

  const { ticket, replies, rating, notifications } = detail
  const submitterInfo = useAsync<SubmitterInfoResponse>(() => ticketApi.submitter(ticketNo), [ticketNo])
  const audit = useAsync<{ items: AuditEntry[] }>(() => ticketApi.auditLogs(ticketNo), [ticketNo, replies.length])

  const canReply = (isSubmitter(ticket, currentUser) || isCurrentGroupMember(ticket, currentUser)) && (ticket.status === 'pending_assignment' || ticket.status === 'processing')
  const canTransfer = isCurrentGroupMember(ticket, currentUser) && ticket.status === 'processing'
  const canComplete = isCurrentGroupMember(ticket, currentUser) && ticket.status === 'processing'
  const canCancel = isSubmitter(ticket, currentUser) && (ticket.status === 'pending_assignment' || ticket.status === 'processing')
  const canRate = isSubmitter(ticket, currentUser) && ticket.status === 'completed' && rating === null

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true)
    setActionError('')
    try {
      await fn()
      toast.success(`${label}成功`)
      onTicketChanged()
      setReply('')
      setRatingScore(0)
      setRatingComment('')
    } catch (cause) {
      setActionError(cause instanceof ApiRequestError ? cause.message : `${label}失败`)
      toast.error(cause instanceof ApiRequestError ? cause.message : `${label}失败`)
    } finally {
      setBusy(false)
    }
  }

  const submitReply = (e: FormEvent) => {
    e.preventDefault()
    if (!reply.trim()) return
    void run('回复', () => ticketApi.reply(ticketNo, reply.trim()))
  }
  const submitTransfer = () => {
    const target = Number(transferTarget)
    if (!target) { setActionError('请选择转派目标业务组'); return }
    void run('转派', () => ticketApi.transfer(ticketNo, target).then(() => setTransferTarget('')))
  }
  const submitComplete = () => void run('完成', () => ticketApi.complete(ticketNo))
  const submitCancel = () => void run('取消', () => ticketApi.cancel(ticketNo))
  const submitRating = (e: FormEvent) => {
    e.preventDefault()
    if (ratingScore < 1 || ratingScore > 5) { setActionError('请选择 1–5 分评分'); return }
    void run('评价', () => ticketApi.rate(ticketNo, ratingScore, ratingComment.trim() || undefined))
  }

  const otherGroups = groups?.filter((g) => g.id !== ticket.currentGroup?.id) ?? []

  return (
    <div className="flex flex-col gap-5">
      {/* 基本信息 */}
      <Card>
        <SectionHeading
          title={ticket.subject}
          subtitle={`工单号 ${ticket.ticketNo}`}
          actions={<div className="flex items-center gap-2"><PriorityBadge priority={ticket.priority} /><StatusBadge status={ticket.status} /></div>}
        />
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          <Field label="问题分类" value={ticket.category} />
          <Field label="当前业务组" value={ticket.currentGroup?.name ?? '待分配'} />
          <Field label="处理人" value={ticket.handler?.name ?? '—'} />
          <Field label="处理时间" value={ticket.handledAt ? formatDateTime(ticket.handledAt) : '—'} />
          <Field label="创建时间" value={formatDateTime(ticket.createdAt)} />
          <Field label="更新时间" value={formatDateTime(ticket.updatedAt)} />
        </dl>
        <div className="mt-4">
          <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">描述</p>
          <p className="whitespace-pre-wrap break-words text-sm text-slate-800 dark:text-slate-200">{ticket.description}</p>
        </div>
      </Card>

      {/* 提交人信息卡（含历史工单） */}
      <Card>
        <SectionHeading title="提交人信息" subtitle="含历史工单" />
        {submitterInfo.loading ? <Spinner /> : submitterInfo.error ? <ErrorInline message={submitterInfo.error} /> : submitterInfo.data ? (
          <div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              <Field label="姓名" value={submitterInfo.data.submitter.name} />
              <Field label="邮箱" value={submitterInfo.data.submitter.email} />
              <Field label="部门" value={submitterInfo.data.submitter.department} />
              <Field label="公司" value={submitterInfo.data.submitter.company.name} />
            </dl>
            <div className="mt-4">
              <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">历史工单（{submitterInfo.data.history.length}）</p>
              {submitterInfo.data.history.length === 0 ? (
                <p className="text-sm text-slate-400">无历史工单</p>
              ) : (
                <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                  {submitterInfo.data.history.map((h) => (
                    <li key={h.ticketNo} className="flex items-center justify-between gap-2 py-2 text-sm">
                      <button className="truncate text-left text-blue-600 hover:underline dark:text-blue-400" onClick={() => navigate(`/tickets/${encodeURIComponent(h.ticketNo)}`)}>
                        <span className="font-mono">{h.ticketNo}</span> · {h.subject}
                      </button>
                      <span className="flex shrink-0 items-center gap-2"><PriorityBadge priority={h.priority} /><StatusBadge status={h.status} /></span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </Card>

      {/* 回复时间线 */}
      <Card>
        <SectionHeading title="回复时间线" subtitle={`${replies.length} 条`} />
        {replies.length === 0 ? <EmptyState title="暂无回复" hint="发起首次回复以开始处理" /> : (
          <ol className="space-y-3">
            {replies.map((r: Reply) => (
              <li key={r.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <div className="mb-1 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-medium text-slate-700 dark:text-slate-200">{r.author.name}</span>
                  <span>{formatDateTime(r.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm text-slate-800 dark:text-slate-200">{r.content}</p>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {/* 操作区 */}
      <Card>
        <SectionHeading title="操作" subtitle="按权限与状态显隐" />
        {actionError && <ErrorInline message={actionError} />}
        <div className="flex flex-col gap-4">
          {canReply && (
            <form onSubmit={submitReply} className="flex flex-col gap-2">
              <textarea
                className="min-h-24 w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                placeholder="输入回复内容…"
                maxLength={5000}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                required
              />
              <button className="self-start" disabled={busy || !reply.trim()}>回复</button>
            </form>
          )}
          {canTransfer && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                转派到业务组
                <select value={transferTarget} onChange={(e) => setTransferTarget(e.target.value)} className="min-w-48">
                  <option value="">选择业务组…</option>
                  {otherGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </label>
              <button className="secondary" disabled={busy || !transferTarget} onClick={submitTransfer}>转派</button>
            </div>
          )}
          {canComplete && (
            <button disabled={busy} onClick={submitComplete}>标记完成</button>
          )}
          {canCancel && (
            <button className="secondary" disabled={busy} onClick={submitCancel}>取消工单</button>
          )}
          {canRate && (
            <form onSubmit={submitRating} className="flex flex-col gap-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">满意度评价</p>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={ratingScore >= n ? 'text-amber-500' : 'text-slate-300 dark:text-slate-600'}
                    onClick={() => setRatingScore(n)}
                    aria-label={`${n} 星`}
                  >
                    {ratingScore >= n ? '★' : '☆'}
                  </button>
                ))}
              </div>
              <textarea
                className="min-h-20 w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                placeholder="评价备注（可选）"
                maxLength={1000}
                value={ratingComment}
                onChange={(e) => setRatingComment(e.target.value)}
              />
              <button className="self-start" disabled={busy || ratingScore === 0}>提交评价</button>
            </form>
          )}
          {rating && (
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <p className="text-xs text-slate-500 dark:text-slate-400">已评价</p>
              <p className="text-amber-500">{'★'.repeat(rating.score)}<span className="text-slate-300">{'☆'.repeat(5 - rating.score)}</span></p>
              {rating.comment && <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{rating.comment}</p>}
            </div>
          )}
          {!canReply && !canTransfer && !canComplete && !canCancel && !canRate && !rating && (
            <p className="text-sm text-slate-400">当前状态下无可执行操作。</p>
          )}
        </div>
      </Card>

      {/* 完成通知记录 */}
      {notifications.length > 0 && (
        <Card>
          <SectionHeading title="完成通知记录" subtitle={`${notifications.length} 条`} />
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">
            {notifications.map((n) => (
              <li key={n.id} className="py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate" title={n.recipientEmail}>{n.recipientEmail}</span>
                  <span className={n.status === 'sent' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                    {n.status === 'sent' ? '已发送' : '发送失败'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{n.subject} · {formatDateTime(n.sentAt)}</p>
                {n.detail && <p className="text-xs text-slate-400">{n.detail}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* 内嵌操作日志 */}
      <Card>
        <SectionHeading title="操作日志" subtitle="本工单审计时间线" />
        {audit.loading ? <Spinner /> : audit.error ? <ErrorInline message={audit.error} /> : audit.data ? (
          audit.data.items.length === 0 ? <EmptyState title="暂无操作日志" /> : (
            <ol className="space-y-2">
              {audit.data.items.map((entry) => (
                <li key={entry.id} className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    {AUDIT_ACTION_LABEL[entry.action]}
                  </span>
                  <div className="min-w-0">
                    <p><span className="font-medium">{entry.operator.name}</span> · {formatDateTime(entry.createdAt)}</p>
                    {entry.detail && <p className="break-words text-xs text-slate-500 dark:text-slate-400">{entry.detail}</p>}
                  </div>
                </li>
              ))}
            </ol>
          )
        ) : null}
      </Card>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="truncate text-slate-800 dark:text-slate-200" title={value}>{value}</dd>
    </div>
  )
}
