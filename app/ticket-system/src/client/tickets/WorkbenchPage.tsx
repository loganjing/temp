import { useEffect, useMemo, useState } from 'react'
import { groupApi, ticketApi } from '../platform/api-client'
import { useAsync } from '../platform/hooks'
import { PRIORITY_LABELS, PRIORITY_ORDER, STATUS_LABELS } from '../platform/labels'
import type { BusinessGroup, CurrentUser, SlaPriority, TicketListItem, WorkbenchTicketsParams } from '../platform/types'
import { EmptyState, ErrorBanner, Skeleton } from '../platform/ui'
import TicketDetail from './TicketDetail'

function formatTime(value: string): string {
  return new Date(value).toLocaleString()
}

export default function WorkbenchPage({ user }: { user: CurrentUser }) {
  const isAdmin = user.isAdmin ?? false
  const [search, setSearch] = useState('')
  const [priority, setPriority] = useState<'' | SlaPriority>('')
  const [groupId, setGroupId] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [sort, setSort] = useState<'sla_priority' | 'created_at'>('sla_priority')
  const [order, setOrder] = useState<'asc' | 'desc'>('asc')
  const [selectedId, setSelectedId] = useState('')

  const groups = useAsync(() => groupApi.list(), [])

  const params: WorkbenchTicketsParams = useMemo(
    () => ({
      search: search.trim() || undefined,
      slaPriority: priority || undefined,
      assignedGroupId: groupId || undefined,
      companyId: isAdmin && companyId ? companyId : undefined,
      sort,
      order,
      pageSize: 50,
    }),
    [search, priority, groupId, companyId, isAdmin, sort, order],
  )

  const list = useAsync(() => ticketApi.workbench(params), [params])

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

  const groupItems: BusinessGroup[] = groups.data?.items ?? []

  return (
    <div className="split-layout">
      <section className="card split-list">
        <div className="filter-bar">
          <label className="search">搜索主题 / Search<input value={search} onChange={(e) => setSearch(e.currentTarget.value)} /></label>
          <label>优先级 / Priority
            <select value={priority} onChange={(e) => setPriority(e.currentTarget.value as '' | SlaPriority)}>
              <option value="">全部 / All</option>
              {PRIORITY_ORDER.map((value) => <option key={value} value={value}>{PRIORITY_LABELS[value]}</option>)}
            </select>
          </label>
          <label>业务组 / Group
            <select value={groupId} onChange={(e) => setGroupId(e.currentTarget.value)}>
              <option value="">全部 / All</option>
              {groupItems.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          </label>
          {isAdmin && (
            <label>公司 / Company
              <input value={companyId} onChange={(e) => setCompanyId(e.currentTarget.value)} placeholder="公司 ID" />
            </label>
          )}
          <label>排序 / Sort
            <select value={sort} onChange={(e) => setSort(e.currentTarget.value as 'sla_priority' | 'created_at')}>
              <option value="sla_priority">优先级</option>
              <option value="created_at">创建时间</option>
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
                  <span className="muted">{item.assignedGroupName ?? '未分配'}</span>
                  <span className="muted">{formatTime(item.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : <EmptyState message="无待处理工单 / No pending tickets" hint="尝试调整筛选条件。" />}
        {list.data && <p className="muted queue-meta">共 {list.data.total} 条</p>}
      </section>

      <section className="card split-detail">
        {!selectedId ? <EmptyState message="选择左侧工单查看详情 / Select a ticket" /> :
         selectedTicket.loading ? <Skeleton lines={6} /> :
         selectedTicket.error ? <ErrorBanner message={selectedTicket.error} /> :
         selectedTicket.data ? (
          <TicketDetail ticket={selectedTicket.data} groups={groupItems} reload={reloadAll} />
        ) : null}
      </section>
    </div>
  )
}
