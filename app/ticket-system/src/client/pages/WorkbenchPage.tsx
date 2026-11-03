import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { ticketApi, userApi, businessGroupApi, categoryApi } from '../api'
import type { BusinessGroup, CurrentUser, TicketDetail, TicketListItem, UserHistoryTicket } from '../types'
import { useToast } from '../hooks/useToast'
import {
  EmptyState,
  ErrorState,
  PRIORITY_OPTIONS,
  Pagination,
  Skeleton,
  SORT_FIELDS,
  STATUS_LABELS,
  STATUS_OPTIONS,
  formatDateTime,
  priorityClass,
  statusClass,
} from '../components/common'

const PAGE_SIZE = 20

export default function WorkbenchPage({ user }: { user: CurrentUser }) {
  const { notify } = useToast()
  const [items, setItems] = useState<TicketListItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 筛选条件
  const [status, setStatus] = useState('')
  const [slaPriority, setSlaPriority] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [sortBy, setSortBy] = useState('createdAt')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // 选中的工单详情
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<TicketDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

  // 分类列表用于筛选下拉（管理员可跨公司，普通用户仅本公司）
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])

  const loadList = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await ticketApi.list({
        page,
        pageSize: PAGE_SIZE,
        status: status || undefined,
        slaPriority: slaPriority || undefined,
        categoryId: categoryId || undefined,
        search: search || undefined,
        sortBy,
        sortOrder,
      })
      setItems(result.items)
      setTotal(result.total)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载工单失败')
    } finally {
      setLoading(false)
    }
  }, [page, status, slaPriority, categoryId, search, sortBy, sortOrder])

  useEffect(() => {
    void loadList()
  }, [loadList])

  useEffect(() => {
    // 加载分类筛选项
    void (async () => {
      try {
        const result = await categoryApi.list()
        setCategories(result.items)
      } catch {
        // 分类筛选非阻塞
      }
    })()
  }, [])

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true)
    setDetailError('')
    setDetail(null)
    try {
      const d = await ticketApi.get(id)
      setDetail(d)
    } catch (cause) {
      setDetailError(cause instanceof Error ? cause.message : '加载详情失败')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedId !== null) void loadDetail(selectedId)
  }, [selectedId, loadDetail])

  const toggleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(field)
      setSortOrder('desc')
    }
    setPage(1)
  }

  const onSearchSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSearch(searchInput)
    setPage(1)
  }

  const refreshDetail = async () => {
    if (selectedId !== null) await loadDetail(selectedId)
    await loadList()
  }

  return (
    <div className="split-layout">
      {/* 主列表区 */}
      <section className="master-panel card">
        <div className="filter-bar">
          <label className="filter-field">
            <span>状态</span>
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="filter-field">
            <span>优先级</span>
            <select value={slaPriority} onChange={(e) => { setSlaPriority(e.target.value); setPage(1) }}>
              {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="filter-field">
            <span>分类</span>
            <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1) }}>
              <option value="">全部分类</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <form className="filter-field search-field" onSubmit={onSearchSubmit}>
            <span>搜索</span>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="标题/描述关键词"
            />
          </form>
        </div>

        {loading ? (
          <Skeleton lines={5} />
        ) : error ? (
          <ErrorState message={error} />
        ) : items.length === 0 ? (
          <EmptyState message="没有符合条件的工单" />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th className="sortable" onClick={() => toggleSort('createdAt')}>创建时间{sortBy === 'createdAt' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                  <th>主题</th>
                  <th className="sortable" onClick={() => toggleSort('status')}>状态{sortBy === 'status' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                  <th className="sortable" onClick={() => toggleSort('slaPriority')}>优先级{sortBy === 'slaPriority' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                  <th>分类</th>
                  <th>提交人</th>
                </tr>
              </thead>
              <tbody>
                {items.map((t) => (
                  <tr
                    key={t.id}
                    className={`ticket-row${selectedId === t.id ? ' selected' : ''}`}
                    onClick={() => setSelectedId(t.id)}
                  >
                    <td>{formatDateTime(t.createdAt)}</td>
                    <td><strong>{t.title}</strong></td>
                    <td><span className={statusClass(t.status)}>{STATUS_LABELS[t.status]}</span></td>
                    <td><span className={priorityClass(t.slaPriority)}>{t.slaPriority}</span></td>
                    <td>{t.categoryName}</td>
                    <td>{t.submitterName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
      </section>

      {/* 详情面板 */}
      <section className="detail-panel card">
        {selectedId === null ? (
          <EmptyState message="请从左侧选择工单查看详情" />
        ) : detailLoading ? (
          <Skeleton lines={6} />
        ) : detailError ? (
          <ErrorState message={detailError} />
        ) : detail ? (
          <TicketDetailContent
            ticket={detail}
            user={user}
            onChanged={refreshDetail}
            notify={notify}
          />
        ) : null}
      </section>
    </div>
  )
}

function TicketDetailContent({
  ticket,
  user,
  onChanged,
  notify,
}: {
  ticket: TicketDetail
  user: CurrentUser
  onChanged: () => Promise<void>
  notify: (msg: string, kind?: 'success' | 'error' | 'info') => void
}) {
  const canTransfer = user.role === 'handler' || user.role === 'admin'
  const canComplete = canTransfer
  const canCancel = ticket.status !== 'completed' && ticket.status !== 'cancelled'
  const canRate = ticket.status === 'completed' && ticket.submitter.id === user.id

  return (
    <div className="detail-content">
      <div className="detail-header">
        <h3>{ticket.title}</h3>
        <div className="detail-badges">
          <span className={statusClass(ticket.status)}>{STATUS_LABELS[ticket.status]}</span>
          <span className={priorityClass(ticket.slaPriority)}>{ticket.slaPriority}</span>
          <span className="badge badge-neutral">{ticket.categoryName}</span>
        </div>
      </div>

      <DetailSection title="基本信息">
        <dl className="info-grid">
          <dt>工单 ID</dt><dd>{ticket.id}</dd>
          <dt>创建时间</dt><dd>{formatDateTime(ticket.createdAt)}</dd>
          <dt>分配时间</dt><dd>{formatDateTime(ticket.assignedAt)}</dd>
          <dt>处理开始</dt><dd>{formatDateTime(ticket.processedAt)}</dd>
          <dt>完成时间</dt><dd>{formatDateTime(ticket.completedAt)}</dd>
          <dt>取消时间</dt><dd>{formatDateTime(ticket.cancelledAt)}</dd>
          <dt>处理人</dt><dd>{ticket.handlerName || '—'}</dd>
        </dl>
        <p className="detail-description">{ticket.description}</p>
      </DetailSection>

      <DetailSection title="提交人信息">
        <SubmitterInfo ticket={ticket} user={user} />
      </DetailSection>

      <DetailSection title={`回复列表 (${ticket.replies.length})`}>
        {ticket.replies.length === 0 ? (
          <EmptyState message="暂无回复" />
        ) : (
          <ul className="reply-list">
            {ticket.replies.map((r) => (
              <li key={r.id} className="reply-item">
                <div className="reply-meta">
                  <strong>{r.replierName}</strong>
                  <time>{formatDateTime(r.createdAt)}</time>
                </div>
                <p className="reply-content">{r.content}</p>
              </li>
            ))}
          </ul>
        )}
        <ReplyForm
          ticketId={ticket.id}
          onReply={async (content) => {
            await ticketApi.reply(ticket.id, content)
            notify('回复已发送', 'success')
            await onChanged()
          }}
        />
      </DetailSection>

      <DetailSection title="处理操作">
        <ActionBar
          ticket={ticket}
          canTransfer={canTransfer}
          canComplete={canComplete}
          canCancel={canCancel}
          canRate={canRate}
          onChanged={onChanged}
          notify={notify}
        />
      </DetailSection>

      {ticket.satisfaction && (
        <DetailSection title="满意度评价">
          <div className="satisfaction-display">
            <span className="rating-stars">{'★'.repeat(ticket.satisfaction.rating)}{'☆'.repeat(5 - ticket.satisfaction.rating)}</span>
            {ticket.satisfaction.comment && <p>{ticket.satisfaction.comment}</p>}
            <time className="subtext">{formatDateTime(ticket.satisfaction.createdAt)}</time>
          </div>
        </DetailSection>
      )}
    </div>
  )
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="detail-section">
      <h4 className="detail-section-title">{title}</h4>
      {children}
    </div>
  )
}

function SubmitterInfo({ ticket, user }: { ticket: TicketDetail; user: CurrentUser }) {
  const [history, setHistory] = useState<UserHistoryTicket[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const canView = user.role === 'handler' || user.role === 'admin'

  useEffect(() => {
    if (!canView) return
    void (async () => {
      setLoading(true)
      setError('')
      try {
        const result = await userApi.history(ticket.submitter.id)
        setHistory(result.items)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '加载历史工单失败')
      } finally {
        setLoading(false)
      }
    })()
  }, [canView, ticket.submitter.id])

  return (
    <div>
      <dl className="info-grid">
        <dt>姓名</dt><dd>{ticket.submitter.displayName}</dd>
        <dt>邮箱</dt><dd>{ticket.submitter.email}</dd>
        <dt>公司</dt><dd>{ticket.submitter.companyName}</dd>
        <dt>部门</dt><dd>{ticket.submitter.departmentName || '—'}</dd>
      </dl>
      {!canView ? (
        <p className="subtext">仅处理人/管理员可查看历史工单</p>
      ) : loading ? (
        <Skeleton lines={2} />
      ) : error ? (
        <ErrorState message={error} />
      ) : (
        <div className="history-tickets">
          <p className="subtext">历史工单 ({history.length})</p>
          {history.length > 0 && (
            <ul className="history-list">
              {history.map((h) => (
                <li key={h.id}>
                  <span>{h.title}</span>
                  <span className={statusClass(h.status)}>{STATUS_LABELS[h.status]}</span>
                  <span className="subtext">{formatDateTime(h.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function ReplyForm({
  ticketId,
  onReply,
}: {
  ticketId: string
  onReply: (content: string) => Promise<void>
}) {
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!content.trim()) return
    setBusy(true)
    setError('')
    try {
      await onReply(content.trim())
      setContent('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '回复失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="reply-form" onSubmit={submit}>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="输入回复内容…"
        rows={3}
        required
        maxLength={2000}
      />
      {error && <p role="alert" className="error">{error}</p>}
      <button disabled={busy}>{busy ? '发送中…' : '发送回复'}</button>
    </form>
  )
}

function ActionBar({
  ticket,
  canTransfer,
  canComplete,
  canCancel,
  canRate,
  onChanged,
  notify,
}: {
  ticket: TicketDetail
  canTransfer: boolean
  canComplete: boolean
  canCancel: boolean
  canRate: boolean
  onChanged: () => Promise<void>
  notify: (msg: string, kind?: 'success' | 'error' | 'info') => void
}) {
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [transferTarget, setTransferTarget] = useState('')
  const [transferReason, setTransferReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // 满意度评价
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')

  useEffect(() => {
    if (!canTransfer) return
    void (async () => {
      try {
        const result = await businessGroupApi.list()
        setGroups(result.items.filter((g) => g.id !== ticket.businessGroupId))
      } catch {
        // 非阻塞
      }
    })()
  }, [canTransfer, ticket.businessGroupId])

  const doTransfer = async () => {
    if (!transferTarget) return
    setBusy(true)
    setError('')
    try {
      await ticketApi.transfer(ticket.id, {
        toBusinessGroupId: transferTarget,
        reason: transferReason || undefined,
      })
      notify('工单已转派', 'success')
      setTransferTarget('')
      setTransferReason('')
      await onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '转派失败')
    } finally {
      setBusy(false)
    }
  }

  const doComplete = async () => {
    const summary = window.prompt('请输入处理摘要（可选）') ?? ''
    setBusy(true)
    setError('')
    try {
      await ticketApi.complete(ticket.id, summary || undefined)
      notify('工单已完成', 'success')
      await onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '完成操作失败')
    } finally {
      setBusy(false)
    }
  }

  const doCancel = async () => {
    const reason = window.prompt('请输入取消原因（可选）') ?? ''
    setBusy(true)
    setError('')
    try {
      await ticketApi.cancel(ticket.id, reason || undefined)
      notify('工单已取消', 'success')
      await onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '取消失败')
    } finally {
      setBusy(false)
    }
  }

  const doRate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await ticketApi.rate(ticket.id, { rating, comment: comment || undefined })
      notify('评价已提交', 'success')
      setComment('')
      await onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '评价失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="action-bar">
      {error && <ErrorState message={error} />}
      <div className="action-buttons">
        {canTransfer && ticket.status === 'pending_processing' && (
          <div className="transfer-form">
            <select value={transferTarget} onChange={(e) => setTransferTarget(e.target.value)}>
              <option value="">选择目标业务组…</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <input value={transferReason} onChange={(e) => setTransferReason(e.target.value)} placeholder="转派原因（可选）" />
            <button className="secondary" disabled={busy || !transferTarget} onClick={doTransfer}>转派</button>
          </div>
        )}
        {canComplete && ticket.status === 'pending_processing' && (
          <button disabled={busy} onClick={doComplete}>标记完成</button>
        )}
        {canCancel && (
          <button className="secondary" disabled={busy} onClick={doCancel}>取消工单</button>
        )}
      </div>
      {canRate && !ticket.satisfaction && (
        <form className="rating-form" onSubmit={doRate}>
          <label className="rating-input">
            <span>满意度评分</span>
            <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{'★'.repeat(n)} ({n})</option>)}
            </select>
          </label>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="评价内容（可选）" rows={2} />
          <button disabled={busy}>{busy ? '提交中…' : '提交评价'}</button>
        </form>
      )}
    </div>
  )
}
