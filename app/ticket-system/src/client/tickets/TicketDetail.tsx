import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { cancelTicket, completeTicket, fetchTicketDetail, rateTicket, replyTicket, transferTicket } from '../api/tickets'
import { listGroups } from '../api/admin'
import { useResource } from '../hooks/useResource'
import {
  ACTION_LABELS,
  NOTIFICATION_STATUS_CLASS,
  NOTIFICATION_STATUS_LABELS,
  STATUS_LABELS,
  formatDateTime,
} from '../domain/labels'
import { PriorityBadge, RatingStars, StatusBadge } from '../components/badges'
import { EmptyState, ErrorBanner, LoadingIndicator, SuccessBanner, buttonDangerClass, buttonPrimaryClass, buttonSecondaryClass, inputClass, useAutoNotice } from '../components/feedback'
import { toUserMessage } from '../platform/api-client'
import type { TicketDetailResponse } from '../platform/types'

export interface TicketDetailProps {
  ticketId: number
  onClose: () => void
  onTicketChange: () => void
  onSelectTicket: (id: number) => void
}

type ActionForm = 'none' | 'transfer' | 'complete' | 'cancel'

export default function TicketDetail({ ticketId, onClose, onTicketChange, onSelectTicket }: TicketDetailProps) {
  const { user } = useAuth()
  const [data, setData] = useState<TicketDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useAutoNotice()
  const [actionError, setActionError] = useState('')
  const [actionForm, setActionForm] = useState<ActionForm>('none')
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const [replyContent, setReplyContent] = useState('')
  const [targetGroupId, setTargetGroupId] = useState('')
  const [targetUserId, setTargetUserId] = useState('')
  const [transferReason, setTransferReason] = useState('')
  const [resolution, setResolution] = useState('')
  const [cancelReason, setCancelReason] = useState('')
  const [ratingScore, setRatingScore] = useState(0)
  const [ratingComment, setRatingComment] = useState('')

  const groups = useResource(() => listGroups(), '业务组加载失败')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await fetchTicketDetail(ticketId)
      setData(result)
    } catch (cause) {
      setData(null)
      setError(toUserMessage(cause, '工单详情加载失败'))
    } finally {
      setLoading(false)
    }
  }, [ticketId])

  useEffect(() => {
    setActionForm('none')
    setActionError('')
    setExpanded(false)
    setReplyContent('')
    void load()
  }, [load])

  if (!user) return null

  const ticket = data?.ticket
  const isAgent = user.role === 'agent' || user.role === 'company_admin'
  const isSubmitterOfTicket = data != null && data.submitter.userId === user.id
  const status = ticket?.status ?? ''
  const canTransfer = ticket != null && isAgent && (status === 'pending_assignment' || status === 'processing')
  const canComplete = ticket != null && isAgent && status === 'processing'
  const canCancel = ticket != null && ['created', 'pending_assignment', 'processing'].includes(status) && (isAgent || isSubmitterOfTicket)
  const canRate = data != null && isSubmitterOfTicket && status === 'completed' && data.rating == null
  // 契约 Ticket 仅含受理人 ID；从当前工单所属组的成员名单解析其姓名，解析不到时回退显示 ID。
  const assigneeName =
    ticket?.assigneeUserId != null
      ? groups.data?.items.find((group) => group.id === ticket.groupId)?.members.find((member) => member.userId === ticket.assigneeUserId)?.displayName ?? ticket.assigneeUserId
      : null

  const runAction = async (action: () => Promise<string>) => {
    setBusy(true)
    setActionError('')
    try {
      setNotice(await action())
      setActionForm('none')
      await load()
      onTicketChange()
    } catch (cause) {
      setActionError(toUserMessage(cause, '操作失败，请稍后重试'))
    } finally {
      setBusy(false)
    }
  }

  const submitReply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!ticket) return
    void runAction(async () => {
      await replyTicket(ticket.id, replyContent.trim())
      setReplyContent('')
      return '回复已提交。'
    })
  }

  const submitTransfer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!ticket || !targetGroupId) {
      setActionError('请选择目标业务组')
      return
    }
    void runAction(async () => {
      await transferTicket(ticket.id, {
        targetGroupId: Number(targetGroupId),
        targetUserId: targetUserId || null,
        reason: transferReason.trim() || null,
      })
      setTargetGroupId('')
      setTargetUserId('')
      setTransferReason('')
      return '工单已转派。'
    })
  }

  const submitComplete = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!ticket) return
    void runAction(async () => {
      const result = await completeTicket(ticket.id, resolution.trim() || null)
      setResolution('')
      return `工单已完成。完成通知邮件：${NOTIFICATION_STATUS_LABELS[result.notification.status] ?? result.notification.status}（收件人 ${result.notification.recipientEmail}）。`
    })
  }

  const submitCancel = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!ticket) return
    void runAction(async () => {
      await cancelTicket(ticket.id, cancelReason.trim() || null)
      setCancelReason('')
      return '工单已取消。'
    })
  }

  const submitRating = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!ticket || ratingScore < 1) {
      setActionError('请先选择满意度分值')
      return
    }
    void runAction(async () => {
      await rateTicket(ticket.id, { score: ratingScore, comment: ratingComment.trim() || null })
      setRatingScore(0)
      setRatingComment('')
      return '评价已提交。'
    })
  }

  const selectedGroupMembers = groups.data?.items.find((group) => String(group.id) === targetGroupId)?.members ?? []

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
        <div className="min-w-0">
          {loading ? (
            <p className="text-sm text-slate-500">加载工单详情…</p>
          ) : ticket ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-slate-900">{ticket.ticketNo}</span>
                <StatusBadge status={ticket.status} />
                <PriorityBadge priority={ticket.priority} />
              </div>
              <p className="mt-1 truncate text-sm text-slate-600" title={ticket.subject}>
                {ticket.subject}
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-500">工单详情</p>
          )}
        </div>
        <button type="button" className={buttonSecondaryClass} onClick={onClose}>
          关闭
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-slate-50/60 p-4">
        {loading && !ticket && <LoadingIndicator label="加载工单详情…" />}
        {error && <ErrorBanner message={error} />}
        {notice && <SuccessBanner message={notice} />}
        {actionError && <ErrorBanner message={actionError} />}

        {ticket && data && (
          <>
            {canTransfer || canComplete || canCancel ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3">
                <span className="text-xs font-medium text-slate-500">操作</span>
                {canTransfer && (
                  <button type="button" className={buttonSecondaryClass} disabled={busy} onClick={() => setActionForm(actionForm === 'transfer' ? 'none' : 'transfer')}>
                    转派
                  </button>
                )}
                {canComplete && (
                  <button type="button" className={buttonPrimaryClass} disabled={busy} onClick={() => setActionForm(actionForm === 'complete' ? 'none' : 'complete')}>
                    完成工单
                  </button>
                )}
                {canCancel && (
                  <button type="button" className={buttonDangerClass} disabled={busy} onClick={() => setActionForm(actionForm === 'cancel' ? 'none' : 'cancel')}>
                    取消工单
                  </button>
                )}
              </div>
            ) : null}

            {actionForm === 'transfer' && (
              <form className="space-y-3 rounded-lg border border-slate-200 bg-white p-4" onSubmit={submitTransfer}>
                <p className="text-sm font-medium text-slate-700">转派工单</p>
                {groups.error && <ErrorBanner message={`业务组加载失败：${groups.error}`} />}
                <label className="block text-sm text-slate-600">
                  目标业务组 <span className="text-red-500">*</span>
                  <select className={`${inputClass} mt-1.5`} value={targetGroupId} required onChange={(event) => { setTargetGroupId(event.currentTarget.value); setTargetUserId('') }}>
                    <option value="">请选择业务组</option>
                    {groups.data?.items.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm text-slate-600">
                  指定组内成员（可选）
                  <select className={`${inputClass} mt-1.5`} value={targetUserId} disabled={selectedGroupMembers.length === 0} onChange={(event) => setTargetUserId(event.currentTarget.value)}>
                    <option value="">不指定</option>
                    {selectedGroupMembers.map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {member.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm text-slate-600">
                  转派原因（可选）
                  <input className={`${inputClass} mt-1.5`} value={transferReason} maxLength={500} onChange={(event) => setTransferReason(event.currentTarget.value)} />
                </label>
                <div className="flex items-center gap-2">
                  <button type="submit" className={buttonPrimaryClass} disabled={busy || !targetGroupId}>
                    {busy ? '提交中…' : '确认转派'}
                  </button>
                  <button type="button" className={buttonSecondaryClass} onClick={() => setActionForm('none')}>
                    取消
                  </button>
                </div>
              </form>
            )}

            {actionForm === 'complete' && (
              <form className="space-y-3 rounded-lg border border-slate-200 bg-white p-4" onSubmit={submitComplete}>
                <p className="text-sm font-medium text-slate-700">完成工单</p>
                <label className="block text-sm text-slate-600">
                  完成说明（可选）
                  <textarea className={`${inputClass} mt-1.5 min-h-20`} value={resolution} maxLength={2000} placeholder="处理结果说明，将随完成通知发送给提交人" onChange={(event) => setResolution(event.currentTarget.value)} />
                </label>
                <p className="text-xs text-slate-400">完成后将向提交人邮箱（{ticket.submitterEmail}）发送完成通知邮件。</p>
                <div className="flex items-center gap-2">
                  <button type="submit" className={buttonPrimaryClass} disabled={busy}>
                    {busy ? '提交中…' : '确认完成'}
                  </button>
                  <button type="button" className={buttonSecondaryClass} onClick={() => setActionForm('none')}>
                    取消
                  </button>
                </div>
              </form>
            )}

            {actionForm === 'cancel' && (
              <form className="space-y-3 rounded-lg border border-slate-200 bg-white p-4" onSubmit={submitCancel}>
                <p className="text-sm font-medium text-slate-700">取消工单</p>
                <label className="block text-sm text-slate-600">
                  取消原因（可选）
                  <input className={`${inputClass} mt-1.5`} value={cancelReason} maxLength={500} onChange={(event) => setCancelReason(event.currentTarget.value)} />
                </label>
                <div className="flex items-center gap-2">
                  <button type="submit" className={buttonDangerClass} disabled={busy}>
                    {busy ? '提交中…' : '确认取消'}
                  </button>
                  <button type="button" className={buttonSecondaryClass} onClick={() => setActionForm('none')}>
                    返回
                  </button>
                </div>
              </form>
            )}

            <section className="rounded-lg border border-slate-200 bg-white">
              <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">问题描述</h2>
              <div className="px-4 py-3 text-sm text-slate-700">
                <p className={expanded ? 'whitespace-pre-wrap break-words' : 'line-clamp-4 whitespace-pre-wrap break-words'}>{ticket.description}</p>
                <button type="button" className="mt-2 text-xs font-medium text-indigo-600 hover:text-indigo-700" onClick={() => setExpanded(!expanded)}>
                  {expanded ? '收起' : '展开全文'}
                </button>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white">
              <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">工单信息</h2>
              <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-2.5 px-4 py-3 text-sm">
                <dt className="text-slate-500">问题分类</dt>
                <dd className="text-slate-700">{ticket.category}</dd>
                <dt className="text-slate-500">当前状态</dt>
                <dd className="text-slate-700">{STATUS_LABELS[ticket.status] ?? ticket.status}</dd>
                <dt className="text-slate-500">归属业务组</dt>
                <dd className="text-slate-700">{ticket.groupName ?? '—（尚未归属）'}</dd>
                <dt className="text-slate-500">受理成员</dt>
                <dd className="text-slate-700">{assigneeName ?? '—'}</dd>
                <dt className="text-slate-500">处理人</dt>
                <dd className="text-slate-700">{ticket.handlerName ?? '—'}</dd>
                <dt className="text-slate-500">创建时间</dt>
                <dd className="text-slate-700">{formatDateTime(ticket.createdAt)}</dd>
                {ticket.dispatchedAt && (
                  <>
                    <dt className="text-slate-500">进入分配</dt>
                    <dd className="text-slate-700">{formatDateTime(ticket.dispatchedAt)}</dd>
                  </>
                )}
                {ticket.assignedAt && (
                  <>
                    <dt className="text-slate-500">归属时间</dt>
                    <dd className="text-slate-700">{formatDateTime(ticket.assignedAt)}</dd>
                  </>
                )}
                {ticket.firstReplyAt && (
                  <>
                    <dt className="text-slate-500">首次回复</dt>
                    <dd className="text-slate-700">{formatDateTime(ticket.firstReplyAt)}</dd>
                  </>
                )}
                {ticket.completedAt && (
                  <>
                    <dt className="text-slate-500">完成时间</dt>
                    <dd className="text-slate-700">{formatDateTime(ticket.completedAt)}</dd>
                  </>
                )}
                {ticket.cancelledAt && (
                  <>
                    <dt className="text-slate-500">取消时间</dt>
                    <dd className="text-slate-700">{formatDateTime(ticket.cancelledAt)}</dd>
                  </>
                )}
              </dl>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white">
              <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">提交人信息</h2>
              <div className="px-4 py-3">
                <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-sm">
                  <dt className="text-slate-500">姓名</dt>
                  <dd className="text-slate-700">{data.submitter.displayName}</dd>
                  <dt className="text-slate-500">公司</dt>
                  <dd className="text-slate-700">{data.submitter.companyName}</dd>
                  <dt className="text-slate-500">部门</dt>
                  <dd className="text-slate-700">{data.submitter.department ?? '未填写'}</dd>
                  <dt className="text-slate-500">邮箱</dt>
                  <dd className="break-all text-slate-700">{data.submitter.email}</dd>
                </dl>
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <p className="text-xs font-medium text-slate-500">历史工单（本公司范围，最近 20 条，不含当前工单）</p>
                  {data.submitter.historyTickets.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-400">暂无历史工单</p>
                  ) : (
                    <ul className="mt-2 space-y-1.5">
                      {data.submitter.historyTickets.map((history) => (
                        <li key={history.id}>
                          <button
                            type="button"
                            className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-200 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-slate-50"
                            onClick={() => onSelectTicket(history.id)}
                          >
                            <span className="min-w-0 flex-1 truncate text-slate-600">
                              <span className="font-medium text-slate-700">{history.ticketNo}</span>
                              <span className="mx-1.5 text-slate-300">·</span>
                              {history.subject}
                            </span>
                            <StatusBadge status={history.status} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white">
              <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">回复（{data.replies.length}）</h2>
              <div className="px-4 py-3">
                {data.replies.length === 0 ? (
                  <EmptyState title="暂无回复" hint="提交人或处理人的回复将按时间显示在这里。" />
                ) : (
                  <ol className="space-y-3">
                    {data.replies.map((reply) => (
                      <li key={reply.id} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-medium text-slate-700">{reply.authorName}</span>
                          <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium ${reply.authorKind === 'submitter' ? 'bg-violet-50 text-violet-700' : 'bg-sky-50 text-sky-700'}`}>
                            {reply.authorKind === 'submitter' ? '提交人' : '处理人'}
                          </span>
                          <span className="text-slate-400">{formatDateTime(reply.createdAt)}</span>
                        </div>
                        <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-slate-700">{reply.content}</p>
                      </li>
                    ))}
                  </ol>
                )}
                <form className="mt-4 space-y-2 border-t border-slate-100 pt-3" onSubmit={submitReply}>
                  <textarea
                    className={`${inputClass} min-h-20`}
                    value={replyContent}
                    required
                    maxLength={5000}
                    placeholder="回复工单（不超过 5000 字符）…"
                    onChange={(event) => setReplyContent(event.currentTarget.value)}
                  />
                  <button type="submit" className={buttonPrimaryClass} disabled={busy || replyContent.trim().length === 0}>
                    {busy ? '提交中…' : '提交回复'}
                  </button>
                </form>
              </div>
            </section>

            {canRate && (
              <section className="rounded-lg border border-slate-200 bg-white">
                <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">满意度评价</h2>
                <form className="space-y-3 px-4 py-3" onSubmit={submitRating}>
                  <p className="text-xs text-slate-400">本工单已完成，请提交满意度评价（1–5 分）。</p>
                  <div className="flex items-center gap-1.5" role="radiogroup" aria-label="满意度分值">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={ratingScore === value}
                        aria-label={`${value} 分`}
                        className={`h-9 w-9 rounded-md border text-base transition-colors ${
                          value <= ratingScore ? 'border-amber-400 bg-amber-50 text-amber-500' : 'border-slate-300 bg-white text-slate-300 hover:bg-slate-50'
                        }`}
                        onClick={() => setRatingScore(value)}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                  <textarea className={`${inputClass} min-h-16`} value={ratingComment} maxLength={1000} placeholder="评价意见（可选，不超过 1000 字符）" onChange={(event) => setRatingComment(event.currentTarget.value)} />
                  <button type="submit" className={buttonPrimaryClass} disabled={busy || ratingScore < 1}>
                    {busy ? '提交中…' : '提交评价'}
                  </button>
                </form>
              </section>
            )}

            {data.rating && (
              <section className="rounded-lg border border-slate-200 bg-white">
                <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">满意度评价</h2>
                <div className="flex flex-col gap-2 px-4 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    <RatingStars score={data.rating.score} />
                    <span className="text-slate-600">{data.rating.score} / 5 分</span>
                    <span className="text-xs text-slate-400">{formatDateTime(data.rating.createdAt)}</span>
                  </div>
                  {data.rating.comment && <p className="whitespace-pre-wrap break-words text-slate-700">{data.rating.comment}</p>}
                </div>
              </section>
            )}

            <section className="rounded-lg border border-slate-200 bg-white">
              <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">操作日志</h2>
              <div className="px-4 py-3">
                {data.activity.length === 0 ? (
                  <p className="text-sm text-slate-400">暂无操作日志</p>
                ) : (
                  <ol className="space-y-2.5">
                    {data.activity.map((entry) => (
                      <li key={entry.id} className="flex flex-col gap-0.5 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-slate-700">{ACTION_LABELS[entry.action] ?? entry.action}</span>
                          <span className="text-slate-600">{entry.operatorName}</span>
                          <span className="text-xs text-slate-400">{formatDateTime(entry.occurredAt)}</span>
                        </div>
                        {entry.detail && <p className="break-all text-xs text-slate-500">{entry.detail}</p>}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white">
              <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">通知记录</h2>
              <div className="px-4 py-3">
                {data.notifications.length === 0 ? (
                  <p className="text-sm text-slate-400">暂无通知记录</p>
                ) : (
                  <ul className="space-y-2.5">
                    {data.notifications.map((notification) => (
                      <li key={notification.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${NOTIFICATION_STATUS_CLASS[notification.status] ?? 'bg-slate-100 text-slate-600'}`}>
                            {NOTIFICATION_STATUS_LABELS[notification.status] ?? notification.status}
                          </span>
                          <span className="break-all text-xs text-slate-500">{notification.recipientEmail}</span>
                          <span className="text-xs text-slate-400">{formatDateTime(notification.sentAt)}</span>
                        </div>
                        <p className="mt-1 break-all text-xs text-slate-600">{notification.subject}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
