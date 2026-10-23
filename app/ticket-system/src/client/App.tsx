import { createContext, useCallback, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, NavLink, useParams, useNavigate, Navigate, Outlet, Link } from 'react-router-dom'
import { apiRequest } from './platform/api-client'
import UsersPage from './admin/UsersPage'

// ════════════════════════════════════════════════════════════════════
// Type Definitions (based on technical-contract.md)
// ════════════════════════════════════════════════════════════════════

type CurrentUser = {
  id: string
  name: string
  email: string
  phone: string | null
  roles: string[]
  passwordChangeRequired: boolean
  companyId: string | null
  departmentId: string | null
}

type Company = { id: string; name: string; createdAt: string; updatedAt: string }
type Department = { id: string; companyId: string; name: string; createdAt: string; updatedAt: string }
type GroupMember = { userId: string; name: string; email: string }
type BusinessGroup = { id: string; companyId: string; name: string; members: GroupMember[]; createdAt: string; updatedAt: string }
type Category = { id: string; companyId: string; name: string; createdAt: string }
type AssignmentRule = { id: string; companyId: string; categoryId: string; categoryName: string; groupId: string; groupName: string; createdAt: string }

type TicketStatus = 'created' | 'pending_assignment' | 'pending_processing' | 'completed' | 'cancelled'
type SlaPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'

type TicketReply = { id: string; ticketId: string; replierId: string; replierName: string; content: string; createdAt: string }

type Ticket = {
  id: string
  companyId: string
  subject: string
  description: string
  categoryId: string | null
  categoryName: string | null
  submitterId: string
  submitterName: string
  submitterEmail: string
  submitterDepartment: string | null
  slaPriority: string
  status: TicketStatus
  groupId: string | null
  groupName: string | null
  handlerId: string | null
  handlerName: string | null
  assignedAt: string | null
  handledAt: string | null
  createdAt: string
  updatedAt: string
  replies: TicketReply[]
}

type TicketListItem = Omit<Ticket, 'replies' | 'description'>

type SubmitterInfo = {
  userId: string
  name: string
  email: string
  phone: string | null
  companyName: string | null
  departmentName: string | null
  historyTickets: TicketListItem[]
}

type Evaluation = { id: string; ticketId: string; submitterId: string; rating: number; comment: string | null; createdAt: string }

type DistributionItem = { key: string; total: number; byStatus: Record<TicketStatus, number> }
type DistributionResponse = { dimension: string; items: DistributionItem[] }
type HotCategory = { categoryId: string; categoryName: string; count: number }
type DashboardResponse = { totalTickets: number; avgResponseTimeHours: number; avgSatisfaction: number | null; hotCategories: HotCategory[] }

type AuditLogEntry = { id: string; eventType: string; actorUserId: string | null; actorName: string | null; occurredAt: string; metadata: Record<string, unknown> }

type TicketListParams = {
  companyId?: string; status?: string; priority?: string; categoryId?: string; groupId?: string
  search?: string; sort?: string; order?: string; limit?: number; offset?: number
}

type WorkbenchParams = {
  companyId?: string; priority?: string; search?: string; sort?: string; order?: string; limit?: number; offset?: number
}

// ════════════════════════════════════════════════════════════════════
// API helpers
// ════════════════════════════════════════════════════════════════════

