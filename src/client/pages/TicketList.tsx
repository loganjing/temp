import { useState, useCallback, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { listTickets, getTicket, addReply, transferTicket, completeTicket, cancelTicket, submitRating, getUserProfile } from '../api'
import type { Ticket, TicketDetail as TicketDetailType, Priority, SortOrder, TicketStatus, UserProfile } from '../api/types'
import { useSession } from '../hooks/useSession'
import { Loading, EmptyState, ErrorState, PriorityBadge, StatusBadge, AssignModeBadge, Alert, Modal } from '../components/common'
import { fmtTime, logActionLabel } from '../components/common'
import { FetchError } from '../api/client'

export default function TicketList() {
  const { id: selectedId } = useParams()
  const navigate = useNavigate()
  const { session } = useSession()
  const [items, setItems] = useState<Ticket[]>([])
  const [total, setTotal] = useState(0)
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [priority, setPriority] = useState<Priority | ''>('')
  const [status, setStatus] = useState<TicketStatus | ''>('')
  const [sort, setSort] = useState<SortOrder>('createdAt_desc')
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)

  const fetchList = useCallback(async () => {
    setListLoading(true)
    setListError(null)
    try {
      const resp = await listTickets({
        q: q || undefined,
        category: category || undefined,
        priority: priority || undefined,
        status: status || undefined,
        sort,
        page,
        pageSize,
      })
      setItems(resp.items)
      setTotal(resp.total)
    } catch (e) {
      setListError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setListLoading(false)
    }
  }, [q, category, priority, status, sort, page, pageSize])

  useEffect(() => { fetchList() }, [fetchList])
  const totalPages = Math.ceil(total / pageSize) || 1

  return (
    <div>
      <div className="page-header">
        <div className="page-title">工单列表</div>
        <button className="btn btn-primary btn-sm" onClick={() => navigate('/tickets/new')}>提交工单</button>
      </div>

      <div className="split-layout">
        <div className="split-master">
          <div className="split-master-toolbar">
            <div className="toolbar-row">
              <input
                className="form-input toolbar-search"
                placeholder="搜索主题/描述/工单 ID"
                value={q}
                onChange={e => { setQ(e.target.value); setPage(1) }}
              />
            </div>
            <div className="toolbar-row">
              <input className="form-input" placeholder="分类" value={category} onChange={e => { setCategory(e.target.value); setPage(1) }} />
              <select className="form-select" value={priority} onChange={e => { setPriority(e.target.value as Priority || ''); setPage(1) }}>
                <option value="">全部优先级</option>
                <option value="P0">P0</option><option value="P1">P1</option><option value="P2">P2</option>
                <option value="P3">P3</option><option value="P4">P4</option>
              </select>
              <select className="form-select" value={status} onChange={e => { setStatus(e.target.value as TicketStatus || ''); setPage(1) }}>
                <option value="">全部状态</option>
                <option value="created">已创建</option>
                <option value="pending_assignment">待分配</option>
                <option value="pending_handling">待处理</option>
                <option value="completed">已完成</option>
                <option value="cancelled">已取消</option>
              </select>
              <select className="form-select" value={sort} onChange={e => setSort(e.target.value as SortOrder)}>
                <option value="createdAt_desc">创建时间 ↓</option>
                <option value="createdAt_asc">创建时间 ↑</option>
              </select>
            </div>
          </div>

          {listLoading ? <Loading /> :
            listError ? <ErrorState message={listError} onRetry={fetchList} /> :
            items.length === 0 ? <EmptyState text="暂无工单" hint="提交工单后将出现在这里" /> : (
              <div className="split-master-list">
                {items.map(t => (
                  <div
                    key={t.id}
                    className={`ticket-list-item ${selectedId === t.id ? 'selected' : ''}`}
                    onClick={() => navigate(`/tickets/${t.id}`)}
                  >
                    <div className="ticket-list-item-subject">{t.subject}</div>
                    <div className="ticket-list-item-meta">
                      <PriorityBadge priority={t.priority} />
                      <StatusBadge status={t.status} />
                      <span>{t.category}</span>
                      <span>{t.id}</span>
                      <span>{fmtTime(t.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )
          }

          <div className="split-master-footer">
            <span>共 {total} 条</span>
            <div className="pagination">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
              <span className="current">{page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页</button>
            </div>
          </div>
        </div>

        <div className="split-detail">
          {selectedId ? (
            <TicketDetailPanel key={selectedId} ticketId={selectedId} />
          ) : (
            <div className="split-detail-content">
              <EmptyState text="选择左侧工单查看详情" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TicketDetailPanel({ ticketId }: { ticketId: string }) {
  const { session } = useSession()
  const [detail, setDetail] = useState<TicketDetailType | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [replying, setReplying] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [showComplete, setShowComplete] = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [showRating, setShowRating] = useState(false)
  const [ratingScore, setRatingScore] = useState(5)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)

  const fetchDetail = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const d = await getTicket(ticketId)
      setDetail(d)
      if (session?.capabilities.includes('handle_ticket') && d.ticket.submitter.id) {
        try {
          const p = await getUserProfile(d.ticket.submitter.id)
          setUserProfile(p)
        } catch { /* ignore profile error */ }
      }
    } catch (e) {
      if (e instanceof FetchError && (e.code === 'NOT_FOUND' || e.code === 'FORBIDDEN')) {
        setError('资源不存在或不可见')
      } else {
        setError(e instanceof Error ? e.message : '加载失败')
      }
    } finally {
      setLoading(false)
    }
  }, [ticketId, session])

  useEffect(() => { fetchDetail() }, [fetchDetail])

  const canReply = session?.capabilities.includes('submit_ticket') || session?.capabilities.includes('handle_ticket')
  const canHandle = session?.capabilities.includes('handle_ticket')
  const canSubmit = session?.capabilities.includes('submit_ticket')
  const isTerminal = detail?.ticket.status === 'completed' || detail?.ticket.status === 'cancelled'
  const isSubmitter = session?.user?.id === detail?.ticket.submitter.id

  const handleReply = async () => {
    if (!replyText.trim() || !detail) return
    setReplying(true)
    setActionError(null)
    try {
      const resp = await addReply(detail.ticket.id, replyText.trim())
      setDetail({ ...detail, replies: [...detail.replies, resp.reply], ticket: { ...detail.ticket, replyCount: detail.ticket.replyCount + 1 } })
      setReplyText('')
      setActionMsg('回复成功')
      setTimeout(() => setActionMsg(null), 3000)
    } catch (e) {
      if (e instanceof FetchError) {
        if (e.code === 'NOT_FOUND' || e.code === 'FORBIDDEN') setActionError('资源不存在或不可见')
        else if (e.code === 'INVALID_TRANSITION') setActionError('当前状态不允许回复')
        else setActionError(e.message)
      } else setActionError('回复失败')
    } finally {
      setReplying(false)
    }
  }

  const handleTransfer = async (groupId: string, assigneeId: string, note: string) => {
    if (!detail) return
    try {
      const data: { groupId?: string; assigneeId?: string; note?: string } = {}
      if (groupId) data.groupId = groupId
      if (assigneeId) data.assigneeId = assigneeId
      if (note) data.note = note
      const resp = await transferTicket(detail.ticket.id, data)
      setDetail({ ...detail, ticket: resp.ticket, transfers: [...detail.transfers, resp.transfer] })
      setShowTransfer(false)
      setActionMsg('转派成功')
      setTimeout(() => setActionMsg(null), 3000)
    } catch (e) {
      if (e instanceof FetchError) {
        if (e.code === 'NOT_FOUND' || e.code === 'FORBIDDEN') throw new Error('资源不存在或不可见')
        if (e.code === 'INVALID_TRANSITION') throw new Error('当前状态不允许转派')
        throw new Error(e.message)
      }
      throw new Error('转派失败')
    }
  }

  const handleComplete = async (resolution: string) => {
    if (!detail) return
    try {
      const resp = await completeTicket(detail.ticket.id, resolution || undefined)
      setDetail({ ...detail, ticket: resp.ticket })
      setShowComplete(false)
      setActionMsg('工单已完成')
      setTimeout(() => setActionMsg(null), 3000)
    } catch (e) {
      if (e instanceof FetchError) {
        if (e.code === 'NOT_FOUND' || e.code === 'FORBIDDEN') throw new Error('资源不存在或不可见')
        if (e.code === 'INVALID_TRANSITION') throw new Error('当前状态不允许完成')
        throw new Error(e.message)
      }
      throw new Error('完成失败')
    }
  }

  const handleCancel = async (reason: string) => {
    if (!detail) return
    try {
      const resp = await cancelTicket(detail.ticket.id, reason || undefined)
      setDetail({ ...detail, ticket: resp.ticket })
      setShowCancel(false)
      setActionMsg('工单已取消')
      setTimeout(() => setActionMsg(null), 3000)
    } catch (e) {
      if (e instanceof FetchError) {
        if (e.code === 'NOT_FOUND' || e.code === 'FORBIDDEN') throw new Error('资源不存在或不可见')
        if (e.code === 'INVALID_TRANSITION') throw new Error('当前状态不允许取消')
        throw new Error(e.message)
      }
      throw new Error('取消失败')
    }
  }

  const handleRating = async () => {
    if (!detail) return
    try {
      const resp = await submitRating(detail.ticket.id, ratingScore)
      setDetail({ ...detail, ticket: { ...detail.ticket, rating: { score: resp.rating.score, ratedBy: resp.rating.ratedBy, ratedAt: resp.rating.ratedAt } } })
      setShowRating(false)
      setActionMsg('评价成功')
      setTimeout(() => setActionMsg(null), 3000)
    } catch (e) {
      if (e instanceof FetchError) {
        if (e.code === 'FORBIDDEN') throw new Error('只有提交人可评价')
        if (e.code === 'INVALID_TRANSITION') throw new Error('未完成的工单不可评价')
        if (e.code === 'ALREADY_RATED') throw new Error('该工单已评价过')
        throw new Error(e.message)
      }
      throw new Error('评价失败')
    }
  }

  if (loading) return <div className="split-detail-content"><Loading /></div>
  if (error) return <div className="split-detail-content"><ErrorState message={error} onRetry={fetchDetail} /></div>
  if (!detail) return null

  const t = detail.ticket

  return (
    <div className="split-detail-content">
      {actionMsg && <Alert type="success">{actionMsg}</Alert>}
      {actionError && <Alert type="error">{actionError}</Alert>}

      <div className="detail-section">
        <div className="flex items-center gap-8 mb-16">
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>{t.subject}</h2>
          <PriorityBadge priority={t.priority} />
          <StatusBadge status={t.status} />
        </div>
        <div className="detail-field"><span className="detail-field-label">工单 ID</span><span className="detail-field-value">{t.id}</span></div>
        <div className="detail-field"><span className="detail-field-label">分类</span><span className="detail-field-value">{t.category}</span></div>
        <div className="detail-field"><span className="detail-field-label">公司</span><span className="detail-field-value">{t.companyName}</span></div>
        <div className="detail-field"><span className="detail-field-label">提交人</span><span className="detail-field-value">{t.submitter.name} ({t.submitter.email || '-'})</span></div>
        <div className="detail-field"><span className="detail-field-label">部门</span><span className="detail-field-value">{t.submitter.department || '-'}</span></div>
        <div className="detail-field"><span className="detail-field-label">创建时间</span><span className="detail-field-value">{fmtTime(t.createdAt)}</span></div>
        {t.assignment && (
          <>
            <div className="detail-field"><span className="detail-field-label">分配业务组</span><span className="detail-field-value">{t.assignment.groupName}</span></div>
            <div className="detail-field"><span className="detail-field-label">分配时间</span><span className="detail-field-value">{fmtTime(t.assignment.assignedAt)}</span></div>
            <div className="detail-field"><span className="detail-field-label">分配方式</span><span className="detail-field-value"><AssignModeBadge mode={t.assignment.assignedMode} /></span></div>
          </>
        )}
        {t.completion && (
          <>
            <div className="detail-field"><span className="detail-field-label">处理人</span><span className="detail-field-value">{t.completion.handledBy.name}</span></div>
            <div className="detail-field"><span className="detail-field-label">处理时间</span><span className="detail-field-value">{fmtTime(t.completion.handledAt)}</span></div>
          </>
        )}
        {t.cancelledAt && (
          <div className="detail-field"><span className="detail-field-label">取消时间</span><span className="detail-field-value">{fmtTime(t.cancelledAt)}</span></div>
        )}
        {t.rating && (
          <>
            <div className="detail-field"><span className="detail-field-label">满意度评分</span><span className="detail-field-value">{'★'.repeat(t.rating.score)}{'☆'.repeat(5 - t.rating.score)} ({t.rating.score}/5)</span></div>
            <div className="detail-field"><span className="detail-field-label">评价时间</span><span className="detail-field-value">{fmtTime(t.rating.ratedAt)}</span></div>
          </>
        )}
        <div className="detail-field"><span className="detail-field-label">描述</span><span className="detail-field-value" style={{ whiteSpace: 'pre-wrap' }}>{t.description}</span></div>
      </div>

      {/* Submitteer profile panel for handlers */}
      {canHandle && userProfile && (
        <div className="detail-section">
          <div className="detail-section-title">提交人完整信息</div>
          <div className="detail-field"><span className="detail-field-label">姓名</span><span className="detail-field-value">{userProfile.user.name}</span></div>
          <div className="detail-field"><span className="detail-field-label">邮箱</span><span className="detail-field-value">{userProfile.user.email}</span></div>
          <div className="detail-field"><span className="detail-field-label">公司</span><span className="detail-field-value">{userProfile.user.companyName}</span></div>
          <div className="detail-field"><span className="detail-field-label">部门</span><span className="detail-field-value">{userProfile.user.department}</span></div>
          <div className="detail-field"><span className="detail-field-label">历史工单</span><span className="detail-field-value">
            <span className="text-muted">共 {userProfile.historyTickets.total} 张</span>
          </span></div>
          {userProfile.historyTickets.items.length > 0 && (
            <table className="table mt-8">
              <thead><tr><th>ID</th><th>主题</th><th>状态</th><th>创建时间</th></tr></thead>
              <tbody>
                {userProfile.historyTickets.items.map(ht => (
                  <tr key={ht.id}>
                    <td>{ht.id}</td>
                    <td>{ht.subject}</td>
                    <td><StatusBadge status={ht.status} /></td>
                    <td>{fmtTime(ht.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="detail-section">
        <div className="detail-section-title">处理动作</div>
        <div className="flex gap-8">
          {canReply && !isTerminal && (
            <button className="btn btn-primary btn-sm" onClick={() => setReplyText('')}>回复</button>
          )}
          {canHandle && t.status === 'pending_handling' && (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowTransfer(true)}>转派</button>
              <button className="btn btn-primary btn-sm" onClick={() => setShowComplete(true)}>完成</button>
            </>
          )}
          {!isTerminal && (canSubmit || canHandle) && (
            <button className="btn btn-danger btn-sm" onClick={() => setShowCancel(true)}>取消</button>
          )}
          {canSubmit && isSubmitter && t.status === 'completed' && !t.rating && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowRating(true)}>评价</button>
          )}
        </div>
      </div>

      {/* Reply form */}
      {canReply && !isTerminal && (
        <div className="detail-section">
          <div className="detail-section-title">回复</div>
          <textarea
            className="form-textarea"
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            rows={3}
            placeholder="输入回复内容..."
            maxLength={5000}
          />
          <button className="btn btn-primary btn-sm mt-8" onClick={handleReply} disabled={replying || !replyText.trim()}>
            {replying ? '发送中...' : '发送回复'}
          </button>
        </div>
      )}

      {/* Reply thread */}
      <div className="detail-section">
        <div className="detail-section-title">回复线程 ({detail.replies.length})</div>
        {detail.replies.length === 0 ? (
          <EmptyState text="暂无回复" />
        ) : (
          detail.replies.map(r => (
            <div key={r.id} className={`reply-item ${r.authorRole}`}>
              <div className="reply-header">
                <span className="reply-author">{r.author.name}</span>
                <span className="reply-role">{r.authorRole === 'handler' ? '处理方' : '提交人'}</span>
                <span className="reply-time">{fmtTime(r.createdAt)}</span>
              </div>
              <div className="reply-content">{r.content}</div>
            </div>
          ))
        )}
      </div>

      {/* Transfer records */}
      {detail.transfers.length > 0 && (
        <div className="detail-section">
          <div className="detail-section-title">转派记录 ({detail.transfers.length})</div>
          {detail.transfers.map(tr => (
            <div key={tr.id} className="transfer-item">
              <div className="detail-field"><span className="detail-field-label">转派人</span><span className="detail-field-value">{tr.transferredBy.name}</span></div>
              <div className="detail-field"><span className="detail-field-label">时间</span><span className="detail-field-value">{fmtTime(tr.transferredAt)}</span></div>
              <div className="detail-field"><span className="detail-field-label">目标组</span><span className="detail-field-value">{tr.toGroupId || '-'}</span></div>
              <div className="detail-field"><span className="detail-field-label">目标人</span><span className="detail-field-value">{tr.toUserId || '-'}</span></div>
            </div>
          ))}
        </div>
      )}

      {/* Logs */}
      <div className="detail-section">
        <div className="detail-section-title">操作日志 ({detail.logs.length})</div>
        {detail.logs.length === 0 ? (
          <EmptyState text="暂无日志" />
        ) : (
          <div className="log-timeline">
            {detail.logs.map(lg => (
              <div key={lg.id} className="log-item">
                <div className="log-item-action">{logActionLabel(lg.action)}</div>
                <div className="log-item-meta">{lg.actor.name} · {fmtTime(lg.createdAt)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showTransfer && (
        <TransferModal onClose={() => setShowTransfer(false)} onSubmit={handleTransfer} />
      )}
      {showComplete && (
        <CompleteModal onClose={() => setShowComplete(false)} onSubmit={handleComplete} />
      )}
      {showCancel && (
        <CancelModal onClose={() => setShowCancel(false)} onSubmit={handleCancel} />
      )}
      {showRating && (
        <RatingModal score={ratingScore} setScore={setRatingScore} onClose={() => setShowRating(false)} onSubmit={handleRating} />
      )}
    </div>
  )
}

function TransferModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (groupId: string, assigneeId: string, note: string) => Promise<void> }) {
  const [groupId, setGroupId] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!groupId.trim() && !assigneeId.trim()) {
      setError('请填写目标业务组或成员')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(groupId.trim(), assigneeId.trim(), note.trim())
    } catch (e) {
      setError(e instanceof Error ? e.message : '转派失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title="转派工单" onClose={onClose} footer={
      <>
        <button className="btn btn-secondary" onClick={onClose}>取消</button>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>{submitting ? '提交中...' : '转派'}</button>
      </>
    }>
      {error && <Alert type="error">{error}</Alert>}
      <div className="form-group">
        <label className="form-label">目标业务组 ID</label>
        <input className="form-input" value={groupId} onChange={e => setGroupId(e.target.value)} placeholder="业务组 ID" />
      </div>
      <div className="form-group">
        <label className="form-label">目标成员 ID</label>
        <input className="form-input" value={assigneeId} onChange={e => setAssigneeId(e.target.value)} placeholder="成员 ID" />
        <div className="form-hint">业务组与成员至少填写其一</div>
      </div>
      <div className="form-group">
        <label className="form-label">备注</label>
        <textarea className="form-textarea" value={note} onChange={e => setNote(e.target.value)} maxLength={500} rows={3} />
      </div>
    </Modal>
  )
}

function CompleteModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (resolution: string) => Promise<void> }) {
  const [resolution, setResolution] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(resolution.trim())
    } catch (e) {
      setError(e instanceof Error ? e.message : '完成失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title="完成处理" onClose={onClose} footer={
      <>
        <button className="btn btn-secondary" onClick={onClose}>取消</button>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>{submitting ? '提交中...' : '完成'}</button>
      </>
    }>
      {error && <Alert type="error">{error}</Alert>}
      <div className="form-group">
        <label className="form-label">处理结果（可选）</label>
        <textarea className="form-textarea" value={resolution} onChange={e => setResolution(e.target.value)} maxLength={2000} rows={4} />
      </div>
    </Modal>
  )
}

function CancelModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(reason.trim())
    } catch (e) {
      setError(e instanceof Error ? e.message : '取消失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title="取消工单" onClose={onClose} footer={
      <>
        <button className="btn btn-secondary" onClick={onClose}>返回</button>
        <button className="btn btn-danger" onClick={handleSubmit} disabled={submitting}>{submitting ? '提交中...' : '确认取消'}</button>
      </>
    }>
      {error && <Alert type="error">{error}</Alert>}
      <div className="form-group">
        <label className="form-label">取消原因（可选）</label>
        <textarea className="form-textarea" value={reason} onChange={e => setReason(e.target.value)} maxLength={500} rows={3} />
      </div>
    </Modal>
  )
}

function RatingModal({ score, setScore, onClose, onSubmit }: { score: number; setScore: (n: number) => void; onClose: () => void; onSubmit: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit()
    } catch (e) {
      setError(e instanceof Error ? e.message : '评价失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title="满意度评价" onClose={onClose} footer={
      <>
        <button className="btn btn-secondary" onClick={onClose}>取消</button>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>{submitting ? '提交中...' : '提交评价'}</button>
      </>
    }>
      {error && <Alert type="error">{error}</Alert>}
      <div className="form-group">
        <label className="form-label">满意度评分</label>
        <div className="star-rating">
          {[1,2,3,4,5].map(n => (
            <span key={n} className={`star ${n <= score ? 'active' : ''}`} onClick={() => setScore(n)}>★</span>
          ))}
        </div>
      </div>
    </Modal>
  )
}
