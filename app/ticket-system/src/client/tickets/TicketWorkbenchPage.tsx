import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { describeError } from '../platform/api-client'
import { EmptyState, ErrorState, LoadingState, Notice } from '../platform/states'
import { Pagination } from '../platform/Pagination'
import { listGroups, listTickets } from './api'
import { formatDateTime, label, priorityBadgeClass, statusBadgeClass, statusLabels } from './labels'
import { TicketDetailPanel } from './TicketDetailPanel'
import { PERMISSIONS, type BusinessGroupSummary, type MeContext, type Page, type TicketSummary } from '../../shared/contracts'

const priorityOptions = ['P0', 'P1', 'P2', 'P3', 'P4']
const statusOptions = ['', 'pending_processing', 'pending_assignment', 'created', 'completed', 'cancelled']
const sortOptions = [
  { value: '-created_at', text: '创建时间（新→旧）/ Newest first' },
  { value: 'created_at', text: '创建时间（旧→新）/ Oldest first' },
  { value: '-priority', text: '优先级（高→低）/ Priority high→low' },
  { value: 'priority', text: '优先级（低→高）/ Priority low→high' },
  { value: 'ticket_no', text: '工单编号（升）/ Ticket no. ascending' },
  { value: '-ticket_no', text: '工单编号（降）/ Ticket no. descending' },
]

