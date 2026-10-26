import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest, buildQuery, type Paginated } from '../platform/api-client'
import { useAsync } from '../hooks/useAsync'
import { Skeleton, EmptyState, ErrorState } from '../components/StateViews'
import { Pagination } from '../components/Pagination'
import { StatusBadge, PriorityBadge } from '../components/Badge'
import { STATUS_LABELS, TICKET_STATUSES, type Priority, type Ticket, type TicketStatus } from '../types/ticket'

const WORKBENCH_STATUSES: TicketStatus[] = ['pending_processing', 'pending_assignment']
const SORTS = ['priority', 'created_at'] as const
const ORDERS = ['desc', 'asc'] as const

// 工单工作台：split-master-detail 布局，左侧待处理工单队列，右侧选中工单摘要。
export default function WorkbenchPage() {
  const [status, setStatus] = useState<TicketStatus>('pending_processing')
  const [category, setCategory] = useState('')
  const [priority, setPriority] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<(typeof SORTS)[number]>('priority')
  const [order, setOrder] = useState<(typeof ORDERS)[number]>('desc')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const query = buildQuery({ status, category, priority, search, sort, order, page, limit: 20 })
  const { data, loading, error, reload } = useAsync<Paginated<Ticket>>(
    () => apiRequest(`/api/workbench/tickets${query}`),
    [query],
  )

  const tickets = data?.data ?? []
  const selected = selectedId ? tickets.find((t) => t.id === selectedId) ?? null : null

  const resetPage = useCallback(() => setPage(1), [])

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <section className="card">
        <div className="section-heading">
          <h2>待处理工单 ({data?.pagination.total ?? 0})</h2>
        </div>
        <form className="form-grid" onSubmit={(e) => { e.preventDefault(); resetPage(); void reload() }}>
          <label>状态
            <select value={status} onChange={(e) => { setStatus(e.currentTarget.value as TicketStatus); resetPage() }}>
              {WORKBENCH_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </label>
          <label>分类<input value={category} onChange={(e) => { setCategory(e.currentTarget.value); resetPage() }} /></label>
          <label>优先级
            <select value={priority} onChange={(e) => { setPriority(e.currentTarget.value); resetPage() }}>
              <option value="">全部</option>
              {(['P0','P1','P2','P3','P4'] as Priority[]).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label>搜索<input value={search} onChange={(e) => { setSearch(e.currentTarget.value); resetPage() }} /></label>
          <label>排序
            <select value={sort} onChange={(e) => setSort(e.currentTarget.value as (typeof SORTS)[number])}>
              <option value="priority">优先级</option>
              <option value="created_at">创建时间</option>
            </select>
          </label>
          <label>方向
            <select value={order} onChange={(e) => setOrder(e.currentTarget.value as (typeof ORDERS)[number])}>
              <option value="desc">降序</option>
              <option value="asc">升序</option>
            </select>
          </label>
        </form>

        <div className="mt-4">
          {loading && <Skeleton lines={4} />}
          {error && <ErrorState message={error} onRetry={reload} />}
          {!loading && !error && tickets.length === 0 && (
            <EmptyState title="暂无待处理工单" hint="调整筛选条件或等待新工单分配。" />
          )}
          {!loading && !error && tickets.length > 0 && (
            <ul className="flex flex-col gap-1">
              {tickets.map((ticket) => (
                <li key={ticket.id}>
                  <button
                    className={`w-full rounded-md border px-3 py-2 text-left ${selectedId === ticket.id ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border)] hover:bg-[var(--border)]'}`}
                    onClick={() => setSelectedId(ticket.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <strong className="truncate">{ticket.subject}</strong>
                      <PriorityBadge priority={ticket.priority} />
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-[var(--muted)]">
                      <StatusBadge status={ticket.status} />
                      <span>{ticket.category}</span>
                      <span>{new Date(ticket.created_at).toLocaleString()}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {data && data.pagination.total > data.pagination.limit && (
            <Pagination pagination={data.pagination} onPage={setPage} />
          )}
        </div>
      </section>

      <section className="card">
        <div className="section-heading"><h2>工单详情</h2></div>
        {selected ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <StatusBadge status={selected.status} />
              <PriorityBadge priority={selected.priority} />
            </div>
            <h3 className="text-lg font-semibold">{selected.subject}</h3>
            <p className="text-sm whitespace-pre-wrap text-[var(--muted)]">{selected.description}</p>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div><dt className="text-[var(--muted)]">分类</dt><dd>{selected.category}</dd></div>
              <div><dt className="text-[var(--muted)]">创建时间</dt><dd>{new Date(selected.created_at).toLocaleString()}</dd></div>
            </dl>
            <div className="flex gap-2">
              <Link to={`/tickets/${encodeURIComponent(selected.id)}`}>
                <button>查看完整详情</button>
              </Link>
            </div>
          </div>
        ) : (
          <EmptyState title="选择左侧工单查看详情" hint="点击工单卡片即可在此处查看摘要。" />
        )}
      </section>
    </div>
  )
}

// 报错分类辅助，供其他页面引用同样约定。
export const ALL_STATUSES = TICKET_STATUSES
