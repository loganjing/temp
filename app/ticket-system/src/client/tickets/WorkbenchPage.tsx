import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { categoriesApi, companiesApi } from '../api/admin'
import { describeApiError } from '../api/errors'
import { ticketsApi } from '../api/tickets'
import type { Category, Company, SlaPriority, TicketListItem, TicketSort } from '../api/types'
import { EmptyState, Loading, Notice, PriorityBadge, StatusBadge } from '../components/ui'
import { formatDateTime } from '../format'
import CreateTicketForm from './CreateTicketForm'
import TicketDetailPanel from './TicketDetailPanel'

const PAGE_SIZE = 20

const statusOptions = [
  { value: 'pending_processing', label: '待处理' },
  { value: 'pending_assignment', label: '待分配' },
  { value: 'created', label: '创建' },
  { value: 'completed', label: '完成' },
  { value: 'cancelled', label: '取消' },
  { value: '', label: '全部状态' },
]

const priorityOptions: SlaPriority[] = ['P0', 'P1', 'P2', 'P3', 'P4']

const sortOptions: { value: TicketSort; label: string }[] = [
  { value: 'createdAt', label: '创建时间' },
  { value: 'slaPriority', label: 'SLA 优先级' },
  { value: 'status', label: '状态' },
]

type Filters = {
  q: string
  status: string
  categoryId: string
  priority: string
  companyId: string
  sort: TicketSort
  order: 'asc' | 'desc'
}

const initialFilters: Filters = { q: '', status: 'pending_processing', categoryId: '', priority: '', companyId: '', sort: 'createdAt', order: 'desc' }

export default function WorkbenchPage() {
  const [params, setParams] = useSearchParams()
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<TicketListItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [categories, setCategories] = useState<Category[]>([])
  const [companies, setCompanies] = useState<Company[]>([])

  const selectedId = params.get('ticket')
  const ticketId = selectedId && /^\d+$/.test(selectedId) ? Number(selectedId) : null
  const creating = params.get('new') === '1'

  useEffect(() => {
    Promise.all([categoriesApi.list(), companiesApi.list()])
      .then(([categoryResult, companyResult]) => { setCategories(categoryResult.items); setCompanies(companyResult.items) })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => setFilters((current) => (current.q === search ? current : { ...current, q: search })), 250)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => { setPage(1) }, [filters])

  const reload = useCallback(() => setReloadKey((key) => key + 1), [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    ticketsApi.list({ ...filters, page, size: PAGE_SIZE })
      .then((result) => {
        if (!active) return
        setItems(result.items)
        setTotal(result.total)
      })
      .catch((cause) => {
        if (!active) return
        setItems([])
        setTotal(0)
        setError(describeApiError(cause, '无法加载工单列表。'))
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [filters, page, reloadKey])

  const selectTicket = (id: number) => {
    const next = new URLSearchParams(params)
    next.delete('new')
    next.set('ticket', String(id))
    setParams(next)
  }

  const openCreate = () => {
    const next = new URLSearchParams(params)
    next.delete('ticket')
    next.set('new', '1')
    setParams(next)
  }

  const closeCreate = () => {
    const next = new URLSearchParams(params)
    next.delete('new')
    setParams(next)
  }

  const pageCount = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total])

  return (
    <div className="split">
      <section className="master-pane card">
        <div className="section-heading">
          <h2>工单工作台</h2>
          <button onClick={openCreate}>新建工单</button>
        </div>
        <div className="filter-grid">
          <label>关键字搜索<input value={search} onChange={(event) => setSearch(event.currentTarget.value)} placeholder="标题或描述" /></label>
          <label>状态<select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.currentTarget.value })}>
            {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select></label>
          <label>分类<select value={filters.categoryId} onChange={(event) => setFilters({ ...filters, categoryId: event.currentTarget.value })}>
            <option value="">全部分类</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select></label>
          <label>SLA 优先级<select value={filters.priority} onChange={(event) => setFilters({ ...filters, priority: event.currentTarget.value })}>
            <option value="">全部优先级</option>
            {priorityOptions.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
          </select></label>
          <label>公司<select value={filters.companyId} onChange={(event) => setFilters({ ...filters, companyId: event.currentTarget.value })}>
            <option value="">全部公司</option>
            {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select></label>
          <label>排序<select value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.currentTarget.value as TicketSort })}>
            {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select></label>
          <label>顺序<select value={filters.order} onChange={(event) => setFilters({ ...filters, order: event.currentTarget.value as 'asc' | 'desc' })}>
            <option value="desc">降序</option>
            <option value="asc">升序</option>
          </select></label>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        {loading ? <Loading label="加载工单列表…" /> : items.length === 0 ? <EmptyState>暂无符合条件的工单。</EmptyState> : (
          <ol className="ticket-list">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={item.id === ticketId ? 'ticket-row active' : 'ticket-row'}
                  onClick={() => selectTicket(item.id)}
                >
                  <span className="ticket-row-title">{item.title}</span>
                  <span className="ticket-row-meta muted">#{item.id} · {item.categoryName} · {item.companyName}</span>
                  <span className="ticket-row-tags"><PriorityBadge priority={item.slaPriority} /><StatusBadge status={item.status} /><span className="muted">{formatDateTime(item.createdAt)}</span></span>
                </button>
              </li>
            ))}
          </ol>
        )}
        <div className="section-heading pagination">
          <span className="muted">{total === 0 ? '共 0 条' : `第 ${page} / ${pageCount} 页 · 共 ${total} 条`}</span>
          <div className="row-actions">
            <button className="secondary" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>上一页</button>
            <button className="secondary" disabled={page >= pageCount || loading} onClick={() => setPage((current) => current + 1)}>下一页</button>
          </div>
        </div>
      </section>
      <section className="detail-pane">
        {creating
          ? <CreateTicketForm onCreated={(id) => { closeCreate(); selectTicket(id) }} onCancel={closeCreate} />
          : ticketId !== null
            ? <TicketDetailPanel ticketId={ticketId} onChanged={reload} />
            : <div className="card"><EmptyState>从左侧选择一条工单查看详情，或点击“新建工单”。</EmptyState></div>}
      </section>
    </div>
  )
}