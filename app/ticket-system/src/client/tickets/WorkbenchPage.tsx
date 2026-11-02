import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { readList } from '../platform/api-client'
import { useApiResource } from '../platform/use-api'
import { useSession } from '../platform/session'
import { EmptyState, ErrorNotice, LoadingBlock, Pagination, PriorityBadge, StatusBadge } from '../components/Feedback'
import { formatDateTime } from '../tickets/format'
import TicketDetailPanel from '../tickets/TicketDetailPanel'
import type { BusinessGroup, Category, Company, Department, TicketListItem } from '../tickets/types'
import { priorities, statuses, statusLabels, priorityLabels } from '../tickets/types'

type ListResponse<T> = T[] | { items: T[] }
type TicketListResponse = { items: TicketListItem[]; total: number }

type Filters = {
  q: string
  status: string
  priority: string
  categoryId: string
  groupId: string
  companyId: string
  departmentId: string
  sort: string
}

const emptyFilters: Filters = { q: '', status: '', priority: '', categoryId: '', groupId: '', companyId: '', departmentId: '', sort: 'createdAt_desc' }
const pageSize = 20

const sortOptions = [
  { value: 'createdAt_desc', label: '创建时间（新 → 旧）' },
  { value: 'createdAt_asc', label: '创建时间（旧 → 新）' },
  { value: 'priority_desc', label: '优先级（高 → 低）' },
  { value: 'priority_asc', label: '优先级（低 → 高）' },
]

