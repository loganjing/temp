import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import {
  getTicket, getReplies, addReply, transferTicket, completeTicket, cancelTicket,
  getSubmitterInfo, getRating, submitRating, getAuditEvents,
  getGroups, getMembers,
} from '../platform/ticket-api'
import type { Ticket, TicketReply, SubmitterInfo, SatisfactionRating, AuditEvent, BusinessGroup, GroupMember } from '../types'
import { Skeleton, EmptyState, ErrorState, Badge } from '../components/Feedback'
import { useToast } from '../components/Toast'

const STATUS_LABELS: Record<string, string> = {
  created: '创建', pending_assignment: '待分配', pending_processing: '待处理', completed: '已完成', cancelled: '已取消',
}
const PRIORITY_LABELS: Record<string, string> = { P0: 'P0 紧急', P1: 'P1 高', P2: 'P2 中', P3: 'P3 普通', P4: 'P4 低' }
function statusVariant(s: string) {
  return s === 'completed' ? 'success' : s === 'cancelled' ? 'danger' : s === 'pending_processing' ? 'warning' : 'info'
}
function priorityVariant(p: string) {
  return p === 'P0' || p === 'P1' ? 'danger' : p === 'P2' ? 'warning' : 'neutral'
}
const AUDIT_LABELS: Record<string, string> = {
  'ticket.created': '创建', 'ticket.assigned': '分配', 'ticket.transferred': '转派',
  'ticket.replied': '回复', 'ticket.processed': '处理', 'ticket.completed': '完成',
  'ticket.cancelled': '取消', 'ticket.rated': '评价',
}

