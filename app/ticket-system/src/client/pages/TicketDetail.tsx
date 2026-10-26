import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ticketApi, ApiRequestError } from '../platform/api'
import type { TicketDetail as TicketDetailData, SubmitterInfo } from '../../shared/types'

const STATUS_LABELS: Record<string, string> = {
  created: '创建', pending_assign: '待分配', pending_process: '待处理', completed: '完成', cancelled: '已取消',
}

export default function TicketDetail({ ticketId, role, onBack }: { ticketId: string; role: string; onBack: () => void }) {
  const [ticket, setTicket] = useState<TicketDetailData | null>(null)
  const [submitterInfo, setSubmitterInfo] = useState<SubmitterInfo | null>(null)
  const [reply, setReply] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [transferGroupId, setTransferGroupId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const detail = await ticketApi.detail(ticketId)
      setTicket(detail)
      if (role === 'handler' || role === 'admin') {
        try { const info = await ticketApi.submitterInfo(ticketId); setSubmitterInfo(info) } catch { /* ignore */ }
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : '加载失败') }
    finally { setLoading(false) }
  }, [ticketId, role])

  useEffect(() => { void load() }, [load])

  const submitReply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(''); setMessage('')
    if (!reply.trim()) return
    try {
      await ticketApi.reply(ticketId, reply.trim())
      setReply('')
      setMessage('回复已发送')
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : '回复失败') }
  }

  const handleCancel = async () => {
    setError(''); setMessage('')
    try { await ticketApi.cancel(ticketId); setMessage('工单已取消'); await load() }
    catch (cause) { setError(cause instanceof Error ? cause.message : '取消失败') }
  }

  const handleComplete = async () => {
    setError(''); setMessage('')
    try { await ticketApi.complete(ticketId); setMessage('工单已完成'); await load() }
    catch (cause) { setError(cause instanceof Error ? cause.message : '完成失败') }
  }

  const handleTransfer = async () => {
    setError(''); setMessage('')
    if (!transferGroupId) { setError('请选择目标业务组'); return }
    try { await ticketApi.transfer(ticketId, { to_group_id: transferGroupId }); setMessage('工单已转派'); setTransferGroupId(''); await load() }
    catch (cause) { setError(cause instanceof Error ? cause.message : '转派失败') }
  }

  const handleEvaluate = async () => {
    setError(''); setMessage('')
    try { await ticketApi.evaluate(ticketId, { rating, comment: comment.trim() || undefined }); setMessage('评价已提交'); await load() }
    catch (cause) { setError(cause instanceof Error ? cause.message : '评价失败') }
  }

  if (loading) return <section className="card"><p>加载中…</p></section>
  if (!ticket) return <section className="card"><p className="error">工单不存在</p></section>

  const canCancel = (role === 'submitter' || role === 'admin') && !['completed', 'cancelled'].includes(ticket.status)
  const canComplete = role === 'handler' && ticket.status === 'pending_process'
  const canTransfer = role === 'handler' && ticket.status === 'pending_process'
  const canEvaluate = role === 'submitter' && ticket.status === 'completed' && !ticket.evaluation

  return (
    <div className="ticket-detail">
      <div className="detail-main">
        <section className="card">
          <div className="section-heading">
            <h2>{ticket.subject}</h2>
            <button className="secondary" onClick={onBack}>返回列表</button>
          </div>
          <div className="ticket-meta">
            <span className="badge">{STATUS_LABELS[ticket.status] ?? ticket.status}</span>
            <span className="subtext">分类: {ticket.category}</span>
            <span className="subtext">优先级: {ticket.sla_priority}</span>
            <span className="subtext">创建: {new Date(ticket.created_at).toLocaleString('zh-CN')}</span>
          </div>
          <p style={{ marginTop: '0.75rem' }}>{ticket.description}</p>
          <div className="subtext" style={{ marginTop: '0.5rem' }}>
            提交人: {ticket.submitter_name} ({ticket.submitter_email})
            {ticket.submitter_company && ` · ${ticket.submitter_company}`}
            {ticket.submitter_department && ` · ${ticket.submitter_department}`}
          </div>
          {ticket.handler_name && <div className="subtext">处理人: {ticket.handler_name} · 完成时间: {ticket.processed_at ? new Date(ticket.processed_at).toLocaleString('zh-CN') : '—'}</div>}
          {message && <p role="status" className="success">{message}</p>}
          {error && <p role="alert" className="error">{error}</p>}
          {(canCancel || canComplete || canTransfer) && (
            <div className="row-actions" style={{ marginTop: '0.75rem' }}>
              {canCancel && <button className="secondary" onClick={() => void handleCancel()}>取消工单</button>}
              {canComplete && <button onClick={() => void handleComplete()}>完成处理</button>}
            </div>
          )}
          {canTransfer && (
            <div className="row-actions" style={{ marginTop: '0.75rem' }}>
              <label>转派到业务组 ID<input value={transferGroupId} onChange={(e) => setTransferGroupId(e.target.value)} placeholder="业务组 ID" /></label>
              <button className="secondary" onClick={() => void handleTransfer()}>转派</button>
            </div>
          )}
        </section>

        <section className="card">
          <h3>回复 ({ticket.replies.length})</h3>
          <div className="replies">
            {ticket.replies.map((r) => (
              <div key={r.id} className="reply-item">
                <div className="reply-header"><strong>{r.user_name}</strong><span className="subtext">{new Date(r.created_at).toLocaleString('zh-CN')}</span></div>
                <p>{r.content}</p>
              </div>
            ))}
            {ticket.replies.length === 0 && <p className="empty">暂无回复</p>}
          </div>
          <form onSubmit={(event) => void submitReply(event)} className="stack" style={{ marginTop: '0.75rem' }}>
            <label>添加回复<textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} style={{ width: '100%', minHeight: '60px', padding: '0.5rem 0.65rem', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--surface)', color: 'var(--text)', resize: 'vertical' }} /></label>
            <button disabled={!reply.trim()}>发送回复</button>
          </form>
        </section>

        {ticket.transfers.length > 0 && (
          <section className="card">
            <h3>转派记录</h3>
            {ticket.transfers.map((t) => (
              <div key={t.id} className="reply-item">
                <div className="reply-header"><strong>{t.from_user_name}</strong> → <strong>{t.to_user_name ?? '业务组'}</strong><span className="subtext">{new Date(t.created_at).toLocaleString('zh-CN')}</span></div>
                {t.reason && <p>{t.reason}</p>}
              </div>
            ))}
          </section>
        )}

        {ticket.evaluation && (
          <section className="card">
            <h3>用户评价</h3>
            <p>评分: {'★'.repeat(ticket.evaluation.rating)}{'☆'.repeat(5 - ticket.evaluation.rating)}</p>
            {ticket.evaluation.comment && <p>{ticket.evaluation.comment}</p>}
          </section>
        )}

        {canEvaluate && (
          <section className="card">
            <h3>满意度评价</h3>
            <div className="stack">
              <label>评分<select value={rating} onChange={(e) => setRating(Number(e.target.value))}>{[5,4,3,2,1].map((n) => <option key={n} value={n}>{'★'.repeat(n)}{'☆'.repeat(5-n)} ({n}分)</option>)}</select></label>
              <label>评价（可选）<textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} style={{ width: '100%', minHeight: '50px', padding: '0.5rem 0.65rem', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--surface)', color: 'var(--text)', resize: 'vertical' }} /></label>
              <button onClick={() => void handleEvaluate()}>提交评价</button>
            </div>
          </section>
        )}
      </div>

      {submitterInfo && (
        <aside className="detail-side">
          <section className="card">
            <h3>提交人信息</h3>
            <div className="submitter-info">
              <div><span className="subtext">姓名</span><strong>{submitterInfo.name}</strong></div>
              <div><span className="subtext">邮箱</span><span>{submitterInfo.email}</span></div>
              <div><span className="subtext">公司</span><span>{submitterInfo.company ?? '—'}</span></div>
              <div><span className="subtext">部门</span><span>{submitterInfo.department ?? '—'}</span></div>
            </div>
          </section>
          <section className="card">
            <h3>历史工单 ({submitterInfo.history_tickets.length})</h3>
            {submitterInfo.history_tickets.length === 0 ? <p className="empty">暂无历史工单</p> : (
              <div className="history-tickets">
                {submitterInfo.history_tickets.map((t) => (
                  <div key={t.id} className="history-item">
                    <strong>{t.subject}</strong>
                    <span className="subtext">{t.category} · {t.sla_priority} · {STATUS_LABELS[t.status] ?? t.status} · {new Date(t.created_at).toLocaleDateString('zh-CN')}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>
      )}
    </div>
  )
}