// 工单工作台：左侧待处理队列（默认仅展示状态 pending_processing），右侧当前工单详情。
export default function TicketWorkbenchPage({ context }: { context: MeContext }) {
  const navigate = useNavigate()
  const [filters, setFilters] = useState({
    status: 'pending_processing',
    q: '',
    category: '',
    priority: '',
    groupId: '',
    assigneeMemberId: '',
    companyId: '',
    sort: '-created_at',
    page: 1,
    pageSize: 20,
  })
  const [search, setSearch] = useState('')
  const [categoryInput, setCategoryInput] = useState('')
  const [data, setData] = useState<Page<TicketSummary> | null>(null)
  const [groups, setGroups] = useState<BusinessGroupSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const canReadGroups = context.permissions.includes(PERMISSIONS.ORG_READ)
  const canCreate = context.permissions.includes(PERMISSIONS.TICKET_CREATE)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await listTickets({
        status: filters.status || undefined,
        category: filters.category || undefined,
        priority: filters.priority || undefined,
        groupId: filters.groupId || undefined,
        assigneeMemberId: filters.assigneeMemberId || undefined,
        companyId: filters.companyId || undefined,
        q: filters.q || undefined,
        sort: filters.sort || undefined,
        page: filters.page,
        pageSize: filters.pageSize,
      })
      setData(result)
    } catch (cause) {
      setError(describeError(cause, '无法加载工单列表 / Could not load tickets'))
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { void load() }, [load, refreshKey])

  useEffect(() => {
    if (!canReadGroups) return
    let cancelled = false
    void listGroups().then((result) => { if (!cancelled) setGroups(result.items) }).catch(() => undefined)
    return () => { cancelled = true }
  }, [canReadGroups])

  useEffect(() => {
    const timer = setTimeout(() => setFilters((current) => (current.q === search ? current : { ...current, q: search, page: 1 })), 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    const timer = setTimeout(() => setFilters((current) => (current.category === categoryInput ? current : { ...current, category: categoryInput, page: 1 })), 300)
    return () => clearTimeout(timer)
  }, [categoryInput])

  useEffect(() => {
    if (selectedId !== null || !data) return
    setSelectedId(data.items[0]?.id ?? null)
  }, [data, selectedId])

  const items = data?.items ?? []

  return (
    <div className="page">
      <div className="section-heading">
        <h1>工单工作台 / Workbench</h1>
        <span className="subtext">范围：{context.companyName}</span>
      </div>

      <section className="panel">
        <div className="filters">
          <label>关键字搜索 / Keyword
            <input type="search" value={search} onChange={(event) => setSearch(event.currentTarget.value)} placeholder="工单编号、主题、描述、提交人" />
          </label>
          <label>分类 / Category
            <input value={categoryInput} onChange={(event) => setCategoryInput(event.currentTarget.value)} maxLength={50} />
          </label>
          <label>优先级 / Priority
            <select value={filters.priority} onChange={(event) => setFilters({ ...filters, priority: event.currentTarget.value, page: 1 })}>
              <option value="">全部 / All</option>
              {priorityOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>状态 / Status
            <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.currentTarget.value, page: 1 })}>
              {statusOptions.map((item) => <option key={item || 'all'} value={item}>{item === '' ? '全部 / All' : label(statusLabels, item)}</option>)}
            </select>
          </label>
          {canReadGroups && (
            <label>业务组 / Group
              <select value={filters.groupId} onChange={(event) => setFilters({ ...filters, groupId: event.currentTarget.value, page: 1 })}>
                <option value="">全部 / All</option>
                {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </label>
          )}
          <label>处理人 / Assignee
            <select value={filters.assigneeMemberId} onChange={(event) => setFilters({ ...filters, assigneeMemberId: event.currentTarget.value, page: 1 })}>
              <option value="">全部 / All</option>
              <option value="me">我的待办 / Assigned to me</option>
            </select>
          </label>
          <label>公司 / Company
            <select value={filters.companyId} onChange={(event) => setFilters({ ...filters, companyId: event.currentTarget.value, page: 1 })}>
              <option value="">全部 / All</option>
              <option value={context.companyId}>{context.companyName}</option>
            </select>
          </label>
          <label>排序 / Sort
            <select value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.currentTarget.value, page: 1 })}>
              {sortOptions.map((item) => <option key={item.value} value={item.value}>{item.text}</option>)}
            </select>
          </label>
          <label>每页 / Page size
            <select value={filters.pageSize} onChange={(event) => setFilters({ ...filters, pageSize: Number(event.currentTarget.value), page: 1 })}>
              {[20, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
          <div className="filter-actions">
            <button className="secondary" onClick={() => { setSearch(''); setCategoryInput(''); setFilters({ ...filters, q: '', category: '', priority: '', groupId: '', assigneeMemberId: '', companyId: '', status: 'pending_processing', sort: '-created_at', page: 1 }) }}>重置 / Reset</button>
          </div>
        </div>
      </section>

      <Notice kind="success" text={notice} />

      <div className="split">
        <section className="panel queue">
          <div className="section-heading">
            <h2>待处理队列 / Queue ({data?.total ?? 0})</h2>
            <button className="secondary" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>刷新 / Refresh</button>
          </div>
          {loading && <LoadingState />}
          {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}
          {!loading && !error && items.length === 0 && (
            <EmptyState
              message={filters.status === 'pending_processing' ? '当前范围内没有待处理工单。/ No pending tickets in this scope.' : '当前筛选条件下没有工单。/ No tickets match the filters.'}
              hint="可调整筛选条件，或查看其他状态的工作队列。"
              action={(
                <div className="row-actions row-actions--inline">
                  {filters.status !== 'pending_assignment' && <button className="secondary" onClick={() => setFilters({ ...filters, status: 'pending_assignment', page: 1 })}>查看待分配 / View unassigned</button>}
                  {canCreate && <button onClick={() => navigate('/my-tickets')}>新建工单 / New ticket</button>}
                </div>
              )}
            />
          )}
          {!loading && !error && items.length > 0 && (
            <>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr><th>工单编号</th><th>主题</th><th>分类</th><th>优先级</th><th>状态</th><th>提交人</th><th>业务组</th><th>处理人</th><th>创建时间</th></tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className={item.id === selectedId ? 'is-selected' : undefined} onClick={() => setSelectedId(item.id)}>
                        <td>{item.ticketNo}</td>
                        <td><strong title={item.subject}>{item.subject}</strong></td>
                        <td>{item.category}</td>
                        <td><span className={priorityBadgeClass(item.priority)}>{item.priority}</span></td>
                        <td><span className={statusBadgeClass(item.status)}>{label(statusLabels, item.status)}</span></td>
                        <td>{item.submitterName}</td>
                        <td>{item.groupName ?? '—'}</td>
                        <td>{item.assigneeName ?? '—'}</td>
                        <td>{formatDateTime(item.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={data?.page ?? 1} pageSize={filters.pageSize} total={data?.total ?? 0} onPage={(page) => setFilters({ ...filters, page })} />
            </>
          )}
        </section>

        <section className="panel detail-panel">
          {selectedId
            ? (
              <TicketDetailPanel
                ticketId={selectedId}
                context={context}
                onSelectTicket={(id) => setSelectedId(id)}
                onChanged={() => { setRefreshKey((value) => value + 1); setNotice('已更新为服务端返回的最新状态 / Refreshed with the latest server state') }}
              />
            )
            : <EmptyState message="从左侧队列选择一张工单查看详情。/ Select a ticket from the queue." />}
        </section>
      </div>
    </div>
  )
}