export default function TicketDetailPage({ roles }: { roles: string[] }) {
  const { id } = useParams<{ id: string }>()
  const toast = useToast()
  const isHandler = roles.includes('handler')
  const isSubmitter = roles.includes('submitter')
  const isAdmin = roles.includes('admin')

  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [replies, setReplies] = useState<TicketReply[]>([])
  const [submitterInfo, setSubmitterInfo] = useState<SubmitterInfo | null>(null)
  const [rating, setRating] = useState<SatisfactionRating | null>(null)
  const [audits, setAudits] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [replyText, setReplyText] = useState('')
  const [busy, setBusy] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [showAudit, setShowAudit] = useState(false)
  const [showRating, setShowRating] = useState(false)
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([])
  const [transferTargetUser, setTransferTargetUser] = useState('')
  const [transferTargetGroup, setTransferTargetGroup] = useState('')
  const [cancelReason, setCancelReason] = useState('')
  const [ratingValue, setRatingValue] = useState(5)
  const [ratingComment, setRatingComment] = useState('')

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError('')
    try {
      const [ticketRes, repliesRes] = await Promise.all([
        getTicket(id),
        getReplies(id),
      ])
      setTicket(ticketRes.ticket)
      setReplies(repliesRes.replies)
      if (isHandler || isAdmin) {
        try {
          const [info, audit] = await Promise.all([
            getSubmitterInfo(id),
            getAuditEvents(id),
          ])
          setSubmitterInfo(info)
          setAudits(audit.events)
        } catch { /* non-critical */ }
      }
      try {
        const ratingRes = await getRating(id)
        setRating(ratingRes.rating)
      } catch { /* may not exist */ }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [id, isHandler, isAdmin])

  useEffect(() => { void load() }, [load])

  const canReply = ticket && ticket.status !== 'completed' && ticket.status !== 'cancelled'
  const canComplete = isHandler && ticket?.status === 'pending_processing'
  const canTransfer = isHandler && ticket?.status === 'pending_processing'
  const canCancel = (isSubmitter || isAdmin) && ticket && ticket.status !== 'completed' && ticket.status !== 'cancelled'
  const canRate = isSubmitter && ticket?.status === 'completed' && !rating

  const submitReply = async () => {
    if (!id || !replyText.trim()) return
    setBusy(true)
    try {
      const result = await addReply(id, { content: replyText })
      setReplies([...replies, result.reply])
      setReplyText('')
      toast('回复已发送')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '回复失败')
    } finally {
      setBusy(false)
    }
  }

  const handleComplete = async () => {
    if (!id) return
    setBusy(true)
    try {
      const result = await completeTicket(id)
      setTicket(result.ticket)
      toast('工单已完成')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作失败')
    } finally {
      setBusy(false)
    }
  }

  const handleCancel = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!id) return
    setBusy(true)
    try {
      const result = await cancelTicket(id, { reason: cancelReason || undefined })
      setTicket(result.ticket)
      setCancelReason('')
      toast('工单已取消')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作失败')
    } finally {
      setBusy(false)
    }
  }

  const loadTransferTargets = async () => {
    if (!ticket) return
    try {
      const groupsRes = await getGroups(ticket.company_id)
      setGroups(groupsRes.groups)
      if (groupsRes.groups.length > 0) {
        const membersRes = await getMembers(groupsRes.groups[0].id)
        setGroupMembers(membersRes.members)
      }
    } catch { /* ignore */ }
  }

  const handleTransferGroupChange = async (groupId: string) => {
    setTransferTargetGroup(groupId)
    if (groupId) {
      try {
        const res = await getMembers(groupId)
        setGroupMembers(res.members)
      } catch { setGroupMembers([]) }
    } else {
      setGroupMembers([])
    }
  }

  const submitTransfer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!id) return
    setBusy(true)
    try {
      const result = await transferTicket(id, {
        target_user_id: transferTargetUser || undefined,
        target_group_id: transferTargetGroup || undefined,
      })
      setTicket(result.ticket)
      setShowTransfer(false)
      toast('工单已转派')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '转派失败')
    } finally {
      setBusy(false)
    }
  }

  const handleRatingSubmit = async () => {
    if (!id) return
    setBusy(true)
    try {
      const result = await submitRating(id, { rating: ratingValue, comment: ratingComment || undefined })
      setRating(result.rating)
      setShowRating(false)
      toast('评价已提交')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '评价失败')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Skeleton lines={6} />
  if (error) return <ErrorState message={error} onRetry={() => void load()} />
  if (!ticket) return <EmptyState title="工单不存在" />

  return (
    <div className="stack">
      <div className="section-heading">
        <h2>{ticket.title}</h2>
        <div className="row-actions">
          <Badge variant={statusVariant(ticket.status)}>{STATUS_LABELS[ticket.status]}</Badge>
          <Badge variant={priorityVariant(ticket.priority)}>{PRIORITY_LABELS[ticket.priority]}</Badge>
        </div>
      </div>

      <div className="details-grid">
        <div className="stack">
          <section className="card">
            <h3 style={{ marginTop: 0 }}>工单信息</h3>
            <div style={{ fontSize: '0.88rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{ticket.description}</div>
            <div className="subtext" style={{ marginTop: '0.75rem' }}>
              提交人: {ticket.submitter_name} ({ticket.submitter_email})
              {ticket.category_name && ` · 分类: ${ticket.category_name}`}
              {ticket.assigned_group_name && ` · 业务组: ${ticket.assigned_group_name}`}
            </div>
            <div className="subtext">
              创建: {new Date(ticket.created_at).toLocaleString()} · 更新: {new Date(ticket.updated_at).toLocaleString()}
              {ticket.processed_at && ` · 完成时间: ${new Date(ticket.processed_at).toLocaleString()}`}
            </div>
          </section>

          <section className="card">
            <h3 style={{ marginTop: 0 }}>回复 ({replies.length})</h3>
            <div className="reply-list">
              {replies.length === 0 ? <p className="subtext">暂无回复</p> : replies.map((r) => (
                <div key={r.id} className="reply-item">
                  <div className="reply-meta">
                    <span className="reply-author">{r.author_name}</span>
                    <span>{new Date(r.created_at).toLocaleString()}</span>
                  </div>
                  <div className="reply-content">{r.content}</div>
                </div>
              ))}
            </div>
            {canReply && (
              <div style={{ marginTop: '1rem', display: 'grid', gap: '0.5rem' }}>
                <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={3} placeholder="输入回复内容…" />
                <button disabled={busy || !replyText.trim()} onClick={() => void submitReply()}>发送回复</button>
              </div>
            )}
          </section>

          {(canComplete || canTransfer || canCancel || canRate) && (
            <section className="card">
              <h3 style={{ marginTop: 0 }}>操作</h3>
              {error && <p role="alert" className="error">{error}</p>}
              <div className="row-actions">
                {canComplete && <button className="success" disabled={busy} onClick={() => void handleComplete()}>完成工单</button>}
                {canTransfer && <button className="secondary" disabled={busy} onClick={() => { setShowTransfer(!showTransfer); void loadTransferTargets() }}>转派工单</button>}
                {canCancel && <button className="danger" disabled={busy} onClick={() => {
                  if (cancelReason !== undefined) {
                    // Use a simple inline approach
                    const reason = window.prompt('取消原因（可选）')
                    if (reason !== null) {
                      setBusy(true)
                      void cancelTicket(id!, { reason: reason || undefined }).then((result) => {
                        setTicket(result.ticket)
                        toast('工单已取消')
                      }).catch((cause) => setError(cause instanceof Error ? cause.message : '操作失败')).finally(() => setBusy(false))
                    }
                  }
                }}>取消工单</button>}
                {canRate && <button disabled={busy} onClick={() => setShowRating(!showRating)}>评价工单</button>}
              </div>

              {showTransfer && (
                <form className="stack" style={{ marginTop: '1rem' }} onSubmit={(e) => void submitTransfer(e)}>
                  <label>目标业务组
                    <select value={transferTargetGroup} onChange={(e) => void handleTransferGroupChange(e.target.value)}>
                      <option value="">不选择</option>
                      {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </label>
                  <label>目标处理人
                    <select value={transferTargetUser} onChange={(e) => setTransferTargetUser(e.target.value)}>
                      <option value="">不选择</option>
                      {groupMembers.map((m) => <option key={m.user_id} value={m.user_id}>{m.name} ({m.email})</option>)}
                    </select>
                  </label>
                  <button disabled={busy || (!transferTargetUser && !transferTargetGroup)}>确认转派</button>
                </form>
              )}

              {showRating && (
                <div className="stack" style={{ marginTop: '1rem' }}>
                  <label>满意度评分
                    <select value={ratingValue} onChange={(e) => setRatingValue(Number(e.target.value))}>
                      <option value={5}>5 非常满意</option>
                      <option value={4}>4 满意</option>
                      <option value={3}>3 一般</option>
                      <option value={2}>2 不满意</option>
                      <option value={1}>1 非常不满意</option>
                    </select>
                  </label>
                  <label>备注<textarea value={ratingComment} onChange={(e) => setRatingComment(e.target.value)} rows={2} /></label>
                  <button disabled={busy} onClick={() => void handleRatingSubmit()}>提交评价</button>
                </div>
              )}
            </section>
          )}

          {rating && (
            <section className="card">
              <h3 style={{ marginTop: 0 }}>满意度评价</h3>
              <p>评分: <strong>{'⭐'.repeat(rating.rating)}</strong> ({rating.rating}/5)</p>
              {rating.comment && <p className="subtext">{rating.comment}</p>}
              <p className="subtext">评价时间: {new Date(rating.created_at).toLocaleString()}</p>
            </section>
          )}

          {(isHandler || isAdmin) && (
            <section className="card">
              <button className="ghost" onClick={() => setShowAudit(!showAudit)}>
                {showAudit ? '收起' : '查看'}审计日志 ({audits.length})
              </button>
              {showAudit && (
                <div className="table-scroll" style={{ marginTop: '0.75rem' }}>
                  <table>
                    <thead><tr><th>操作</th><th>时间</th><th>详情</th></tr></thead>
                    <tbody>{audits.map((a) => (
                      <tr key={a.id}>
                        <td><Badge variant="info">{AUDIT_LABELS[a.event_type] ?? a.event_type}</Badge></td>
                        <td>{new Date(a.occurred_at).toLocaleString()}</td>
                        <td className="subtext">{a.metadata_json}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>

        {submitterInfo && (
          <aside className="card">
            <h3 style={{ marginTop: 0 }}>提交人信息</h3>
            <div className="stack" style={{ gap: '0.5rem' }}>
              <div><strong>{submitterInfo.submitter.name}</strong></div>
              <div className="subtext">{submitterInfo.submitter.email}</div>
              {submitterInfo.submitter.phone && <div className="subtext">电话: {submitterInfo.submitter.phone}</div>}
              {submitterInfo.submitter.company_name && <div className="subtext">公司: {submitterInfo.submitter.company_name}</div>}
              {submitterInfo.submitter.department_name && <div className="subtext">部门: {submitterInfo.submitter.department_name}</div>}
            </div>
            <h4 style={{ marginTop: '1rem' }}>历史工单 ({submitterInfo.history_tickets.length})</h4>
            {submitterInfo.history_tickets.length === 0 ? (
              <p className="subtext">暂无历史工单</p>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead><tr><th>主题</th><th>状态</th></tr></thead>
                  <tbody>{submitterInfo.history_tickets.map((h) => (
                    <tr key={h.id}>
                      <td style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.title}</td>
                      <td><Badge variant={statusVariant(h.status)}>{STATUS_LABELS[h.status] ?? h.status}</Badge></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  )
}
