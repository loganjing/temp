import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { businessGroupsApi, usersApi } from '../api/admin'
import { describeApiError } from '../api/errors'
import { ticketsApi } from '../api/tickets'
import type { BusinessGroup, SubmitterInfo, TicketDetail, TicketLog, UserSummary } from '../api/types'
import { EmptyState, Loading, Notice, PriorityBadge, StatusBadge, statusLabel } from '../components/ui'
import { formatDateTime } from '../format'

const actionLabels: Record<string, string> = {
  created: '创建工单',
  assigned: '分配业务组',
  auto_assigned: '自动分配业务组',
  transferred: '转派工单',
  replied: '追加回复',
  completed: '完成工单',
  cancelled: '取消工单',
  rated: '满意度评价',
}

function actionLabel(action: string): string {
  return actionLabels[action] ?? action
}

function detailsText(details: Record<string, unknown>): string {
  return Object.entries(details)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${key}=${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
    .join(' · ')
}

export default function TicketDetailPanel({ ticketId, onChanged }: { ticketId: number; onChanged?: () => void }) {
  const [ticket, setTicket] = useState<TicketDetail | null>(null)
  const [logs, setLogs] = useState<TicketLog[]>([])
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [users, setUsers] = useState<UserSummary[]>([])
  const [submitter, setSubmitter] = useState<SubmitterInfo | null>(null)
  const [submitterError, setSubmitterError] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [replyContent, setReplyContent] = useState('')
  const [transferGroupId, setTransferGroupId] = useState('')
  const [transferUserId, setTransferUserId] = useState('')
  const [assignGroupId, setAssignGroupId] = useState('')
  const [ratingScore, setRatingScore] = useState(5)
  const [ratingComment, setRatingComment] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    setSubmitterError('')
    let detail: TicketDetail
    try {
      detail = await ticketsApi.get(ticketId)
      setTicket(detail)
    } catch (cause) {
      setTicket(null)
      setError(describeApiError(cause, '无法加载工单详情。'))
      setLoading(false)
      return
    }
    setLoading(false)
    const [logResult, groupResult, userResult] = await Promise.all([
      ticketsApi.logs(ticketId).catch(() => ({ items: [] as TicketLog[] })),
      businessGroupsApi.list(detail.companyId).catch(() => ({ items: [] as BusinessGroup[] })),
      usersApi.list().catch(() => ({ items: [] as UserSummary[], total: 0 })),
    ])
    setLogs(logResult.items)
    setGroups(groupResult.items)
    setUsers(userResult.items)
    setSubmitter(null)
    try {
      setSubmitter(await ticketsApi.submitterInfo(ticketId))
    } catch (cause) {
      setSubmitterError(describeApiError(cause, '无法加载提交人信息。'))
    }
  }, [ticketId])

  useEffect(() => { void load() }, [load])

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true)
    setFeedback(null)
    try {
      await action()
      setFeedback({ tone: 'success', text: success })
      await load()
      onChanged?.()
    } catch (cause) {
      setFeedback({ tone: 'error', text: describeApiError(cause, '操作失败，请重试。') })
    } finally {
      setBusy(false)
    }
  }

  const submitReply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!replyContent.trim()) {
      setFeedback({ tone: 'error', text: '请填写回复内容。' })
      return
    }
    await run(async () => {
      await ticketsApi.reply(ticketId, replyContent.trim())
      setReplyContent('')
    }, '回复已提交。')
  }

  const submitTransfer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!transferGroupId && !transferUserId) {
      setFeedback({ tone: 'error', text: '请选择目标业务组或目标处理人。' })
      return
    }
    await run(async () => {
      await ticketsApi.transfer(ticketId, {
        ...(transferGroupId ? { targetGroupId: Number(transferGroupId) } : {}),
        ...(transferUserId ? { targetUserId: Number(transferUserId) } : {}),
      })
      setTransferGroupId('')
      setTransferUserId('')
    }, '工单已转派。')
  }

  const submitAssign = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!assignGroupId) {
      setFeedback({ tone: 'error', text: '请选择要分配的业务组。' })
      return
    }
    await run(async () => {
      await ticketsApi.assign(ticketId, Number(assignGroupId))
      setAssignGroupId('')
    }, '工单已分配。')
  }

  const submitRating = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await run(
      () => ticketsApi.rate(ticketId, { score: ratingScore, ...(ratingComment.trim() ? { comment: ratingComment.trim() } : {}) }),
      '评价已提交。',
    )
  }

  if (loading) return <div className="card"><Loading label="加载工单详情…" /></div>
  if (error) return <div className="card"><Notice tone="error">{error}</Notice></div>
  if (!ticket) return <div className="card"><EmptyState>工单不存在。</EmptyState></div>

  const terminal = ticket.status === 'completed' || ticket.status === 'cancelled'

  return (
    <div className="stack">
      <section className="card">
        <div className="section-heading">
          <h2>{ticket.title}</h2>
          <div className="row-actions horizontal">
            <PriorityBadge priority={ticket.slaPriority} />
            <StatusBadge status={ticket.status} />
          </div>
        </div>
        <dl className="detail-grid">
          <div><dt>工单 ID</dt><dd>#{ticket.id}</dd></div>
          <div><dt>分类</dt><dd>{ticket.categoryName}</dd></div>
          <div><dt>公司</dt><dd>{ticket.companyName}</dd></div>
          <div><dt>提交人</dt><dd>{ticket.submitterName}</dd></div>
          <div><dt>提交人邮箱</dt><dd>{ticket.submitterEmail}</dd></div>
          <div><dt>提交人部门</dt><dd>{ticket.submitterDepartment || '—'}</dd></div>
          <div><dt>归属业务组</dt><dd>{ticket.businessGroupName || '未分配'}</dd></div>
          <div><dt>处理人</dt><dd>{ticket.handlerName || '—'}</dd></div>
          <div><dt>创建时间</dt><dd>{formatDateTime(ticket.createdAt)}</dd></div>
          <div><dt>完成时间</dt><dd>{formatDateTime(ticket.completedAt)}</dd></div>
          <div><dt>取消时间</dt><dd>{formatDateTime(ticket.cancelledAt)}</dd></div>
          <div><dt>当前状态</dt><dd>{statusLabel(ticket.status)}</dd></div>
        </dl>
        <p className="description">{ticket.description}</p>
      </section>

      {feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>}

      <section className="card">
        <h3>处理操作</h3>
        {terminal ? (
          <p className="muted">工单已{ticket.status === 'completed' ? '完成' : '取消'}，不可再变更状态、回复、转派或重新分配。</p>
        ) : (
          <div className="stack">
            {ticket.status === 'pending_assignment' && (
              <form className="inline-form" onSubmit={(event) => void submitAssign(event)}>
                <label>手动分配业务组<select value={assignGroupId} onChange={(event) => setAssignGroupId(event.currentTarget.value)}>
                  <option value="">请选择业务组</option>
                  {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                </select></label>
                <button disabled={busy}>分配</button>
              </form>
            )}
            <form className="inline-form" onSubmit={(event) => void submitTransfer(event)}>
              <label>转派到业务组<select value={transferGroupId} onChange={(event) => setTransferGroupId(event.currentTarget.value)}>
                <option value="">不指定</option>
                {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select></label>
              <label>或转派给处理人<select value={transferUserId} onChange={(event) => setTransferUserId(event.currentTarget.value)}>
                <option value="">不指定</option>
                {users.map((user) => <option key={user.id} value={user.id}>{user.profile.displayName}</option>)}
              </select></label>
              <button className="secondary" disabled={busy}>转派</button>
            </form>
            <div className="row-actions horizontal">
              <button disabled={busy} onClick={() => void run(() => ticketsApi.complete(ticketId), '工单已完成。')}>完成工单</button>
              <button className="secondary" disabled={busy} onClick={() => void run(() => ticketsApi.cancel(ticketId), '工单已取消。')}>取消工单</button>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <h3>回复记录（{ticket.replies.length}）</h3>
        {ticket.replies.length === 0 ? <EmptyState>暂无回复。</EmptyState> : (
          <ol className="replies">
            {ticket.replies.map((reply) => (
              <li key={reply.id}>
                <div className="reply-head"><strong>{reply.replierName}</strong><span className="muted">{formatDateTime(reply.createdAt)}</span></div>
                <p className="reply-body">{reply.content}</p>
              </li>
            ))}
          </ol>
        )}
        {!terminal && (
          <form className="stack reply-form" onSubmit={(event) => void submitReply(event)}>
            <label>追加回复<textarea value={replyContent} onChange={(event) => setReplyContent(event.currentTarget.value)} rows={3} required /></label>
            <button disabled={busy}>提交回复</button>
          </form>
        )}
      </section>

      <section className="card">
        <h3>满意度评价</h3>
        {ticket.rating ? (
          <div className="stack">
            <p>评分：<strong>{ticket.rating.score} 星</strong><span className="muted"> · {formatDateTime(ticket.rating.ratedAt)}</span></p>
            {ticket.rating.comment && <p className="reply-body">{ticket.rating.comment}</p>}
            <p className="muted">该工单已评价，不可重复提交。</p>
          </div>
        ) : ticket.status === 'completed' ? (
          <form className="stack" onSubmit={(event) => void submitRating(event)}>
            <div className="rating-row">
              <span className="muted">评分（1–5 星）</span>
              <div className="row-actions horizontal">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={value === ratingScore ? '' : 'secondary'}
                    aria-pressed={value === ratingScore}
                    aria-label={`${value} 星`}
                    onClick={() => setRatingScore(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <span className="muted">当前选择：{ratingScore} 星</span>
            </div>
            <label>文字说明（可选）<textarea value={ratingComment} onChange={(event) => setRatingComment(event.currentTarget.value)} rows={2} /></label>
            <button disabled={busy}>提交评价</button>
          </form>
        ) : (
          <p className="muted">仅已完成的工单可提交满意度评价。</p>
        )}
      </section>

      <section className="card">
        <h3>提交人完整信息</h3>
        {submitterError ? <Notice tone="error">{submitterError}</Notice> : !submitter ? <Loading label="加载提交人信息…" /> : (
          <div className="stack">
            <dl className="detail-grid">
              <div><dt>姓名</dt><dd>{submitter.name}</dd></div>
              <div><dt>公司</dt><dd>{submitter.company}</dd></div>
              <div><dt>部门</dt><dd>{submitter.department || '—'}</dd></div>
            </dl>
            <h4>历史工单（{submitter.historyTickets.length}）</h4>
            {submitter.historyTickets.length === 0 ? <EmptyState>该提交人暂无其他工单。</EmptyState> : (
              <div className="table-scroll">
                <table>
                  <thead><tr><th>主题</th><th>状态</th><th>创建时间</th></tr></thead>
                  <tbody>
                    {submitter.historyTickets.map((history) => (
                      <tr key={history.id}>
                        <td>{history.title}</td>
                        <td><StatusBadge status={history.status} /></td>
                        <td>{formatDateTime(history.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="card">
        <h3>操作日志（{logs.length}）</h3>
        {logs.length === 0 ? <EmptyState>暂无日志记录。</EmptyState> : (
          <ol className="logs">
            {logs.map((log) => (
              <li key={log.id}>
                <div className="reply-head">
                  <strong>{actionLabel(log.action)}</strong>
                  <span className="muted">{log.operatorName} · {formatDateTime(log.createdAt)}</span>
                </div>
                {detailsText(log.details) && <span className="subtext">{detailsText(log.details)}</span>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}