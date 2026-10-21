import { useState } from 'react'
import { apiRequest } from '../platform/api-client'
import type {
  AuditEvent,
  CompleteResponse,
  Group,
  RatingResponse,
  TicketDetail,
  UserProfileSummary,
} from '../types'
import { useSession } from './AppShell'
import { useAsyncData } from './useAsyncData'
import {
  ACTION_LABELS,
  MAIL_CHANNEL_LABELS,
  MAIL_STATUS_LABELS,
  STATUS_META,
  EmptyState,
  ErrorNotice,
  SuccessNotice,
  formatDateTime,
  PriorityBadge,
  SkeletonList,
  StatusBadge,
} from './ui'
import { ExpandableText } from './ExpandableText'

type Props = {
  ticketId: number
  /** 工单状态变化后通知外层刷新列表。 */
  onTicketChanged: () => void
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <dt className="shrink-0 text-slate-400">{label}</dt>
      <dd className="min-w-0 truncate font-medium text-slate-600" title={value}>
        {value}
      </dd>
    </div>
  )
}

/**
 * 工单详情面板：提交人完整信息卡、历史工单、回复流、满意度评价、
 * 人工分配/转派/完成/取消操作与单工单操作记录。
 * 全部写操作经契约端点执行，前端只负责状态展示与反馈。
 */
