import { useEffect, useMemo, useState } from 'react'
import { ticketApi } from '../platform/api-client'
import { useAsync } from '../platform/hooks'
import { PRIORITY_LABELS, PRIORITY_ORDER, STATUS_LABELS } from '../platform/labels'
import type { SlaPriority, TicketListItem, TicketStatus } from '../platform/types'
import { EmptyState, ErrorBanner, Skeleton } from '../platform/ui'
import TicketDetail from './TicketDetail'

function formatTime(value: string): string {
  return new Date(value).toLocaleString()
}

export default function MyTicketsPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'' | TicketStatus>('')
  const [priority, setPriority] = useState<'' | SlaPriority>('')
  const [sort, setSort] = useState<'created_at' | 'sla_priority' | 'updated_at'>('created_at')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')
  const [selectedId, setSelectedId] = useState('')

  const params = useMemo(
    () => ({
      search: search.trim() || undefined,
      status: (status || undefined) as TicketStatus | undefined,
      slaPriority: (priority || undefined) as SlaPriority | undefined,
      sort,
      order,
      pageSize: 50,
    }),
    [search, status, priority, sort, order],
  )

  const list = useAsync(() => ticketApi.list(params), [params])

  useEffect(() => {
    if (!selectedId && list.data && list.data.items.length > 0) setSelectedId(list.data.items[0].id)
  }, [list.data, selectedId])

  const selectedTicket = useAsync(
    () => (selectedId ? ticketApi.get(selectedId) : Promise.resolve(null)),
    [selectedId],
  )

  const reloadAll = async () => {
    await Promise.all([list.reload(), selectedTicket.reload()])
  }

  return (
    <div className="split-layout">
      <section className="card split-list">
        <div className="filter-bar">
          <label className="search">搜索主题 / Search<input value={search} onChange={(e) => setSearch(e.currentTarget.value)} /></label>
          <label>状态 / Status
            <select value={status} onChange={(e) => setStatus(e.currentTarget.value as '' | TicketStatus)}>
              <option value="">全部 / All</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>优先级 / Priority
            <select value={priority} onChange={(e) => setPriority(e.currentTarget.value as '' | SlaPriority)}>
              <option value="">全部 / All</option>
              {PRIORITY_ORDER.map((value) => <option key={value} value={value}>{PRIORITY_LABELS[value]}</option>)}
            </select>
          </label>
          <label>排序 / Sort
            <select value={sort} onChange={(e) => setSort(e.currentTarget.value as 'created_at' | 'sla_priority' | 'updated_at')}>
              <option value="created_at">创建时间</option>
              <option value="sla_priority">优先级</option>
              <option value="updated_at">更新时间</option>
            </select>
          </label>
          <label>方向 / Order
            <select value={order} onChange={(e) => setOrder(e.currentTarget.value as 'asc' | 'desc')}>
              <option value="asc">升序</option>
              <option value="desc">降序</option>
            </select>
          </label>
        </div>

        {list.loading ? <Skeleton lines={5} /> : list.error ? <ErrorBanner message={list.error} /> : list.data && list.data.items.length > 0 ? (
          <ul className="ticket-queue">
            {list.data.items.map((item: TicketListItem) => (
              <li key={item.id}>
                <button
                  className={item.id === selectedId ? 'queue-item active' : 'queue-item'}
                  onClick={() => setSelectedId(item.id)}
                >
                  <span className="queue-priority">{PRIORITY_LABELS[item.slaPriority]}</span>
                  <span className="queue-subject">{item.subject}</span>
                  <span className="muted">{STATUS_LABELS[item.status]}</span>
                  <span className="muted">{formatTime(item.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : <EmptyState message="暂无工单 / No tickets" hint="您提交的工单将显示在这里。" />}
        {list.data && <p className="muted queue-meta">共 {list.data.total} 条</p>}
      </section>

      <section className="card split-detail">
        {!selectedId ? <EmptyState message="选择左侧工单查看详情 / Select a ticket" /> :
         selectedTicket.loading ? <Skeleton lines={6} /> :
         selectedTicket.error ? <ErrorBanner message={selectedTicket.error} /> :
         selectedTicket.data ? (
          <TicketDetail ticket={selectedTicket.data} groups={[]} reload={reloadAll} canManage={false} />
        ) : null}
      </section>
    </div>
  )
}
