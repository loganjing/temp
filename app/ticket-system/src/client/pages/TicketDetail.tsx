import { useEffect, useState, type FormEvent } from 'react'
import { apiRequest } from '../platform/api-client'
import { useTicket } from '../hooks/useTicket'
import { useBusinessGroups } from '../hooks/useBusinessGroups'
import {
  STATUS_LABELS, LOG_ACTION_LABELS,
  type AuthUser, type BusinessGroupDTO, type DataResponse,
  type LogEntryDTO, type SubmitterInfoDTO, type TicketDetailDTO,
} from '../types'

interface Props {
  ticketId: string | null
  currentUser: AuthUser
  onUpdated: () => void
}

export default function TicketDetail({ ticketId, currentUser, onUpdated }: Props) {
  const { ticket, loading, error, refresh } = useTicket(ticketId)
  const { groups } = useBusinessGroups()
  const [actionError, setActionError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [replyContent, setReplyContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [transferMode, setTransferMode] = useState<'user' | 'group'>('user')
  const [transferTargetId, setTransferTargetId] = useState('')
  const [submitterInfo, setSubmitterInfo] = useState<SubmitterInfoDTO | null>(null)
  const [logs, setLogs] = useState<LogEntryDTO[]>([])
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')

  const role = currentUser.role ?? 'submitter'
  const isHandler = role === 'handler' || role === 'admin'
  const isAdmin = role === 'admin'

  // Fetch submitter info when handler views ticket
  const loadSubmitterInfo = async (id: string) => {
    if (!isHandler) return
    try {
      const res = await apiRequest<DataResponse<SubmitterInfoDTO>>(`/api/tickets/${encodeURIComponent(id)}/submitter-info`)
      setSubmitterInfo(res.data)
    } catch { setSubmitterInfo(null) }
  }

  // Fetch operation logs
  const loadLogs = async (id: string) => {
    try {
      const res = await apiRequest<DataResponse<LogEntryDTO[]>>(`/api/tickets/${encodeURIComponent(id)}/logs`)
      setLogs(res.data)
    } catch { setLogs([]) }
  }

  // Load submitter info and operation logs when ticket is loaded
  useEffect(() => {
    if (!ticketId || loading) return
    setSubmitterInfo(null)
    setLogs([])
    if (isHandler) void loadSubmitterInfo(ticketId)
    void loadLogs(ticketId)
  }, [ticketId, loading, isHandler])

  const handleReply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!ticketId || !replyContent.trim()) return
    setBusy(true)
    setActionError('')
    setActionMessage('')
    try {
      await apiRequest(`/api/tickets/${encodeURIComponent(ticketId)}/replies`, {
        method: 'POST', body: JSON.stringify({ content: replyContent.trim() }),
      })
      setReplyContent('')
      setActionMessage('回复成功')
      await refresh()
      await loadLogs(ticketId)
      onUpdated()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '回复失败')
    } finally {
      setBusy(false)
    }
  }

  const handleStatus = async (target: 'completed' | 'cancelled') => {
    if (!ticketId) return
    setBusy(true)
    setActionError('')
    setActionMessage('')
    try {
      await apiRequest(`/api/tickets/${encodeURIComponent(ticketId)}/status`, {
        method: 'PATCH', body: JSON.stringify({ status: target }),
      })
      setActionMessage(target === 'completed' ? '工单已完成' : '工单已取消')
      await refresh()
      await loadLogs(ticketId)
      onUpdated()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '操作失败')
    } finally {
      setBusy(false)
    }
  }

  const handleTransfer = async () => {
    if (!ticketId || !transferTargetId) return
    const body = transferMode === 'user'
      ? { toUserId: transferTargetId }
      : { toGroupId: transferTargetId }
    setBusy(true)
    setActionError('')
    setActionMessage('')
    try {
      await apiRequest(`/api/tickets/${encodeURIComponent(ticketId)}/transfer`, {
        method: 'POST', body: JSON.stringify(body),
      })
      setShowTransfer(false)
      setTransferTargetId('')
      setActionMessage('转派成功')
      await refresh()
      await loadLogs(ticketId)
      onUpdated()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '转派失败')
    } finally {
      setBusy(false)
    }
  }

  const handleEvaluation = async () => {
    if (!ticketId || rating < 1) return
    setBusy(true)
    setActionError('')
    setActionMessage('')
    try {
      await apiRequest(`/api/tickets/${encodeURIComponent(ticketId)}/evaluation`, {
        method: 'POST', body: JSON.stringify({ rating, comment: comment.trim() || undefined }),
      })
      setRating(0)
      setComment('')
      setActionMessage('评价成功')
      await refresh()
      await loadLogs(ticketId)
      onUpdated()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '评价失败')
    } finally {
      setBusy(false)
    }
  }

  if (!ticketId) return <div className="detail-placeholder"><p>选择左侧工单查看详情</p></div>
  if (loading) return <div className="detail-placeholder"><p>加载中…</p></div>
  if (error) return <div className="detail-placeholder"><p className="error">{error}</p></div>
  if (!ticket) return <div className="detail-placeholder"><p>未找到工单</p></div>

  const t: TicketDetailDTO = ticket
  const isSubmitterOfTicket = t.submitterId === currentUser.id
  const isAssignedHandler = t.handlerId === currentUser.id
  const canComplete = isAssignedHandler && t.status === 'pending'
  const canCancel = (isAssignedHandler || isAdmin) && (t.status === 'unassigned' || t.status === 'pending')
  const canTransfer = (isAssignedHandler || isAdmin) && t.status === 'pending'
  const canEvaluate = isSubmitterOfTicket && t.status === 'completed' && !t.evaluation

  // Collect all users from group members for transfer-to-user dropdown
  const allMembers = groups.flatMap((g: BusinessGroupDTO) =>
    g.members.map(m => ({ userId: m.userId, userName: m.userName, email: m.email, groupName: g.name }))
  )

  return (
    <div className="ticket-detail">
      <div className="detail-header">
        <h3>{t.subject}</h3>
        <span className={`priority-badge priority-${t.priority}`}>{t.priority}</span>
        <span className={`status-badge status-${t.status}`}>{STATUS_LABELS[t.status] ?? t.status}</span>
      </div>

      <dl className="detail-meta">
        <div><dt>分类</dt><dd>{t.categoryName}</dd></div>
        <div><dt>提交人</dt><dd>{t.submitterName}</dd></div>
        <div><dt>处理人</dt><dd>{t.handlerName ?? '—'}</dd></div>
        <div><dt>业务组</dt><dd>{t.groupName ?? '—'}</dd></div>
        <div><dt>创建时间</dt><dd>{new Date(t.createdAt).toLocaleString()}</dd></div>
        {t.completedAt && <div><dt>完成时间</dt><dd>{new Date(t.completedAt).toLocaleString()}</dd></div>}
      </dl>

      <div className="detail-description">
        <h4>描述</h4>
        <p>{t.description}</p>
      </div>

      {actionMessage && <p role="status" className="success">{actionMessage}</p>}
      {actionError && <p role="alert" className="error">{actionError}</p>}

      {/* Actions */}
      <div className="detail-actions">
        {canComplete && <button disabled={busy} onClick={() => void handleStatus('completed')}>完成</button>}
        {canCancel && <button className="secondary" disabled={busy} onClick={() => void handleStatus('cancelled')}>取消</button>}
        {canTransfer && <button className="secondary" disabled={busy} onClick={() => setShowTransfer(!showTransfer)}>转派</button>}
      </div>

      {/* Transfer form */}
      {showTransfer && canTransfer && (
        <div className="card transfer-form">
          <h4>转派工单</h4>
          <div className="transfer-mode-toggle">
            <button type="button" className={transferMode === 'user' ? '' : 'secondary'} onClick={() => { setTransferMode('user'); setTransferTargetId('') }}>转派给处理人</button>
            <button type="button" className={transferMode === 'group' ? '' : 'secondary'} onClick={() => { setTransferMode('group'); setTransferTargetId('') }}>转派给业务组</button>
          </div>
          {transferMode === 'user' ? (
            <label>选择处理人
              <select value={transferTargetId} onChange={(e) => setTransferTargetId(e.target.value)}>
                <option value="">— 选择 —</option>
                {allMembers.map(m => (
                  <option key={m.userId} value={m.userId}>{m.userName} ({m.email}) · {m.groupName}</option>
                ))}
              </select>
            </label>
          ) : (
            <label>选择业务组
              <select value={transferTargetId} onChange={(e) => setTransferTargetId(e.target.value)}>
                <option value="">— 选择 —</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </label>
          )}
          <button disabled={busy || !transferTargetId} onClick={() => void handleTransfer()}>确认转派</button>
        </div>
      )}

      {/* Evaluation */}
      {t.evaluation ? (
        <div className="card evaluation-display">
          <h4>满意度评价</h4>
          <p className="rating-display">{'★'.repeat(t.evaluation.rating)}{'☆'.repeat(5 - t.evaluation.rating)} <span>{t.evaluation.rating}/5</span></p>
          {t.evaluation.comment && <p className="evaluation-comment">{t.evaluation.comment}</p>}
          <p className="subtext">{new Date(t.evaluation.createdAt).toLocaleString()}</p>
        </div>
      ) : canEvaluate ? (
        <div className="card evaluation-form">
          <h4>满意度评价</h4>
          <div className="rating-stars">
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} type="button" className={`star ${n <= rating ? 'active' : ''}`} onClick={() => setRating(n)}>★</button>
            ))}
          </div>
          <label>评价备注（可选）
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} maxLength={500} />
          </label>
          <button disabled={busy || rating < 1} onClick={() => void handleEvaluation()}>提交评价</button>
        </div>
      ) : null}

      {/* Submitter info (for handlers) */}
      {isHandler && submitterInfo && (
        <div className="card submitter-info">
          <h4>提交人信息</h4>
          <dl className="detail-meta">
            <div><dt>姓名</dt><dd>{submitterInfo.user.name}</dd></div>
            <div><dt>邮箱</dt><dd>{submitterInfo.user.email}</dd></div>
            <div><dt>公司</dt><dd>{submitterInfo.user.companyName}</dd></div>
            <div><dt>部门</dt><dd>{submitterInfo.user.department}</dd></div>
          </dl>
          <h5>历史工单 ({submitterInfo.historyTickets.length})</h5>
          {submitterInfo.historyTickets.length > 0 ? (
            <div className="table-scroll">
              <table>
                <thead><tr><th>主题</th><th>优先级</th><th>状态</th><th>创建时间</th></tr></thead>
                <tbody>
                  {submitterInfo.historyTickets.map(ht => (
                    <tr key={ht.id}>
                      <td><strong title={ht.subject}>{ht.subject}</strong></td>
                      <td><span className={`priority-badge priority-${ht.priority}`}>{ht.priority}</span></td>
                      <td>{STATUS_LABELS[ht.status] ?? ht.status}</td>
                      <td>{new Date(ht.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="subtext">暂无历史工单</p>}
        </div>
      )}

      {/* Replies */}
      <div className="replies-section">
        <h4>回复 ({t.replies.length})</h4>
        <div className="replies-list">
          {t.replies.map(r => (
            <div key={r.id} className="reply-item">
              <div className="reply-header">
                <strong>{r.replierName}</strong>
                <span className="subtext">{new Date(r.createdAt).toLocaleString()}</span>
              </div>
              <p className="reply-content">{r.content}</p>
            </div>
          ))}
          {t.replies.length === 0 && <p className="subtext">暂无回复</p>}
        </div>
        {t.status !== 'cancelled' && (
          <form className="reply-form" onSubmit={(e) => void handleReply(e)}>
            <textarea
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              placeholder="输入回复内容…"
              rows={3}
              maxLength={2000}
              required
            />
            <button disabled={busy || !replyContent.trim()}>回复</button>
          </form>
        )}
      </div>

      {/* Operation logs */}
      {logs.length > 0 && (
        <div className="card logs-section">
          <h4>操作日志</h4>
          <div className="logs-list">
            {logs.map(l => (
              <div key={l.id} className="log-item">
                <span className={`log-action log-${l.action}`}>{LOG_ACTION_LABELS[l.action] ?? l.action}</span>
                <span>{l.operatorName}</span>
                <span className="subtext">{new Date(l.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
