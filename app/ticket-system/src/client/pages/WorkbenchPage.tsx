import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { listTickets, getTicket, patchTicket, transferTicket, listReplies, addReply, getSubmitter, submitEvaluation } from '../api/ticket-api'
import { listCompanies } from '../api/org-api'
import type { Ticket, Company, TicketReply, SubmitterInfo, TicketStatus, SlaPriority } from '../api/types'
import { StatusBadge, PriorityBadge } from '../components/StatusBadge'
import { Loading, EmptyState, ErrorState } from '../components/States'
import { ToastProvider, useToast } from '../components/Toast'
import { formatDateTime, STATUS_OPTIONS, STATUS_LABEL } from '../components/format'

type SortField = 'created_at' | 'sla_priority'
type Order = 'asc' | 'desc'

function WorkbenchInner() {
  const navigate = useNavigate()
  const { ticketId } = useParams()
  const toast = useToast()

  const [companies, setCompanies] = useState<Company[]>([])
  const [companyFilter, setCompanyFilter] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<TicketStatus | ''>('pending_process')
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [order, setOrder] = useState<Order>('desc')
  const [page, setPage] = useState(1)
  const [pageSize] = useState(15)

  const [tickets, setTickets] = useState<Ticket[]>([])
  const [total, setTotal] = useState(0)
  const [loadingList, setLoadingList] = useState(true)
  const [listError, setListError] = useState('')

  const loadCompanies = useCallback(async () => {
    try { setCompanies(await listCompanies()) } catch { /* 公司列表非阻塞 */ }
  }, [])

  const loadList = useCallback(async () => {
    setLoadingList(true)
    setListError('')
    try {
      const result = await listTickets({
        status: statusFilter || undefined,
        companyId: companyFilter || undefined,
        search: search || undefined,
        sort: sortField,
        order,
        page,
        pageSize,
      })
      setTickets(result.items)
      setTotal(result.total)
    } catch (cause) {
      setListError(cause instanceof Error ? cause.message : '加载工单失败')
    } finally {
      setLoadingList(false)
    }
  }, [statusFilter, companyFilter, search, sortField, order, page, pageSize])

  useEffect(() => { void loadCompanies() }, [loadCompanies])
  useEffect(() => { void loadList() }, [loadList])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const selectTicket = (id: string) => navigate(`/tickets/${encodeURIComponent(id)}`)

  return (
    <div className="split-layout">
      <section className="master-panel">
        <div className="filter-bar">
          <label className="filter-item">
            <span>状态</span>
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as TicketStatus | ''); setPage(1) }}>
              <option value="">全部</option>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </label>
          <label className="filter-item">
            <span>公司</span>
            <select value={companyFilter} onChange={(e) => { setCompanyFilter(e.target.value); setPage(1) }}>
              <option value="">全部公司</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="filter-item search-item">
            <span>搜索</span>
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="按主题关键词" />
          </label>
          <label className="filter-item">
            <span>排序</span>
            <select value={sortField} onChange={(e) => setSortField(e.target.value as SortField)}>
              <option value="created_at">创建时间</option>
              <option value="sla_priority">优先级</option>
            </select>
          </label>
          <label className="filter-item">
            <span>方向</span>
            <select value={order} onChange={(e) => setOrder(e.target.value as Order)}>
              <option value="desc">降序</option>
              <option value="asc">升序</option>
            </select>
          </label>
        </div>

        <div className="ticket-list">
          {loadingList ? <Loading /> : listError ? <ErrorState message={listError} /> : tickets.length === 0 ? (
            <EmptyState message="暂无工单" hint="调整筛选条件或创建新工单" />
          ) : tickets.map((t) => (
            <button
              key={t.id}
              className={`ticket-row${ticketId === t.id ? ' selected' : ''}`}
              onClick={() => selectTicket(t.id)}
            >
              <div className="ticket-row-head">
                <span className="ticket-subject" title={t.subject}>{t.subject}</span>
                <PriorityBadge priority={t.slaPriority} />
              </div>
              <div className="ticket-row-meta">
                <StatusBadge status={t.status} />
                <span className="subtext">{t.category}</span>
                <span className="subtext">{formatDateTime(t.createdAt)}</span>
              </div>
            </button>
          ))}
        </div>

        <div className="pagination-bar">
          <span className="subtext">{total === 0 ? '无数据' : `第 ${page} / ${totalPages} 页 · 共 ${total} 条`}</span>
          <div className="row-actions">
            <button className="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</button>
            <button className="secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>下一页</button>
          </div>
        </div>
      </section>

      <section className="detail-panel">
        {ticketId ? <TicketDetail key={ticketId} ticketId={ticketId} onUpdated={loadList} toast={toast} /> : (
          <EmptyState message="请选择左侧工单查看详情" />
        )}
      </section>
    </div>
  )
}

