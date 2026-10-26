import { useCallback, useEffect, useState, type FormEvent } from 'react'
import * as api from './api'
import type {
  BusinessGroup,
  Category,
  Priority,
  TicketDetail,
  TicketListItem,
  TicketStatus,
} from './types'
import { PRIORITIES, SORT_OPTIONS, TICKET_STATUSES } from './types'
import {
  EmptyState,
  ErrorCard,
  Modal,
  PriorityBadge,
  Skeleton,
  StatusBadge,
  formatTime,
  useToast,
  type CurrentUser,
  effectiveRole,
} from './ui'

const STATUS_SELECT: { value: string; label: string }[] = [
  { value: '', label: '全部状态 / All' },
  ...TICKET_STATUSES.map((s) => ({ value: s, label: s })),
]

const PRIORITY_SELECT: { value: string; label: string }[] = [
  { value: '', label: '全部优先级 / All' },
  ...PRIORITIES.map((p) => ({ value: p, label: p })),
]

const SORT_SELECT: { value: string; label: string }[] = [
  { value: 'created_desc', label: '创建时间 ↓' },
  { value: 'priority_desc', label: '优先级 ↓' },
]

interface WorkbenchProps {
  user: CurrentUser
}

export default function WorkbenchPage({ user }: WorkbenchProps) {
  const role = effectiveRole(user)
  const notify = useToast()
  const isAdmin = role === 'admin'

  const [categories, setCategories] = useState<Category[]>([])
  const [groups, setGroups] = useState<BusinessGroup[]>([])

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [priority, setPriority] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [sort, setSort] = useState('created_desc')
  const [page, setPage] = useState(1)
  const pageSize = 25

  const [items, setItems] = useState<TicketListItem[]>([])
  const [total, setTotal] = useState(0)
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState('')

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<TicketDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

  const [showCreate, setShowCreate] = useState(false)

  const loadList = useCallback(async () => {
    setListLoading(true)
    setListError('')
    try {
      const res = await api.listTickets({
        page,
        pageSize,
        search: search.trim(),
        status,
        categoryId,
        priority,
        companyId: isAdmin ? companyId.trim() : undefined,
        sort,
      })
      setItems(res.items)
      setTotal(res.total)
    } catch (cause) {
      setListError(cause instanceof Error ? cause.message : '工单列表加载失败 / Failed to load tickets')
    } finally {
      setListLoading(false)
    }
  }, [page, pageSize, search, status, categoryId, priority, companyId, sort, isAdmin])

  const loadCategories = useCallback(async () => {
    try {
      const res = await api.getCategories()
      setCategories(res.items)
    } catch {
      setCategories([])
    }
  }, [])

  const loadGroups = useCallback(async () => {
    if (role !== 'admin' && role !== 'processor') return
    try {
      const res = await api.listBusinessGroups()
      setGroups(res.items)
    } catch {
      setGroups([])
    }
  }, [role])

  useEffect(() => {
    void loadList()
  }, [loadList])

  useEffect(() => {
    void loadCategories()
  }, [loadCategories])

  useEffect(() => {
    void loadGroups()
  }, [loadGroups])

  const selectTicket = useCallback((id: string) => {
    setSelectedId(id)
    setDetail(null)
    setDetailError('')
  }, [])

  const loadDetail = useCallback(async () => {
    if (!selectedId) return
    setDetailLoading(true)
    setDetailError('')
    try {
      setDetail(await api.getTicket(selectedId))
    } catch (cause) {
      setDetailError(cause instanceof Error ? cause.message : '工单详情加载失败 / Failed to load ticket')
    } finally {
      setDetailLoading(false)
    }
  }, [selectedId])

  useEffect(() => {
    if (selectedId) void loadDetail()
  }, [selectedId, loadDetail])

  const resetFilters = () => {
    setSearch('')
    setStatus('')
    setCategoryId('')
    setPriority('')
    setCompanyId('')
    setSort('created_desc')
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="workbench">
      <div className="list-panel">
        <div className="list-toolbar">
          <div className="section-heading">
            <h2>工单工作台 / Workbench</h2>
            <button onClick={() => setShowCreate(true)}>+ 新建工单 / New</button>
          </div>
          <label className="search">
            搜索主题/工单 ID / Search
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="关键词 / Keyword"
            />
          </label>
          <div className="row">
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} aria-label="状态筛选">
              {STATUS_SELECT.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1) }} aria-label="分类筛选">
              <option value="">全部分类 / All</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="row">
            <select value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1) }} aria-label="优先级筛选">
              {PRIORITY_SELECT.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="排序方式">
              {SORT_SELECT.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {isAdmin && (
            <label>
              公司 ID 筛选 / Company filter
              <input
                value={companyId}
                onChange={(e) => { setCompanyId(e.target.value); setPage(1) }}
                placeholder="公司 ID / Company ID"
              />
            </label>
          )}
          <div className="row">
            <button className="secondary" onClick={resetFilters}>清除 / Reset</button>
            <span className="subtext" style={{ alignSelf: 'center' }}>
              {total === 0 ? '无工单 / No tickets' : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} / ${total}`}
            </span>
            <button className="secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>上一页</button>
            <button className="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>下一页</button>
          </div>
        </div>
        <div className="list-scroll">
          {listLoading ? (
            <Skeleton lines={5} />
          ) : listError ? (
            <div style={{ padding: '1rem' }}><ErrorCard message={listError} onRetry={() => void loadList()} /></div>
          ) : items.length === 0 ? (
            <EmptyState title="暂无工单 / No tickets" hint="调整筛选条件或新建工单。" />
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className={`ticket-item${selectedId === item.id ? ' active' : ''}`}
                onClick={() => selectTicket(item.id)}
              >
                <div className="ti-top">
                  <span className="ti-title" title={item.title}>{item.title}</span>
                  <PriorityBadge priority={item.priority} />
                </div>
                <div className="ti-meta">
                  <StatusBadge status={item.status} />
                  <span className="subtext">{item.categoryName}</span>
                </div>
                <div className="ti-sub">
                  {item.submitterName} · {formatTime(item.createdAt)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="detail-panel">
        {!selectedId ? (
          <EmptyState title="选择左侧工单查看详情 / Select a ticket" hint="或新建工单。" />
        ) : detailLoading ? (
          <Skeleton lines={6} />
        ) : detailError ? (
          <ErrorCard message={detailError} onRetry={() => void loadDetail()} />
        ) : detail ? (
          <TicketDetailPanel
            ticket={detail}
            user={user}
            role={role}
            groups={groups}
            onChanged={() => { void loadList(); void loadDetail() }}
            notify={notify}
          />
        ) : null}
      </div>

      {showCreate ? (
        <CreateTicketModal
          categories={categories}
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false)
            setPage(1)
            void loadList().then(() => selectTicket(id))
            notify('工单已创建 / Ticket created')
          }}
        />
      ) : null}
    </div>
  )
}

// ---- 工单详情面板 ----
function TicketDetailPanel({
  ticket,
  user,
  role,
  groups,
  onChanged,
  notify,
}: {
  ticket: TicketDetail
  user: CurrentUser
  role: ReturnType<typeof effectiveRole>
  groups: BusinessGroup[]
  onChanged: () => void
  notify: (m: string, kind?: 'success' | 'error') => void
}) {
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [submitterInfo, setSubmitterInfo] = useState<apiReturnType | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)
  const [infoError, setInfoError] = useState('')
  const [showTransfer, setShowTransfer] = useState(false)

  const canReply = ticket.status !== 'completed' && ticket.status !== 'cancelled'
  const canTransfer = (role === 'processor' || role === 'admin') && ticket.status === 'pending_processing'
  const canComplete = (role === 'processor' || role === 'admin') && ticket.status === 'pending_processing'
  const canCancel = (role === 'submitter' || role === 'admin') && (ticket.status === 'pending_assignment' || ticket.status === 'pending_processing')
  const canRate = role === 'submitter' && ticket.status === 'completed' && ticket.rating === null && ticket.submitterId === user.id
  const canViewSubmitter = (role === 'processor' || role === 'admin') && ticket.submitterId !== user.id

  const submitReply = async (event: FormEvent) => {
    event.preventDefault()
    if (!reply.trim()) return
    setBusy(true)
    try {
      await api.addReply(ticket.id, reply.trim())
      setReply('')
      notify('回复已发送 / Reply added')
      onChanged()
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : '回复失败 / Reply failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  const doComplete = async () => {
    setBusy(true)
    try {
      await api.completeTicket(ticket.id)
      notify('工单已完成 / Ticket completed')
      onChanged()
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : '完成失败 / Complete failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  const doCancel = async () => {
    if (!confirm('确认取消该工单？ / Cancel this ticket?')) return
    setBusy(true)
    try {
      await api.cancelTicket(ticket.id)
      notify('工单已取消 / Ticket cancelled')
      onChanged()
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : '取消失败 / Cancel failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  const doRate = async (rating: number) => {
    setBusy(true)
    try {
      await api.rateTicket(ticket.id, rating)
      notify('评价已提交 / Rating submitted')
      onChanged()
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : '评价失败 / Rating failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  const loadSubmitterInfo = async () => {
    if (!infoOpen) {
      setInfoOpen(true)
      setInfoError('')
      try {
        setSubmitterInfo(await api.getSubmitterInfo(ticket.id))
      } catch (cause) {
        setInfoError(cause instanceof Error ? cause.message : '提交人信息加载失败 / Failed to load submitter info')
      }
    } else {
      setInfoOpen(false)
    }
  }

  return (
    <div>
      <div className="detail-header">
        <h2 title={ticket.title}>{ticket.title}</h2>
        <div className="detail-meta">
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
          <span className="subtext">分类 / Category: {ticket.categoryName}</span>
        </div>
        <div className="subtext">
          工单 ID: {ticket.id} · 创建 / Created: {formatTime(ticket.createdAt)}
          {ticket.processedAt ? ` · 完成 / Completed: ${formatTime(ticket.processedAt)}` : ''}
        </div>
      </div>

      <div className="detail-section">
        <h3>描述 / Description</h3>
        <p style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{ticket.description || '—'}</p>
      </div>

      <div className="detail-section">
        <h3>提交人 / Submitter</h3>
        <div className="subtext">
          {ticket.submitterName}
          {canViewSubmitter ? (
            <button className="secondary" style={{ marginLeft: '0.75rem' }} onClick={() => void loadSubmitterInfo()}>
              {infoOpen ? '收起 / Hide' : '查看完整信息 / View info'}
            </button>
          ) : null}
        </div>
        {infoOpen && canViewSubmitter ? (
          <div style={{ marginTop: '0.75rem' }}>
            {infoError ? (
              <ErrorCard message={infoError} />
            ) : submitterInfo ? (
              <SubmitterInfoPanel info={submitterInfo} />
            ) : (
              <Skeleton lines={3} />
            )}
          </div>
        ) : null}
      </div>

      {(ticket.assignedGroupId || ticket.assigneeId || ticket.processorId) && (
        <div className="detail-section">
          <h3>处理 / Assignment</h3>
          <div className="subtext">
            {ticket.assigneeId ? `处理人 / Assignee: ${ticket.assigneeId}` : '未指派具体处理人 / No assignee'}
            {ticket.processorName ? ` · 完成处理人 / Processor: ${ticket.processorName}` : ''}
          </div>
        </div>
      )}

      <div className="detail-section">
        <h3>回复 ({ticket.replies.length}) / Replies</h3>
        {ticket.replies.length === 0 ? (
          <EmptyState title="暂无回复 / No replies" />
        ) : (
          <div className="reply-list">
            {ticket.replies.map((r) => (
              <div key={r.id} className="reply">
                <div className="reply-head">
                  <span>{r.replierName}</span>
                  <span>{formatTime(r.createdAt)}</span>
                </div>
                <div className="reply-body">{r.content}</div>
              </div>
            ))}
          </div>
        )}
        {canReply && (
          <form className="inline-form" style={{ marginTop: '0.75rem' }} onSubmit={(e) => void submitReply(e)}>
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="输入回复 / Write a reply"
              aria-label="回复内容"
            />
            <button disabled={busy || !reply.trim()}>{busy ? '...' : '回复 / Reply'}</button>
          </form>
        )}
      </div>

      {ticket.status === 'completed' && ticket.rating !== null && (
        <div className="detail-section">
          <h3>满意度评价 / Rating</h3>
          <div className="rating-row">
            {[1, 2, 3, 4, 5].map((n) => (
              <span key={n} className="badge info" style={{ opacity: n <= (ticket.rating ?? 0) ? 1 : 0.3 }}>
                {n <= (ticket.rating ?? 0) ? '★' : '☆'}
              </span>
            ))}
            <span className="subtext" style={{ alignSelf: 'center' }}>{ticket.rating} / 5</span>
          </div>
        </div>
      )}

      <div className="detail-section">
        <h3>操作 / Actions</h3>
        <div className="action-row">
          {canTransfer && (
            <button className="secondary" disabled={busy} onClick={() => setShowTransfer(true)}>
              转派 / Transfer
            </button>
          )}
          {canComplete && (
            <button disabled={busy} onClick={() => void doComplete()}>完成 / Complete</button>
          )}
          {canCancel && (
            <button className="secondary" disabled={busy} onClick={() => void doCancel()}>取消 / Cancel</button>
          )}
          {canRate && (
            <span className="rating-row">
              <span className="subtext" style={{ alignSelf: 'center' }}>评价 / Rate:</span>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} className="secondary rating-btn" disabled={busy} onClick={() => void doRate(n)}>
                  {n}
                </button>
              ))}
            </span>
          )}
        </div>
      </div>

      {showTransfer && (
        <TransferModal
          ticket={ticket}
          groups={groups}
          onClose={() => setShowTransfer(false)}
          onTransferred={() => {
            setShowTransfer(false)
            notify('工单已转派 / Ticket transferred')
            onChanged()
          }}
          notify={notify}
        />
      )}
    </div>
  )
}

// 提交人信息面板
function SubmitterInfoPanel({ info }: { info: NonNullable<apiReturnType> }) {
  return (
    <div>
      <div className="subtext">
        姓名 / Name: {info.name} · 公司 / Company: {info.companyName} · 部门 / Dept: {info.department || '—'}
      </div>
      <h4 style={{ margin: '0.75rem 0 0.4rem' }}>历史工单 / History ({info.historyTickets.length})</h4>
      {info.historyTickets.length === 0 ? (
        <EmptyState title="暂无历史工单 / No history" />
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>工单 ID</th><th>主题 / Title</th><th>状态 / Status</th><th>创建 / Created</th></tr>
            </thead>
            <tbody>
              {info.historyTickets.map((t) => (
                <tr key={t.id}>
                  <td className="subtext">{t.id}</td>
                  <td>{t.title}</td>
                  <td><StatusBadge status={t.status} /></td>
                  <td className="subtext">{formatTime(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// 转派模态
function TransferModal({
  ticket,
  groups,
  onClose,
  onTransferred,
  notify,
}: {
  ticket: TicketDetail
  groups: BusinessGroup[]
  onClose: () => void
  onTransferred: () => void
  notify: (m: string, kind?: 'success' | 'error') => void
}) {
  const [targetGroupId, setTargetGroupId] = useState('')
  const [targetUserId, setTargetUserId] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!targetGroupId.trim() && !targetUserId.trim()) {
      notify('请选择目标业务组或处理人 / Choose a target', 'error')
      return
    }
    setBusy(true)
    try {
      await api.transferTicket(ticket.id, {
        targetGroupId: targetGroupId.trim() || undefined,
        targetUserId: targetUserId.trim() || undefined,
      })
      onTransferred()
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : '转派失败 / Transfer failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="转派工单 / Transfer ticket" onClose={onClose}>
      <form className="stack" onSubmit={(e) => void submit(e)}>
        <label>
          目标业务组 / Target group
          <select value={targetGroupId} onChange={(e) => setTargetGroupId(e.target.value)}>
            <option value="">不指定 / None</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </label>
        <label>
          目标处理人 ID / Target user ID（可选）
          <input
            value={targetUserId}
            onChange={(e) => setTargetUserId(e.target.value)}
            placeholder="用户 ID / User ID"
          />
        </label>
        <div className="modal-footer">
          <button className="secondary" type="button" onClick={onClose} disabled={busy}>取消 / Cancel</button>
          <button disabled={busy}>{busy ? '...' : '确认转派 / Transfer'}</button>
        </div>
      </form>
    </Modal>
  )
}

// 新建工单模态
function CreateTicketModal({
  categories,
  onClose,
  onCreated,
}: {
  categories: Category[]
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [priority, setPriority] = useState<Priority>('P2')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim() || !description.trim() || !categoryId) {
      setError('请填写主题、描述并选择分类 / Title, description and category are required')
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await api.createTicket({
        title: title.trim(),
        description: description.trim(),
        categoryId,
        priority,
      })
      onCreated(res.id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建失败 / Create failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="新建工单 / New ticket" onClose={onClose}>
      <form className="stack" onSubmit={(e) => void submit(e)}>
        <label>主题 / Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
        </label>
        <label>描述 / Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            required
            aria-label="描述"
          />
        </label>
        <div className="form-grid">
          <label>分类 / Category
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
              <option value="">请选择 / Select</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>SLA 优先级 / Priority
            <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        </div>
        {error && <p role="alert" className="error">{error}</p>}
        <div className="modal-footer">
          <button className="secondary" type="button" onClick={onClose} disabled={busy}>取消 / Cancel</button>
          <button disabled={busy}>{busy ? '...' : '创建 / Create'}</button>
        </div>
      </form>
    </Modal>
  )
}

// 局部类型别名，避免在 JSX 中写复杂 ReturnType
type apiReturnType = Awaited<ReturnType<typeof api.getSubmitterInfo>>
