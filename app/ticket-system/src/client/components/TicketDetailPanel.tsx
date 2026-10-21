import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  addTicketReply,
  assignTicket,
  cancelTicket,
  completeTicket,
  getSubmitterProfile,
  getTicketDetail,
  getTicketLogs,
  listGroups,
  rateTicket,
  transferTicket,
} from '../api'
import {
  ErrorState,
  formatDateTime,
  PriorityBadge,
  Skeleton,
  StatusBadge,
  apiErrorMessage,
  useToast,
} from './ui'
import {
  isTerminal,
  logActionLabels,
  priorities,
  roleLabels,
  statusLabels,
  type BusinessGroup,
  type TicketDetail,
  type TicketLog,
  type UserProfileDetail,
  type UserProfileSummary,
} from '../types'

interface Props {
  ticketId: number | null
  currentUser: UserProfileSummary
  onTicketChanged: () => void
}

export default function TicketDetailPanel({ ticketId, currentUser, onTicketChanged }: Props) {
  const toast = useToast()
  const [detail, setDetail] = useState<TicketDetail | null>(null)
  const [logs, setLogs] = useState<TicketLog[]>([])
  const [submitterProfile, setSubmitterProfile] = useState<UserProfileDetail | null>(null)
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [replyText, setReplyText] = useState('')
  const [replyBusy, setReplyBusy] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState('')

  const [assignGroupId, setAssignGroupId] = useState('')
  const [transferGroupId, setTransferGroupId] = useState('')
  const [transferReason, setTransferReason] = useState('')
  const [resolution, setResolution] = useState('')
  const [cancelReason, setCancelReason] = useState('')
  const [ratingScore, setRatingScore] = useState(5)
  const [ratingComment, setRatingComment] = useState('')

  const isHandlerSide = currentUser.role === 'agent' || currentUser.role === 'company_admin'

  const load = useCallback(
    async (id: number) => {
      setLoading(true)
      setError('')
      setActionError('')
      try {
        const [ticket, logResult] = await Promise.all([getTicketDetail(id), getTicketLogs(id)])
        setDetail(ticket)
        setLogs(logResult.items)
        if (currentUser.role === 'submitter') {
          setSubmitterProfile(null)
        } else {
          setSubmitterProfile(await getSubmitterProfile(id).catch(() => null))
        }
      } catch (cause) {
        setDetail(null)
        setLogs([])
        setSubmitterProfile(null)
        setError(apiErrorMessage(cause))
      } finally {
        setLoading(false)
      }
    },
    [currentUser.role],
  )

  useEffect(() => {
    if (ticketId === null) {
      setDetail(null)
      setLogs([])
      setSubmitterProfile(null)
      setError('')
      setActionError('')
      setReplyText('')
      return
    }
    void load(ticketId)
  }, [ticketId, load])

  useEffect(() => {
    if (!isHandlerSide) {
      setGroups([])
      return
    }
    let cancelled = false
    listGroups()
      .then((result) => {
        if (!cancelled) setGroups(result.items)
      })
      .catch(() => {
        if (!cancelled) setGroups([])
      })
    return () => {
      cancelled = true
    }
  }, [isHandlerSide])

  const refreshAfterAction = async (successMessage: string) => {
    if (ticketId === null) return
    toast.show(successMessage)
    await load(ticketId)
    onTicketChanged()
  }

  const runAction = async (action: () => Promise<unknown>, successMessage: string) => {
    if (ticketId === null) return
    setActionBusy(true)
    setActionError('')
    try {
      await action()
      await refreshAfterAction(successMessage)
    } catch (cause) {
      setActionError(apiErrorMessage(cause))
    } finally {
      setActionBusy(false)
    }
  }

  const submitReply = async () => {
    if (ticketId === null || !replyText.trim()) return
    setReplyBusy(true)
    setActionError('')
    try {
      await addTicketReply(ticketId, replyText.trim())
      setReplyText('')
      await refreshAfterAction('回复已提交')
    } catch (cause) {
      setActionError(apiErrorMessage(cause))
    } finally {
      setReplyBusy(false)
    }
  }

  if (ticketId === null) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/60 p-10 text-center">
        <div>
          <p className="text-sm font-medium text-slate-500">选择左侧工单查看详情</p>
          <p className="mt-1.5 text-xs text-slate-400">可查看回复时间线、提交人完整信息、操作日志并执行处理动作</p>
        </div>
      </div>
    )
  }

  if (loading && !detail) {
    return (
      <div className="panel space-y-4 p-5" aria-busy>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => void load(ticketId)} />
  }

  if (!detail) return null

  const isSubmitterSelf = detail.submitter.id === currentUser.id
  const terminal = isTerminal(detail.status)
  const canReply = !terminal && (isHandlerSide || (currentUser.role === 'submitter' && isSubmitterSelf))
  const canAssign = isHandlerSide && detail.status === 'pending_assign'
  const canTransfer = isHandlerSide && detail.status === 'processing'
  const canComplete = isHandlerSide && detail.status === 'processing'
  const canCancel =
    !terminal && ((currentUser.role === 'submitter' && isSubmitterSelf) || currentUser.role === 'company_admin')
  const canRate = currentUser.role === 'submitter' && isSubmitterSelf && detail.status === 'completed' && !detail.rating
  const showSubmitterProfile = currentUser.role !== 'submitter'
  const hasAction = canAssign || canTransfer || canComplete || canCancel || canRate

  return (
    <div className={`space-y-4 ${loading ? 'opacity-60 transition-opacity' : ''}`}>
      {/* 概要 */}
      <section className="panel p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-slate-500">{detail.ticketNo}</span>
          <StatusBadge status={detail.status} />
          <PriorityBadge priority={detail.priority} />
          <span className="ml-auto text-xs text-slate-400">创建于 {formatDateTime(detail.createdAt)}</span>
        </div>
        <h2 className="mt-2 break-words text-lg font-semibold text-slate-900">{detail.subject}</h2>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <FieldRow label="分类" value={detail.categoryName} />
          <FieldRow label="当前业务组" value={detail.groupName ?? '未分配'} />
          <FieldRow label="处理人" value={detail.handlerName ?? '—'} />
          <FieldRow label="首次回复" value={formatDateTime(detail.firstReplyAt)} />
          <FieldRow label="完成时间" value={formatDateTime(detail.completedAt)} />
          <FieldRow label="取消时间" value={formatDateTime(detail.cancelledAt)} />
          <div>
            <dt className="text-xs text-slate-400">提交人</dt>
            <dd className="mt-0.5 text-slate-800">
              {detail.submitter.displayName}
              <span className="ml-2 text-xs text-slate-500">
                {detail.submitter.companyName} · {detail.submitter.department}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">所属公司</dt>
            <dd className="mt-0.5 text-slate-800">{detail.companyName}</dd>
          </div>
        </dl>
        <div className="mt-4">
          <h4 className="text-xs font-medium text-slate-400">问题描述</h4>
          <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">
            {detail.description}
          </p>
        </div>
        {detail.rating && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
            <p className="font-medium text-amber-700">
              满意度评价 {'★'.repeat(detail.rating.score)}
              <span className="text-amber-300">{'★'.repeat(5 - detail.rating.score)}</span>
              <span className="ml-2 text-amber-600">{detail.rating.score} / 5</span>
              <span className="ml-2 text-xs text-amber-500">{formatDateTime(detail.rating.createdAt)}</span>
            </p>
            {detail.rating.comment && (
              <p className="mt-1 whitespace-pre-wrap break-words text-amber-800">{detail.rating.comment}</p>
            )}
          </div>
        )}
      </section>

      {/* 多轮回复 */}
      <section className="panel p-5">
        <h3 className="text-sm font-semibold text-slate-800">回复时间线（{detail.replies.length}）</h3>
        {detail.replies.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 p-4 text-sm text-slate-400">
            暂无回复。提交人与处理人可以在下方进行多轮回复沟通。
          </p>
        ) : (
          <ol className="mt-3 space-y-3">
            {detail.replies.map((reply) => (
              <li key={reply.id} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-slate-800">
                    {reply.author.displayName}
                    <span className="ml-1.5 text-xs font-normal text-slate-400">
                      {roleLabels[reply.author.role]} · {reply.author.companyName}
                    </span>
                  </span>
                  <time className="text-xs text-slate-400" title={reply.createdAt}>
                    {formatDateTime(reply.createdAt)}
                  </time>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">
                  {reply.content}
                </p>
              </li>
            ))}
          </ol>
        )}
        {canReply ? (
          <form
            className="mt-4 space-y-2"
            onSubmit={(event) => {
              event.preventDefault()
              void submitReply()
            }}
          >
            <textarea
              className="input min-h-0 h-auto w-full resize-y px-3 py-2 leading-relaxed"
              rows={3}
              maxLength={5000}
              placeholder="输入回复内容（1–5000 字）"
              value={replyText}
              onChange={(event) => setReplyText(event.currentTarget.value)}
            />
            <div className="flex items-center gap-3">
              <button type="submit" className="btn btn-primary" disabled={replyBusy || !replyText.trim()}>
                {replyBusy ? '提交中…' : '提交回复'}
              </button>
              <span className="text-xs text-slate-400">{replyText.length} / 5000</span>
            </div>
          </form>
        ) : (
          <p className="mt-4 text-xs text-slate-400">
            {terminal ? '工单已结束，无法继续回复。' : '当前角色无法回复此工单。'}
          </p>
        )}
      </section>

      {/* 提交人完整信息（处理侧/运营视角） */}
      {showSubmitterProfile && (
        <section className="panel p-5">
          <h3 className="text-sm font-semibold text-slate-800">提交人完整信息</h3>
          {submitterProfile ? (
            <>
              <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <FieldRow label="姓名" value={submitterProfile.displayName} />
                <FieldRow label="邮箱" value={submitterProfile.email} />
                <FieldRow label="公司" value={submitterProfile.companyName} />
                <FieldRow label="部门" value={submitterProfile.department} />
              </dl>
              <h4 className="mt-4 text-xs font-medium text-slate-400">
                历史工单（{submitterProfile.historyTickets.length}）
              </h4>
              {submitterProfile.historyTickets.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400">该提交人暂无其他工单记录。</p>
              ) : (
                <div className="mt-2 overflow-hidden rounded-lg border border-slate-200">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">工单号</th>
                        <th className="px-3 py-2 font-medium">主题</th>
                        <th className="px-3 py-2 font-medium">优先级</th>
                        <th className="px-3 py-2 font-medium">状态</th>
                        <th className="px-3 py-2 font-medium">创建时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {submitterProfile.historyTickets.map((ticket) => (
                        <tr key={ticket.id} className="border-t border-slate-100">
                          <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-500">{ticket.ticketNo}</td>
                          <td className="max-w-[240px] truncate px-3 py-2 text-slate-700" title={ticket.subject}>
                            {ticket.subject}
                          </td>
                          <td className="px-3 py-2">
                            <PriorityBadge priority={ticket.priority} />
                          </td>
                          <td className="px-3 py-2">
                            <StatusBadge status={ticket.status} />
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">
                            {formatDateTime(ticket.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <p className="mt-3 text-sm text-slate-400">提交人详细信息暂不可用。</p>
          )}
        </section>
      )}

      {/* 操作日志 */}
      <section className="panel p-5">
        <h3 className="text-sm font-semibold text-slate-800">操作日志（{logs.length}）</h3>
        {logs.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">暂无操作日志。</p>
        ) : (
          <ol className="mt-3 space-y-1.5">
            {logs.map((log) => (
              <li key={log.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                <time className="w-36 shrink-0 text-xs text-slate-400" title={log.createdAt}>
                  {formatDateTime(log.createdAt)}
                </time>
                <span className="shrink-0 font-medium text-slate-700">{log.actor ? log.actor.displayName : '系统'}</span>
                <span className="shrink-0 text-slate-300">|</span>
                <span className="shrink-0 text-xs font-medium text-blue-700">{logActionLabels[log.action]}</span>
                <span className="min-w-0 flex-1 break-words text-xs text-slate-500">{log.detail}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* 处理动作 */}
      <section className="panel p-5">
        <h3 className="text-sm font-semibold text-slate-800">处理动作</h3>
        {actionError && (
          <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {actionError}
          </p>
        )}
        {!hasAction ? (
          <p className="mt-3 text-sm text-slate-400">
            {terminal
              ? detail.status === 'completed'
                ? detail.rating
                  ? '工单已完成并评价，流程结束。'
                  : '工单已完成，等待提交人满意度评价。'
                : '工单已取消，流程结束。'
              : '当前角色在此状态下无需执行操作。'}
          </p>
        ) : (
          <div className="mt-3 space-y-5">
            {canAssign && (
              <ActionBlock title="人工分配" description="将待分配工单指派到业务组，进入待处理状态。">
                <select
                  className="input max-w-56"
                  value={assignGroupId}
                  onChange={(event) => setAssignGroupId(event.currentTarget.value)}
                >
                  <option value="">选择业务组</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={actionBusy || !assignGroupId}
                  onClick={() =>
                    void runAction(
                      () => assignTicket(detail.id, Number(assignGroupId)),
                      `已分配至「${groups.find((group) => group.id === Number(assignGroupId))?.name ?? ''}」`,
                    )
                  }
                >
                  分配
                </button>
              </ActionBlock>
            )}
            {canTransfer && (
              <ActionBlock title="转派" description="将待处理工单转派给其他业务组，转派后仍为待处理状态。">
                <div className="grid max-w-xl grid-cols-2 gap-3">
                  <select
                    className="input"
                    value={transferGroupId}
                    onChange={(event) => setTransferGroupId(event.currentTarget.value)}
                  >
                    <option value="">选择目标业务组</option>
                    {groups
                      .filter((group) => group.id !== detail.groupId)
                      .map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                  </select>
                  <input
                    className="input"
                    placeholder="转派理由（可选，≤500 字）"
                    maxLength={500}
                    value={transferReason}
                    onChange={(event) => setTransferReason(event.currentTarget.value)}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={actionBusy || !transferGroupId}
                  onClick={() =>
                    void runAction(
                      () => transferTicket(detail.id, Number(transferGroupId), transferReason),
                      '转派成功',
                    )
                  }
                >
                  转派
                </button>
              </ActionBlock>
            )}
            {canComplete && (
              <ActionBlock title="完成工单" description="记录处理人与完成时间，并向提交人发送完成通知。">
                <input
                  className="input max-w-xl"
                  placeholder="处理说明（可选，≤2000 字）"
                  maxLength={2000}
                  value={resolution}
                  onChange={(event) => setResolution(event.currentTarget.value)}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={actionBusy}
                  onClick={() => void runAction(() => completeTicket(detail.id, resolution), '工单已完成，已通知提交人')}
                >
                  完成处理
                </button>
              </ActionBlock>
            )}
            {canCancel && (
              <ActionBlock title="取消工单" description="取消后工单进入终态，不再进入处理流程。">
                <input
                  className="input max-w-xl"
                  placeholder="取消理由（可选，≤500 字）"
                  maxLength={500}
                  value={cancelReason}
                  onChange={(event) => setCancelReason(event.currentTarget.value)}
                />
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={actionBusy}
                  onClick={() => void runAction(() => cancelTicket(detail.id, cancelReason), '工单已取消')}
                >
                  取消工单
                </button>
              </ActionBlock>
            )}
            {canRate && (
              <ActionBlock title="满意度评价" description="对已完成的工单提交 1–5 分评价，提交后不可修改。">
                <div className="flex items-center gap-1" role="radiogroup" aria-label="评分">
                  {[1, 2, 3, 4, 5].map((score) => (
                    <button
                      key={score}
                      type="button"
                      role="radio"
                      aria-checked={ratingScore === score}
                      aria-label={`${score} 分`}
                      className={`h-9 w-9 rounded-lg border text-lg leading-none transition-colors ${
                        score <= ratingScore
                          ? 'border-amber-300 bg-amber-50 text-amber-500'
                          : 'border-slate-200 bg-white text-slate-300 hover:text-amber-400'
                      }`}
                      onClick={() => setRatingScore(score)}
                    >
                      ★
                    </button>
                  ))}
                  <span className="ml-2 text-sm text-slate-500">{ratingScore} / 5</span>
                </div>
                <input
                  className="input max-w-xl"
                  placeholder="评价备注（可选，≤500 字）"
                  maxLength={500}
                  value={ratingComment}
                  onChange={(event) => setRatingComment(event.currentTarget.value)}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={actionBusy}
                  onClick={() => void runAction(() => rateTicket(detail.id, ratingScore, ratingComment), '评价已提交')}
                >
                  提交评价
                </button>
              </ActionBlock>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="mt-0.5 break-words text-slate-800" title={value}>
        {value}
      </dd>
    </div>
  )
}

function ActionBlock({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      <p className="mt-0.5 text-xs text-slate-400">{description}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">{children}</div>
    </div>
  )
}