function TicketDetail({ ticketId, onUpdated, toast }: { ticketId: string; onUpdated: () => void; toast: (kind: 'success' | 'error' | 'info', message: string) => void }) {
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [replies, setReplies] = useState<TicketReply[]>([])
  const [submitter, setSubmitter] = useState<SubmitterInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [replyText, setReplyText] = useState('')
  const [busy, setBusy] = useState(false)
  const [showSubmitter, setShowSubmitter] = useState(false)
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)

  // 分配 / 转派面板
  const [assignGroupId, setAssignGroupId] = useState('')
  const [assignUserId, setAssignUserId] = useState('')
  const [transferGroupId, setTransferGroupId] = useState('')
  const [transferUserId, setTransferUserId] = useState('')

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [t, r] = await Promise.all([getTicket(ticketId), listReplies(ticketId)])
      setTicket(t)
      setReplies(r)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载工单详情失败')
    } finally {
      setLoading(false)
    }
  }, [ticketId])

  useEffect(() => { void loadAll() }, [loadAll])

  const doReply = async (event: FormEvent) => {
    event.preventDefault()
    if (!replyText.trim()) return
    setBusy(true)
    try {
      await addReply(ticketId, replyText.trim())
      setReplyText('')
      setReplies(await listReplies(ticketId))
      toast('success', '回复已添加')
    } catch (cause) {
      toast('error', cause instanceof Error ? cause.message : '回复失败')
    } finally {
      setBusy(false)
    }
  }

  const doAssign = async () => {
    if (!ticket) return
    setBusy(true)
    try {
      const updated = await patchTicket(ticket.id, {
        status: 'pending_process',
        assignedGroupId: assignGroupId || null,
        assignedUserId: assignUserId || null,
      })
      setTicket(updated)
      toast('success', '工单已分配')
      onUpdated()
    } catch (cause) {
      toast('error', cause instanceof Error ? cause.message : '分配失败')
    } finally {
      setBusy(false)
    }
  }

  const doTransfer = async () => {
    if (!ticket) return
    setBusy(true)
    try {
      const updated = await transferTicket(ticket.id, {
        toGroupId: transferGroupId || null,
        toUserId: transferUserId || null,
      })
      setTicket(updated)
      setAssignGroupId(updated.assignedGroupId ?? '')
      setAssignUserId(updated.assignedUserId ?? '')
      toast('success', '工单已转派')
      onUpdated()
    } catch (cause) {
      toast('error', cause instanceof Error ? cause.message : '转派失败')
    } finally {
      setBusy(false)
    }
  }

  const doComplete = async () => {
    if (!ticket) return
    setBusy(true)
    try {
      const updated = await patchTicket(ticket.id, { status: 'completed' })
      setTicket(updated)
      toast('success', '工单已完成')
      onUpdated()
    } catch (cause) {
      toast('error', cause instanceof Error ? cause.message : '完成失败')
    } finally {
      setBusy(false)
    }
  }

  const doCancel = async () => {
    if (!ticket) return
    setBusy(true)
    try {
      const updated = await patchTicket(ticket.id, { status: 'cancelled' })
      setTicket(updated)
      toast('success', '工单已取消')
      onUpdated()
    } catch (cause) {
      toast('error', cause instanceof Error ? cause.message : '取消失败')
    } finally {
      setBusy(false)
    }
  }

  const loadSubmitter = async () => {
    if (submitter) { setShowSubmitter(true); return }
    try {
      setSubmitter(await getSubmitter(ticketId))
      setShowSubmitter(true)
    } catch (cause) {
      toast('error', cause instanceof Error ? cause.message : '加载提交人信息失败')
    }
  }

  const doEvaluate = async () => {
    if (!ticket || rating === 0) return
    setBusy(true)
    try {
      await submitEvaluation(ticket.id, rating)
      toast('success', '评价已提交')
      setTicket({ ...ticket, status: 'completed' })
    } catch (cause) {
      toast('error', cause instanceof Error ? cause.message : '评价失败')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Loading />
  if (error) return <ErrorState message={error} />
  if (!ticket) return <EmptyState message="工单不存在" />

  const canAssign = ticket.status === 'pending_assign'
  const canTransfer = ticket.status === 'pending_process'
  const canComplete = ticket.status === 'pending_process'
  const canCancel = ticket.status !== 'completed' && ticket.status !== 'cancelled'
  const canEvaluate = ticket.status === 'completed'

  return (
    <div className="ticket-detail">
      <div className="detail-header">
        <div>
          <h2 title={ticket.subject}>{ticket.subject}</h2>
          <p className="subtext">工单 ID：{ticket.id}</p>
        </div>
        <div className="detail-badges">
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.slaPriority} />
        </div>
      </div>

      <div className="detail-grid">
        <div className="detail-field"><label>分类</label><span>{ticket.category}</span></div>
        <div className="detail-field"><label>提交人</label><span>{ticket.submitterName}</span></div>
        <div className="detail-field"><label>创建时间</label><span>{formatDateTime(ticket.createdAt)}</span></div>
        <div className="detail-field"><label>处理时间</label><span>{formatDateTime(ticket.processedAt)}</span></div>
        <div className="detail-field"><label>已分配业务组</label><span>{ticket.assignedGroupName ?? '—'}</span></div>
        <div className="detail-field"><label>已分配处理人</label><span>{ticket.assignedUserId ?? '—'}</span></div>
      </div>

      <div className="detail-section">
        <h3>描述</h3>
        <p className="description-text">{ticket.description}</p>
      </div>

      <div className="action-group">
        <button className="secondary" onClick={() => void loadSubmitter()}>查看提交人信息</button>
        {canCancel && <button className="danger-btn" disabled={busy} onClick={() => void doCancel()}>取消工单</button>}
        {canComplete && <button disabled={busy} onClick={() => void doComplete()}>完成工单</button>}
      </div>

      {showSubmitter && submitter && (
        <div className="detail-section submitter-box">
          <h3>提交人信息</h3>
          <div className="detail-grid">
            <div className="detail-field"><label>姓名</label><span>{submitter.user.fullName}</span></div>
            <div className="detail-field"><label>邮箱</label><span>{submitter.user.email}</span></div>
            <div className="detail-field"><label>公司</label><span>{submitter.user.companyName}</span></div>
            <div className="detail-field"><label>部门</label><span>{submitter.user.departmentName ?? '—'}</span></div>
          </div>
          <h4>历史工单</h4>
          {submitter.historyTickets.length === 0 ? <p className="subtext">暂无历史工单</p> : (
            <div className="table-scroll">
              <table>
                <thead><tr><th>主题</th><th>状态</th><th>分类</th><th>创建时间</th></tr></thead>
                <tbody>{submitter.historyTickets.map((h) => (
                  <tr key={h.id}><td>{h.subject}</td><td>{STATUS_LABEL[h.status] ?? h.status}</td><td>{h.category}</td><td>{formatDateTime(h.createdAt)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {canAssign && (
        <div className="detail-section assign-box">
          <h3>分配工单</h3>
          <div className="inline-form">
            <label>业务组 ID<input value={assignGroupId} onChange={(e) => setAssignGroupId(e.target.value)} placeholder="业务组 UUID" /></label>
            <label>处理人 ID<input value={assignUserId} onChange={(e) => setAssignUserId(e.target.value)} placeholder="用户 UUID" /></label>
            <button disabled={busy || (!assignGroupId && !assignUserId)} onClick={() => void doAssign()}>分配</button>
          </div>
        </div>
      )}

      {canTransfer && (
        <div className="detail-section assign-box">
          <h3>转派工单</h3>
          <div className="inline-form">
            <label>转至业务组 ID<input value={transferGroupId} onChange={(e) => setTransferGroupId(e.target.value)} placeholder="业务组 UUID" /></label>
            <label>转至处理人 ID<input value={transferUserId} onChange={(e) => setTransferUserId(e.target.value)} placeholder="用户 UUID" /></label>
            <button disabled={busy || (!transferGroupId && !transferUserId)} onClick={() => void doTransfer()}>转派</button>
          </div>
        </div>
      )}

      {canEvaluate && (
        <div className="detail-section evaluate-box">
          <h3>满意度评价</h3>
          <div className="star-row">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                className={`star${(hoverRating || rating) >= star ? ' active' : ''}`}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => setRating(star)}
                aria-label={`${star}星`}
              >★</button>
            ))}
          </div>
          <button disabled={busy || rating === 0} onClick={() => void doEvaluate()}>提交评价</button>
        </div>
      )}

      <div className="detail-section">
        <h3>回复（{replies.length}）</h3>
        {replies.length === 0 ? <p className="subtext">暂无回复</p> : (
          <ul className="reply-list">
            {replies.map((r) => (
              <li key={r.id} className="reply-item">
                <div className="reply-head"><strong>{r.userFullName}</strong><span className="subtext">{formatDateTime(r.createdAt)}</span></div>
                <p>{r.content}</p>
              </li>
            ))}
          </ul>
        )}
        <form className="reply-form" onSubmit={(e) => void doReply(e)}>
          <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="输入回复内容…" rows={3} />
          <button type="submit" disabled={busy || !replyText.trim()}>添加回复</button>
        </form>
      </div>
    </div>
  )
}

export default function WorkbenchPage() {
  return (
    <ToastProvider>
      <WorkbenchInner />
    </ToastProvider>
  )
}
