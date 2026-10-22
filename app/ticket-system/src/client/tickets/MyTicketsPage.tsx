import { useCallback, useEffect, useState } from 'react'
import { describeError } from '../platform/api-client'
import { EmptyState, ErrorState, LoadingState, Notice } from '../platform/states'
import { Pagination } from '../platform/Pagination'
import { listTickets } from './api'
import { CreateTicketForm } from './CreateTicketForm'
import { formatDateTime, label, priorityBadgeClass, statusBadgeClass, statusLabels } from './labels'
import { TicketDetailPanel } from './TicketDetailPanel'
import { PERMISSIONS, type MeContext, type Page, type TicketSummary } from '../../shared/contracts'

const statusOptions = ['', 'created', 'pending_assignment', 'pending_processing', 'completed', 'cancelled']

// 我的工单：提交人查看本人工单、回复、取消，并在完成后提交满意度评价。
export default function MyTicketsPage({ context }: { context: MeContext }) {
  const [filters, setFilters] = useState({ status: '', q: '', sort: '-created_at', page: 1, pageSize: 20 })
  const [search, setSearch] = useState('')
  const [data, setData] = useState<Page<TicketSummary> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [creating, setCreating] = useState(false)
  const canCreate = context.permissions.includes(PERMISSIONS.TICKET_CREATE)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await listTickets({
        status: filters.status || undefined,
        q: filters.q || undefined,
        sort: filters.sort || undefined,
        page: filters.page,
        pageSize: filters.pageSize,
      })
      setData(result)
    } catch (cause) {
      setError(describeError(cause, '无法加载我的工单 / Could not load my tickets'))
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { void load() }, [load, refreshKey])

  useEffect(() => {
    const timer = setTimeout(() => setFilters((current) => (current.q === search ? current : { ...current, q: search, page: 1 })), 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (selectedId !== null || !data) return
    setSelectedId(data.items[0]?.id ?? null)
  }, [data, selectedId])

  const items = data?.items ?? []

  return (
    <div className="page">
      <div className="section-heading">
        <h1>我的工单 / My tickets</h1>
        <div className="row-actions row-actions--inline">
          {canCreate && <button onClick={() => setCreating((value) => !value)}>{creating ? '收起新建 / Close' : '新建工单 / New ticket'}</button>}
        </div>
      </div>

      {canCreate && (
        <CreateTicketForm
          open={creating}
          onToggle={() => setCreating(false)}
          onCreated={(ticket) => {
            setCreating(false)
            setNotice(`工单 ${ticket.ticketNo} 已创建 / Ticket created`)
            setSelectedId(ticket.id)
            setRefreshKey((value) => value + 1)
          }}
        />
      )}

      <Notice kind="success" text={notice} />

      <section className="panel">
        <div className="filters">
          <label>关键字搜索 / Keyword
            <input type="search" value={search} onChange={(event) => setSearch(event.currentTarget.value)} placeholder="工单编号、主题、描述、提交人" />
          </label>
          <label>状态 / Status
            <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.currentTarget.value, page: 1 })}>
              {statusOptions.map((item) => <option key={item || 'all'} value={item}>{item === '' ? '全部 / All' : label(statusLabels, item)}</option>)}
            </select>
          </label>
          <label>排序 / Sort
            <select value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.currentTarget.value, page: 1 })}>
              <option value="-created_at">创建时间（新→旧）/ Newest first</option>
              <option value="created_at">创建时间（旧→新）/ Oldest first</option>
            </select>
          </label>
          <div className="filter-actions">
            <button className="secondary" onClick={() => { setSearch(''); setFilters({ ...filters, q: '', status: '', page: 1 }) }}>重置 / Reset</button>
          </div>
        </div>
      </section>

      <div className="split">
        <section className="panel queue">
          <div className="section-heading">
            <h2>工单列表 / Tickets ({data?.total ?? 0})</h2>
            <button className="secondary" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>刷新 / Refresh</button>
          </div>
          {loading && <LoadingState />}
          {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}
          {!loading && !error && items.length === 0 && (
            <EmptyState
              message="当前范围内没有工单。/ No tickets in this scope."
              hint="提交一张工单开始跟踪处理进度。"
              action={canCreate ? <button onClick={() => setCreating(true)}>新建工单 / New ticket</button> : undefined}
            />
          )}
          {!loading && !error && items.length > 0 && (
            <>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr><th>工单编号</th><th>主题</th><th>分类</th><th>优先级</th><th>状态</th><th>创建时间</th><th>完成时间</th></tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className={item.id === selectedId ? 'is-selected' : undefined} onClick={() => setSelectedId(item.id)}>
                        <td>{item.ticketNo}</td>
                        <td><strong title={item.subject}>{item.subject}</strong></td>
                        <td>{item.category}</td>
                        <td><span className={priorityBadgeClass(item.priority)}>{item.priority}</span></td>
                        <td><span className={statusBadgeClass(item.status)}>{label(statusLabels, item.status)}</span></td>
                        <td>{formatDateTime(item.createdAt)}</td>
                        <td>{formatDateTime(item.completedAt)}</td>
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
            : <EmptyState message="从左侧列表选择一张工单查看详情。/ Select a ticket from the list." />}
        </section>
      </div>
    </div>
  )
}
