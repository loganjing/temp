import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { assignmentApi, ticketApi } from '../platform/api-client'
import {
  PRIORITIES,
  STATUS_BADGE_CLASS,
  STATUS_LABEL,
  TICKET_STATUSES,
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

interface Props { currentUser: SessionUser }

export default function TicketsPage({ currentUser }: Props) {
  const navigate = useNavigate()
  const { ticketNo } = useParams<{ ticketNo: string }>()
  const selected = ticketNo ?? null
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState<TicketStatus | ''>('')
  const [priority, setPriority] = useState<Priority | ''>('')
  const [mine, setMine] = useState(false)
  const [sort, setSort] = useState<TicketSortField>('created_at')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')

  const list = useAsync(
    () => ticketApi.list({ q, category, status: status || undefined, priority: priority || undefined, sort, order, mine, companyId: currentUser.company.id }),
    [q, category, status, priority, mine, sort, order, currentUser.company.id],
  )
  const groups = useAsync(() => assignmentApi.listGroups(), [])
  const detail = useAsync(
    () => (selected ? ticketApi.detail(selected) : Promise.reject(new Error('no selection'))),
    [selected],
  )
  const tickets = useMemo(() => list.data?.items ?? [], [list.data])

  useEffect(() => {
    if (selected && tickets.length > 0 && !tickets.some((t) => t.ticketNo === selected)) {
      // 当前选中不在列表中（如筛选后），保留详情但不高亮
    }
  }, [tickets, selected])

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(360px,1fr)_minmax(0,1.4fr)]">
      <div className="flex flex-col gap-3">
        <Card>
          <SectionHeading
            title="工单"
            subtitle={`公司：${currentUser.company.name}`}
            actions={<button className="secondary" onClick={() => navigate('/tickets/new')}>新建工单</button>}
          />
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
              关键字
              <input className="min-w-40" value={q} onChange={(e) => setQ(e.target.value)} placeholder="主题 / 工单号" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
              状态
              <select value={status} onChange={(e) => setStatus(e.target.value as TicketStatus | '')}>
                <option value="">全部</option>
                {TICKET_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
              优先级
              <select value={priority} onChange={(e) => setPriority(e.target.value as Priority | '')}>
                <option value="">全部</option>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
              问题分类
              <input className="min-w-28" value={category} onChange={(e) => setCategory(e.target.value)} />
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
              <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
              仅我提交的
            </label>
          </div>
        </Card>

        <Card className="p-0">
          {list.loading ? <TableSkeleton rows={8} cols={4} /> : list.error ? (
            <div className="p-5"><p className="text-sm text-red-600 dark:text-red-400">{list.error}</p></div>
          ) : tickets.length === 0 ? (
            <EmptyState title="暂无工单" hint="调整筛选条件或创建新工单" />
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-700">
              {tickets.map((t: Ticket) => (
                <button
                  key={t.ticketNo}
                  onClick={() => navigate(`/tickets/${encodeURIComponent(t.ticketNo)}`)}
                  className={`flex w-full items-center justify-between gap-2 p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40 ${
                    selected === t.ticketNo ? 'bg-blue-50 dark:bg-blue-900/30' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100" title={t.subject}>{t.subject}</p>
                    <p className="font-mono text-xs text-slate-400">{t.ticketNo} · {t.submitter.name} · {t.category}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <PriorityBadge priority={t.priority} />
                    <Badge className={STATUS_BADGE_CLASS[t.status]}>{STATUS_LABEL[t.status]}</Badge>
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
          <Card>
            <p className="text-sm text-red-600 dark:text-red-400">{detail.error}</p>
            <button className="secondary mt-3" onClick={() => navigate('/tickets')}>返回列表</button>
          </Card>
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
