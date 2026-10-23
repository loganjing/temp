// 工单管理页 — 左侧列表 + 右侧详情（split-master-detail）
// 支持创建工单、回复、完成、取消、转派、查看提交人信息、满意度评价
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ticketsApi, categoriesApi, businessGroupsApi } from '../api'
import type {
  BusinessGroup,
  SubmitterInfo,
  Ticket,
  TicketCategory,
  TicketDetail,
  TicketEvaluation,
  TicketListParams,
  TicketPriority,
  TicketStatus,
} from '../types'
import {
  EmptyState,
  ErrorBanner,
  Loading,
  Pagination,
  PriorityBadge,
  SkeletonRows,
  SortSelect,
  StatusBadge,
  formatTime,
  useToast,
} from '../components'

const PRIORITIES: TicketPriority[] = ['P0', 'P1', 'P2', 'P3', 'P4']

export default function TicketsPage() {
  // ─── 列表状态 ───
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState('')

  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [categoryIdFilter, setCategoryIdFilter] = useState('')
  const [companyIdFilter, setCompanyIdFilter] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('createdAt:desc')

  const [categories, setCategories] = useState<TicketCategory[]>([])
  const [groups, setGroups] = useState<BusinessGroup[]>([])

  // ─── 详情状态 ───
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<TicketDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

  // ─── 操作状态 ───
  const [showCreate, setShowCreate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [submitter, setSubmitter] = useState<SubmitterInfo | null>(null)
  const [submitterLoading, setSubmitterLoading] = useState(false)
  const [evaluation, setEvaluation] = useState<TicketEvaluation | null>(null)
  const [showSubmitter, setShowSubmitter] = useState(false)
  const [transferUserId, setTransferUserId] = useState('')

  const [pageError, setPageError] = useState('')
  const [toast, showToast, toastView] = useToast()

  // ─── 加载列表 ───
  const loadList = useCallback(async () => {
    setListLoading(true)
    setListError('')
    try {
      const params: TicketListParams = {
        status: statusFilter || undefined,
        priority: priorityFilter || undefined,
        categoryId: categoryIdFilter || undefined,
        companyId: companyIdFilter || undefined,
        search: search || undefined,
        sort,
        page,
        pageSize,
      }
      const result = await ticketsApi.list(params)
      setTickets(result.items)
      setTotal(result.total)
    } catch (cause) {
      setListError(cause instanceof Error ? cause.message : '加载工单列表失败')
    } finally {
      setListLoading(false)
    }
  }, [statusFilter, priorityFilter, categoryIdFilter, companyIdFilter, search, sort, page, pageSize])

  useEffect(() => {
    void loadList()
  }, [loadList])

  useEffect(() => {
    categoriesApi
      .list()
      .then(setCategories)
      .catch(() => {})
    businessGroupsApi
      .list()
      .then(setGroups)
      .catch(() => {})
  }, [])

  // ─── 加载详情 ───
  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true)
    setDetailError('')
    setSubmitter(null)
    setEvaluation(null)
    setShowSubmitter(false)
    try {
      const d = await ticketsApi.get(id)
      setDetail(d)
      if (d.status === 'completed') {
        try {
          setEvaluation(await ticketsApi.getEvaluation(id))
        } catch {
          // 未评价时 404，正常
        }
      }
    } catch (cause) {
      setDetailError(cause instanceof Error ? cause.message : '加载工单详情失败')
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId)
    else setDetail(null)
  }, [selectedId, loadDetail])

  // ─── 创建工单 ───
  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setPageError('')
    const form = event.currentTarget
    const data = Object.fromEntries(new FormData(form).entries())
    try {
      await ticketsApi.create({
        subject: String(data.subject),
        description: String(data.description),
        categoryId: String(data.categoryId),
        priority: String(data.priority) as TicketPriority,
      })
      form.reset()
      setShowCreate(false)
      showToast('工单已创建')
      await loadList()
    } catch (cause) {
      setPageError(cause instanceof Error ? cause.message : '创建工单失败')
    } finally {
      setBusy(false)
    }
  }

  // ─── 添加回复 ───
  const handleReply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedId) return
    setBusy(true)
    setPageError('')
    const form = event.currentTarget
    const content = String(new FormData(form).get('content') ?? '')
    try {
      await ticketsApi.addReply(selectedId, content)
      form.reset()
      showToast('回复已发送')
      await loadDetail(selectedId)
    } catch (cause) {
      setPageError(cause instanceof Error ? cause.message : '回复失败')
    } finally {
      setBusy(false)
    }
  }

  // ─── 完成工单 ───
  const handleComplete = async () => {
    if (!selectedId) return
    setBusy(true)
    setPageError('')
    try {
      await ticketsApi.complete(selectedId)
      showToast('工单已完成')
      await loadDetail(selectedId)
      await loadList()
    } catch (cause) {
      setPageError(cause instanceof Error ? cause.message : '完成工单失败')
    } finally {
      setBusy(false)
    }
  }

  // ─── 取消工单 ───
  const handleCancel = async () => {
    if (!selectedId) return
    setBusy(true)
    setPageError('')
    try {
      await ticketsApi.cancel(selectedId)
      showToast('工单已取消')
      await loadDetail(selectedId)
      await loadList()
    } catch (cause) {
      setPageError(cause instanceof Error ? cause.message : '取消工单失败')
    } finally {
      setBusy(false)
    }
  }

  // ─── 转派工单 ───
  const handleTransfer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedId) return
    setBusy(true)
    setPageError('')
    try {
      await ticketsApi.transfer(selectedId, transferUserId)
      setTransferUserId('')
      showToast('工单已转派')
      await loadDetail(selectedId)
      await loadList()
    } catch (cause) {
      setPageError(cause instanceof Error ? cause.message : '转派失败')
    } finally {
      setBusy(false)
    }
  }

  // ─── 查看提交人信息 ───
  const handleViewSubmitter = async () => {
    if (!selectedId) return
    setSubmitterLoading(true)
    setPageError('')
    try {
      setSubmitter(await ticketsApi.getSubmitter(selectedId))
      setShowSubmitter(true)
    } catch (cause) {
      setPageError(cause instanceof Error ? cause.message : '获取提交人信息失败')
    } finally {
      setSubmitterLoading(false)
    }
  }

  // ─── 提交评价 ───
  const handleEvaluation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedId) return
    setBusy(true)
    setPageError('')
    const form = event.currentTarget
    const data = Object.fromEntries(new FormData(form).entries())
    try {
      const ev = await ticketsApi.createEvaluation(selectedId, {
        rating: Number(data.rating),
        comment: data.comment ? String(data.comment) : null,
      })
      setEvaluation(ev)
      showToast('评价已提交')
      form.reset()
    } catch (cause) {
      setPageError(cause instanceof Error ? cause.message : '提交评价失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-container page-tickets">
      <div className="page-header">
        <div>
          <h1>工单管理</h1>
          <p>工单全生命周期管理：创建、回复、完成、取消、转派、评价</p>
        </div>
        <button onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? '收起创建表单' : '新建工单'}
        </button>
      </div>
      {toastView}
      <ErrorBanner error={pageError} onClose={() => setPageError('')} />

      {showCreate && (
        <section className="card create-form">
          <h2>创建工单</h2>
          <form className="form-grid" onSubmit={handleCreate}>
            <label className="col-span-2">
              主题
              <input name="subject" required maxLength={200} placeholder="工单主题" />
            </label>
            <label className="col-span-2">
              描述
              <textarea name="description" rows={3} placeholder="详细描述" />
            </label>
            <label>
              分类
              <select name="categoryId" required>
                <option value="">请选择分类</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              优先级
              <select name="priority" required defaultValue="P2">
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-actions">
              <button type="submit" disabled={busy}>
                {busy ? '处理中…' : '创建工单'}
              </button>
              <button type="button" className="secondary" onClick={() => setShowCreate(false)}>
                取消
              </button>
            </div>
          </form>
        </section>
      )}

      <div className="master-detail">
        {/* ─── 左侧列表 ─── */}
        <div className="master-panel">
          <section className="card filter-bar-compact">
            <div className="form-grid-compact">
              <label>
                状态
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.currentTarget.value)
                    setPage(1)
                  }}
                >
                  <option value="">全部</option>
                  <option value="created">创建</option>
                  <option value="pending_assignment">待分配</option>
                  <option value="pending_processing">待处理</option>
                  <option value="completed">完成</option>
                  <option value="cancelled">取消</option>
                </select>
              </label>
              <label>
                优先级
                <select
                  value={priorityFilter}
                  onChange={(e) => {
                    setPriorityFilter(e.currentTarget.value)
                    setPage(1)
                  }}
                >
                  <option value="">全部</option>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                分类
                <select
                  value={categoryIdFilter}
                  onChange={(e) => {
                    setCategoryIdFilter(e.currentTarget.value)
                    setPage(1)
                  }}
                >
                  <option value="">全部分类</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                公司
                <input
                  value={companyIdFilter}
                  onChange={(e) => {
                    setCompanyIdFilter(e.currentTarget.value)
                    setPage(1)
                  }}
                  placeholder="公司 ID"
                />
              </label>
              <label>
                搜索
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.currentTarget.value)
                    setPage(1)
                  }}
                  placeholder="关键词"
                />
              </label>
              <label>
                排序
                <SortSelect
                  value={sort}
                  onChange={(v) => {
                    setSort(v)
                    setPage(1)
                  }}
                />
              </label>
            </div>
          </section>

          <section className="card ticket-list-panel">
            {listLoading ? (
              <SkeletonRows />
            ) : listError ? (
              <ErrorBanner error={listError} onClose={() => setListError('')} />
            ) : tickets.length === 0 ? (
              <EmptyState message="暂无工单" />
            ) : (
              <div className="ticket-list">
                {tickets.map((t) => (
                  <button
                    key={t.id}
                    className={`ticket-list-item ${selectedId === t.id ? 'selected' : ''}`}
                    onClick={() => setSelectedId(t.id)}
                  >
                    <div className="ticket-list-item-main">
                      <div className="ticket-list-item-title">
                        <strong>{t.subject}</strong>
                      </div>
                      <div className="ticket-list-item-meta">
                        <StatusBadge status={t.status} />
                        <PriorityBadge priority={t.priority} />
                        <span className="subtext">{t.submitterName}</span>
                      </div>
                    </div>
                    <div className="ticket-list-item-time">{formatTime(t.createdAt)}</div>
                  </button>
                ))}
              </div>
            )}
            <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} />
          </section>
        </div>

        {/* ─── 右侧详情 ─── */}
        <div className="detail-panel">
          {!selectedId ? (
            <section className="card detail-empty">
              <EmptyState message="请从左侧选择工单查看详情" />
            </section>
          ) : detailLoading ? (
            <section className="card">
              <Loading message="加载工单详情…" />
            </section>
          ) : detailError ? (
            <section className="card">
              <ErrorBanner error={detailError} onClose={() => setDetailError('')} />
            </section>
          ) : detail ? (
            <TicketDetailPanel
              detail={detail}
              busy={busy}
              submitter={submitter}
              submitterLoading={submitterLoading}
              showSubmitter={showSubmitter}
              evaluation={evaluation}
              transferUserId={transferUserId}
              onTransferChange={setTransferUserId}
              onViewSubmitter={handleViewSubmitter}
              onReply={handleReply}
              onComplete={handleComplete}
              onCancel={handleCancel}
              onTransfer={handleTransfer}
              onEvaluation={handleEvaluation}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}

// ─── 工单详情面板子组件 ───
function TicketDetailPanel({
  detail,
  busy,
  submitter,
  submitterLoading,
  showSubmitter,
  evaluation,
  transferUserId,
  onTransferChange,
  onViewSubmitter,
  onReply,
  onComplete,
  onCancel,
  onTransfer,
  onEvaluation,
}: {
  detail: TicketDetail
  busy: boolean
  submitter: SubmitterInfo | null
  submitterLoading: boolean
  showSubmitter: boolean
  evaluation: TicketEvaluation | null
  transferUserId: string
  onTransferChange: (v: string) => void
  onViewSubmitter: () => void
  onReply: (e: FormEvent<HTMLFormElement>) => void
  onComplete: () => void
  onCancel: () => void
  onTransfer: (e: FormEvent<HTMLFormElement>) => void
  onEvaluation: (e: FormEvent<HTMLFormElement>) => void
}) {
  const canComplete = detail.status === 'pending_processing'
  const canCancel = detail.status !== 'completed' && detail.status !== 'cancelled'
  const canTransfer = detail.status === 'pending_processing'
  const canEvaluate = detail.status === 'completed' && !evaluation

  return (
    <section className="card detail-card">
      {/* 工单基本信息 */}
      <div className="detail-header">
        <div>
          <h2>{detail.subject}</h2>
          <div className="detail-meta">
            <StatusBadge status={detail.status} />
            <PriorityBadge priority={detail.priority} />
            {detail.categoryName && <span className="tag">{detail.categoryName}</span>}
          </div>
        </div>
      </div>

      <div className="detail-info-grid">
        <div className="info-item">
          <span className="info-label">提交人</span>
          <span className="info-value">{detail.submitterName}</span>
        </div>
        <div className="info-item">
          <span className="info-label">邮箱</span>
          <span className="info-value">{detail.submitterEmail}</span>
        </div>
        <div className="info-item">
          <span className="info-label">公司</span>
          <span className="info-value">{detail.submitterCompany}</span>
        </div>
        <div className="info-item">
          <span className="info-label">部门</span>
          <span className="info-value">{detail.submitterDepartment ?? '—'}</span>
        </div>
        <div className="info-item">
          <span className="info-label">分配业务组</span>
          <span className="info-value">{detail.assignedGroupName ?? '未分配'}</span>
        </div>
        <div className="info-item">
          <span className="info-label">处理人</span>
          <span className="info-value">{detail.assignedHandlerName ?? '未分配'}</span>
        </div>
        <div className="info-item">
          <span className="info-label">创建时间</span>
          <span className="info-value">{formatTime(detail.createdAt)}</span>
        </div>
        <div className="info-item">
          <span className="info-label">完成时间</span>
          <span className="info-value">{formatTime(detail.completedAt)}</span>
        </div>
      </div>

      {detail.description && (
        <div className="detail-section">
          <h3>描述</h3>
          <p className="detail-description">{detail.description}</p>
        </div>
      )}

      {/* 回复列表 */}
      <div className="detail-section">
        <h3>回复 ({detail.replies.length})</h3>
        {detail.replies.length === 0 ? (
          <EmptyState message="暂无回复" />
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
      </div>

      {/* 添加回复 */}
      <div className="detail-section">
        <h3>添加回复</h3>
        <form className="reply-form" onSubmit={onReply}>
          <textarea name="content" rows={2} required placeholder="输入回复内容" />
          <button type="submit" disabled={busy}>
            {busy ? '处理中…' : '发送回复'}
          </button>
        </form>
      </div>

      {/* 提交人完整信息 */}
      <div className="detail-section">
        <div className="section-heading">
          <h3>提交人完整信息</h3>
          <button className="secondary" onClick={onViewSubmitter} disabled={submitterLoading}>
            {submitterLoading ? '加载中…' : showSubmitter ? '刷新' : '查看'}
          </button>
        </div>
        {showSubmitter && submitter && (
          <div className="submitter-info">
            <div className="detail-info-grid">
              <div className="info-item">
                <span className="info-label">姓名</span>
                <span className="info-value">{submitter.name}</span>
              </div>
              <div className="info-item">
                <span className="info-label">邮箱</span>
                <span className="info-value">{submitter.email}</span>
              </div>
              <div className="info-item">
                <span className="info-label">公司</span>
                <span className="info-value">{submitter.companyName}</span>
              </div>
              <div className="info-item">
                <span className="info-label">部门</span>
                <span className="info-value">{submitter.department ?? '—'}</span>
              </div>
            </div>
            <h4>历史工单</h4>
            {submitter.historyTickets.length === 0 ? (
              <EmptyState message="暂无历史工单" />
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>主题</th>
                      <th>状态</th>
                      <th>优先级</th>
                      <th>创建时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {submitter.historyTickets.map((ht) => (
                      <tr key={ht.id}>
                        <td>
                          <strong>{ht.subject}</strong>
                        </td>
                        <td>
                          <StatusBadge status={ht.status as TicketStatus} />
                        </td>
                        <td>
                          <PriorityBadge priority={ht.priority as TicketPriority} />
                        </td>
                        <td>{formatTime(ht.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 满意度评价 */}
      {detail.status === 'completed' && (
        <div className="detail-section">
          <h3>满意度评价</h3>
          {evaluation ? (
            <div className="evaluation-display">
              <span className="rating-stars">
                {'★'.repeat(evaluation.rating)}
                {'☆'.repeat(5 - evaluation.rating)}
              </span>
              <span className="info-value">{evaluation.rating} / 5</span>
              {evaluation.comment && <p className="detail-description">{evaluation.comment}</p>}
            </div>
          ) : canEvaluate ? (
            <form className="evaluation-form" onSubmit={onEvaluation}>
              <label>
                评分
                <select name="rating" required defaultValue="5">
                  <option value="5">5 非常满意</option>
                  <option value="4">4 满意</option>
                  <option value="3">3 一般</option>
                  <option value="2">2 不满意</option>
                  <option value="1">1 非常不满意</option>
                </select>
              </label>
              <label>
                评价内容（可选）
                <textarea name="comment" rows={2} placeholder="输入评价内容" />
              </label>
              <button type="submit" disabled={busy}>
                {busy ? '处理中…' : '提交评价'}
              </button>
            </form>
          ) : null}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="detail-actions">
        {canComplete && (
          <button onClick={onComplete} disabled={busy}>
            完成工单
          </button>
        )}
        {canTransfer && (
          <form className="transfer-form" onSubmit={onTransfer}>
            <input
              value={transferUserId}
              onChange={(e) => onTransferChange(e.currentTarget.value)}
              placeholder="被转派人用户 ID"
              required
            />
            <button type="submit" disabled={busy || !transferUserId}>
              {busy ? '处理中…' : '转派工单'}
            </button>
          </form>
        )}
        {canCancel && (
          <button className="danger-btn" onClick={onCancel} disabled={busy}>
            取消工单
          </button>
        )}
      </div>
    </section>
  )
}