function buildQuery(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

const api = {
  // Auth
  login: (body: string) => apiRequest<{ token: string; user: CurrentUser }>('/api/auth/login', { method: 'POST', body }),
  me: () => apiRequest<CurrentUser>('/api/auth/me'),
  bootstrapStatus: () => apiRequest<{ required: boolean }>('/api/auth/bootstrap-status'),
  bootstrap: (body: string) => apiRequest('/api/auth/bootstrap', { method: 'POST', body }),
  changePassword: (body: string) => apiRequest('/api/auth/password', { method: 'POST', body }),

  // Companies
  listCompanies: (params?: { search?: string; limit?: number; offset?: number }) =>
    apiRequest<{ companies: Company[]; total: number }>(`/api/companies${buildQuery(params ?? {})}`),
  createCompany: (name: string) => apiRequest<Company>('/api/companies', { method: 'POST', body: JSON.stringify({ name }) }),
  updateCompany: (id: string, name: string) => apiRequest<Company>(`/api/companies/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),

  // Departments
  listDepartments: (companyId: string) => apiRequest<{ departments: Department[] }>(`/api/companies/${companyId}/departments`),
  createDepartment: (companyId: string, name: string) => apiRequest<Department>(`/api/companies/${companyId}/departments`, { method: 'POST', body: JSON.stringify({ name }) }),
  updateDepartment: (companyId: string, id: string, name: string) => apiRequest<Department>(`/api/companies/${companyId}/departments/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),

  // Business Groups
  listGroups: (companyId: string) => apiRequest<{ groups: BusinessGroup[] }>(`/api/companies/${companyId}/groups`),
  createGroup: (companyId: string, name: string) => apiRequest<BusinessGroup>(`/api/companies/${companyId}/groups`, { method: 'POST', body: JSON.stringify({ name }) }),
  updateGroup: (id: string, name: string) => apiRequest<BusinessGroup>(`/api/groups/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  deleteGroup: (id: string) => apiRequest<{ ok: boolean }>(`/api/groups/${id}`, { method: 'DELETE' }),
  addMember: (groupId: string, userId: string) => apiRequest<{ ok: boolean }>(`/api/groups/${groupId}/members`, { method: 'POST', body: JSON.stringify({ userId }) }),
  removeMember: (groupId: string, userId: string) => apiRequest<{ ok: boolean }>(`/api/groups/${groupId}/members/${userId}`, { method: 'DELETE' }),

  // Categories
  listCategories: (companyId: string) => apiRequest<{ categories: Category[] }>(`/api/companies/${companyId}/categories`),
  createCategory: (companyId: string, name: string) => apiRequest<Category>(`/api/companies/${companyId}/categories`, { method: 'POST', body: JSON.stringify({ name }) }),
  updateCategory: (id: string, name: string) => apiRequest<Category>(`/api/categories/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  deleteCategory: (id: string) => apiRequest<{ ok: boolean }>(`/api/categories/${id}`, { method: 'DELETE' }),

  // Assignment Rules
  listRules: (companyId: string) => apiRequest<{ rules: AssignmentRule[] }>(`/api/companies/${companyId}/assignment-rules`),
  createRule: (companyId: string, categoryId: string, groupId: string) => apiRequest<AssignmentRule>(`/api/companies/${companyId}/assignment-rules`, { method: 'POST', body: JSON.stringify({ categoryId, groupId }) }),
  deleteRule: (id: string) => apiRequest<{ ok: boolean }>(`/api/assignment-rules/${id}`, { method: 'DELETE' }),

  // Tickets
  listTickets: (params: TicketListParams) => apiRequest<{ tickets: TicketListItem[]; total: number }>(`/api/tickets${buildQuery(params)}`),
  getTicket: (id: string) => apiRequest<Ticket>(`/api/tickets/${id}`),
  createTicket: (body: { subject: string; description: string; categoryId: string; slaPriority: string }) =>
    apiRequest<Ticket>('/api/tickets', { method: 'POST', body: JSON.stringify(body) }),
  assignTicket: (id: string, groupId: string) => apiRequest<Ticket>(`/api/tickets/${id}/assign`, { method: 'POST', body: JSON.stringify({ groupId }) }),
  transferTicket: (id: string, body: { toGroupId?: string; toHandlerId?: string }) =>
    apiRequest<Ticket>(`/api/tickets/${id}/transfer`, { method: 'POST', body: JSON.stringify(body) }),
  completeTicket: (id: string) => apiRequest<Ticket>(`/api/tickets/${id}/complete`, { method: 'POST' }),
  cancelTicket: (id: string) => apiRequest<Ticket>(`/api/tickets/${id}/cancel`, { method: 'POST' }),

  // Replies
  listReplies: (ticketId: string) => apiRequest<{ replies: TicketReply[] }>(`/api/tickets/${ticketId}/replies`),
  addReply: (ticketId: string, content: string) => apiRequest<TicketReply>(`/api/tickets/${ticketId}/replies`, { method: 'POST', body: JSON.stringify({ content }) }),

  // Submitter info
  getSubmitterInfo: (ticketId: string) => apiRequest<SubmitterInfo>(`/api/tickets/${ticketId}/submitter-info`),

  // Evaluation
  getEvaluation: (ticketId: string) => apiRequest<Evaluation>(`/api/tickets/${ticketId}/evaluation`),
  createEvaluation: (ticketId: string, rating: number, comment?: string) =>
    apiRequest<Evaluation>(`/api/tickets/${ticketId}/evaluation`, { method: 'POST', body: JSON.stringify({ rating, comment }) }),

  // Statistics
  getDistribution: (params: { dimension: string; companyId?: string }) => apiRequest<DistributionResponse>(`/api/stats/distribution${buildQuery(params)}`),
  getDashboard: (companyId?: string) => apiRequest<DashboardResponse>(`/api/stats/dashboard${buildQuery({ companyId })}`),

  // Workbench
  getWorkbench: (params: WorkbenchParams) => apiRequest<{ tickets: TicketListItem[]; total: number }>(`/api/workbench/tickets${buildQuery(params)}`),

  // Audit logs
  getLogs: (ticketId: string) => apiRequest<{ logs: AuditLogEntry[] }>(`/api/tickets/${ticketId}/logs`),
}

// ════════════════════════════════════════════════════════════════════
// Context
// ════════════════════════════════════════════════════════════════════

const UserContext = createContext<CurrentUser | null>(null)
const useUser = () => useContext(UserContext)

type ToastMsg = { id: number; text: string; type: 'success' | 'error' }
const ToastContext = createContext<{ notify: (text: string, type?: 'success' | 'error') => void }>({ notify: () => {} })
const useToast = () => useContext(ToastContext)

function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMsg[]>([])
  const notify = useCallback((text: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now() + Math.random()
    setToasts(t => [...t, { id, text, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000)
  }, [])
  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div className="toast-container">
        {toasts.map(t => <div key={t.id} className={`toast ${t.type}`}>{t.text}</div>)}
      </div>
    </ToastContext.Provider>
  )
}

// ════════════════════════════════════════════════════════════════════
// Shared UI Components
// ════════════════════════════════════════════════════════════════════

const STATUS_LABELS: Record<string, string> = {
  created: '已创建', pending_assignment: '待分配', pending_processing: '待处理', completed: '已完成', cancelled: '已取消',
}
const PRIORITY_LABELS: Record<string, string> = { P0: 'P0', P1: 'P1', P2: 'P2', P3: 'P3', P4: 'P4' }

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABELS[status] ?? status}</span>
}

function PriorityBadge({ priority }: { priority: string }) {
  return <span className={`badge badge-${priority.toLowerCase()}`}>{PRIORITY_LABELS[priority] ?? priority}</span>
}

function Skeleton({ lines = 3 }: { lines?: number }) {
  return <>{Array.from({ length: lines }).map((_, i) => <div key={i} className="skeleton skeleton-block" />)}</>
}

function EmptyState({ message }: { message: string }) {
  return <div className="empty-state"><p>{message}</p></div>
}

function ErrorAlert({ message }: { message: string }) {
  return <div className="inline-error" role="alert">{message}</div>
}

function Pagination({ total, offset, limit, onPage }: { total: number; offset: number; limit: number; onPage: (n: number) => void }) {
  if (total === 0) return <p className="subtext">无数据</p>
  const end = Math.min(offset + limit, total)
  return (
    <div className="pagination">
      <span className="subtext">{offset + 1}–{end} / {total}</span>
      <div className="row-actions" style={{ flexDirection: 'row' }}>
        <button className="secondary small" disabled={offset === 0} onClick={() => onPage(Math.max(offset - limit, 0))}>上一页</button>
        <button className="secondary small" disabled={offset + limit >= total} onClick={() => onPage(offset + limit)}>下一页</button>
      </div>
    </div>
  )
}