export default function WorkbenchPage() {
  const user = useSession()
  const { ticketId } = useParams()
  const navigate = useNavigate()
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [page, setPage] = useState(1)

  const isOps = user.role === 'ops'
  const categories = useApiResource<ListResponse<Category>>('/api/categories')
  const groups = useApiResource<ListResponse<BusinessGroup>>('/api/groups')
  const companies = useApiResource<ListResponse<Company>>(isOps ? '/api/meta/companies' : null)
  const departmentCompanyId = isOps ? filters.companyId : user.companyId
  const departments = useApiResource<ListResponse<Department>>(departmentCompanyId ? `/api/meta/departments?companyId=${encodeURIComponent(departmentCompanyId)}` : null)

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort: filters.sort || 'createdAt_desc' })
    if (filters.q.trim()) params.set('q', filters.q.trim())
    if (filters.status) params.set('status', filters.status)
    if (filters.priority) params.set('priority', filters.priority)
    if (filters.categoryId) params.set('categoryId', filters.categoryId)
    if (filters.groupId) params.set('groupId', filters.groupId)
    if (isOps && filters.companyId) params.set('companyId', filters.companyId)
    if (filters.departmentId) params.set('departmentId', filters.departmentId)
    return params.toString()
  }, [filters, page, isOps])

  const list = useApiResource<TicketListResponse>(`/api/tickets?${query}`)

  const update = (patch: Partial<Filters>) => {
    setFilters((current) => ({ ...current, ...patch, ...(patch.companyId !== undefined ? { departmentId: '' } : {}) }))
    setPage(1)
  }

  const reset = () => {
    setFilters(emptyFilters)
    setPage(1)
  }

  const hasFilters = Boolean(filters.q || filters.status || filters.priority || filters.categoryId || filters.groupId || filters.companyId || filters.departmentId || filters.sort !== 'createdAt_desc')

  return (
    <div className="page workbench-page">
      <header className="page-header">
        <div>
          <h1>工单工作台</h1>
          <p className="page-hint">按可见范围汇总工单，选择左侧工单即可在右侧查看详情与协作记录。</p>
        </div>
        <div className="row-actions">
          <button type="button" className="secondary" disabled={list.loading} onClick={list.reload}>刷新</button>
        </div>
      </header>

      <section className="filter-bar card" aria-label="工单筛选">
        <label className="filter-search">搜索主题或工单 ID
          <input
            type="search"
            value={filters.q}
            onChange={(event) => update({ q: event.currentTarget.value })}
            placeholder="例如：TK-000001 或 登录"
          />
        </label>
        <label>状态
          <select value={filters.status} onChange={(event) => update({ status: event.currentTarget.value })}>
            <option value="">全部状态</option>
            {statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
          </select>
        </label>
        <label>优先级
          <select value={filters.priority} onChange={(event) => update({ priority: event.currentTarget.value })}>
            <option value="">全部优先级</option>
            {priorities.map((priority) => <option key={priority} value={priority}>{priorityLabels[priority]}</option>)}
          </select>
        </label>
        <label>问题分类
          <select value={filters.categoryId} onChange={(event) => update({ categoryId: event.currentTarget.value })}>
            <option value="">全部分类</option>
            {readList(categories.data).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </label>
        <label>业务组
          <select value={filters.groupId} onChange={(event) => update({ groupId: event.currentTarget.value })}>
            <option value="">全部业务组</option>
            {readList(groups.data).map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
        </label>
        {isOps && (
          <label>公司
            <select value={filters.companyId} onChange={(event) => update({ companyId: event.currentTarget.value })}>
              <option value="">全部公司</option>
              {readList(companies.data).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </label>
        )}
        <label>部门
          <select value={filters.departmentId} onChange={(event) => update({ departmentId: event.currentTarget.value })} disabled={!departmentCompanyId}>
            <option value="">{departmentCompanyId ? '全部部门' : '请先选择公司'}</option>
            {readList(departments.data).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
          </select>
        </label>
        <label>排序
          <select value={filters.sort} onChange={(event) => update({ sort: event.currentTarget.value })}>
            {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <button type="button" className="secondary filter-reset" onClick={reset} disabled={!hasFilters}>重置筛选</button>
      </section>

      <div className="workbench-layout">
        <section className="master-panel card" aria-label="工单列表">
          {list.error ? <ErrorNotice error={list.error} title="工单列表加载失败" onRetry={list.reload} /> : null}
          {list.loading && !list.data
            ? <LoadingBlock label="正在加载工单列表…" rows={6} />
            : !list.data || list.data.items.length === 0
              ? <EmptyState title="没有匹配的工单" hint={hasFilters ? '调整筛选条件或清空搜索后重试。' : '当前可见范围内暂无工单。'} />
              : <>
                <div className="table-scroll">
                  <table className="ticket-table master-table">
                    <thead>
                      <tr>
                        <th>工单 ID</th>
                        <th>主题</th>
                        <th>分类</th>
                        <th>优先级</th>
                        <th>状态</th>
                        <th>公司</th>
                        <th>部门</th>
                        <th>提交人</th>
                        <th>处理人</th>
                        <th>创建时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.data.items.map((ticket) => (
                        <tr key={ticket.id} className={ticket.id === ticketId ? 'selected' : ''}>
                          <td className="mono sticky-col"><Link to={`/workbench/${encodeURIComponent(ticket.id)}`}>{ticket.id}</Link></td>
                          <td className="clip" title={ticket.title}><Link to={`/workbench/${encodeURIComponent(ticket.id)}`}>{ticket.title}</Link></td>
                          <td>{ticket.categoryName}</td>
                          <td><PriorityBadge priority={ticket.priority} /></td>
                          <td><StatusBadge status={ticket.status} /></td>
                          <td>{ticket.companyName}</td>
                          <td>{ticket.departmentName}</td>
                          <td>{ticket.submitterName}</td>
                          <td>{ticket.assigneeName ?? '—'}</td>
                          <td className="nowrap">{formatDateTime(ticket.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination page={page} pageSize={pageSize} total={list.data.total} onChange={setPage} />
              </>}
        </section>

        <aside className="detail-pane card" aria-label="工单详情">
          {ticketId
            ? <TicketDetailPanel key={ticketId} ticketId={ticketId} currentUser={user} onClose={() => navigate('/workbench')} onChanged={list.reload} />
            : <EmptyState title="选择一张工单" hint="从左侧列表选择工单，查看信息、回复记录、通知与工单日志。" />}
        </aside>
      </div>
    </div>
  )
}
