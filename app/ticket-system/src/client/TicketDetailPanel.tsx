// 工单详情面板：概要、回复时间线、按角色呈现的操作、提交人完整信息与历史工单、操作日志。
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowRightLeft, CircleUser, Clock, ScrollText, Send, Star, UserPlus } from 'lucide-react'
import {
  apiAddReply,
  apiAssignTicket,
  apiCancelTicket,
  apiCompleteTicket,
  apiGetTicket,
  apiListGroups,
  apiRateTicket,
  apiSubmitterHistory,
  apiTicketLogs,
  apiTransferTicket,
} from './api'
import type { AuditEvent, Group, GroupRef, MeResponse, SubmitterHistoryResponse, TicketDetail, TicketSummary } from './contracts'
import {
  auditDetailKeyLabel,
  auditEventLabels,
  formatDateTime,
  priorityLabels,
  priorityTones,
  replySideLabels,
  ticketStatusLabels,
  ticketStatusTones,
} from './labels'
import { apiErrorMessage, Badge, ConfirmButton, EmptyState, ErrorBanner, Skeleton, SuccessBanner } from './shared'

export function TicketDetailPanel({
  ticketId,
  me,
  onTicketChanged,
  onOpenTicket,
}: {
  ticketId: number
  me: MeResponse
  onTicketChanged: () => void
  onOpenTicket: (id: number) => void
}) {
  const [detail, setDetail] = useState<TicketDetail | null>(null)
  const [history, setHistory] = useState<SubmitterHistoryResponse | null>(null)
  const [logs, setLogs] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [replyContent, setReplyContent] = useState('')
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignGroupId, setAssignGroupId] = useState('')
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferGroupId, setTransferGroupId] = useState('')
  const [ratingScore, setRatingScore] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const [ticket, submitterHistory, ticketLogs] = await Promise.all([
        apiGetTicket(ticketId),
        apiSubmitterHistory(ticketId),
        apiTicketLogs(ticketId),
      ])
      setDetail(ticket)
      setHistory(submitterHistory)
      setLogs(ticketLogs.events)
    } catch (cause) {
      setDetail(null)
      setHistory(null)
      setLogs([])
      setLoadError(apiErrorMessage(cause, '工单详情加载失败'))
    } finally {
      setLoading(false)
    }
  }, [ticketId])

  useEffect(() => {
    setActionError('')
    setActionMessage('')
    setReplyContent('')
    setAssignOpen(false)
    setTransferOpen(false)
    setRatingScore(0)
    void load()
  }, [load])

  const isSubmitter = detail != null && me.user.id === detail.submitter.id
  const isCompanyAdmin = detail != null && me.org?.isCompanyAdmin === true && me.org.companyId === detail.company.id
  const isAssignedMember = detail?.assignedGroup != null && me.groups.some((group) => group.id === detail.assignedGroup!.id)

  const canReply = detail != null && (isSubmitter || isAssignedMember)
  const canAssign = isCompanyAdmin && detail?.status === 'awaiting_assignment'
  const canTransfer = (isAssignedMember || isCompanyAdmin) && detail?.status === 'pending'
  const canComplete = (isAssignedMember || isCompanyAdmin) && detail?.status === 'pending'
  const canCancel =
    detail != null &&
    (isSubmitter || isCompanyAdmin) &&
    (detail.status === 'awaiting_assignment' || detail.status === 'pending')
  const canRate = isSubmitter && detail?.status === 'completed' && detail?.rating == null

  // 手工分配组选项：本公司全部业务组（公司管理员）。
  const [assignGroups, setAssignGroups] = useState<Group[]>([])
  useEffect(() => {
    if (!canAssign || me.org == null) return
    let cancelled = false
    void apiListGroups(me.org.companyId)
      .then((groups) => {
        if (!cancelled) setAssignGroups(groups)
      })
      .catch((cause) => setActionError(apiErrorMessage(cause, '业务组加载失败')))
    return () => {
      cancelled = true
    }
  }, [canAssign, me.org, ticketId])

  // 公司管理员转派时的目标组选项：工单所属公司的全部业务组。
  const [adminGroups, setAdminGroups] = useState<Group[]>([])
  useEffect(() => {
    if (!canTransfer || !isCompanyAdmin || detail == null) return
    let cancelled = false
    void apiListGroups(detail.company.id)
      .then((groups) => {
        if (!cancelled) setAdminGroups(groups)
      })
      .catch((cause) => setActionError(apiErrorMessage(cause, '业务组加载失败')))
    return () => {
      cancelled = true
    }
  }, [canTransfer, isCompanyAdmin, detail])

  // 转派目标组：公司管理员取工单所属公司全部组；普通成员取自己所属且属于该工单公司的组；均排除当前组。
  const transferGroups = useMemo<GroupRef[]>(() => {
    if (detail == null || !canTransfer) return []
    if (isCompanyAdmin) {
      return adminGroups
        .filter((group) => group.id !== detail.assignedGroup?.id)
        .map((group) => ({ id: group.id, name: group.name }))
    }
    return me.groups
      .filter((group) => group.companyId === detail.company.id && group.id !== detail.assignedGroup?.id)
      .map((group) => ({ id: group.id, name: group.name }))
  }, [detail, canTransfer, isCompanyAdmin, adminGroups, me.groups])

  const runAction = async (action: () => Promise<void>) => {
    setBusy(true)
    setActionError('')
    setActionMessage('')
    try {
      await action()
    } catch (cause) {
      setActionError(apiErrorMessage(cause, '操作失败'))
    } finally {
      setBusy(false)
    }
  }

  const reloadAll = async () => {
    await load()
    onTicketChanged()
  }

  const submitReply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (detail == null) return
    const content = replyContent.trim()
    if (!content) return
    void runAction(async () => {
      await apiAddReply(detail.id, content)
      setReplyContent('')
      setActionMessage('回复已提交。')
      await reloadAll()
    })
  }

  const assign = () => {
    if (detail == null || !assignGroupId) return
    void runAction(async () => {
      await apiAssignTicket(detail.id, Number(assignGroupId))
      setAssignOpen(false)
      setAssignGroupId('')
      setActionMessage('工单已分配，状态为待处理。')
      await reloadAll()
    })
  }

  const transfer = () => {
    if (detail == null || !transferGroupId) return
    void runAction(async () => {
      await apiTransferTicket(detail.id, Number(transferGroupId))
      setTransferOpen(false)
      setTransferGroupId('')
      setActionMessage('工单已转派到目标业务组。')
      await reloadAll()
    })
  }

  const complete = () => {
    if (detail == null) return
    void runAction(async () => {
      const result = await apiCompleteTicket(detail.id)
      setActionMessage(
        result.notification.emailSent
          ? '工单已完成，完成通知邮件已发送至提交人邮箱。'
          : `工单已完成，但完成通知邮件发送失败${result.notification.error ? `：${result.notification.error}` : ''}。`,
      )
      await reloadAll()
    })
  }

  const cancel = () => {
    if (detail == null) return
    void runAction(async () => {
      await apiCancelTicket(detail.id)
      setActionMessage('工单已取消。')
      await reloadAll()
    })
  }

  const rate = () => {
    if (detail == null || ratingScore < 1) return
    void runAction(async () => {
      await apiRateTicket(detail.id, ratingScore)
      setRatingScore(0)
      setActionMessage('满意度评价已提交。')
      await reloadAll()
    })
  }

  if (loading) {
    return (
      <section className="min-w-0 flex-1 space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </section>
    )
  }

  if (loadError || detail == null) {
    return (
      <section className="flex min-w-0 flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white p-8">
        <EmptyState title="工单不存在或不可见" description={loadError || '该工单可能属于其他公司或已被删除。'} />
      </section>
    )
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 gap-4">
      <section className="flex min-w-0 flex-1 flex-col overflow-y-auto rounded-xl border border-slate-200 bg-white">
        <header className="border-b border-slate-200 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="min-w-0 flex-1 text-lg font-semibold text-slate-900">
              #{detail.id} {detail.subject}
            </h2>
            <Badge tone={ticketStatusTones[detail.status]}>{ticketStatusLabels[detail.status]}</Badge>
            <Badge tone={priorityTones[detail.priority]}>{priorityLabels[detail.priority]}</Badge>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-slate-500 sm:grid-cols-3">
            <Field label="问题分类" value={detail.category.name} />
            <Field label="所属公司" value={detail.company.name} />
            <Field label="创建时间" value={formatDateTime(detail.createdAt)} />
            <Field label="归属业务组" value={detail.assignedGroup?.name ?? '未分配'} />
            <Field label="处理人" value={detail.handler?.name ?? '—'} />
            <Field label="完成时间" value={formatDateTime(detail.handledAt)} />
          </dl>
        </header>

        <div className="space-y-4 px-5 py-4">
          {actionError && <ErrorBanner message={actionError} />}
          {actionMessage && <SuccessBanner message={actionMessage} />}

          <section aria-label="工单描述">
            <h3 className="section-title">描述</h3>
            <p className="whitespace-pre-wrap break-words rounded-lg bg-slate-50 px-3.5 py-3 text-sm leading-6 text-slate-700">
              {detail.description}
            </p>
          </section>

          {detail.rating != null && (
            <section aria-label="满意度评价">
              <h3 className="section-title">满意度评价</h3>
              <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
                <StarRating score={detail.rating.score} />
                <span>
                  {detail.rating.score} / 5 · 评价于 {formatDateTime(detail.rating.createdAt)}
                </span>
              </p>
            </section>
          )}

          {(canAssign || canTransfer || canComplete || canCancel || canRate) && (
            <section aria-label="工单操作">
              <h3 className="section-title">操作</h3>
              <div className="flex flex-wrap items-center gap-2">
                {canAssign && (
                  <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setAssignOpen((open) => !open)}>
                    <UserPlus className="h-4 w-4" />
                    手工分配
                  </button>
                )}
                {canTransfer && (
                  <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setTransferOpen((open) => !open)}>
                    <ArrowRightLeft className="h-4 w-4" />
                    转派
                  </button>
                )}
                {canComplete && (
                  <ConfirmButton label="完成处理" confirmLabel="确认完成？" tone="primary" busy={busy} onConfirm={complete} />
                )}
                {canCancel && (
                  <ConfirmButton label="取消工单" confirmLabel="确认取消？" tone="secondary" busy={busy} onConfirm={cancel} />
                )}
              </div>

              {canAssign && assignOpen && (
                <form className="action-form" onSubmit={(event) => { event.preventDefault(); assign() }}>
                  <label className="label">
                    分配到业务组
                    <select className="input" value={assignGroupId} onChange={(event) => setAssignGroupId(event.currentTarget.value)} required aria-label="分配到业务组">
                      <option value="" disabled>
                        请选择业务组
                      </option>
                      {assignGroups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="submit" className="btn btn-primary" disabled={busy || !assignGroupId}>
                    {busy ? '处理中…' : '确认分配'}
                  </button>
                </form>
              )}

              {canTransfer && transferOpen && (
                <form className="action-form" onSubmit={(event) => { event.preventDefault(); transfer() }}>
                  <label className="label">
                    转派到业务组
                    <select className="input" value={transferGroupId} onChange={(event) => setTransferGroupId(event.currentTarget.value)} required>
                      <option value="" disabled>
                        请选择目标业务组
                      </option>
                      {transferGroups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="submit" className="btn btn-primary" disabled={busy || !transferGroupId}>
                    {busy ? '处理中…' : '确认转派'}
                  </button>
                </form>
              )}

              {canRate && (
                <form className="action-form" onSubmit={(event) => { event.preventDefault(); rate() }}>
                  <span className="label">满意度评分（1-5）</span>
                  <div className="flex items-center gap-1" role="radiogroup" aria-label="满意度评分">
                    {[1, 2, 3, 4, 5].map((score) => (
                      <button
                        key={score}
                        type="button"
                        aria-label={`${score} 分`}
                        aria-checked={ratingScore === score}
                        role="radio"
                        className="btn-ghost rounded"
                        onClick={() => setRatingScore(score)}
                      >
                        <Star className={`h-6 w-6 ${ratingScore >= score ? 'fill-amber-400' : 'fill-transparent'}`} />
                      </button>
                    ))}
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={busy || ratingScore < 1}>
                    {busy ? '提交中…' : '提交评价'}
                  </button>
                </form>
              )}
            </section>
          )}

          <section aria-label="回复时间线">
            <h3 className="section-title">沟通回复（{detail.replies.length}）</h3>
            {detail.replies.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-3.5 py-3 text-sm text-slate-500">
                暂无回复，提交人或处理方回复后将显示在这里。
              </p>
            ) : (
              <ol className="space-y-3">
                {detail.replies.map((reply) => (
                  <li key={reply.id} className="flex gap-3">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${reply.side === 'submitter' ? 'bg-slate-100 text-slate-600' : 'bg-blue-100 text-blue-700'}`} title={reply.author.name}>
                      {reply.author.name.slice(0, 1)}
                    </span>
                    <div className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-slate-900">{reply.author.name}</span>
                        <Badge tone={reply.side === 'submitter' ? 'gray' : 'blue'}>{replySideLabels[reply.side]}</Badge>
                        <span className="text-xs text-slate-400" title={reply.createdAt}>
                          {formatDateTime(reply.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{reply.content}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}

            {canReply ? (
              <form className="mt-3" onSubmit={submitReply}>
                <label className="label">
                  新增回复
                  <textarea
                    className="input min-h-20"
                    value={replyContent}
                    onChange={(event) => setReplyContent(event.currentTarget.value)}
                    placeholder="输入回复内容（1-10000 字）"
                    maxLength={10000}
                    required
                  />
                </label>
                <button type="submit" className="btn btn-primary mt-2" disabled={busy || !replyContent.trim()}>
                  <Send className="h-4 w-4" />
                  {busy ? '提交中…' : '发送回复'}
                </button>
              </form>
            ) : (
              <p className="mt-3 text-xs text-slate-400">工单提交人与当前归属业务组成员可回复。</p>
            )}
          </section>
        </div>
      </section>

      <aside className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto">
        <section className="rounded-xl border border-slate-200 bg-white p-4" aria-label="提交人信息">
          <h3 className="section-title flex items-center gap-1.5">
            <CircleUser className="h-4 w-4 text-slate-400" />
            提交人
          </h3>
          <dl className="space-y-1.5 text-sm">
            <Field block label="姓名" value={detail.submitter.name} />
            <Field block label="邮箱" value={detail.submitter.email} />
            <Field block label="公司" value={detail.company.name} />
            <Field block label="部门" value={detail.submitter.department} />
          </dl>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4" aria-label="历史工单">
          <h3 className="section-title flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-slate-400" />
            提交人历史工单（{history?.tickets.length ?? 0}）
          </h3>
          {history == null || history.tickets.length === 0 ? (
            <p className="text-xs text-slate-400">该提交人暂无历史工单。</p>
          ) : (
            <ul className="space-y-1.5">
              {history.tickets.map((ticket) => (
                <li key={ticket.id}>
                  <button
                    type="button"
                    className={`w-full rounded-lg border px-2.5 py-2 text-left text-xs transition-colors ${
                      ticket.id === detail.id ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                    onClick={() => onOpenTicket(ticket.id)}
                  >
                    <span className="block truncate font-medium text-slate-800" title={ticket.subject}>
                      #{ticket.id} {ticket.subject}
                    </span>
                    <span className="mt-1 flex items-center gap-1.5">
                      <Badge tone={ticketStatusTones[ticket.status]}>{ticketStatusLabels[ticket.status]}</Badge>
                      <span className="text-slate-400">{formatDateTime(ticket.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4" aria-label="操作日志">
          <h3 className="section-title flex items-center gap-1.5">
            <ScrollText className="h-4 w-4 text-slate-400" />
            操作日志（{logs.length}）
          </h3>
          {logs.length === 0 ? (
            <p className="text-xs text-slate-400">暂无操作记录。</p>
          ) : (
            <ol className="space-y-2.5">
              {logs.map((event) => (
                <li key={event.id} className="border-l-2 border-slate-200 pl-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium text-slate-800">{auditEventLabels[event.type] ?? event.type}</span>
                    <span className="text-xs text-slate-400" title={event.createdAt}>
                      {formatDateTime(event.createdAt)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">操作人：{event.actor.name}</p>
                  {event.detail != null && Object.keys(event.detail).length > 0 && (
                    <dl className="mt-1 space-y-0.5 text-[11px] text-slate-400">
                      {Object.entries(event.detail)
                        .filter(([, value]) => value != null)
                        .map(([key, value]) => (
                          <div key={key} className="flex gap-1.5">
                            <dt className="shrink-0">{auditDetailKeyLabel(key)}：</dt>
                            <dd className="min-w-0 break-all">{renderDetailValue(key, value)}</dd>
                          </div>
                        ))}
                    </dl>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      </aside>
    </div>
  )
}

function renderDetailValue(key: string, value: unknown): string {
  if (key === 'score') return `${value} / 5`
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

function Field({ label, value, block = false }: { label: string; value: string; block?: boolean }) {
  if (block) {
    return (
      <div className="flex items-baseline justify-between gap-3">
        <dt className="shrink-0 text-xs text-slate-500">{label}</dt>
        <dd className="min-w-0 break-all text-right text-sm text-slate-800" title={value}>
          {value}
        </dd>
      </div>
    )
  }
  return (
    <div>
      <dt className="text-slate-400">{label}</dt>
      <dd className="break-all text-slate-700" title={value}>
        {value}
      </dd>
    </div>
  )
}

function StarRating({ score }: { score: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`评分 ${score} / 5`}>
      {[1, 2, 3, 4, 5].map((position) => (
        <Star key={position} className={`h-4 w-4 ${position <= score ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
      ))}
    </span>
  )
}