function CompanySelector({ value, onChange, allowAll }: { value: string; onChange: (v: string) => void; allowAll?: boolean }) {
  const [companies, setCompanies] = useState<Company[]>([])
  useEffect(() => {
    void api.listCompanies({ limit: 100 }).then(r => setCompanies(r.companies)).catch(() => {})
  }, [])
  return (
    <label>公司
      <select value={value} onChange={e => onChange(e.target.value)}>
        {allowAll && <option value="">全部公司</option>}
        {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </label>
  )
}

function formatDate(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  return isNaN(d.getTime()) ? s : d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// ════════════════════════════════════════════════════════════════════
// Async data hook
// ════════════════════════════════════════════════════════════════════

function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce(n => n + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fn().then(result => { if (!cancelled) { setData(result); setError(null) } })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : '加载失败') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  return { data, loading, error, reload }
}

// ════════════════════════════════════════════════════════════════════
// Ticket Card Component
// ════════════════════════════════════════════════════════════════════

function TicketCard({ ticket, active }: { ticket: TicketListItem; active?: boolean }) {
  return (
    <Link to={`/tickets/${ticket.id}`} className={`ticket-item ${active ? 'active' : ''}`}>
      <div className="ticket-item-title">{ticket.subject}</div>
      <div className="ticket-item-meta">
        <StatusBadge status={ticket.status} />
        <PriorityBadge priority={ticket.slaPriority} />
        {ticket.categoryName && <span>{ticket.categoryName}</span>}
        {ticket.groupName && <span>→ {ticket.groupName}</span>}
      </div>
      <div className="ticket-item-meta">
        <span>{ticket.submitterName}</span>
        <span>{formatDate(ticket.createdAt)}</span>
      </div>
    </Link>
  )
}

// ════════════════════════════════════════════════════════════════════
// Filter Bar Component
// ════════════════════════════════════════════════════════════════════

function FilterBar({ filters, onFilter }: {
  filters: Record<string, string>
  onFilter: (key: string, value: string) => void
}) {
  const user = useUser()
  const isAdmin = user?.roles.includes('admin')
  return (
    <div className="filter-bar">
      {isAdmin && (
        <CompanySelector value={filters.companyId ?? ''} onChange={v => onFilter('companyId', v)} allowAll />
      )}
      {filters.status !== undefined && (
        <label>状态
          <select value={filters.status} onChange={e => onFilter('status', e.target.value)}>
            <option value="">全部</option>
            <option value="created">已创建</option>
            <option value="pending_assignment">待分配</option>
            <option value="pending_processing">待处理</option>
            <option value="completed">已完成</option>
            <option value="cancelled">已取消</option>
          </select>
        </label>
      )}
      <label>优先级
        <select value={filters.priority ?? ''} onChange={e => onFilter('priority', e.target.value)}>
          <option value="">全部</option>
          <option value="P0">P0</option>
          <option value="P1">P1</option>
          <option value="P2">P2</option>
          <option value="P3">P3</option>
          <option value="P4">P4</option>
        </select>
      </label>
      <label>排序
        <select value={filters.sort ?? 'createdAt'} onChange={e => onFilter('sort', e.target.value)}>
          <option value="createdAt">创建时间</option>
          <option value="updatedAt">更新时间</option>
          <option value="priority">优先级</option>
        </select>
      </label>
      <label>方向
        <select value={filters.order ?? 'desc'} onChange={e => onFilter('order', e.target.value)}>
          <option value="desc">降序</option>
          <option value="asc">升序</option>
        </select>
      </label>
      <label className="search">关键字搜索
        <input value={filters.search ?? ''} placeholder="搜索主题/描述" onChange={e => onFilter('search', e.target.value)} />
      </label>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// Workbench Page
// ════════════════════════════════════════════════════════════════════

function WorkbenchPage() {
  const [filters, setFilters] = useState<Record<string, string>>({ sort: 'createdAt', order: 'desc' })
  const [offset, setOffset] = useState(0)
  const limit = 50
  const { data, loading, error, reload } = useAsync(
    () => api.getWorkbench({ ...filters, limit, offset }),
    [filters, offset]
  )
  const onFilter = (key: string, value: string) => { setFilters(f => ({ ...f, [key]: value })); setOffset(0) }

  return (
    <div>
      <div className="section-heading"><h2>工单工作台</h2></div>
      <FilterBar filters={filters} onFilter={onFilter} />
      {error && <ErrorAlert message={error} />}
      {loading ? <Skeleton lines={4} /> : (
        <>
          {data && data.tickets.length === 0 && <EmptyState message="暂无待处理工单" />}
          <div className="stack">
            {data?.tickets.map(t => <TicketCard key={t.id} ticket={t} />)}
          </div>
          <Pagination total={data?.total ?? 0} offset={offset} limit={limit} onPage={setOffset} />
        </>
      )}
      <button className="secondary small" style={{ marginTop: '1rem' }} onClick={reload}>刷新</button>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// Ticket Management Page (Split master-detail)
// ════════════════════════════════════════════════════════════════════

function TicketManagementList() {
  const { ticketId } = useParams()
  const [filters, setFilters] = useState<Record<string, string>>({ sort: 'createdAt', order: 'desc', status: '' })
  const [offset, setOffset] = useState(0)
  const limit = 50
  const { data, loading, error } = useAsync(
    () => api.listTickets({ ...filters, limit, offset }),
    [filters, offset]
  )
  const onFilter = (key: string, value: string) => { setFilters(f => ({ ...f, [key]: value })); setOffset(0) }

  return (
    <div>
      <FilterBar filters={{ ...filters, status: filters.status }} onFilter={onFilter} />
      {error && <ErrorAlert message={error} />}
      {loading ? <Skeleton lines={4} /> : (
        <>
          {data && data.tickets.length === 0 && <EmptyState message="暂无工单" />}
          <div className="stack">
            {data?.tickets.map(t => <TicketCard key={t.id} ticket={t} active={t.id === ticketId} />)}
          </div>
          <Pagination total={data?.total ?? 0} offset={offset} limit={limit} onPage={setOffset} />
        </>
      )}
    </div>
  )
}

function TicketManagementPage() {
  return (
    <div>
      <div className="section-heading"><h2>工单管理</h2></div>
      <div className="split-layout">
        <div className="split-master">
          <div className="card">
            <TicketManagementList />
          </div>
        </div>
        <div className="split-detail">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

function DetailPlaceholder() {
  return (
    <div className="card empty-state">
      <p>从左侧选择工单查看详情</p>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// Ticket Detail Page
// ════════════════════════════════════════════════════════════════════

function TicketDetailPage() {
  const { ticketId } = useParams<{ ticketId: string }>()
  const navigate = useNavigate()
  const { notify } = useToast()
  const user = useUser()
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')

  const ticketRes = useAsync(() => api.getTicket(ticketId!), [ticketId])
  const ticket = ticketRes.data

  const logsRes = useAsync(() => api.getLogs(ticketId!), [ticketId])
  const submitterRes = useAsync(() => api.getSubmitterInfo(ticketId!).catch(() => null), [ticketId])
  const evalRes = useAsync(() => api.getEvaluation(ticketId!).catch(() => null), [ticketId])

  const groupsRes = useAsync(() => {
    if (!ticket?.companyId) return Promise.resolve({ groups: [] as BusinessGroup[] })
    return api.listGroups(ticket.companyId).catch(() => ({ groups: [] as BusinessGroup[] }))
  }, [ticket?.companyId])

  const categoriesRes = useAsync(() => {
    if (!ticket?.companyId) return Promise.resolve({ categories: [] as Category[] })
    return api.listCategories(ticket.companyId).catch(() => ({ categories: [] as Category[] }))
  }, [ticket?.companyId])

  if (ticketRes.loading) return <div className="card"><Skeleton lines={5} /></div>
  if (ticketRes.error) return <div className="card"><ErrorAlert message={ticketRes.error} /></div>
  if (!ticket) return <div className="card"><EmptyState message="工单不存在" /></div>

  const isSubmitter = user?.id === ticket.submitterId
  const isAdmin = user?.roles.includes('admin')
  const isHandler = user?.roles.includes('handler')
  const canAssign = (isAdmin || isHandler) && ['created', 'pending_assignment'].includes(ticket.status)
  const canTransfer = isHandler && ticket.status === 'pending_processing'
  const canComplete = isHandler && ticket.status === 'pending_processing'
  const canCancel = (isSubmitter || isAdmin) && ticket.status !== 'completed' && ticket.status !== 'cancelled'
  const canEvaluate = isSubmitter && ticket.status === 'completed'

  const handleReply = async (e: FormEvent) => {
    e.preventDefault()
    if (!replyText.trim()) return
    setBusy(true); setActionError('')
    try {
      await api.addReply(ticketId!, replyText.trim())
      setReplyText('')
      notify('回复成功')
      ticketRes.reload()
    } catch (err) { setActionError(err instanceof Error ? err.message : '回复失败') }
    finally { setBusy(false) }
  }

  const handleAction = async (action: 'assign' | 'complete' | 'cancel', groupId?: string) => {
    setBusy(true); setActionError('')
    try {
      if (action === 'assign' && groupId) await api.assignTicket(ticketId!, groupId)
      else if (action === 'complete') await api.completeTicket(ticketId!)
      else if (action === 'cancel') await api.cancelTicket(ticketId!)
      notify('操作成功')
      ticketRes.reload()
      logsRes.reload()
    } catch (err) { setActionError(err instanceof Error ? err.message : '操作失败') }
    finally { setBusy(false) }
  }

  return (
    <div className="stack">
      {/* Ticket header */}
      <div className="card">
        <div className="section-heading">
          <h2>{ticket.subject}</h2>
          <div className="ticket-item-meta">
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.slaPriority} />
          </div>
        </div>
        <div className="info-panel">
          <div className="info-row"><span className="info-label">工单ID</span><span className="info-value">{ticket.id}</span></div>
          <div className="info-row"><span className="info-label">提交人</span><span className="info-value">{ticket.submitterName} ({ticket.submitterEmail})</span></div>
          {ticket.submitterDepartment && <div className="info-row"><span className="info-label">部门</span><span className="info-value">{ticket.submitterDepartment}</span></div>}
          {ticket.categoryName && <div className="info-row"><span className="info-label">分类</span><span className="info-value">{ticket.categoryName}</span></div>}
          {ticket.groupName && <div className="info-row"><span className="info-label">业务组</span><span className="info-value">{ticket.groupName}</span></div>}
          {ticket.handlerName && <div className="info-row"><span className="info-label">处理人</span><span className="info-value">{ticket.handlerName}</span></div>}
          <div className="info-row"><span className="info-label">创建时间</span><span className="info-value">{formatDate(ticket.createdAt)}</span></div>
          {ticket.assignedAt && <div className="info-row"><span className="info-label">分配时间</span><span className="info-value">{formatDate(ticket.assignedAt)}</span></div>}
          {ticket.handledAt && <div className="info-row"><span className="info-label">处理时间</span><span className="info-value">{formatDate(ticket.handledAt)}</span></div>}
        </div>
      </div>

      {/* Description */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>工单描述</h3>
        <p style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{ticket.description}</p>
      </div>

      {/* Action buttons */}
      {(canAssign || canComplete || canCancel || canTransfer) && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>工单操作</h3>
          {actionError && <ErrorAlert message={actionError} />}
          <div className="row-actions" style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {canAssign && groupsRes.data?.groups.map(g => (
              <button key={g.id} className="secondary small" disabled={busy} onClick={() => handleAction('assign', g.id)}>分配到 {g.name}</button>
            ))}
            {canComplete && <button disabled={busy} onClick={() => handleAction('complete')}>完成工单</button>}
            {canCancel && <button className="danger small" disabled={busy} onClick={() => handleAction('cancel')}>取消工单</button>}
            {canTransfer && <TransferButton ticketId={ticketId!} groups={groupsRes.data?.groups ?? []} disabled={busy} onDone={() => { ticketRes.reload(); logsRes.reload() }} />}
          </div>
        </div>
      )}

      {/* Submitter info panel (handler/admin only) */}
      {(isHandler || isAdmin) && submitterRes.data && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>提交人信息</h3>
          <div className="info-panel">
            <div className="info-row"><span className="info-label">姓名</span><span className="info-value">{submitterRes.data.name}</span></div>
            <div className="info-row"><span className="info-label">邮箱</span><span className="info-value">{submitterRes.data.email}</span></div>
            {submitterRes.data.phone && <div className="info-row"><span className="info-label">电话</span><span className="info-value">{submitterRes.data.phone}</span></div>}
            {submitterRes.data.companyName && <div className="info-row"><span className="info-label">公司</span><span className="info-value">{submitterRes.data.companyName}</span></div>}
            {submitterRes.data.departmentName && <div className="info-row"><span className="info-label">部门</span><span className="info-value">{submitterRes.data.departmentName}</span></div>}
          </div>
          {submitterRes.data.historyTickets.length > 0 && (
            <>
              <h4>历史工单</h4>
              <div className="table-scroll">
                <table>
                  <thead><tr><th>主题</th><th>状态</th><th>创建时间</th></tr></thead>
                  <tbody>{submitterRes.data.historyTickets.map(t => (
                    <tr key={t.id}><td><strong>{t.subject}</strong></td><td><StatusBadge status={t.status} /></td><td>{formatDate(t.createdAt)}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Replies */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>回复列表</h3>
        {ticket.replies.length === 0 ? <EmptyState message="暂无回复" /> : (
          <div className="stack">
            {ticket.replies.map(r => (
              <div key={r.id} className="reply-item">
                <div className="reply-header">
                  <span className="reply-author">{r.replierName}</span>
                  <span className="reply-time">{formatDate(r.createdAt)}</span>
                </div>
                <div className="reply-content">{r.content}</div>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={handleReply} className="stack" style={{ marginTop: '1rem' }}>
          <label>回复内容<textarea value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="输入回复内容" minLength={1} maxLength={5000} required /></label>
          <button type="submit" disabled={busy || !replyText.trim()}>{busy ? '发送中…' : '发送回复'}</button>
        </form>
      </div>

      {/* Evaluation */}
      {canEvaluate && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>满意度评价</h3>
          {evalRes.data ? (
            <div className="info-panel">
              <div className="info-row"><span className="info-label">评分</span><span className="info-value">{'★'.repeat(evalRes.data.rating)}{'☆'.repeat(5 - evalRes.data.rating)} ({evalRes.data.rating}/5)</span></div>
              {evalRes.data.comment && <div className="info-row"><span className="info-label">备注</span><span className="info-value">{evalRes.data.comment}</span></div>}
            </div>
          ) : (
            <EvaluationForm ticketId={ticketId!} onSubmitted={() => evalRes.reload()} />
          )}
        </div>
      )}

      {/* Operation logs */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>操作日志</h3>
        {logsRes.loading ? <Skeleton lines={3} /> : logsRes.error ? <ErrorAlert message={logsRes.error} /> : (
          logsRes.data && logsRes.data.logs.length === 0 ? <EmptyState message="暂无操作日志" /> : (
            <div className="table-scroll">
              <table>
                <thead><tr><th>操作类型</th><th>操作人</th><th>时间</th></tr></thead>
                <tbody>{logsRes.data?.logs.map(l => (
                  <tr key={l.id}>
                    <td>{l.eventType}</td>
                    <td>{l.actorName ?? '系统'}</td>
                    <td>{formatDate(l.occurredAt)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* Create ticket form (for submitters) */}
      {showCreateForm && (
        <CreateTicketForm
          categories={categoriesRes.data?.categories ?? []}
          onClose={() => setShowCreateForm(false)}
          onCreated={(id) => { setShowCreateForm(false); navigate(`/tickets/${id}`) }}
        />
      )}
    </div>
  )
}

function TransferButton({ ticketId, groups, disabled, onDone }: {
  ticketId: string; groups: BusinessGroup[]; disabled: boolean; onDone: () => void
}) {
  const { notify } = useToast()
  const [showForm, setShowForm] = useState(false)
  const [toGroupId, setToGroupId] = useState('')
  const [toHandlerId, setToHandlerId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const handleTransfer = async (e: FormEvent) => {
    e.preventDefault()
    if (!toGroupId && !toHandlerId) return
    setBusy(true); setError('')
    try {
      await api.transferTicket(ticketId, { toGroupId: toGroupId || undefined, toHandlerId: toHandlerId || undefined })
      notify('转派成功')
      setShowForm(false); setToGroupId(''); setToHandlerId('')
      onDone()
    } catch (err) { setError(err instanceof Error ? err.message : '转派失败') }
    finally { setBusy(false) }
  }

  if (!showForm) return <button className="secondary small" disabled={disabled} onClick={() => setShowForm(true)}>转派</button>
  return (
    <form onSubmit={handleTransfer} className="stack" style={{ minWidth: 300 }}>
      {error && <ErrorAlert message={error} />}
      <label>转出业务组
        <select value={toGroupId} onChange={e => setToGroupId(e.target.value)}>
          <option value="">不更换组</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </label>
      <label>转出处理人ID（可选）
        <input value={toHandlerId} onChange={e => setToHandlerId(e.target.value)} placeholder="处理人用户 ID" />
      </label>
      <div className="row-actions" style={{ flexDirection: 'row' }}>
        <button className="small" type="submit" disabled={busy || disabled || (!toGroupId && !toHandlerId)}>确认转派</button>
        <button className="secondary small" type="button" onClick={() => setShowForm(false)}>取消</button>
      </div>
    </form>
  )
}

function EvaluationForm({ ticketId, onSubmitted }: { ticketId: string; onSubmitted: () => void }) {
  const { notify } = useToast()
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await api.createEvaluation(ticketId, rating, comment || undefined)
      notify('评价成功')
      onSubmitted()
    } catch (err) { setError(err instanceof Error ? err.message : '评价失败') }
    finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="stack">
      {error && <ErrorAlert message={error} />}
      <label>满意度评分
        <div className="star-rating">
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} type="button" className={n <= rating ? 'filled' : ''} onClick={() => setRating(n)}>★</button>
          ))}
        </div>
      </label>
      <label>评价备注（可选）<textarea value={comment} onChange={e => setComment(e.target.value)} maxLength={1000} placeholder="说点什么…" /></label>
      <button type="submit" disabled={busy}>{busy ? '提交中…' : '提交评价'}</button>
    </form>
  )
}

function CreateTicketForm({ categories, onClose, onCreated }: {
  categories: Category[]; onClose: () => void; onCreated: (id: string) => void
}) {
  const { notify } = useToast()
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [slaPriority, setSlaPriority] = useState('P3')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const ticket = await api.createTicket({ subject, description, categoryId, slaPriority })
      notify('工单已创建')
      onCreated(ticket.id)
    } catch (err) { setError(err instanceof Error ? err.message : '创建失败') }
    finally { setBusy(false) }
  }

  return (
    <div className="card">
      <div className="section-heading"><h3>创建工单</h3><button className="secondary small" onClick={onClose}>关闭</button></div>
      <form onSubmit={submit} className="stack">
        {error && <ErrorAlert message={error} />}
        <label>工单主题<input value={subject} onChange={e => setSubject(e.target.value)} maxLength={500} required /></label>
        <label>工单描述<textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={5000} required /></label>
        <label>问题分类
          <select value={categoryId} onChange={e => setCategoryId(e.target.value)} required>
            <option value="">请选择分类</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>SLA 优先级
          <select value={slaPriority} onChange={e => setSlaPriority(e.target.value)}>
            {['P0', 'P1', 'P2', 'P3', 'P4'].map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <button type="submit" disabled={busy}>{busy ? '创建中…' : '创建工单'}</button>
      </form>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// Statistics Page
// ════════════════════════════════════════════════════════════════════

function StatisticsPage() {
  const [dimension, setDimension] = useState('company')
  const [companyId, setCompanyId] = useState('')
  const { notify } = useToast()

  const distRes = useAsync(() => api.getDistribution({ dimension, companyId: companyId || undefined }), [dimension, companyId])
  const dashRes = useAsync(() => api.getDashboard(companyId || undefined), [companyId])

  return (
    <div>
      <div className="section-heading"><h2>统计分析</h2></div>
      <div className="filter-bar">
        <CompanySelector value={companyId} onChange={v => setCompanyId(v)} allowAll />
        <label>统计维度
          <select value={dimension} onChange={e => setDimension(e.target.value)}>
            <option value="company">按公司</option>
            <option value="department">按部门</option>
          </select>
        </label>
      </div>

      {/* Dashboard */}
      <h3>运营仪表盘</h3>
      {dashRes.loading ? <Skeleton lines={2} /> : dashRes.error ? <ErrorAlert message={dashRes.error} /> : dashRes.data && (
        <>
          <div className="stats-grid">
            <div className="stat-card"><div className="stat-label">工单总量</div><div className="stat-value">{dashRes.data.totalTickets}</div></div>
            <div className="stat-card"><div className="stat-label">平均响应时间（小时）</div><div className="stat-value">{dashRes.data.avgResponseTimeHours.toFixed(1)}</div></div>
            <div className="stat-card"><div className="stat-label">平均满意度</div><div className="stat-value">{dashRes.data.avgSatisfaction !== null ? dashRes.data.avgSatisfaction.toFixed(1) : '—'}</div></div>
          </div>
          {dashRes.data.hotCategories.length > 0 && (
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ marginTop: 0 }}>热点问题 Top 5</h3>
              <div className="table-scroll"><table>
                <thead><tr><th>排名</th><th>分类</th><th>工单数量</th></tr></thead>
                <tbody>{dashRes.data.hotCategories.map((c, i) => (
                  <tr key={c.categoryId}><td>{i + 1}</td><td>{c.categoryName}</td><td>{c.count}</td></tr>
                ))}</tbody>
              </table></div>
            </div>
          )}
        </>
      )}

      {/* Distribution */}
      <h3>工单分布（{dimension === 'company' ? '公司' : '部门'}维度）</h3>
      {distRes.loading ? <Skeleton lines={3} /> : distRes.error ? <ErrorAlert message={distRes.error} /> : distRes.data && (
        distRes.data.items.length === 0 ? <EmptyState message="暂无分布数据" /> : (
          <div className="card">
            <div className="table-scroll"><table>
              <thead><tr><th>{dimension === 'company' ? '公司' : '部门'}</th><th>总数</th><th>已创建</th><th>待分配</th><th>待处理</th><th>已完成</th><th>已取消</th></tr></thead>
              <tbody>{distRes.data.items.map(item => (
                <tr key={item.key}>
                  <td><strong>{item.key}</strong></td>
                  <td>{item.total}</td>
                  <td>{item.byStatus.created ?? 0}</td>
                  <td>{item.byStatus.pending_assignment ?? 0}</td>
                  <td>{item.byStatus.pending_processing ?? 0}</td>
                  <td>{item.byStatus.completed ?? 0}</td>
                  <td>{item.byStatus.cancelled ?? 0}</td>
                </tr>
              ))}</tbody>
            </table></div>
          </div>
        )
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// Admin Pages
// ════════════════════════════════════════════════════════════════════

function useCompanyScope(): [string, ReactNode] {
  const user = useUser()
  const [selected, setSelected] = useState(user?.companyId ?? '')
  useEffect(() => { setSelected(user?.companyId ?? '') }, [user?.companyId])
  if (user?.companyId) return [user.companyId, null]
  return [selected, <CompanySelector value={selected} onChange={setSelected} />]
}

function CompaniesPage() {
  const { notify } = useToast()
  const [search, setSearch] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { data, loading, error: loadError, reload } = useAsync(
    () => api.listCompanies({ search, limit: 100 }),
    [search]
  )

  const create = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    try { await api.createCompany(name); notify('公司已创建'); setName(''); reload() }
    catch (err) { setError(err instanceof Error ? err.message : '创建失败') }
    finally { setBusy(false) }
  }

  return (
    <div className="admin-grid">
      <div className="section-heading"><h2>公司管理</h2></div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>创建公司</h3>
        <form onSubmit={create} className="form-grid">
          <label>公司名称<input value={name} onChange={e => setName(e.target.value)} maxLength={200} required /></label>
          <button disabled={busy || !name.trim()}>{busy ? '创建中…' : '创建'}</button>
        </form>
        {error && <ErrorAlert message={error} />}
      </div>
      <div className="card">
        <div className="section-heading"><h3>公司列表 ({data?.total ?? 0})</h3>
          <label className="search">搜索<input value={search} onChange={e => setSearch(e.target.value)} /></label>
        </div>
        {loadError && <ErrorAlert message={loadError} />}
        {loading ? <Skeleton lines={3} /> : (
          <div className="table-scroll"><table>
            <thead><tr><th>公司名称</th><th>创建时间</th></tr></thead>
            <tbody>{data?.companies.map(c => <tr key={c.id}><td><strong>{c.name}</strong></td><td>{formatDate(c.createdAt)}</td></tr>)}</tbody>
          </table></div>
        )}
      </div>
    </div>
  )
}

function DepartmentsPage() {
  const { notify } = useToast()
  const [companyId, companySelector] = useCompanyScope()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { data, loading, error: loadError, reload } = useAsync(
    () => companyId ? api.listDepartments(companyId) : Promise.resolve({ departments: [] as Department[] }),
    [companyId]
  )

  const create = async (e: FormEvent) => {
    e.preventDefault()
    if (!companyId) return
    setBusy(true); setError('')
    try { await api.createDepartment(companyId, name); notify('部门已创建'); setName(''); reload() }
    catch (err) { setError(err instanceof Error ? err.message : '创建失败') }
    finally { setBusy(false) }
  }

  return (
    <div className="admin-grid">
      <div className="section-heading"><h2>部门管理</h2></div>
      {companySelector}
      {companyId && (
        <>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>创建部门</h3>
            <form onSubmit={create} className="form-grid">
              <label>部门名称<input value={name} onChange={e => setName(e.target.value)} maxLength={200} required /></label>
              <button disabled={busy || !name.trim()}>{busy ? '创建中…' : '创建'}</button>
            </form>
            {error && <ErrorAlert message={error} />}
          </div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>部门列表</h3>
            {loadError && <ErrorAlert message={loadError} />}
            {loading ? <Skeleton lines={3} /> : data && data.departments.length === 0 ? <EmptyState message="暂无部门" /> : (
              <div className="table-scroll"><table>
                <thead><tr><th>部门名称</th><th>创建时间</th></tr></thead>
                <tbody>{data?.departments.map(d => <tr key={d.id}><td><strong>{d.name}</strong></td><td>{formatDate(d.createdAt)}</td></tr>)}</tbody>
              </table></div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function BusinessGroupsPage() {
  const { notify } = useToast()
  const [companyId, companySelector] = useCompanyScope()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [memberUserId, setMemberUserId] = useState<Record<string, string>>({})
  const { data, loading, error: loadError, reload } = useAsync(
    () => companyId ? api.listGroups(companyId) : Promise.resolve({ groups: [] as BusinessGroup[] }),
    [companyId]
  )

  const create = async (e: FormEvent) => {
    e.preventDefault()
    if (!companyId) return
    setBusy(true); setError('')
    try { await api.createGroup(companyId, name); notify('业务组已创建'); setName(''); reload() }
    catch (err) { setError(err instanceof Error ? err.message : '创建失败') }
    finally { setBusy(false) }
  }

  const removeGroup = async (id: string) => {
    try { await api.deleteGroup(id); notify('业务组已删除'); reload() }
    catch (err) { setError(err instanceof Error ? err.message : '删除失败') }
  }

  const addMember = async (groupId: string) => {
    const uid = memberUserId[groupId]?.trim()
    if (!uid) return
    try { await api.addMember(groupId, uid); notify('成员已添加'); setMemberUserId(m => ({ ...m, [groupId]: '' })); reload() }
    catch (err) { setError(err instanceof Error ? err.message : '添加失败') }
  }

  const removeMember = async (groupId: string, userId: string) => {
    try { await api.removeMember(groupId, userId); notify('成员已移除'); reload() }
    catch (err) { setError(err instanceof Error ? err.message : '移除失败') }
  }

  return (
    <div className="admin-grid">
      <div className="section-heading"><h2>业务组管理</h2></div>
      {error && <ErrorAlert message={error} />}
      {companySelector}
      {companyId && (
        <>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>创建业务组</h3>
            <form onSubmit={create} className="form-grid">
              <label>业务组名称<input value={name} onChange={e => setName(e.target.value)} maxLength={200} required /></label>
              <button disabled={busy || !name.trim()}>{busy ? '创建中…' : '创建'}</button>
            </form>
          </div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>业务组列表</h3>
            {loadError && <ErrorAlert message={loadError} />}
            {loading ? <Skeleton lines={3} /> : data && data.groups.length === 0 ? <EmptyState message="暂无业务组" /> : (
              <div className="stack">
                {data?.groups.map(g => (
                  <div key={g.id} className="card" style={{ background: 'var(--surface-alt)' }}>
                    <div className="section-heading"><h4>{g.name}</h4>
                      <button className="danger small" onClick={() => void removeGroup(g.id)}>删除</button>
                    </div>
                    <div className="table-scroll"><table>
                      <thead><tr><th>成员</th><th>邮箱</th><th>操作</th></tr></thead>
                      <tbody>{g.members.map(m => (
                        <tr key={m.userId}><td><strong>{m.name}</strong></td><td>{m.email}</td>
                          <td><button className="secondary small" onClick={() => void removeMember(g.id, m.userId)}>移除</button></td></tr>
                      ))}</tbody>
                    </table></div>
                    <div className="row-actions" style={{ flexDirection: 'row', marginTop: '0.5rem' }}>
                      <input style={{ flex: 1 }} placeholder="用户 ID" value={memberUserId[g.id] ?? ''} onChange={e => setMemberUserId(m => ({ ...m, [g.id]: e.target.value }))} />
                      <button className="secondary small" onClick={() => void addMember(g.id)}>添加成员</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function CategoriesPage() {
  const { notify } = useToast()
  const [companyId, companySelector] = useCompanyScope()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { data, loading, error: loadError, reload } = useAsync(
    () => companyId ? api.listCategories(companyId) : Promise.resolve({ categories: [] as Category[] }),
    [companyId]
  )

  const create = async (e: FormEvent) => {
    e.preventDefault()
    if (!companyId) return
    setBusy(true); setError('')
    try { await api.createCategory(companyId, name); notify('分类已创建'); setName(''); reload() }
    catch (err) { setError(err instanceof Error ? err.message : '创建失败') }
    finally { setBusy(false) }
  }

  const remove = async (id: string) => {
    try { await api.deleteCategory(id); notify('分类已删除'); reload() }
    catch (err) { setError(err instanceof Error ? err.message : '删除失败') }
  }

  return (
    <div className="admin-grid">
      <div className="section-heading"><h2>分类管理</h2></div>
      {error && <ErrorAlert message={error} />}
      {companySelector}
      {companyId && (
        <>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>创建分类</h3>
            <form onSubmit={create} className="form-grid">
              <label>分类名称<input value={name} onChange={e => setName(e.target.value)} maxLength={200} required /></label>
              <button disabled={busy || !name.trim()}>{busy ? '创建中…' : '创建'}</button>
            </form>
          </div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>分类列表</h3>
            {loadError && <ErrorAlert message={loadError} />}
            {loading ? <Skeleton lines={3} /> : data && data.categories.length === 0 ? <EmptyState message="暂无分类" /> : (
              <div className="table-scroll"><table>
                <thead><tr><th>分类名称</th><th>创建时间</th><th>操作</th></tr></thead>
                <tbody>{data?.categories.map(c => (
                  <tr key={c.id}><td><strong>{c.name}</strong></td><td>{formatDate(c.createdAt)}</td>
                    <td><button className="danger small" onClick={() => void remove(c.id)}>删除</button></td></tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function AssignmentRulesPage() {
  const { notify } = useToast()
  const [companyId, companySelector] = useCompanyScope()
  const [categoryId, setCategoryId] = useState('')
  const [groupId, setGroupId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { data: rulesData, loading: rulesLoading, error: rulesError, reload } = useAsync(
    () => companyId ? api.listRules(companyId) : Promise.resolve({ rules: [] as AssignmentRule[] }),
    [companyId]
  )
  const { data: catsData } = useAsync(
    () => companyId ? api.listCategories(companyId) : Promise.resolve({ categories: [] as Category[] }),
    [companyId]
  )
  const { data: groupsData } = useAsync(
    () => companyId ? api.listGroups(companyId) : Promise.resolve({ groups: [] as BusinessGroup[] }),
    [companyId]
  )

  const create = async (e: FormEvent) => {
    e.preventDefault()
    if (!companyId) return
    setBusy(true); setError('')
    try { await api.createRule(companyId, categoryId, groupId); notify('规则已创建'); setCategoryId(''); setGroupId(''); reload() }
    catch (err) { setError(err instanceof Error ? err.message : '创建失败') }
    finally { setBusy(false) }
  }

  const remove = async (id: string) => {
    try { await api.deleteRule(id); notify('规则已删除'); reload() }
    catch (err) { setError(err instanceof Error ? err.message : '删除失败') }
  }

  return (
    <div className="admin-grid">
      <div className="section-heading"><h2>分配规则管理</h2></div>
      {error && <ErrorAlert message={error} />}
      {companySelector}
      {companyId && (
        <>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>创建分配规则</h3>
            <form onSubmit={create} className="form-grid">
              <label>分类
                <select value={categoryId} onChange={e => setCategoryId(e.target.value)} required>
                  <option value="">请选择分类</option>
                  {catsData?.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label>目标业务组
                <select value={groupId} onChange={e => setGroupId(e.target.value)} required>
                  <option value="">请选择业务组</option>
                  {groupsData?.groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </label>
              <button disabled={busy || !categoryId || !groupId}>{busy ? '创建中…' : '创建'}</button>
            </form>
          </div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>规则列表</h3>
            {rulesError && <ErrorAlert message={rulesError} />}
            {rulesLoading ? <Skeleton lines={3} /> : rulesData && rulesData.rules.length === 0 ? <EmptyState message="暂无分配规则" /> : (
              <div className="table-scroll"><table>
                <thead><tr><th>分类</th><th>业务组</th><th>创建时间</th><th>操作</th></tr></thead>
                <tbody>{rulesData?.rules.map(r => (
                  <tr key={r.id}><td><strong>{r.categoryName}</strong></td><td>{r.groupName}</td><td>{formatDate(r.createdAt)}</td>
                    <td><button className="danger small" onClick={() => void remove(r.id)}>删除</button></td></tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// App Shell
// ════════════════════════════════════════════════════════════════════

function Sidebar() {
  const navItems: { to: string; label: string; section?: string }[] = [
    { to: '/workbench', label: '工单工作台', section: '工单' },
    { to: '/tickets', label: '工单管理', section: '工单' },
    { to: '/stats', label: '统计分析', section: '统计' },
    { to: '/admin/groups', label: '业务组管理', section: '管理后台' },
    { to: '/admin/categories', label: '分类管理', section: '管理后台' },
    { to: '/admin/rules', label: '分配规则管理', section: '管理后台' },
    { to: '/admin/companies', label: '公司管理', section: '管理后台' },
    { to: '/admin/departments', label: '部门管理', section: '管理后台' },
    { to: '/admin/users', label: '用户管理', section: '管理后台' },
  ]
  let lastSection = ''
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">工单系统</div>
      <nav>
        {navItems.map(item => {
          const showSection = item.section !== lastSection
          lastSection = item.section ?? ''
          return (
            <div key={item.to}>
              {showSection && item.section && <div className="sidebar-section">{item.section}</div>}
              <NavLink to={item.to} className={({ isActive }) => isActive ? 'active' : ''}>{item.label}</NavLink>
            </div>
          )
        })}
      </nav>
    </aside>
  )
}

function AppShell({ user, onSignOut, children }: { user: CurrentUser; onSignOut: () => void; children: ReactNode }) {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-area">
        <header className="topbar">
          <div className="user-info" title={user.email}>{user.name} · {user.email} · {user.roles.join(', ')}</div>
          <button className="secondary small" onClick={onSignOut}>退出</button>
        </header>
        <main className="content-area">{children}</main>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// Auth Screens (preserved from original App.tsx)
// ════════════════════════════════════════════════════════════════════

type BootstrapState = 'checking' | 'required' | 'login' | 'authenticated'

function AuthScreen({ state, error, busy, onSubmit }: {
  state: 'required' | 'login'
  error: string
  busy: boolean
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <main className="shell auth-shell">
      <section className="card auth-card">
        <h1>{state === 'required' ? '创建首个账户' : '登录'}</h1>
        <p>{state === 'required' ? '仅在没有用户时可执行一次。' : '使用本地账户登录。'}</p>
        <form onSubmit={onSubmit} className="stack">
          {state === 'required' && <label>姓名<input name="name" autoComplete="name" required maxLength={200} /></label>}
          <label>邮箱<input name="email" type="email" autoComplete="email" required maxLength={320} /></label>
          <label>密码<input name="password" type="password" autoComplete={state === 'required' ? 'new-password' : 'current-password'} required minLength={state === 'required' ? 12 : 1} /></label>
          {error && <p role="alert" className="error">{error}</p>}
          <button disabled={busy}>{busy ? '处理中…' : state === 'required' ? '创建账户' : '登录'}</button>
        </form>
      </section>
    </main>
  )
}

function PasswordChangeScreen({ error, busy, onSubmit }: {
  error: string; busy: boolean; onSubmit: (e: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <main className="shell auth-shell">
      <section className="card auth-card">
        <h1>更改临时密码</h1>
        <p>继续使用前请设置新密码。</p>
        <form onSubmit={onSubmit} className="stack">
          <label>新密码<input name="password" type="password" autoComplete="new-password" minLength={12} required /></label>
          {error && <p role="alert" className="error">{error}</p>}
          <button disabled={busy}>更新密码</button>
        </form>
      </section>
    </main>
  )
}

// ════════════════════════════════════════════════════════════════════
// Main App Component
// ════════════════════════════════════════════════════════════════════

export default function App() {
  const [state, setState] = useState<BootstrapState>('checking')
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    const token = localStorage.getItem('platform-token')
    if (token) {
      try {
        setUser(await api.me())
        setState('authenticated')
        return
      } catch {
        localStorage.removeItem('platform-token')
      }
    }
    const status = await api.bootstrapStatus()
    setState(status.required ? 'required' : 'login')
  }, [])

  useEffect(() => { void refresh().catch(() => setError('无法连接服务')) }, [refresh])

  const submitIdentity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true); setError('')
    const body = Object.fromEntries(new FormData(event.currentTarget).entries())
    try {
      if (state === 'required') {
        await api.bootstrap(JSON.stringify(body))
        setState('login')
        setError('账户已创建，请登录。')
      } else {
        const result = await api.login(JSON.stringify(body))
        localStorage.setItem('platform-token', result.token)
        setUser(result.user)
        setState('authenticated')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作失败')
    } finally {
      setBusy(false)
    }
  }

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true); setError('')
    const body = Object.fromEntries(new FormData(event.currentTarget).entries())
    try {
      await api.changePassword(JSON.stringify(body))
      setUser(user ? { ...user, passwordChangeRequired: false } : user)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '更新密码失败')
    } finally {
      setBusy(false)
    }
  }

  const signOut = () => {
    localStorage.removeItem('platform-token')
    setUser(null)
    setState('login')
  }

  if (state === 'checking') return <main className="shell"><p>加载中…</p></main>
  if (state === 'required' || state === 'login') return <AuthScreen state={state} error={error} busy={busy} onSubmit={submitIdentity} />
  if (!user) return null
  if (user.passwordChangeRequired) return <PasswordChangeScreen error={error} busy={busy} onSubmit={changePassword} />

  return (
    <UserContext.Provider value={user}>
      <ToastProvider>
        <BrowserRouter>
          <AppShell user={user} onSignOut={signOut}>
            <Routes>
              <Route path="/workbench" element={<WorkbenchPage />} />
              <Route path="/tickets" element={<TicketManagementPage />}>
                <Route index element={<DetailPlaceholder />} />
                <Route path=":ticketId" element={<TicketDetailPage />} />
              </Route>
              <Route path="/stats" element={<StatisticsPage />} />
              <Route path="/admin/companies" element={<CompaniesPage />} />
              <Route path="/admin/departments" element={<DepartmentsPage />} />
              <Route path="/admin/groups" element={<BusinessGroupsPage />} />
              <Route path="/admin/categories" element={<CategoriesPage />} />
              <Route path="/admin/rules" element={<AssignmentRulesPage />} />
              <Route path="/admin/users" element={<UsersPage />} />
              <Route path="*" element={<Navigate to="/workbench" replace />} />
            </Routes>
          </AppShell>
        </BrowserRouter>
      </ToastProvider>
    </UserContext.Provider>
  )
}
