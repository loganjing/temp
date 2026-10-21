import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { workbenchApi } from '../platform/api-client'
import {
  PRIORITIES,
  TICKET_STATUSES,
  STATUS_LABEL,
  STATUS_BADGE_CLASS,
  type Priority,
  type SessionUser,
  type Ticket,
  type TicketSortField,
  type TicketStatus,
} from '../components/contracts'
import {
  Badge,
  Card,
  EmptyState,
  formatDateTime,
  PriorityBadge,
  SectionHeading,
  Spinner,
  TableSkeleton,
  useAsync,
} from '../components/ui'
import TicketDetail from '../components/TicketDetail'
import { assignmentApi, ticketApi } from '../platform/api-client'

interface Props { currentUser: SessionUser }

export default function WorkbenchPage({ currentUser }: Props) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [priority, setPriority] = useState<Priority | ''>('')
  const [sort, setSort] = useState<TicketSortField>('created_at')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')
  const [groupOnly, setGroupOnly] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)

  const list = useAsync(
    () => workbenchApi.list({ q, category, priority: priority || undefined, sort, order, group: groupOnly, companyId: currentUser.company.id }),
    [q, category, priority, sort, order, groupOnly, currentUser.company.id],
  )
  const groups = useAsync(() => assignmentApi.listGroups(), [])

  const tickets = useMemo(() => list.data?.items ?? [], [list.data])
  useEffect(() => {
    if (!selected && tickets.length > 0) setSelected(tickets[0].ticketNo)
    if (selected && tickets.length > 0 && !tickets.some((t) => t.ticketNo === selected)) setSelected(tickets[0].ticketNo)
    if (tickets.length === 0) setSelected(null)
  }, [tickets, selected])

  const detail = useAsync(
    () => (selected ? ticketApi.detail(selected) : Promise.reject(new Error('no selection'))),
    [selected],
  )

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(360px,1fr)_minmax(0,1.4fr)]">
      <div className="flex flex-col gap-3">
        <Card>
          <SectionHeading title="工单工作台" subtitle="待处理工单队列（本人所属业务组）" />
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
              关键字
              <input className="min-w-40" value={q} onChange={(e) => setQ(e.target.value)} placeholder="主题 / 工单号" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
              问题分类
              <input className="min-w-32" value={category} onChange={(e) => setCategory(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
              优先级
              <select value={priority} onChange={(e) => setPriority(e.target.value as Priority | '')}>
                <option value="">全部</option>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
              排序
              <select value={`${sort}:${order}`} onChange={(e) => {
                const [s, o] = e.target.value.split(':') as [TicketSortField, 'asc' | 'desc']
                setSort(s); setOrder(o)
              }}>
                <option value="created_at:desc">创建时间 新→旧</option>
                <option value="created_at:asc">创建时间 旧→新</option>
                <option value="priority:desc">优先级 高→低</option>
                <option value="priority:asc">优先级 低→高</option>
              </select>
            </label>
            <label className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={groupOnly} onChange={(e) => setGroupOnly(e.target.checked)} />
              仅本人业务组
            </label>
            <span className="text-xs text-slate-400">公司：{currentUser.company.name}</span>
          </div>
        </Card>

        <Card className="p-0">
          {list.loading ? <TableSkeleton rows={6} cols={4} /> : list.error ? (
            <div className="p-5"><p className="text-sm text-red-600 dark:text-red-400">{list.error}</p></div>
          ) : tickets.length === 0 ? (
            <EmptyState title="暂无待处理工单" hint="调整筛选条件或等待新工单分配" />
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-700">
              {tickets.map((t: Ticket) => (
                <button
                  key={t.ticketNo}
                  onClick={() => setSelected(t.ticketNo)}
                  className={`flex w-full items-center justify-between gap-2 p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40 ${
                    selected === t.ticketNo ? 'bg-blue-50 dark:bg-blue-900/30' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100" title={t.subject}>{t.subject}</p>
                    <p className="font-mono text-xs text-slate-400">{t.ticketNo} · {t.submitter.name} · {formatDateTime(t.createdAt)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <PriorityBadge priority={t.priority} />
                    <Badge className={STATUS_BADGE_CLASS[t.status as TicketStatus]}>{STATUS_LABEL[t.status as TicketStatus]}</Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div>
        {!selected ? (
          <Card><EmptyState title="选择左侧工单查看详情" /></Card>
        ) : detail.loading ? (
          <Card><Spinner label="加载工单详情…" /></Card>
        ) : detail.error ? (
          <Card><p className="text-sm text-red-600 dark:text-red-400">{detail.error}</p></Card>
        ) : detail.data ? (
          <TicketDetail
            ticketNo={selected}
            currentUser={currentUser}
            detail={detail.data}
            groups={groups.data?.items}
            onTicketChanged={() => { detail.reload(); list.reload() }}
          />
        ) : null}
      </div>
    </div>
  )
}
