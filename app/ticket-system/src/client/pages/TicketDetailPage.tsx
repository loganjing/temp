import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiRequest } from '../platform/api-client'
import { LoadingView, ErrorView, Toast } from '../components/StateViews'
import { StatusBadge, PriorityBadge } from '../components/Badges'
import { STATUS_LABELS, ACTION_LABELS, type TicketDetail, type BusinessGroup, type CurrentUser } from '../types'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function TicketDetailPage({ user }: { user: CurrentUser }) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<TicketDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')
  const [replyText, setReplyText] = useState('')
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [assignGroupId, setAssignGroupId] = useState('')
  const [transferGroupId, setTransferGroupId] = useState('')
  const [transferProfileId, setTransferProfileId] = useState('')
  const [evalScore, setEvalScore] = useState(5)
  const [evalComment, setEvalComment] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError('')
    try {
      const result = await apiRequest<TicketDetail>(`/api/tickets/${id}`)
      setDetail(result)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [id])

  const loadGroups = useCallback(async () => {
    try {
      const result = await apiRequest<BusinessGroup[]>('/api/business-groups')
      setGroups(result)
    } catch {
      // 非管理员或无权限时忽略
    }
  }, [])

  useEffect(() => { void load(); void loadGroups() }, [load, loadGroups])

  const ticket = detail?.ticket
  const status = ticket?.status

  const canReply = ticket && (user.role === 'admin' || user.profileId === ticket.submitterProfileId || user.profileId === ticket.assignedHandlerId)
  const canAssign = user.role === 'admin' && status === 'pending_assignment'
  const canTransfer = (user.role === 'admin' || user.profileId === ticket?.assignedHandlerId) && status === 'pending_processing'
  const canComplete = (user.role === 'admin' || user.profileId === ticket?.assignedHandlerId) && status === 'pending_processing'
  const canCancel = (user.role === 'admin' || user.profileId === ticket?.submitterProfileId) && (status === 'pending_assignment' || status === 'pending_processing')
  const canEvaluate = user.profileId === ticket?.submitterProfileId && status === 'completed' && !detail?.evaluation

  const handleReply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!id || !replyText.trim()) return
    setBusy(true)
    setActionError('')
    setActionSuccess('')
    try {
      await apiRequest(`/api/tickets/${id}/replies`, { method: 'POST', body: JSON.stringify({ content: replyText.trim() }) })
      setReplyText('')
      setActionSuccess('回复成功')
      await load()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '回复失败')
    } finally {
      setBusy(false)
    }
  }

  const handleAssign = async () => {
    if (!id || !assignGroupId) return
    setBusy(true)
    setActionError('')
    setActionSuccess('')
    try {
      await apiRequest(`/api/tickets/${id}/assign`, { method: 'POST', body: JSON.stringify({ groupId: assignGroupId }) })
      setActionSuccess('分配成功')
      setAssignGroupId('')
      await load()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '分配失败')
    } finally {
      setBusy(false)
    }
  }

  const handleTransfer = async () => {
    if (!id) return
    if (!transferGroupId && !transferProfileId) return
    setBusy(true)
    setActionError('')
    setActionSuccess('')
    try {
      await apiRequest(`/api/tickets/${id}/transfer`, {
        method: 'POST',
        body: JSON.stringify({
          toGroupId: transferGroupId || null,
          toProfileId: transferProfileId || null,
        }),
      })
      setActionSuccess('转派成功')
      setTransferGroupId('')
      setTransferProfileId('')
      await load()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '转派失败')
    } finally {
      setBusy(false)
    }
  }

  const handleComplete = async () => {
    if (!id) return
    setBusy(true)
    setActionError('')
    setActionSuccess('')
    try {
      await apiRequest(`/api/tickets/${id}/complete`, { method: 'POST' })
      setActionSuccess('工单已完成')
      await load()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '操作失败')
    } finally {
      setBusy(false)
    }
  }

  const handleCancel = async () => {
    if (!id) return
    setBusy(true)
    setActionError('')
    setActionSuccess('')
    try {
      await apiRequest(`/api/tickets/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason: null }) })
      setActionSuccess('工单已取消')
      await load()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '操作失败')
    } finally {
      setBusy(false)
    }
  }

  const handleEvaluate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!id) return
    setBusy(true)
    setActionError('')
    setActionSuccess('')
    try {
      await apiRequest(`/api/tickets/${id}/evaluation`, {
        method: 'POST',
        body: JSON.stringify({ satisfactionScore: evalScore, comment: evalComment || null }),
      })
      setActionSuccess('评价已提交')
      await load()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '评价失败')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <LoadingView />
  if (error) return <ErrorView message={error} onRetry={load} />
  if (!ticket || !detail) return <ErrorView message="工单不存在" />

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <button className="link-btn" onClick={() => navigate('/')}>← 返回工作台</button>
          <h1>{ticket.subject}</h1>
        </div>
        <div className="header-badges">
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.slaPriority} />
        </div>
      </div>

      <Toast message={actionError} type="error" />
      <Toast message={actionSuccess} />

      <div className="detail-layout">
        {/* 左侧：工单信息 + 提交人 + 历史工单 + 操作日志 */}
        <div className="detail-left">
          <section className="card detail-section">
            <h2>工单信息</h2>
            <dl className="info-grid">
              <dt>分类</dt><dd>{ticket.category}</dd>
              <dt>所属公司</dt><dd>{ticket.companyName}</dd>
              <dt>分配业务组</dt><dd>{ticket.assignedGroupName ?? '未分配'}</dd>
              <dt>处理人</dt><dd>{ticket.assignedHandlerName ?? '未指派'}</dd>
              <dt>创建时间</dt><dd>{formatDate(ticket.createdAt)}</dd>
              <dt>完成时间</dt><dd>{ticket.completedAt ? formatDate(ticket.completedAt) : '—'}</dd>
              <dt>完成人</dt><dd>{ticket.completedByName ?? '—'}</dd>
            </dl>
            {ticket.description && (
              <div className="description-block">
                <h3>描述</h3>
                <p className="description-text">{ticket.description}</p>
              </div>
            )}
          </section>

          <section className="card detail-section">
            <h2>提交人信息</h2>
            <dl className="info-grid">
              <dt>姓名</dt><dd>{detail.submitter.displayName}</dd>
              <dt>邮箱</dt><dd>{detail.submitter.email}</dd>
              <dt>公司</dt><dd>{detail.submitter.companyName}</dd>
              <dt>部门</dt><dd>{detail.submitter.departmentName ?? '—'}</dd>
            </dl>
          </section>

          <section className="card detail-section">
            <h2>提交人历史工单 ({detail.submitterHistory.length})</h2>
            {detail.submitterHistory.length === 0 ? (
              <p className="muted">暂无历史工单</p>
            ) : (
              <div className="table-scroll">
                <table className="data-table compact">
                  <thead><tr><th>主题</th><th>分类</th><th>状态</th><th>创建时间</th></tr></thead>
                  <tbody>
                    {detail.submitterHistory.map((h) => (
                      <tr key={h.id} className="clickable-row" onClick={() => navigate(`/tickets/${h.id}`)}>
                        <td>{h.subject}</td>
                        <td>{h.category}</td>
                        <td><StatusBadge status={h.status} /></td>
                        <td className="muted">{formatDate(h.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card detail-section">
            <h2>操作日志</h2>
            {detail.recentLogs.length === 0 ? (
              <p className="muted">暂无操作日志</p>
            ) : (
              <ul className="log-list">
                {detail.recentLogs.map((log) => (
                  <li key={log.id} className="log-item">
                    <span className="log-action">{ACTION_LABELS[log.action] ?? log.action}</span>
                    <span className="muted">{log.actorName}</span>
                    <span className="muted">{formatDate(log.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* 右侧：回复列表 + 操作区 */}
        <div className="detail-right">
          <section className="card detail-section">
            <h2>回复 ({detail.replies.length})</h2>
            {detail.replies.length === 0 ? (
              <p className="muted">暂无回复</p>
            ) : (
              <ul className="reply-list">
                {detail.replies.map((reply) => (
                  <li key={reply.id} className="reply-item">
                    <div className="reply-header">
                      <strong>{reply.replierName}</strong>
                      <span className="muted">{formatDate(reply.createdAt)}</span>
                    </div>
                    <p className="reply-content">{reply.content}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {canReply && (
            <section className="card detail-section">
              <h2>添加回复</h2>
              <form onSubmit={(event) => void handleReply(event)}>
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.currentTarget.value)}
                  rows={3}
                  placeholder="输入回复内容…"
                />
                <button className="reply-submit" disabled={busy || !replyText.trim()}>回复</button>
              </form>
            </section>
          )}

          {/* 操作区 */}
          <section className="card detail-section">
            <h2>操作</h2>
            <div className="action-area">
              {canAssign && (
                <div className="action-group">
                  <h3>分配到业务组</h3>
                  <div className="action-row">
                    <select value={assignGroupId} onChange={(e) => setAssignGroupId(e.currentTarget.value)}>
                      <option value="">选择业务组…</option>
                      {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                    <button disabled={busy || !assignGroupId} onClick={() => void handleAssign()}>分配</button>
                  </div>
                </div>
              )}

              {canTransfer && (
                <div className="action-group">
                  <h3>转派工单</h3>
                  <div className="action-row">
                    <select value={transferGroupId} onChange={(e) => setTransferGroupId(e.currentTarget.value)}>
                      <option value="">目标业务组（可选）</option>
                      {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                    <input placeholder="目标处理人 Profile ID（可选）" value={transferProfileId} onChange={(e) => setTransferProfileId(e.currentTarget.value)} />
                    <button disabled={busy || (!transferGroupId && !transferProfileId)} onClick={() => void handleTransfer()}>转派</button>
                  </div>
                </div>
              )}

              {canComplete && (
                <div className="action-group">
                  <button disabled={busy} onClick={() => void handleComplete()}>完成工单</button>
                </div>
              )}

              {canCancel && (
                <div className="action-group">
                  <button className="danger-btn" disabled={busy} onClick={() => void handleCancel()}>取消工单</button>
                </div>
              )}

              {canEvaluate && (
                <div className="action-group">
                  <h3>满意度评价</h3>
                  <form onSubmit={(event) => void handleEvaluate(event)} className="stack">
                    <label>评分（1-5）
                      <select value={evalScore} onChange={(e) => setEvalScore(Number(e.currentTarget.value))}>
                        <option value={5}>5 — 非常满意</option>
                        <option value={4}>4 — 满意</option>
                        <option value={3}>3 — 一般</option>
                        <option value={2}>2 — 不满意</option>
                        <option value={1}>1 — 非常不满意</option>
                      </select>
                    </label>
                    <label>备注（可选）<textarea value={evalComment} onChange={(e) => setEvalComment(e.currentTarget.value)} rows={2} /></label>
                    <button disabled={busy}>提交评价</button>
                  </form>
                </div>
              )}

              {detail.evaluation && (
                <div className="action-group">
                  <h3>已评价</h3>
                  <p>满意度评分：{detail.evaluation.satisfactionScore} / 5</p>
                  {detail.evaluation.comment && <p className="muted">{detail.evaluation.comment}</p>}
                </div>
              )}

              {!canReply && !canAssign && !canTransfer && !canComplete && !canCancel && !canEvaluate && !detail.evaluation && (
                <p className="muted">当前无可执行操作</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
