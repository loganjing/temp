import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { getWorkbenchTickets, getCompanies, getCategories, createTicket } from '../platform/ticket-api'
import type { Ticket, Company, Category, Priority, TicketStatus } from '../types'
import { Skeleton, EmptyState, ErrorState, Badge } from '../components/Feedback'
import { useToast } from '../components/Toast'

const STATUS_LABELS: Record<string, string> = {
  created: '创建', pending_assignment: '待分配', pending_processing: '待处理', completed: '已完成', cancelled: '已取消',
}
const PRIORITY_LABELS: Record<string, string> = { P0: 'P0 紧急', P1: 'P1 高', P2: 'P2 中', P3: 'P3 普通', P4: 'P4 低' }

function statusVariant(s: string) {
  return s === 'completed' ? 'success' : s === 'cancelled' ? 'danger' : s === 'pending_processing' ? 'warning' : 'info'
}
function priorityVariant(p: string) {
  return p === 'P0' || p === 'P1' ? 'danger' : p === 'P2' ? 'warning' : 'neutral'
}

export default function WorkbenchPage({ roles, companyId }: { roles: string[]; companyId: string | null }) {
  const toast = useToast()
  const isSubmitter = roles.includes('submitter')
  const isAdmin = roles.includes('admin')

  const [tickets, setTickets] = useState<Ticket[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Ticket | null>(null)

  const [companies, setCompanies] = useState<Company[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [filters, setFilters] = useState({ company_id: '', category_id: '', priority: '', status: 'pending_processing' })
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('priority')
  const [order, setOrder] = useState('asc')

  // Create ticket dialog
  const [showCreate, setShowCreate] = useState(false)
  const [createBusy, setCreateBusy] = useState(false)

  const loadCompanies = useCallback(async () => {
    try {
      const result = await getCompanies()
      setCompanies(result.companies)
    } catch { /* ignore — non-critical */ }
  }, [])

  const loadCategories = useCallback(async (companyId: string) => {
    if (!companyId) { setCategories([]); return }
    try {
      const result = await getCategories(companyId)
      setCategories(result.categories)
    } catch { setCategories([]) }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await getWorkbenchTickets({
        status: filters.status || undefined,
        priority: filters.priority || undefined,
        category_id: filters.category_id || undefined,
        company_id: filters.company_id || undefined,
        search: search || undefined,
        sort, order,
        limit: 50, offset: 0,
      })
      setTickets(result.tickets)
      setTotal(result.total)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [filters, search, sort, order])

  useEffect(() => { void loadCompanies() }, [loadCompanies])
  useEffect(() => { if (filters.company_id) void loadCategories(filters.company_id) }, [filters.company_id, loadCategories])
  useEffect(() => { if (!isAdmin && companyId) void loadCategories(companyId) }, [isAdmin, companyId, loadCategories])
  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (selectedId) {
      const t = tickets.find((t) => t.id === selectedId)
      setSelected(t ?? null)
    } else {
      setSelected(null)
    }
  }, [selectedId, tickets])

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCreateBusy(true)
    const form = event.currentTarget
    const body = Object.fromEntries(new FormData(form).entries())
    try {
      await createTicket({
        title: body.title as string,
        description: body.description as string,
        category_id: (body.category_id as string) || null,
        priority: (body.priority as Priority) || 'P2',
      })
      form.reset()
      setShowCreate(false)
      toast('工单已创建')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建失败')
    } finally {
      setCreateBusy(false)
    }
  }

  return (
    <div className="stack">
      {isSubmitter && (
        <div className="section-heading">
          <h2>工单工作台</h2>
          <button onClick={() => setShowCreate(!showCreate)}>{showCreate ? '取消' : '创建工单'}</button>
        </div>
      )}
      {showCreate && (
        <section className="card">
          <form className="form-grid" onSubmit={(e) => void handleCreate(e)}>
            <label>主题<input name="title" required maxLength={200} /></label>
            <label>分类
              <select name="category_id">
                <option value="">无分类</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label>优先级
              <select name="priority" defaultValue="P2">
                {['P0', 'P1', 'P2', 'P3', 'P4'].map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
              </select>
            </label>
            <label style={{ gridColumn: '1 / -1' }}>描述<textarea name="description" required rows={3} /></label>
            <button disabled={createBusy}>{createBusy ? '提交中…' : '提交工单'}</button>
          </form>
        </section>
      )}

      <div className="split-layout">
        <div className="master-panel">
          <div className="card" style={{ padding: '0.75rem' }}>
            <div className="filters" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              {isAdmin && (
                <label style={{ gridColumn: '1 / -1' }}>公司
                  <select value={filters.company_id} onChange={(e) => setFilters({ ...filters, company_id: e.target.value })}>
                    <option value="">全部公司</option>
                    {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
              )}
              <label>分类
                <select value={filters.category_id} onChange={(e) => setFilters({ ...filters, category_id: e.target.value })}>
                  <option value="">全部分类</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label>优先级
                <select value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value })}>
                  <option value="">全部</option>
                  {['P0', 'P1', 'P2', 'P3', 'P4'].map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
                </select>
              </label>
              <label>状态
                <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
                  {['pending_processing', 'pending_assignment', 'created', 'completed', 'cancelled'].map((s) => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </label>
              <label>排序
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="priority">优先级</option>
                  <option value="created_at">创建时间</option>
                  <option value="updated_at">更新时间</option>
                </select>
              </label>
              <label style={{ gridColumn: '1 / -1' }}>搜索
                <input className="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="标题/描述关键词" />
              </label>
            </div>
          </div>
          <div className="ticket-list">
            {loading ? <Skeleton lines={4} /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : tickets.length === 0 ? (
              <EmptyState title="暂无待处理工单" hint="调整筛选条件或创建新工单" />
            ) : tickets.map((t) => (
              <div key={t.id} className={`ticket-card${selectedId === t.id ? ' selected' : ''}`} onClick={() => setSelectedId(t.id)}>
                <div className="tc-title">{t.title}</div>
                <div className="tc-meta">
                  <Badge variant={statusVariant(t.status)}>{STATUS_LABELS[t.status]}</Badge>
                  <Badge variant={priorityVariant(t.priority)}>{PRIORITY_LABELS[t.priority]}</Badge>
                  <span>{new Date(t.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="subtext" style={{ textAlign: 'center' }}>{total > 0 ? `共 ${total} 条` : ''}</p>
        </div>

        <div className="card detail-panel">
          {selected ? (
            <div className="stack" style={{ padding: '1.25rem' }}>
              <div className="section-heading">
                <h2>{selected.title}</h2>
                <div className="row-actions">
                  <Badge variant={statusVariant(selected.status)}>{STATUS_LABELS[selected.status]}</Badge>
                  <Badge variant={priorityVariant(selected.priority)}>{PRIORITY_LABELS[selected.priority]}</Badge>
                </div>
              </div>
              <div className="subtext">
                提交人: {selected.submitter_name} · {selected.submitter_email}
                {selected.category_name && ` · 分类: ${selected.category_name}`}
                {selected.assigned_group_name && ` · 业务组: ${selected.assigned_group_name}`}
              </div>
              <div style={{ fontSize: '0.88rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{selected.description}</div>
              <div className="subtext">
                创建: {new Date(selected.created_at).toLocaleString()} · 更新: {new Date(selected.updated_at).toLocaleString()}
              </div>
              <Link to={`/tickets/${selected.id}`}>
                <button className="secondary">查看详情 →</button>
              </Link>
            </div>
          ) : (
            <EmptyState title="选择左侧工单查看详情" hint="或从列表中点击一个工单" />
          )}
        </div>
      </div>
    </div>
  )
}
