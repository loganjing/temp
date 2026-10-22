import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { apiRequest } from '../platform/api-client'
import { useTickets, type TicketQuery } from '../hooks/useTickets'
import { useCategories } from '../hooks/useCategories'
import { STATUS_LABELS, STATUS_OPTIONS, PRIORITY_OPTIONS, type AuthUser, type DataResponse, type TicketDTO } from '../types'
import TicketDetail from './TicketDetail'

interface Props {
  currentUser: AuthUser
}

const PAGE_SIZE = 20

export default function TicketWorkspace({ currentUser }: Props) {
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('createdAt')
  const [order, setOrder] = useState('desc')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)

  // Create form state
  const [createError, setCreateError] = useState('')
  const [createBusy, setCreateBusy] = useState(false)

  const query: TicketQuery = useMemo(() => ({
    status: status || undefined,
    priority: priority || undefined,
    categoryId: categoryId || undefined,
    search: search || undefined,
    sort, order, page, pageSize: PAGE_SIZE,
  }), [status, priority, categoryId, search, sort, order, page])

  const { tickets, total, loading, error, refresh } = useTickets(query)
  const { categories } = useCategories()

  const resetPage = () => setPage(1)

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const body = Object.fromEntries(new FormData(form).entries())
    setCreateBusy(true)
    setCreateError('')
    try {
      const result = await apiRequest<DataResponse<TicketDTO>>('/api/tickets', {
        method: 'POST', body: JSON.stringify(body),
      })
      form.reset()
      setShowCreateForm(false)
      setSelectedId(result.data.id)
      await refresh()
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : '创建工单失败')
    } finally {
      setCreateBusy(false)
    }
  }

  // Auto-select first ticket when list loads and nothing selected
  useEffect(() => {
    if (!selectedId && tickets.length > 0 && !loading) {
      setSelectedId(tickets[0].id)
    }
  }, [tickets, selectedId, loading])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="workspace">
      <div className="workspace-toolbar">
        <button onClick={() => setShowCreateForm(!showCreateForm)}>创建工单</button>
      </div>

      {showCreateForm && (
        <section className="card create-ticket-form">
          <h3>创建工单</h3>
          <form className="form-grid" onSubmit={(e) => void handleCreate(e)}>
            <label>主题<input name="subject" required maxLength={200} /></label>
            <label>描述<textarea name="description" rows={3} required maxLength={2000} /></label>
            <label>分类
              <select name="categoryId" required>
                <option value="">— 选择分类 —</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label>优先级
              <select name="priority" required defaultValue="P2">
                {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <button disabled={createBusy}>{createBusy ? '提交中…' : '提交'}</button>
          </form>
          {createError && <p role="alert" className="error">{createError}</p>}
        </section>
      )}

      <div className="workspace-split">
        {/* Left: ticket list */}
        <div className="workspace-list">
          <div className="workspace-filters">
            <select value={status} onChange={(e) => { setStatus(e.target.value); resetPage() }}>
              <option value="">全部状态</option>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
            <select value={priority} onChange={(e) => { setPriority(e.target.value); resetPage() }}>
              <option value="">全部优先级</option>
              {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); resetPage() }}>
              <option value="">全部分类</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="search-row">
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { setSearch(searchInput); resetPage() } }}
                placeholder="搜索主题/工单ID"
              />
              <button className="secondary" onClick={() => { setSearch(searchInput); resetPage() }}>搜索</button>
            </div>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="createdAt">按创建时间</option>
              <option value="priority">按优先级</option>
            </select>
            <select value={order} onChange={(e) => setOrder(e.target.value)}>
              <option value="desc">降序</option>
              <option value="asc">升序</option>
            </select>
          </div>

          {loading && <p className="subtext">加载中…</p>}
          {error && <p className="error">{error}</p>}
          {!loading && !error && tickets.length === 0 && <p className="subtext">暂无工单</p>}

          <div className="ticket-list">
            {tickets.map(t => (
              <div
                key={t.id}
                className={`ticket-list-item ${selectedId === t.id ? 'selected' : ''}`}
                onClick={() => setSelectedId(t.id)}
              >
                <div className="ticket-list-main">
                  <div className="ticket-list-header">
                    <span className={`priority-badge priority-${t.priority}`}>{t.priority}</span>
                    <span className={`status-badge status-${t.status}`}>{STATUS_LABELS[t.status] ?? t.status}</span>
                  </div>
                  <strong title={t.subject}>{t.subject}</strong>
                  <span className="subtext" title={t.id}>{t.id.slice(0, 8)}… · {t.submitterName}</span>
                </div>
                <span className="subtext">{new Date(t.createdAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>

          {total > PAGE_SIZE && (
            <div className="pagination">
              <span className="subtext">{page} / {totalPages} 页 · 共 {total} 条</span>
              <div className="row-actions">
                <button className="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</button>
                <button className="secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>下一页</button>
              </div>
            </div>
          )}
        </div>

        {/* Right: ticket detail */}
        <div className="workspace-detail">
          <TicketDetail ticketId={selectedId} currentUser={currentUser} onUpdated={refresh} />
        </div>
      </div>
    </div>
  )
}
