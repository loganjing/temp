/** 工单工作台 — split-master-detail 布局：左侧待处理列表 + 右侧详情 */
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ticketApi, userApi, groupApi } from '../platform/ticket-api'
import { ApiRequestError } from '../platform/api-client'
import type { Ticket, TicketDetail, SubmitterProfile, BusinessGroup, SortField, SortOrder, Role, TicketStatus } from '../types'
import {
  Skeleton, SkeletonRows, EmptyState, ErrorState, PriorityBadge, StatusBadge,
  StarRating, Pagination, formatTime, actionLabel,
} from '../components'
import {
  SearchIcon, SendIcon, CheckCircleIcon, XCircleIcon, TransferIcon,
  ChevronUpIcon, ChevronDownIcon, UserIcon, MessageIcon, ListIcon, ClockIcon,
  StarIcon,
} from '../icons'

interface Props {
  role: Role
  companyId: string
}

type SortColumn = SortField

export default function WorkbenchPage({ role, companyId }: Props) {
  // ── 列表状态 ──
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [sort, setSort] = useState<SortColumn>('created_at')
  const [order, setOrder] = useState<SortOrder>('desc')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'all'>('pending_processing')

  // ── 详情状态 ──
  const [detail, setDetail] = useState<TicketDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [submitter, setSubmitter] = useState<SubmitterProfile | null>(null)
  const [replyText, setReplyText] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [actionMsg, setActionMsg] = useState('')
  const [actionError, setActionError] = useState('')
  const [showTransfer, setShowTransfer] = useState(false)
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [transferTarget, setTransferTarget] = useState('')
  const [evalRating, setEvalRating] = useState(0)
  const [evalComment, setEvalComment] = useState('')
  const [evalSubmitted, setEvalSubmitted] = useState(false)

  const canOperate = role === 'handler' || role === 'admin'
  const canEvaluate = role === 'submitter'

  // ── 加载列表 ──
  const loadList = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await ticketApi.list({
        status: statusFilter === 'all' ? undefined : statusFilter,
        companyId: role === 'admin' ? undefined : companyId,
        keyword: keyword || undefined,
        sort,
        order,
        page,
        pageSize,
      })
      setTickets(res.items)
      setTotal(res.total)
      if (res.items.length > 0 && !selectedId) {
        setSelectedId(res.items[0].id)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载工单列表失败')
    } finally {
      setLoading(false)
    }
  }, [keyword, sort, order, page, pageSize, role, companyId, selectedId, statusFilter])

  useEffect(() => { void loadList() }, [loadList])

  // ── 加载详情 ──
  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true)
    setDetailError('')
    setSubmitter(null)
    setEvalSubmitted(false)
    setEvalRating(0)
    setEvalComment('')
    try {
      const d = await ticketApi.get(id)
      setDetail(d)
      if (canOperate) {
        try {
          const profile = await userApi.getProfile(d.submitterId)
          setSubmitter(profile)
        } catch { /* 提交人信息加载失败不阻塞详情 */ }
      }
    } catch (cause) {
      setDetail(null)
      setDetailError(cause instanceof Error ? cause.message : '加载工单详情失败')
    } finally {
      setDetailLoading(false)
    }
  }, [canOperate])

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId)
    else { setDetail(null); setSubmitter(null) }
  }, [selectedId, loadDetail])

  // ── 排序切换 ──
  const toggleSort = (col: SortColumn) => {
    if (sort === col) {
      setOrder(order === 'asc' ? 'desc' : 'asc')
    } else {
      setSort(col)
      setOrder('desc')
    }
    setPage(1)
  }

  const sortIcon = (col: SortColumn) =>
    sort === col ? (order === 'asc' ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />) : null

  // ── 搜索 ──
  const handleSearch = (e: FormEvent) => {
    e.preventDefault()
    setKeyword(searchInput)
    setPage(1)
    setSelectedId(null)
  }

  // ── 回复 ──
  const handleReply = async (e: FormEvent) => {
    e.preventDefault()
    if (!selectedId || !replyText.trim()) return
    setActionBusy(true)
    setActionError('')
    setActionMsg('')
    try {
      await ticketApi.reply(selectedId, replyText.trim())
      setReplyText('')
      setActionMsg('回复已发送')
      await loadDetail(selectedId)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '回复失败')
    } finally {
      setActionBusy(false)
    }
  }

  // ── 完成 ──
  const handleComplete = async () => {
    if (!selectedId) return
    setActionBusy(true)
    setActionError('')
    setActionMsg('')
    try {
      await ticketApi.complete(selectedId)
      setActionMsg('工单已完成，已发送邮件通知提交人')
      await loadDetail(selectedId)
      await loadList()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '完成操作失败')
    } finally {
      setActionBusy(false)
    }
  }

  // ── 取消 ──
  const handleCancel = async () => {
    if (!selectedId) return
    setActionBusy(true)
    setActionError('')
    setActionMsg('')
    try {
      await ticketApi.updateStatus(selectedId, 'cancelled')
      setActionMsg('工单已取消')
      await loadDetail(selectedId)
      await loadList()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '取消操作失败')
    } finally {
      setActionBusy(false)
    }
  }

  // ── 转派 ──
  const openTransfer = async () => {
    if (!selectedId) return
    setShowTransfer(true)
    setTransferTarget('')
    setActionError('')
    try {
      const res = await groupApi.list(companyId)
      setGroups(res.items)
    } catch { /* ignore */ }
  }

  const handleTransfer = async () => {
    if (!selectedId || !transferTarget) return
    setActionBusy(true)
    setActionError('')
    setActionMsg('')
    try {
      await ticketApi.transfer(selectedId, transferTarget)
      setShowTransfer(false)
      setActionMsg('工单已转派')
      await loadDetail(selectedId)
      await loadList()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '转派失败')
    } finally {
      setActionBusy(false)
    }
  }

  // ── 评价 ──
  const handleEvaluate = async () => {
    if (!selectedId || evalRating === 0) return
    setActionBusy(true)
    setActionError('')
    setActionMsg('')
    try {
      await ticketApi.createEvaluation(selectedId, evalRating, evalComment.trim() || null)
      setEvalSubmitted(true)
      setActionMsg('评价已提交')
      await loadDetail(selectedId)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '评价提交失败')
    } finally {
      setActionBusy(false)
    }
  }

  return (
    <div className="split-layout">
      {/* ── 左侧：工单列表 ── */}
      <div className="list-panel">
        <div className="list-header">
          <h2>{statusFilter === 'all' ? '全部工单' : statusFilter === 'pending_processing' ? '待处理工单' : statusFilter === 'completed' ? '已完成工单' : statusFilter === 'cancelled' ? '已取消工单' : '待分配工单'}</h2>
          <form className="search-box" onSubmit={handleSearch}>
            <SearchIcon size={16} />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="搜索主题/描述…"
            />
          </form>
        </div>
        <div className="list-filters">
          <button className={`sort-btn ${statusFilter === 'pending_processing' ? 'active' : ''}`} onClick={() => { setStatusFilter('pending_processing'); setPage(1); setSelectedId(null) }}>待处理</button>
          <button className={`sort-btn ${statusFilter === 'completed' ? 'active' : ''}`} onClick={() => { setStatusFilter('completed'); setPage(1); setSelectedId(null) }}>已完成</button>
          <button className={`sort-btn ${statusFilter === 'cancelled' ? 'active' : ''}`} onClick={() => { setStatusFilter('cancelled'); setPage(1); setSelectedId(null) }}>已取消</button>
          <button className={`sort-btn ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => { setStatusFilter('all'); setPage(1); setSelectedId(null) }}>全部</button>
        </div>
        <div className="list-filters">
          <button className={`sort-btn ${sort === 'created_at' ? 'active' : ''}`} onClick={() => toggleSort('created_at')}>
            创建时间 {sortIcon('created_at')}
          </button>
          <button className={`sort-btn ${sort === 'priority' ? 'active' : ''}`} onClick={() => toggleSort('priority')}>
            优先级 {sortIcon('priority')}
          </button>
          <button className={`sort-btn ${sort === 'status' ? 'active' : ''}`} onClick={() => toggleSort('status')}>
            状态 {sortIcon('status')}
          </button>
        </div>
        <div className="ticket-list">
          {loading ? (
            <SkeletonRows count={6} />
          ) : error ? (
            <ErrorState message={error} onRetry={loadList} />
          ) : tickets.length === 0 ? (
            <EmptyState title="暂无待处理工单" hint="尝试调整筛选条件或等待新工单分配" />
          ) : (
            tickets.map((t) => (
              <div
                key={t.id}
                className={`ticket-item ${selectedId === t.id ? 'selected' : ''}`}
                onClick={() => setSelectedId(t.id)}
              >
                <div className="ticket-item-top">
                  <PriorityBadge priority={t.priority} />
                  <StatusBadge status={t.status} />
                  <span className="subtext">{formatTime(t.createdAt)}</span>
                </div>
                <p className="ticket-item-subject">{t.subject}</p>
                <span className="subtext">{t.submitterName} · {t.category}</span>
              </div>
            ))
          )}
        </div>
        {!loading && !error && tickets.length > 0 && (
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
        )}
      </div>

      {/* ── 右侧：工单详情 ── */}
      <div className="detail-panel">
        {!selectedId ? (
          <EmptyState icon={<ListIcon size={32} />} title="选择左侧工单查看详情" />
        ) : detailLoading ? (
          <div className="detail-skeleton">
            <Skeleton className="skeleton-title" />
            <Skeleton className="skeleton-block" />
            <Skeleton className="skeleton-block" />
          </div>
        ) : detailError ? (
          <ErrorState message={detailError} onRetry={() => void loadDetail(selectedId)} />
        ) : detail ? (
          <div className="detail-content">
            {/* 基本信息 */}
            <section className="card detail-section">
              <div className="detail-header">
                <h2>{detail.subject}</h2>
                <div className="detail-badges">
                  <PriorityBadge priority={detail.priority} />
                  <StatusBadge status={detail.status} />
                </div>
              </div>
              <div className="detail-meta">
                <span><UserIcon size={14} /> {detail.submitterName}</span>
                <span className="subtext">{detail.submitterEmail}</span>
                <span><ClockIcon size={14} /> {formatTime(detail.createdAt)}</span>
                {detail.completedAt && <span className="subtext">完成: {formatTime(detail.completedAt)}</span>}
              </div>
              <p className="detail-description">{detail.description}</p>
              <div className="detail-tags">
                <span className="tag">分类: {detail.category}</span>
                {detail.assignedGroupId && <span className="tag">已分配业务组</span>}
              </div>
            </section>

            {/* 提交人信息 — 仅 handler/admin */}
            {canOperate && (
              <section className="card detail-section">
                <h3><UserIcon size={16} /> 提交人信息</h3>
                {submitter ? (
                  <div className="submitter-info">
                    <div className="submitter-grid">
                      <div><label>姓名</label><span>{submitter.name}</span></div>
                      <div><label>邮箱</label><span>{submitter.email}</span></div>
                      <div><label>公司</label><span>{submitter.companyName}</span></div>
                      <div><label>部门</label><span>{submitter.departmentName ?? '—'}</span></div>
                    </div>
                    {submitter.ticketHistory.length > 0 && (
                      <div className="ticket-history">
                        <p className="subtext">历史工单 ({submitter.ticketHistory.length})</p>
                        {submitter.ticketHistory.map((h) => (
                          <div key={h.id} className="history-item">
                            <span>{h.subject}</span>
                            <StatusBadge status={h.status as Ticket['status']} />
                            <span className="subtext">{formatTime(h.createdAt)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <Skeleton className="skeleton-block" />
                )}
              </section>
            )}

            {/* 回复列表 */}
            <section className="card detail-section">
              <h3><MessageIcon size={16} /> 回复 ({detail.replies.length})</h3>
              {detail.replies.length === 0 ? (
                <p className="subtext">暂无回复</p>
              ) : (
                <div className="reply-list">
                  {detail.replies.map((r) => (
                    <div key={r.id} className="reply-item">
                      <div className="reply-header">
                        <strong>{r.replierName}</strong>
                        <span className="subtext">{formatTime(r.createdAt)}</span>
                      </div>
                      <p className="reply-content">{r.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 操作区 */}
            <section className="card detail-section">
              <h3>操作</h3>
              {actionMsg && <p role="status" className="success">{actionMsg}</p>}
              {actionError && <p role="alert" className="error">{actionError}</p>}

              {/* 回复表单 */}
              <form className="reply-form" onSubmit={handleReply}>
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="输入回复内容…"
                  rows={3}
                  required
                />
                <button type="submit" disabled={actionBusy || !replyText.trim()}>
                  <SendIcon size={16} /> 回复
                </button>
              </form>

              {/* 操作按钮 */}
              {canOperate && detail.status === 'pending_processing' && (
                <div className="action-buttons">
                  <button className="secondary" disabled={actionBusy} onClick={openTransfer}>
                    <TransferIcon size={16} /> 转派
                  </button>
                  <button disabled={actionBusy} onClick={handleComplete}>
                    <CheckCircleIcon size={16} /> 完成工单
                  </button>
                  <button className="danger-btn" disabled={actionBusy} onClick={handleCancel}>
                    <XCircleIcon size={16} /> 取消工单
                  </button>
                </div>
              )}

              {/* 转派弹窗 */}
              {showTransfer && (
                <div className="modal-overlay" onClick={() => setShowTransfer(false)}>
                  <div className="modal" onClick={(e) => e.stopPropagation()}>
                    <h3>转派工单</h3>
                    <p className="subtext">选择目标业务组</p>
                    <select value={transferTarget} onChange={(e) => setTransferTarget(e.target.value)}>
                      <option value="">请选择…</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                    <div className="modal-actions">
                      <button className="secondary" onClick={() => setShowTransfer(false)}>取消</button>
                      <button disabled={!transferTarget || actionBusy} onClick={handleTransfer}>确认转派</button>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* 操作日志摘要 */}
            {detail.recentLogs.length > 0 && (
              <section className="card detail-section">
                <h3><ListIcon size={16} /> 操作日志</h3>
                <div className="log-list">
                  {detail.recentLogs.map((log) => (
                    <div key={log.id} className="log-item">
                      <span className="log-action">{actionLabel(log.action)}</span>
                      <span className="subtext">{log.operatorName}</span>
                      <span className="subtext">{formatTime(log.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 满意度评价 */}
            <section className="card detail-section">
              <h3><StarIcon size={16} filled={detail.evaluation != null} /> 满意度评价</h3>
              {detail.evaluation ? (
                <div className="evaluation-display">
                  <StarRating value={detail.evaluation.rating} readonly size={28} />
                  {detail.evaluation.comment && <p className="subtext">{detail.evaluation.comment}</p>}
                  <span className="subtext">评价时间: {formatTime(detail.evaluation.createdAt)}</span>
                </div>
              ) : canEvaluate && detail.status === 'completed' && !evalSubmitted ? (
                <div className="evaluation-form">
                  <p className="subtext">请对本次工单处理进行评价</p>
                  <StarRating value={evalRating} onChange={setEvalRating} size={32} />
                  <textarea
                    value={evalComment}
                    onChange={(e) => setEvalComment(e.target.value)}
                    placeholder="评价备注（可选）"
                    rows={2}
                  />
                  <button disabled={actionBusy || evalRating === 0} onClick={handleEvaluate}>
                    提交评价
                  </button>
                </div>
              ) : detail.status === 'completed' && !canEvaluate ? (
                <p className="subtext">等待提交人评价</p>
              ) : (
                <p className="subtext">工单完成后可进行评价</p>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </div>
  )
}


