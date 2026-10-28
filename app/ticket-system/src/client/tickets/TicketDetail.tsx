import { useState, type FormEvent } from 'react'
import { ApiRequestError, ticketApi } from '../platform/api-client'
import { useAsync } from '../platform/hooks'
import { PRIORITY_LABELS, STATUS_LABELS } from '../platform/labels'
import type { BusinessGroup, TicketDetail as TicketDetailType } from '../platform/types'
import { EmptyState, ErrorBanner, Spinner, useToast } from '../platform/ui'

function formatTime(value: string): string {
  return new Date(value).toLocaleString()
}

export default function TicketDetail({
  ticket,
  groups,
  reload,
  canManage = true,
}: {
  ticket: TicketDetailType
  groups: BusinessGroup[]
  reload: () => Promise<void>
  canManage?: boolean
}) {
  const toast = useToast()
  const [reply, setReply] = useState('')
  const [transferGroupId, setTransferGroupId] = useState('')
  const [transferReason, setTransferReason] = useState('')
  const [completeSummary, setCompleteSummary] = useState('')
  const [rating, setRating] = useState(0)
  const [ratingComment, setRatingComment] = useState('')
  const [busy, setBusy] = useState('')
  const [localError, setLocalError] = useState('')

  const submitter = useAsync(() => ticketApi.submitter(ticket.id), [ticket.id])

  const runAction = async (key: string, action: () => Promise<unknown>, success: string) => {
    setBusy(key)
    setLocalError('')
    try {
      await action()
      toast.push(success, 'success')
      await reload()
    } catch (cause) {
      const message =
        cause instanceof ApiRequestError ? cause.message : cause instanceof Error ? cause.message : '操作失败 / Action failed'
      setLocalError(message)
      toast.push(message, 'error')
    } finally {
      setBusy('')
    }
  }

  const submitReply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!reply.trim()) return
    void runAction('reply', () => ticketApi.reply(ticket.id, reply.trim()), '回复已发送 / Reply added').then(() => setReply(''))
  }

  const submitTransfer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!transferGroupId) return
    void runAction(
      'transfer',
      () => ticketApi.transfer(ticket.id, { toGroupId: transferGroupId, reason: transferReason.trim() || undefined }),
      '工单已转派 / Ticket transferred',
    ).then(() => {
      setTransferGroupId('')
      setTransferReason('')
    })
  }

  const submitComplete = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void runAction(
      'complete',
      () => ticketApi.complete(ticket.id, completeSummary.trim() || undefined),
      '工单已完成 / Ticket completed',
    ).then(() => setCompleteSummary(''))
  }

  const submitRating = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (rating < 1 || rating > 5) return
    void runAction(
      'rating',
      () => ticketApi.rate(ticket.id, { rating, comment: ratingComment.trim() || undefined }),
      '评价已提交 / Rating submitted',
    ).then(() => {
      setRating(0)
      setRatingComment('')
    })
  }

  const isPending = ticket.status === 'pending_processing'
  const isCompleted = ticket.status === 'completed'

  return (
    <div className="ticket-detail">
      <div className="section-heading">
        <div>
          <h2>{ticket.subject}</h2>
          <p className="muted">
            {STATUS_LABELS[ticket.status]} · {PRIORITY_LABELS[ticket.slaPriority]} · {ticket.categoryName}
          </p>
        </div>
      </div>

      {localError && <ErrorBanner message={localError} />}

      <dl className="detail-grid">
        <div><dt>工单 ID</dt><dd>{ticket.id}</dd></div>
        <div><dt>提交人</dt><dd>{ticket.submitterName} <span className="muted">{ticket.submitterEmail}</span></dd></div>
        <div><dt>业务组</dt><dd>{ticket.assignedGroupName ?? '未分配'}</dd></div>
        <div><dt>创建时间</dt><dd>{formatTime(ticket.createdAt)}</dd></div>
        <div><dt>更新时间</dt><dd>{formatTime(ticket.updatedAt)}</dd></div>
      </dl>

      <section className="card">
        <h3>描述 / Description</h3>
        <p className="preserve-lines">{ticket.description}</p>
      </section>

      <section className="card">
        <div className="section-heading">
          <h3>回复 / Replies ({ticket.replies.length})</h3>
        </div>
        {ticket.replies.length === 0 ? (
          <EmptyState message="暂无回复 / No replies yet" />
        ) : (
          <ul className="reply-list">
            {ticket.replies.map((item) => (
              <li key={item.id}>
                <p><strong>{item.replierName}</strong> <span className="muted">{formatTime(item.createdAt)}</span></p>
                <p className="preserve-lines">{item.content}</p>
              </li>
            ))}
          </ul>
        )}
        <form className="stack" onSubmit={submitReply}>
          <label>添加回复 / Add reply<textarea name="content" value={reply} onChange={(e) => setReply(e.currentTarget.value)} rows={3} required /></label>
          <button disabled={busy === 'reply'}>{busy === 'reply' ? '处理中…' : '发送回复 / Send reply'}</button>
        </form>
      </section>

      {canManage && isPending && (
        <section className="card">
          <h3>转派 / Transfer</h3>
          <form className="form-grid" onSubmit={submitTransfer}>
            <label>目标业务组 / Target group
              <select value={transferGroupId} onChange={(e) => setTransferGroupId(e.currentTarget.value)} required>
                <option value="">请选择 / Select…</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>{group.name}</option>
                ))}
              </select>
            </label>
            <label>转派原因（可选）/ Reason (optional)<input value={transferReason} onChange={(e) => setTransferReason(e.currentTarget.value)} maxLength={500} /></label>
            <button disabled={busy === 'transfer' || groups.length === 0}>{busy === 'transfer' ? '处理中…' : '转派 / Transfer'}</button>
          </form>
        </section>
      )}

      {canManage && isPending && (
        <section className="card">
          <h3>完成工单 / Complete</h3>
          <p className="muted">完成后将向提交人发送邮件通知。/ The submitter will be notified by email.</p>
          <form className="stack" onSubmit={submitComplete}>
            <label>处理总结（可选）/ Summary (optional)<textarea value={completeSummary} onChange={(e) => setCompleteSummary(e.currentTarget.value)} rows={2} maxLength={1000} /></label>
            <button disabled={busy === 'complete'}>{busy === 'complete' ? '处理中…' : '完成工单 / Complete'}</button>
          </form>
        </section>
      )}

      {canManage && (
      <section className="card">
        <div className="section-heading">
          <h3>提交人信息 / Submitter profile</h3>
          <button className="secondary" onClick={() => void submitter.reload()} disabled={submitter.loading}>刷新 / Refresh</button>
        </div>
        {submitter.loading ? <Spinner /> : submitter.error ? <ErrorBanner message={submitter.error} /> : submitter.data ? (
          <div className="stack">
            <dl className="detail-grid">
              <div><dt>姓名</dt><dd>{submitter.data.displayName}</dd></div>
              <div><dt>邮箱</dt><dd>{submitter.data.email}</dd></div>
              <div><dt>公司</dt><dd>{submitter.data.companyName}</dd></div>
              <div><dt>部门</dt><dd>{submitter.data.departmentName ?? '—'}</dd></div>
            </dl>
            <div>
              <p className="muted">历史工单 ({submitter.data.historyTickets.length})</p>
              <div className="table-scroll">
                <table>
                  <thead><tr><th>主题</th><th>状态</th><th>优先级</th><th>创建时间</th></tr></thead>
                  <tbody>
                    {submitter.data.historyTickets.length === 0 ? (
                      <tr><td colSpan={4}>无历史工单 / No history</td></tr>
                    ) : submitter.data.historyTickets.map((history) => (
                      <tr key={history.id}>
                        <td><strong title={history.subject}>{history.subject}</strong></td>
                        <td>{STATUS_LABELS[history.status]}</td>
                        <td>{PRIORITY_LABELS[history.slaPriority]}</td>
                        <td>{formatTime(history.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}
      </section>
      )}

      {isCompleted && (
        <section className="card">
          <h3>满意度评价 / Satisfaction rating</h3>
          <form className="stack" onSubmit={submitRating}>
            <div className="rating-row" role="radiogroup" aria-label="评分 / Score">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  className={value <= rating ? 'rating-btn active' : 'rating-btn secondary'}
                  aria-pressed={value === rating}
                  onClick={() => setRating(value)}
                >
                  {value}
                </button>
              ))}
            </div>
            <label>备注（可选）/ Comment (optional)<textarea value={ratingComment} onChange={(e) => setRatingComment(e.currentTarget.value)} rows={2} maxLength={500} /></label>
            <button disabled={busy === 'rating' || rating === 0}>{busy === 'rating' ? '处理中…' : '提交评价 / Submit rating'}</button>
          </form>
        </section>
      )}
    </div>
  )
}
