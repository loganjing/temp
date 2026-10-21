import {
  ArrowRightLeft,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  MessageSquare,
  Send,
  Star,
  UserRound,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  addTicketReply,
  assignTicket,
  cancelTicket,
  completeTicket,
  fetchTicketDetail,
  listGroups,
  rateTicket,
  transferTicket,
} from '../api/endpoints'
import type { GroupInfo, TicketDetailBundle } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { PriorityBadge, StatusBadge } from '../components/badges'
import { EmptyState, ErrorBanner, InlineNotice, SkeletonPanel, Spinner } from '../components/feedback'
import { useToast } from '../components/Toast'
import { formatDateTime, TICKET_EVENT_LABELS, timelineItemDetail, timelineOperatorName } from '../lib/labels'

const TERMINAL_STATUSES = new Set(['completed', 'cancelled'])

interface TicketDetailPanelProps {
  ticketId: number
  refreshKey?: number
  onChanged: () => void
  onSelectTicket: (ticketId: number) => void
}

export default function TicketDetailPanel({ ticketId, refreshKey = 0, onChanged, onSelectTicket }: TicketDetailPanelProps) {
  const { user } = useAuth()
  const toast = useToast()
  const [bundle, setBundle] = useState<TicketDetailBundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionPending, setActionPending] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [replyPending, setReplyPending] = useState(false)
  const [groups, setGroups] = useState<GroupInfo[] | null>(null)
  const [groupsError, setGroupsError] = useState<string | null>(null)
  const [assignFormOpen, setAssignFormOpen] = useState(false)
  const [assignGroupId, setAssignGroupId] = useState<number | null>(null)
  const [transferFormOpen, setTransferFormOpen] = useState(false)
  const [transferGroupId, setTransferGroupId] = useState<number | null>(null)
  const [ratingValue, setRatingValue] = useState(0)
  const [cancelConfirming, setCancelConfirming] = useState(false)

  const reloadDetail = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const result = await fetchTicketDetail(ticketId)
      setBundle(result)
      setActionError(null)
    } catch (err) {
      setBundle(null)
      if (err instanceof Error && 'status' in err && (err as { status: number }).status === 404) {
        setLoadError('工单不存在或无权限')
      } else {
        setLoadError(err instanceof Error ? err.message : '加载工单详情失败')
      }
    } finally {
      setLoading(false)
    }
  }, [ticketId])

  useEffect(() => {
    void reloadDetail()
  }, [reloadDetail, refreshKey])

  const ticket = bundle?.ticket ?? null
  const isTerminal = ticket != null && TERMINAL_STATUSES.has(ticket.status)

  // 分配/转派表单打开时加载本公司业务组列表
  useEffect(() => {
    if (groups !== null || groupsError !== null) return
    if (!assignFormOpen && !transferFormOpen) return
    if (ticket == null) return
    if (ticket.status !== 'pending_assignment' && ticket.status !== 'pending_process') return
    listGroups()
      .then((result) => setGroups(result.items))
      .catch((err: unknown) => {
        setGroupsError(err instanceof Error ? err.message : '加载业务组失败')
      })
  }, [assignFormOpen, transferFormOpen, groups, groupsError, ticket])

  const runAction = useCallback(
    async (key: string, action: () => Promise<void>, successText: string): Promise<boolean> => {
      setActionError(null)
      setActionPending(key)
      try {
        await action()
        toast.show(successText)
        await reloadDetail()
        onChanged()
        return true
      } catch (err) {
        const status = err instanceof Error && 'status' in err ? (err as { status: number }).status : undefined
        if (status === 404) {
          setBundle(null)
          setLoadError('工单不存在或无权限')
          onChanged()
        } else {
          setActionError(err instanceof Error ? err.message : '操作失败，请稍后重试')
          // 状态冲突后刷新详情与列表，保证界面与服务端状态一致
          await reloadDetail()
          onChanged()
        }
        return false
      } finally {
        setActionPending(null)
      }
    },
    [onChanged, reloadDetail, toast],
  )

  const submitReply = async (event: FormEvent) => {
    event.preventDefault()
    if (ticket == null || replyPending) return
    const content = replyText.trim()
    if (!content) {
      setActionError('回复内容不能为空')
      return
    }
    setActionError(null)
    setReplyPending(true)
    try {
      await addTicketReply(ticket.id, content)
      setReplyText('')
      toast.show('回复已提交')
      await reloadDetail()
      onChanged()
    } catch (err) {
      const status = err instanceof Error && 'status' in err ? (err as { status: number }).status : undefined
      if (status === 404) {
        setBundle(null)
        setLoadError('工单不存在或无权限')
        onChanged()
      } else {
        setActionError(err instanceof Error ? err.message : '回复失败，请稍后重试')
        await reloadDetail()
        onChanged()
      }
    } finally {
      setReplyPending(false)
    }
  }

  const submitRating = (event: FormEvent) => {
    event.preventDefault()
    if (ticket == null) return
    if (ratingValue < 1 || ratingValue > 5) {
      setActionError('请选择 1–5 的满意度评分')
      return
    }
    void runAction('rating', () => rateTicket(ticket.id, ratingValue), '评价已提交')
  }

  const terminalNotice = (action: string) => {
    const label = ticket?.status === 'cancelled' ? '工单已取消' : '工单已完成'
    setActionError(`${label}，不能${action}`)
  }

  const submitAssign = (event: FormEvent) => {
    event.preventDefault()
    if (ticket == null || assignGroupId == null) return
    void runAction('assign', () => assignTicket(ticket.id, assignGroupId), '工单已分配').then((success) => {
      if (success) {
        setAssignFormOpen(false)
        setAssignGroupId(null)
      }
    })
  }

  const submitTransfer = (event: FormEvent) => {
    event.preventDefault()
    if (ticket == null || transferGroupId == null) return
    void runAction('transfer', () => transferTicket(ticket.id, transferGroupId), '工单已转派').then((success) => {
      if (success) {
        setTransferFormOpen(false)
        setTransferGroupId(null)
      }
    })
  }

  const transferableGroups = useMemo(() => {
    if (groups === null || ticket === null) return []
    return groups.filter((group) => group.id !== ticket.assignedGroupId)
  }, [groups, ticket])

  if (loading && bundle === null && loadError === null) {
    return (
      <div className="h-full overflow-y-auto bg-white">
        <SkeletonPanel />
      </div>
    )
  }

  if (loadError !== null) {
    return (
      <div className="h-full overflow-y-auto bg-white">
        {loadError === '工单不存在或无权限' ? (
          <EmptyState title="工单不存在或无权限" hint="该工单可能已被删除，或属于其他公司，你无权查看。" />
        ) : (
          <ErrorBanner message={loadError} onRetry={() => void reloadDetail()} />
        )}
      </div>
    )
  }

  if (ticket == null || bundle == null) {
    return <div className="h-full overflow-y-auto bg-white" />
  }

  const ratingInfo = bundle.rating
  const canRate = ticket.status === 'completed' && user != null && ticket.submitter.id === user.id

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      {/* 详情头部：基础信息与操作 */}
      <div className="border-b border-slate-200 px-6 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-slate-500">{ticket.ticketNo}</span>
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{ticket.categoryName}</span>
          {isTerminal ? <span className="ml-auto text-[11px] text-slate-400">终态工单，不可再流转</span> : null}
        </div>
        <h2 className="mt-2 text-lg font-semibold leading-snug text-slate-900">{ticket.subject}</h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-slate-500 lg:grid-cols-3">
          <Row term="提交人" value={ticket.submitter.fullName} emphasized />
          <Row term="公司" value={ticket.companyName} />
          <Row term="归属业务组" value={ticket.assignedGroupName ?? '未分配'} emphasized />
          <Row term="创建时间" value={formatDateTime(ticket.createdAt)} />
          <Row term="更新时间" value={formatDateTime(ticket.updatedAt)} />
          <Row term="首次回复" value={formatDateTime(ticket.firstReplyAt)} />
          {ticket.completedBy ? <Row term="处理人" value={ticket.completedBy.fullName} emphasized /> : null}
          {ticket.completedAt ? <Row term="完成时间" value={formatDateTime(ticket.completedAt)} /> : null}
        </dl>

        {/* 操作区：按状态提供分配 / 转派 / 完成 / 取消 */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {ticket.status === 'pending_assignment' ? (
            <ActionButton
              onClick={() => {
                setActionError(null)
                setTransferFormOpen(false)
                setAssignFormOpen((open) => !open)
              }}
              active={assignFormOpen}
              pending={actionPending === 'assign'}
              icon={ClipboardCheck}
              label="分配到业务组"
            />
          ) : isTerminal ? (
            <MutedActionButton onClick={() => terminalNotice('再分配')} label="分配到业务组" title="终态工单不可分配" />
          ) : null}

          {ticket.status === 'pending_process' ? (
            <ActionButton
              onClick={() => {
                setActionError(null)
                setAssignFormOpen(false)
                setTransferFormOpen((open) => !open)
              }}
              active={transferFormOpen}
              pending={actionPending === 'transfer'}
              icon={ArrowRightLeft}
              label="转派"
            />
          ) : isTerminal ? (
            <MutedActionButton onClick={() => terminalNotice('转派')} label="转派" title="终态工单不可转派" />
          ) : null}

          {ticket.status === 'pending_process' ? (
            <button
              type="button"
              disabled={actionPending !== null}
              onClick={() => void runAction('complete', () => completeTicket(ticket.id), '工单已完成，完成通知已进入发件箱')}
              className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {actionPending === 'complete' ? <Spinner className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
              完成处理
            </button>
          ) : isTerminal ? (
            <MutedActionButton onClick={() => terminalNotice('再次完成')} label="完成处理" title="终态工单不可再次完成" />
          ) : null}

          {!isTerminal ? (
            cancelConfirming ? (
              <span className="inline-flex items-center gap-2">
                <span className="text-xs text-slate-500">确认取消该工单？取消后不可恢复。</span>
                <button
                  type="button"
                  disabled={actionPending !== null}
                  onClick={() => {
                    setCancelConfirming(false)
                    void runAction('cancel', () => cancelTicket(ticket.id), '工单已取消')
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {actionPending === 'cancel' ? <Spinner className="h-3.5 w-3.5" /> : null}
                  确认取消
                </button>
                <button
                  type="button"
                  onClick={() => setCancelConfirming(false)}
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  返回
                </button>
              </span>
            ) : (
              <button
                type="button"
                disabled={actionPending !== null}
                onClick={() => setCancelConfirming(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                取消工单
              </button>
            )
          ) : (
            <MutedActionButton onClick={() => terminalNotice('取消')} label="取消工单" title="终态工单不可取消" />
          )}
        </div>

        {actionError ? (
          <div className="mt-3">
            <InlineNotice kind="error">{actionError}</InlineNotice>
          </div>
        ) : null}

        {/* 分配表单 */}
        {assignFormOpen && ticket.status === 'pending_assignment' ? (
          <form onSubmit={submitAssign} className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <label htmlFor="assign-group" className="text-xs font-medium text-slate-600">
              目标业务组
            </label>
            <select
              id="assign-group"
              value={assignGroupId ?? ''}
              onChange={(event) => setAssignGroupId(event.target.value ? Number(event.target.value) : null)}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
            >
              <option value="">请选择业务组</option>
              {(groups ?? []).map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}（{group.memberCount} 人）
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={actionPending !== null || assignGroupId == null}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              确认分配
            </button>
            <button
              type="button"
              onClick={() => setAssignFormOpen(false)}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              关闭
            </button>
            {groupsError ? <span className="text-xs text-red-600">{groupsError}</span> : null}
            {groups === null && groupsError === null ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                <Spinner className="h-3 w-3" />
                加载业务组…
              </span>
            ) : null}
            {groups !== null && groups.length === 0 ? (
              <span className="text-xs text-slate-400">本公司暂无业务组，请先在「业务组」页创建。</span>
            ) : null}
          </form>
        ) : null}

        {/* 转派表单 */}
        {transferFormOpen && ticket.status === 'pending_process' ? (
          <form onSubmit={submitTransfer} className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <label htmlFor="transfer-group" className="text-xs font-medium text-slate-600">
              转派目标业务组
            </label>
            <select
              id="transfer-group"
              value={transferGroupId ?? ''}
              onChange={(event) => setTransferGroupId(event.target.value ? Number(event.target.value) : null)}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
            >
              <option value="">请选择业务组</option>
              {transferableGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}（{group.memberCount} 人）
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={actionPending !== null || transferGroupId == null}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              确认转派
            </button>
            <button
              type="button"
              onClick={() => setTransferFormOpen(false)}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              关闭
            </button>
            {groupsError ? <span className="text-xs text-red-600">{groupsError}</span> : null}
            {groups === null && groupsError === null ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                <Spinner className="h-3 w-3" />
                加载业务组…
              </span>
            ) : null}
            {groups !== null && transferableGroups.length === 0 ? (
              <span className="text-xs text-slate-400">没有其他可转派的业务组，请先创建。</span>
            ) : null}
          </form>
        ) : null}
      </div>

      {/* 主体两栏：描述与回复 / 提交人上下文 */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">问题描述</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{ticket.description || '（无描述）'}</p>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">沟通回复（{bundle.replies.length}）</h3>
            <div className="mt-3 space-y-3">
              {bundle.replies.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400">
                  暂无回复，发送第一条回复开始沟通。
                </p>
              ) : (
                bundle.replies.map((reply) => (
                  <article key={reply.id} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700">
                        <MessageSquare className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                        {reply.author.fullName}
                      </span>
                      <time className="text-[11px] text-slate-400" dateTime={reply.createdAt}>
                        {formatDateTime(reply.createdAt)}
                      </time>
                      {user != null && reply.author.id === user.id ? (
                        <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">我</span>
                      ) : null}
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-slate-700">{reply.content}</p>
                  </article>
                ))
              )}
            </div>

            {!isTerminal ? (
              <form onSubmit={submitReply} className="mt-4 space-y-2">
                <label htmlFor="reply-content" className="text-xs font-medium text-slate-600">
                  添加回复
                </label>
                <textarea
                  id="reply-content"
                  rows={3}
                  maxLength={5000}
                  value={replyText}
                  onChange={(event) => setReplyText(event.target.value)}
                  placeholder="输入回复内容（≤5000 字）"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">工单完成后不可再回复</span>
                  <button
                    type="submit"
                    disabled={replyPending}
                    className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {replyPending ? <Spinner className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" aria-hidden="true" />}
                    {replyPending ? '提交中…' : '提交回复'}
                  </button>
                </div>
              </form>
            ) : (
              <p className="mt-3 text-xs text-slate-400">
                {ticket.status === 'completed' ? '工单已完成，回复通道关闭。' : '工单已取消，回复通道关闭。'}
              </p>
            )}
          </section>
        </div>

        <aside className="w-full shrink-0 space-y-4 overflow-y-auto border-t border-slate-200 bg-slate-50/50 px-6 py-5 lg:w-80 lg:border-l lg:border-t-0">
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
              提交人信息
            </h3>
            <dl className="mt-2.5 space-y-1.5 text-xs">
              <Row term="姓名" value={ticket.submitter.fullName} emphasized />
              <Row term="邮箱" value={ticket.submitter.email} emphasized />
              <Row term="公司" value={ticket.submitter.companyName} emphasized />
              <Row term="部门" value={ticket.submitter.department} emphasized />
            </dl>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
              历史工单（{bundle.submitterHistory.length}）
            </h3>
            <ul className="mt-2.5 space-y-1.5">
              {bundle.submitterHistory.length === 0 ? (
                <li className="text-xs text-slate-400">该提交人暂无其他工单。</li>
              ) : (
                bundle.submitterHistory.map((history) => (
                  <li key={history.id}>
                    <button
                      type="button"
                      onClick={() => onSelectTicket(history.id)}
                      className={`w-full rounded-md border px-2.5 py-2 text-left text-xs transition-colors ${
                        history.id === ticket.id ? 'border-indigo-200 bg-indigo-50/60' : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[10px] text-slate-400">{history.ticketNo}</span>
                        <StatusBadge status={history.status} />
                      </div>
                      <p className="mt-1 truncate text-slate-700" title={history.subject}>
                        {history.subject}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-400">{formatDateTime(history.createdAt)}</p>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              操作时间线
            </h3>
            <ol className="mt-2.5 space-y-3">
              {bundle.timeline.length === 0 ? (
                <li className="text-xs text-slate-400">暂无操作记录。</li>
              ) : (
                bundle.timeline.map((item, index) => (
                  <li key={index} className="relative pl-4">
                    <span className="absolute left-0 top-1.5 h-1.5 w-1.5 rounded-full bg-indigo-400" aria-hidden="true" />
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-xs font-medium text-slate-700">{TICKET_EVENT_LABELS[item.type] ?? item.type}</span>
                      <span className="text-[11px] text-slate-400">{timelineOperatorName(item.operator)}</span>
                    </div>
                    <p className="text-[11px] text-slate-400">{formatDateTime(item.occurredAt)}</p>
                    {timelineItemDetail(item) ? <p className="text-[11px] text-slate-500">{timelineItemDetail(item)}</p> : null}
                  </li>
                ))
              )}
            </ol>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <Star className="h-3.5 w-3.5" aria-hidden="true" />
              满意度评价
            </h3>
            {ratingInfo ? (
              <div className="mt-2.5 rounded-md border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-slate-600">
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <Star
                      key={value}
                      className={`h-3.5 w-3.5 ${value <= ratingInfo.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
                      aria-hidden="true"
                    />
                  ))}
                  <span className="ml-1 font-semibold text-slate-700">{ratingInfo.rating}/5</span>
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500">
                  评价人 {ratingInfo.ratedBy.fullName} · {formatDateTime(ratingInfo.ratedAt)}
                </p>
              </div>
            ) : ticket.status === 'completed' && !canRate ? (
              <p className="mt-2.5 text-xs text-slate-400">等待提交人评价。</p>
            ) : null}

            {canRate ? (
              <form onSubmit={submitRating} className="mt-3 space-y-2">
                <div className="flex items-center gap-1" role="radiogroup" aria-label="满意度评分">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-label={`${value} 星`}
                      onClick={() => setRatingValue(value)}
                      className="rounded p-0.5 transition-colors hover:bg-amber-50"
                    >
                      <Star
                        className={`h-5 w-5 ${value <= ratingValue ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
                        aria-hidden="true"
                      />
                    </button>
                  ))}
                  <span className="ml-1 text-xs text-slate-500">{ratingValue > 0 ? `${ratingValue}/5` : '未选择'}</span>
                </div>
                <button
                  type="submit"
                  disabled={actionPending !== null}
                  className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {actionPending === 'rating' ? <Spinner className="h-3.5 w-3.5" /> : null}
                  提交评价
                </button>
                {ratingInfo ? (
                  <p className="text-[11px] leading-4 text-slate-400">该工单已评价，重复提交将被拒绝。</p>
                ) : (
                  <p className="text-[11px] leading-4 text-slate-400">每个工单仅可评价一次，提交后不可修改。</p>
                )}
              </form>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  )
}

function Row({ term, value, emphasized }: { term: string; value: string; emphasized?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="shrink-0 text-slate-400">{term}</dt>
      <dd className={`truncate ${emphasized ? 'font-medium text-slate-700' : 'text-slate-600'}`} title={value}>
        {value || '—'}
      </dd>
    </div>
  )
}

function ActionButton({
  onClick,
  active,
  pending,
  icon: Icon,
  label,
}: {
  onClick: () => void
  active: boolean
  pending: boolean
  icon: LucideIcon
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        active ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-700 hover:bg-slate-50'
      }`}
    >
      {pending ? <Spinner className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
      {label}
    </button>
  )
}

function MutedActionButton({ onClick, label, title }: { onClick: () => void; label: string; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-disabled="true"
      className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-300"
    >
      {label}
    </button>
  )
}