export default function TicketDetailPanel({ ticketId, onTicketChanged }: Props) {
  const { user } = useSession()
  const detail = useAsyncData<TicketDetail>(() => apiRequest(`/api/tickets/${ticketId}`), [ticketId])
  const logs = useAsyncData<{ items: AuditEvent[] }>(() => apiRequest(`/api/tickets/${ticketId}/logs`), [ticketId])
  const groups = useAsyncData<{ items: Group[] }>(() => apiRequest('/api/groups'), [])
  const users = useAsyncData<{ items: UserProfileSummary[] }>(() => apiRequest('/api/users'), [])

  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')

  const [replyText, setReplyText] = useState('')
  const [resolution, setResolution] = useState('')
  const [cancelReason, setCancelReason] = useState('')
  const [assignGroupId, setAssignGroupId] = useState('')
  const [reassignGroupId, setReassignGroupId] = useState('')
  const [reassignHandlerId, setReassignHandlerId] = useState('')
  const [ratingScore, setRatingScore] = useState(0)
  const [ratingComment, setRatingComment] = useState('')

  if (detail.loading) {
    return (
      <section className="card">
        <SkeletonList rows={6} />
      </section>
    )
  }
  if (detail.error) {
    return (
      <section className="card p-4">
        <ErrorNotice error={detail.error} onRetry={detail.reload} />
      </section>
    )
  }
  const data = detail.data
  if (!data) return null
  const ticket = data.ticket
  const isTerminal = ticket.status === 'completed' || ticket.status === 'cancelled'
  const canRate = data.rating === null && ticket.status === 'completed' && user.userId === data.submitter.userId

  const runAction = async (message: string, action: () => Promise<unknown>, after?: () => void) => {
    setBusy(true)
    setNotice('')
    setActionError('')
    try {
      await action()
      setNotice(message)
      detail.reload()
      logs.reload()
      onTicketChanged()
      after?.()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '操作失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  const submitReply = () => {
    const content = replyText.trim()
    if (!content) return
    void runAction(
      '回复已发送',
      () =>
        apiRequest(`/api/tickets/${ticketId}/replies`, {
          method: 'POST',
          body: JSON.stringify({ content }),
        }),
      () => setReplyText(''),
    )
  }

  const submitAssign = () => {
    const groupId = Number(assignGroupId)
    if (!groupId) return
    const groupName = groups.data?.items.find((g) => g.groupId === groupId)?.name ?? '业务组'
    void runAction(
      `已分配到「${groupName}」，工单进入待处理`,
      () =>
        apiRequest(`/api/tickets/${ticketId}/assign`, {
          method: 'POST',
          body: JSON.stringify({ groupId }),
        }),
      () => setAssignGroupId(''),
    )
  }

  const submitReassign = () => {
    const groupId = reassignGroupId === '' ? null : Number(reassignGroupId)
    const handlerId = reassignHandlerId === '' ? null : Number(reassignHandlerId)
    if (groupId === null && handlerId === null) return
    void runAction(
      '转派成功，处理归属已更新',
      () =>
        apiRequest(`/api/tickets/${ticketId}/reassign`, {
          method: 'POST',
          body: JSON.stringify({ groupId, handlerId }),
        }),
      () => {
        setReassignGroupId('')
        setReassignHandlerId('')
      },
    )
  }

  const completeTicket = async () => {
    setBusy(true)
    setNotice('')
    setActionError('')
    try {
      const result = await apiRequest<CompleteResponse>(`/api/tickets/${ticketId}/complete`, {
        method: 'POST',
        body: JSON.stringify(resolution.trim() ? { resolution: resolution.trim() } : {}),
      })
      setNotice(
        `工单已完成。完成通知（${MAIL_CHANNEL_LABELS[result.notification.channel]}）：${MAIL_STATUS_LABELS[result.notification.status]}`,
      )
      setResolution('')
      detail.reload()
      logs.reload()
      onTicketChanged()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '操作失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  const submitCancel = () => {
    const reason = cancelReason.trim()
    void runAction(
      '工单已取消',
      () =>
        apiRequest(`/api/tickets/${ticketId}/cancel`, {
          method: 'POST',
          body: JSON.stringify(reason ? { reason } : {}),
        }),
      () => setCancelReason(''),
    )
  }

  const submitRating = () => {
    if (ratingScore < 1) return
    const comment = ratingComment.trim()
    void runAction(
      '满意度评价已提交',
      () =>
        apiRequest<RatingResponse>(`/api/tickets/${ticketId}/rating`, {
          method: 'POST',
          body: JSON.stringify(comment ? { score: ratingScore, comment } : { score: ratingScore }),
        }),
      () => {
        setRatingScore(0)
        setRatingComment('')
      },
    )
  }

  return (
    <section className="card flex flex-col self-start xl:sticky xl:top-4 xl:max-h-[calc(100vh-7.5rem)]">
      <div className="border-b border-slate-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-sm font-semibold text-slate-700">{ticket.ticketNo}</span>
          <span className="flex gap-1.5">
            <PriorityBadge priority={ticket.priority} />
            <StatusBadge status={ticket.status} />
          </span>
        </div>
        <h2 className="mt-2 text-base font-semibold text-slate-800" title={ticket.subject}>
          {ticket.subject}
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
          <MetaItem label="分类" value={ticket.category} />
          <MetaItem label="提交人" value={ticket.submitterName} />
          <MetaItem label="公司" value={ticket.companyName} />
          <MetaItem label="业务组" value={ticket.assignedGroupName ?? '未分配'} />
          <MetaItem label="处理人" value={ticket.handlerName ?? '未指定'} />
          <MetaItem label="回复数" value={`${ticket.replyCount}`} />
          <MetaItem label="创建时间" value={formatDateTime(ticket.createdAt)} />
          <MetaItem label="完成时间" value={formatDateTime(ticket.completedAt)} />
        </dl>
      </div>

      {(notice || actionError) && (
        <div className="space-y-2 px-4 pt-3">
          {notice && <SuccessNotice>{notice}</SuccessNotice>}
          <ErrorNotice error={actionError} />
        </div>
      )}

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <div>
          <h3 className="mb-1.5 text-sm font-semibold text-slate-700">工单描述</h3>
          <ExpandableText text={data.description} limit={200} className="text-sm text-slate-700" />
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">提交人信息</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <MetaItem label="姓名" value={data.submitter.name} />
            <MetaItem label="邮箱" value={data.submitter.email} />
            <MetaItem label="公司" value={data.submitter.companyName} />
            <MetaItem label="部门" value={data.submitter.department || '未填写'} />
          </dl>
        </div>

        <div>
          <h3 className="mb-1.5 text-sm font-semibold text-slate-700">
            提交人历史工单（{data.submitter.historyTickets.length}）
          </h3>
          {data.submitter.historyTickets.length === 0 ? (
            <EmptyState title="该提交人暂无历史工单" />
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">工单号</th>
                    <th className="px-3 py-2 font-medium">主题</th>
                    <th className="px-3 py-2 font-medium">状态</th>
                    <th className="px-3 py-2 font-medium">优先级</th>
                    <th className="px-3 py-2 font-medium">创建时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.submitter.historyTickets.map((history) => (
                    <tr
                      key={history.ticketNo}
                      className={history.ticketNo === ticket.ticketNo ? 'bg-indigo-50/50' : ''}
                    >
                      <td className="px-3 py-2 font-mono text-slate-600">{history.ticketNo}</td>
                      <td className="max-w-[14rem] truncate px-3 py-2 text-slate-700" title={history.subject}>
                        {history.subject}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={history.status} />
                      </td>
                      <td className="px-3 py-2">
                        <PriorityBadge priority={history.priority} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                        {formatDateTime(history.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">回复记录（{data.replies.length}）</h3>
          {data.replies.length === 0 ? (
            <EmptyState title="暂无回复" hint="提交人与处理侧可在此多轮沟通" />
          ) : (
            <ol className="space-y-3">
              {data.replies.map((reply) => (
                <li key={reply.replyId} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="font-medium text-slate-700">{reply.replierName}</span>
                    <time dateTime={reply.repliedAt}>{formatDateTime(reply.repliedAt)}</time>
                  </div>
                  <ExpandableText text={reply.content} limit={160} className="mt-1.5 text-sm text-slate-700" />
                </li>
              ))}
            </ol>
          )}
          {isTerminal ? (
            <p className="mt-2.5 text-xs text-slate-400">工单已结束（{STATUS_META[ticket.status].label}），无法继续回复。</p>
          ) : (
            <form
              className="mt-2.5 grid gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                submitReply()
              }}
            >
              <label className="field">
                <span className="label">添加回复</span>
                <textarea
                  className="input"
                  rows={3}
                  maxLength={5000}
                  required
                  placeholder="输入回复内容（提交人与处理侧双向可见）"
                  value={replyText}
                  onChange={(event) => setReplyText(event.target.value)}
                  disabled={busy}
                />
              </label>
              <button type="submit" className="btn justify-self-start" disabled={busy || !replyText.trim()}>
                {busy ? '处理中…' : '回复'}
              </button>
            </form>
          )}
        </div>

        {data.rating ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3.5">
            <h3 className="text-sm font-semibold text-emerald-800">满意度评价</h3>
            <p className="mt-1 text-sm text-emerald-700">
              {data.rating.score} / 5 分 · {formatDateTime(data.rating.ratedAt)}
            </p>
            {data.rating.comment && (
              <ExpandableText text={data.rating.comment} limit={120} className="mt-1 text-sm text-emerald-700" />
            )}
          </div>
        ) : (
          canRate && (
            <div className="rounded-lg border border-slate-200 p-3.5">
              <h3 className="mb-2 text-sm font-semibold text-slate-700">满意度评价</h3>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((score) => (
                  <button
                    key={score}
                    type="button"
                    aria-label={`${score} 分`}
                    aria-pressed={ratingScore === score}
                    className={ratingScore === score ? 'btn' : 'btn-secondary'}
                    disabled={busy}
                    onClick={() => setRatingScore(score)}
                  >
                    {score}
                  </button>
                ))}
              </div>
              <label className="field mt-2.5">
                <span className="label">评价留言（可选，最多 500 字）</span>
                <textarea
                  className="input"
                  rows={2}
                  maxLength={500}
                  value={ratingComment}
                  onChange={(event) => setRatingComment(event.target.value)}
                  disabled={busy}
                />
              </label>
              <button
                type="button"
                className="btn mt-2.5"
                disabled={busy || ratingScore < 1}
                onClick={submitRating}
              >
                {busy ? '处理中…' : '提交评价'}
              </button>
            </div>
          )
        )}

        <div className="rounded-lg border border-slate-200 p-3.5">
          <h3 className="mb-2.5 text-sm font-semibold text-slate-700">工单操作</h3>
          <div className="space-y-4">
            {ticket.status === 'pending_assignment' && (
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <label className="field">
                  <span className="label">人工分配到业务组</span>
                  <select
                    className="input"
                    value={assignGroupId}
                    onChange={(event) => setAssignGroupId(event.target.value)}
                    disabled={busy}
                  >
                    <option value="">请选择业务组</option>
                    {(groups.data?.items ?? []).map((group) => (
                      <option key={group.groupId} value={group.groupId}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="btn"
                  disabled={busy || !assignGroupId}
                  onClick={submitAssign}
                >
                  {busy ? '处理中…' : '分配'}
                </button>
              </div>
            )}

            {ticket.status === 'pending_processing' && (
              <div className="space-y-2">
                <label className="field">
                  <span className="label">处理结果（可选，最多 1000 字；完成后随通知发送）</span>
                  <textarea
                    className="input"
                    rows={2}
                    maxLength={1000}
                    value={resolution}
                    onChange={(event) => setResolution(event.target.value)}
                    disabled={busy}
                  />
                </label>
                <button type="button" className="btn" disabled={busy} onClick={() => void completeTicket()}>
                  {busy ? '处理中…' : '完成工单'}
                </button>
                <p className="text-xs text-slate-400">完成后将向提交人邮箱发送完成通知，并记录处理人与处理时间。</p>
              </div>
            )}

            {ticket.status === 'pending_processing' && (
              <div className="space-y-2 border-t border-slate-100 pt-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="field">
                    <span className="label">转派到业务组（可留空表示不变更）</span>
                    <select
                      className="input"
                      value={reassignGroupId}
                      onChange={(event) => setReassignGroupId(event.target.value)}
                      disabled={busy}
                    >
                      <option value="">不变更</option>
                      {(groups.data?.items ?? []).map((group) => (
                        <option key={group.groupId} value={group.groupId}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="label">转派处理人（可留空表示不变更）</span>
                    <select
                      className="input"
                      value={reassignHandlerId}
                      onChange={(event) => setReassignHandlerId(event.target.value)}
                      disabled={busy}
                    >
                      <option value="">不变更</option>
                      {(users.data?.items ?? []).map((member) => (
                        <option key={member.userId} value={member.userId}>
                          {member.name}（{member.department || '未填写部门'}）
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busy || (reassignGroupId === '' && reassignHandlerId === '')}
                  onClick={submitReassign}
                >
                  {busy ? '处理中…' : '转派'}
                </button>
              </div>
            )}

            {!isTerminal && (
              <div className="space-y-2 border-t border-slate-100 pt-4">
                <label className="field">
                  <span className="label">取消原因（可选，最多 500 字）</span>
                  <input
                    className="input"
                    maxLength={500}
                    value={cancelReason}
                    onChange={(event) => setCancelReason(event.target.value)}
                    disabled={busy}
                  />
                </label>
                <button type="button" className="btn-danger" disabled={busy} onClick={submitCancel}>
                  {busy ? '处理中…' : '取消工单'}
                </button>
              </div>
            )}

            {isTerminal && (
              <p className="text-xs text-slate-400">
                工单已进入终态（{STATUS_META[ticket.status].label}），不再支持流转操作。
              </p>
            )}
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">操作记录</h3>
          {logs.loading ? (
            <SkeletonList rows={3} />
          ) : logs.error ? (
            <ErrorNotice error={logs.error} onRetry={logs.reload} />
          ) : (logs.data?.items ?? []).length === 0 ? (
            <EmptyState title="暂无操作记录" />
          ) : (
            <ol className="space-y-1.5">
              {(logs.data?.items ?? []).map((log) => (
                <li key={log.eventId} className="flex gap-2 text-xs text-slate-500">
                  <time className="shrink-0" dateTime={log.occurredAt}>
                    {formatDateTime(log.occurredAt)}
                  </time>
                  <span className="shrink-0 font-medium text-slate-600">
                    {ACTION_LABELS[log.action] ?? log.action}
                  </span>
                  <span className="shrink-0 text-slate-400">{log.operatorName}</span>
                  <span className="min-w-0 flex-1 truncate" title={log.detail}>
                    {log.detail}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  )
}
