import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  ticketApi, businessGroupApi, userApi,
  type TicketDetail, type BusinessGroup, type UserListItem, type CurrentUser,
} from '../platform/api-client'
import {
  StatusBadge, PriorityBadge, formatDate, formatDuration,
  Spinner, EmptyState, ErrorBanner, SectionCard,
  STATUS_LABELS, EVENT_LABELS, PRIORITIES,
} from '../components/ui'

const ROLE_HANDLER = 'ticket_handler'
const ROLE_ADMIN = 'admin'
const ROLE_GROUP_ADMIN = 'business_group_admin'

export default function TicketDetailPage({
  ticketId, currentUser, onUpdated,
}: { ticketId: string; currentUser: CurrentUser; onUpdated?: () => void }) {
  const [detail, setDetail] = useState<TicketDetail | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [reply, setReply] = useState('')
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [users, setUsers] = useState<UserListItem[]>([])
  const [transferTarget, setTransferTarget] = useState<{ user: string; group: string }>({ user: '', group: '' })
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')

  const roles = currentUser.roles ?? []
  const canManage = roles.includes(ROLE_HANDLER) || roles.includes(ROLE_ADMIN) || roles.includes(ROLE_GROUP_ADMIN)

  const reload = useCallback(async () => {
    setError('')
    try {
      setDetail(await ticketApi.get(ticketId))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载工单失败')
    }
  }, [ticketId])

  useEffect(() => { void reload() }, [reload])

  useEffect(() => {
    if (!detail) return
    void businessGroupApi.list(detail.companyId).then((r) => setGroups(r.items)).catch(() => setGroups([]))
    void userApi.list({ companyId: detail.companyId, pageSize: 100 }).then((r) => setUsers(r.items)).catch(() => setUsers([]))
  }, [detail])

  const afterMutation = async (msg: string) => {
    setMessage(msg)
    await reload()
    onUpdated?.()
  }

  const submitReply = async (event: FormEvent) => {
    event.preventDefault()
    if (!reply.trim()) return
    setBusy(true); setError(''); setMessage('')
    try {
      await ticketApi.addReply(ticketId, reply.trim())
      setReply('')
      await afterMutation('回复已发送')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '回复失败')
    } finally { setBusy(false) }
  }

  const transfer = async () => {
    if (!transferTarget.user && !transferTarget.group) { setError('请选择转派目标'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      await ticketApi.transfer(ticketId, {
        targetUserId: transferTarget.user || undefined,
        targetGroupId: transferTarget.group || undefined,
      })
      setTransferTarget({ user: '', group: '' })
      await afterMutation('工单已转派')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '转派失败')
    } finally { setBusy(false) }
  }

  const complete = async () => {
    setBusy(true); setError(''); setMessage('')
    try {
      const r = await ticketApi.complete(ticketId)
      const note = r.emailNotification?.status === 'sent' ? '，通知邮件已发送' : r.emailNotification?.status === 'skipped' ? '（邮件未配置，已跳过）' : ''
      await afterMutation(`工单已完成${note}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '完成失败')
    } finally { setBusy(false) }
  }

  const cancel = async () => {
    setBusy(true); setError(''); setMessage('')
    try {
      await ticketApi.cancel(ticketId)
      await afterMutation('工单已取消')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '取消失败')
    } finally { setBusy(false) }
  }

  const evaluate = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true); setError(''); setMessage('')
    try {
      await ticketApi.evaluate(ticketId, rating, comment.trim())
      setComment('')
      await afterMutation('评价已提交')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '评价失败')
    } finally { setBusy(false) }
  }

  if (error && !detail) return <ErrorBanner message={error} />
  if (!detail) return <Spinner />
  const status = detail.status
  const sortedReplies = [...detail.replies].sort((a, b) => a.repliedAt.localeCompare(b.repliedAt))

  return (
    <div className="detail-stack">
      {message && <p role="status" className="success">{message}</p>}
      {error && <ErrorBanner message={error} />}

      <SectionCard title={detail.subject} actions={<div className="badge-row"><PriorityBadge priority={detail.priority} /><StatusBadge status={status} /></div>}>
        <dl className="meta-grid">
          <div><dt>分类</dt><dd>{detail.category}</dd></div>
          <div><dt>业务组</dt><dd>{detail.businessGroupName ?? '—'}</dd></div>
          <div><dt>处理人</dt><dd>{detail.assigneeName ?? '—'}</dd></div>
          <div><dt>创建时间</dt><dd>{formatDate(detail.createdAt)}</dd></div>
          <div><dt>完成时间</dt><dd>{formatDate(detail.handledAt)}</dd></div>
          <div><dt>处理人（完成）</dt><dd>{detail.handlerName ?? '—'}</dd></div>
        </dl>
        <div className="description"><h4>描述</h4><p>{detail.description || '—'}</p></div>
      </SectionCard>

      <SectionCard title="提交人信息">
        <dl className="meta-grid">
          <div><dt>姓名</dt><dd>{detail.submitter.name}</dd></div>
          <div><dt>邮箱</dt><dd>{detail.submitter.email}</dd></div>
          <div><dt>公司</dt><dd>{detail.submitter.companyName ?? '—'}</dd></div>
          <div><dt>部门</dt><dd>{detail.submitter.departmentName ?? '—'}</dd></div>
        </dl>
        {detail.submitter.historicalTickets.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead><tr><th>历史工单</th><th>状态</th><th>创建时间</th></tr></thead>
              <tbody>{detail.submitter.historicalTickets.map((t) => (
                <tr key={t.id}><td>{t.subject}</td><td>{STATUS_LABELS[t.status]}</td><td>{formatDate(t.createdAt)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title={`回复（${sortedReplies.length}）`}>
        {sortedReplies.length === 0 ? <EmptyState message="暂无回复" /> : (
          <ul className="reply-list">
            {sortedReplies.map((r) => (
              <li key={r.id}>
                <div className="reply-head"><strong>{r.replierName}</strong><time>{formatDate(r.repliedAt)}</time></div>
                <p className="reply-content">{r.content}</p>
              </li>
            ))}
          </ul>
        )}
        <form className="form-grid" onSubmit={(e) => void submitReply(e)}>
          <label className="full">回复内容<textarea name="content" value={reply} onChange={(e) => setReply(e.target.value)} rows={3} required /></label>
          <button disabled={busy}>发送回复</button>
        </form>
      </SectionCard>

      <SectionCard title="操作">
        <div className="action-grid">
          {status === 'pending_processing' && canManage && (
            <div className="action-block">
              <h4>转派工单</h4>
              <div className="form-grid">
                <label>目标处理人<select value={transferTarget.user} onChange={(e) => setTransferTarget((s) => ({ ...s, user: e.target.value }))}>
                  <option value="">不指定</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}（{u.email}）</option>)}
                </select></label>
                <label>目标业务组<select value={transferTarget.group} onChange={(e) => setTransferTarget((s) => ({ ...s, group: e.target.value }))}>
                  <option value="">不指定</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select></label>
                <button className="secondary" disabled={busy} onClick={() => void transfer()}>转派</button>
              </div>
            </div>
          )}
          {status === 'pending_processing' && canManage && (
            <div className="action-block">
              <h4>完成处理</h4>
              <p className="muted">标记完成后将向提交人邮箱发送通知。</p>
              <button disabled={busy} onClick={() => void complete()}>完成工单</button>
            </div>
          )}
          {status !== 'completed' && status !== 'cancelled' && (
            <div className="action-block">
              <h4>取消工单</h4>
              <button className="danger" disabled={busy} onClick={() => void cancel()}>取消工单</button>
            </div>
          )}
          {status === 'completed' && !detail.evaluation && (
            <div className="action-block">
              <h4>满意度评价</h4>
              <form className="form-grid" onSubmit={(e) => void evaluate(e)}>
                <label>评分（1-5）<select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
                  {PRIORITIES.length > 0 && [1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} 分</option>)}
                </select></label>
                <label className="full">评价备注（可选）<textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} /></label>
                <button disabled={busy}>提交评价</button>
              </form>
            </div>
          )}
          {detail.evaluation && (
            <div className="action-block">
              <h4>满意度评价</h4>
              <p>评分：<strong>{detail.evaluation.rating} / 5</strong></p>
              {detail.evaluation.comment && <p>{detail.evaluation.comment}</p>}
              <p className="muted">评价时间：{formatDate(detail.evaluation.evaluatedAt)}</p>
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="操作日志">
        {detail.recentLogs.length === 0 ? <EmptyState message="暂无日志" /> : (
          <ul className="log-list">
            {detail.recentLogs.map((l) => (
              <li key={l.id}><time>{formatDate(l.occurredAt)}</time><span>{EVENT_LABELS[l.eventType] ?? l.eventType}</span></li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  )
}
