// 工单列表（master）：筛选/搜索/排序栏 + 表格 + 分页。
// 工作台与我的工单共用；公司筛选与公司列仅工作台 ops 角色可见（契约第 7.2 节数据域语义）。

import { useEffect, useState } from 'react'
import { listTickets } from '../api'
import { describeApiError } from '../platform/api-client'
import {
  BASELINE_CATEGORIES,
  STATUS_LABELS,
  TICKET_FILTER_STATUSES,
  type Paged,
  type TicketScope,
  type TicketStatus,
  type TicketSummary,
} from '../contracts'
import { formatDateTime } from '../format'
import { useAuth } from '../state/auth'
import { useCompanyDirectory } from '../state/company-directory'
import { EmptyBlock, ErrorBlock, LoadingBlock, Pagination, PriorityBadge, StatusBadge } from './ui'
import { IconChevronDown, IconChevronUp, IconSearch } from './icons'

const PAGE_SIZE = 20

interface TicketListPanelProps {
  scope: TicketScope
  selectedId: number | null
  onSelect: (ticketId: number | null) => void
  refreshKey: number
  emptyTitle: string
  emptyHint?: string
}

export default function TicketListPanel({
  scope,
  selectedId,
  onSelect,
  refreshKey,
  emptyTitle,
  emptyHint,
}: TicketListPanelProps) {
  const { user } = useAuth()
  const { companies, register } = useCompanyDirectory()
  const isWorkbench = scope === 'workbench'
  const showCompanyFilter = isWorkbench && user.role === 'ops'

  const [status, setStatus] = useState<Set<TicketStatus>>(() => new Set(isWorkbench ? ['in_progress'] : []))
  const [category, setCategory] = useState('')
  const [priority, setPriority] = useState('')
  const [companyId, setCompanyId] = useState<number | ''>('')
  const [searchText, setSearchText] = useState('')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'created_at' | 'priority'>('created_at')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [nonce, setNonce] = useState(0)
  const [result, setResult] = useState<Paged<TicketSummary> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 搜索输入防抖
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(searchText.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchText])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const data = await listTickets({
          scope,
          status: [...status],
          category: category || undefined,
          priority: priority || undefined,
          company_id: showCompanyFilter && companyId !== '' ? companyId : undefined,
          q: query || undefined,
          sort,
          order,
          page,
          page_size: PAGE_SIZE,
        })
        if (cancelled) return
        setResult(data)
        register(data.items.map((ticket) => ({ id: ticket.company_id, name: ticket.company_name })))
      } catch (cause) {
        if (!cancelled) setError(describeApiError(cause))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [scope, status, category, priority, companyId, query, sort, order, page, nonce, refreshKey, showCompanyFilter, register])

  const toggleStatus = (value: TicketStatus) => {
    setStatus((previous) => {
      const next = new Set(previous)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
    setPage(1)
  }

  const items = result?.items ?? []
  const total = result?.total ?? 0

  return (
    <section className="card flex w-full flex-col xl:w-[560px] xl:shrink-0">
      <header className="space-y-3 border-b border-slate-200 p-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-base font-semibold">{isWorkbench ? '工单工作台' : '我的工单'}</h1>
          <span className="text-xs text-slate-500">共 {total} 张</span>
        </div>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <IconSearch size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-8"
              placeholder="搜索工单号 / 主题 / 提交人"
              value={searchText}
              onChange={(event) => setSearchText(event.currentTarget.value)}
              aria-label="搜索工单"
            />
          </div>
          <select
            className="input w-auto"
            value={sort}
            onChange={(event) => {
              setSort(event.currentTarget.value as 'created_at' | 'priority')
              setPage(1)
            }}
            aria-label="排序字段"
          >
            <option value="created_at">按创建时间</option>
            <option value="priority">按优先级</option>
          </select>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setOrder((previous) => (previous === 'desc' ? 'asc' : 'desc'))}
            title={order === 'desc' ? '当前为降序，点击切换为升序' : '当前为升序，点击切换为降序'}
            aria-label="切换排序方向"
          >
            {order === 'desc' ? <IconChevronDown size={15} /> : <IconChevronUp size={15} />}
            {order === 'desc' ? '降序' : '升序'}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-xs text-slate-500">状态</span>
          {TICKET_FILTER_STATUSES.map((value) => (
            <button
              key={value}
              type="button"
              className={`chip ${status.has(value) ? 'chip-on' : 'chip-off'}`}
              aria-pressed={status.has(value)}
              onClick={() => toggleStatus(value)}
            >
              {STATUS_LABELS[value]}
            </button>
          ))}
          {status.size > 0 && (
            <button
              type="button"
              className="text-xs text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline"
              onClick={() => {
                setStatus(new Set())
                setPage(1)
              }}
            >
              清除
            </button>
          )}
        </div>
        <div className={`grid gap-2 ${showCompanyFilter ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3'}`}>
          <select
            className="input"
            value={category}
            onChange={(event) => {
              setCategory(event.currentTarget.value)
              setPage(1)
            }}
            aria-label="问题分类筛选"
          >
            <option value="">全部分类</option>
            {BASELINE_CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={priority}
            onChange={(event) => {
              setPriority(event.currentTarget.value)
              setPage(1)
            }}
            aria-label="优先级筛选"
          >
            <option value="">全部优先级</option>
            {['P0', 'P1', 'P2', 'P3', 'P4'].map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          {showCompanyFilter && (
            <select
              className="input col-span-2 sm:col-span-1"
              value={companyId}
              onChange={(event) => {
                const value = event.currentTarget.value
                setCompanyId(value === '' ? '' : Number(value))
                setPage(1)
              }}
              aria-label="公司筛选"
            >
              <option value="">全部公司</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>
      <div className="min-h-[120px] flex-1">
        {loading ? (
          <LoadingBlock label="加载工单列表…" />
        ) : error ? (
          <ErrorBlock message={error} onRetry={() => setNonce((value) => value + 1)} />
        ) : items.length === 0 ? (
          <EmptyBlock title={emptyTitle} hint={emptyHint} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="table-th">工单号</th>
                  <th className="table-th">主题</th>
                  <th className="table-th">分类</th>
                  <th className="table-th">优先级</th>
                  <th className="table-th">状态</th>
                  {showCompanyFilter && <th className="table-th">公司</th>}
                  <th className="table-th">业务组</th>
                  <th className="table-th">创建时间</th>
                </tr>
              </thead>
              <tbody>
                {items.map((ticket) => (
                  <tr
                    key={ticket.id}
                    className={`cursor-pointer border-b border-slate-100 transition-colors last:border-b-0 hover:bg-slate-50 ${
                      selectedId === ticket.id ? 'bg-indigo-50/70 hover:bg-indigo-50' : ''
                    }`}
                    onClick={() => onSelect(selectedId === ticket.id ? null : ticket.id)}
                  >
                    <td className="table-td font-mono text-xs text-indigo-700">{ticket.ticket_no}</td>
                    <td className="table-td max-w-[220px]">
                      <span className="block truncate font-medium text-slate-800" title={ticket.subject}>
                        {ticket.subject}
                      </span>
                      <span className="block truncate text-xs text-slate-400" title={ticket.submitter_name}>
                        {ticket.submitter_name}
                      </span>
                    </td>
                    <td className="table-td text-xs">{ticket.category}</td>
                    <td className="table-td">
                      <PriorityBadge priority={ticket.priority} />
                    </td>
                    <td className="table-td">
                      <StatusBadge status={ticket.status} />
                    </td>
                    {showCompanyFilter && <td className="table-td text-xs">{ticket.company_name}</td>}
                    <td className="table-td text-xs text-slate-500">{ticket.assigned_group_name ?? '—'}</td>
                    <td className="table-td whitespace-nowrap text-xs text-slate-500">{formatDateTime(ticket.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <footer className="border-t border-slate-200 p-3">
        <Pagination page={result?.page ?? page} pageSize={result?.page_size ?? PAGE_SIZE} total={total} onPage={setPage} />
      </footer>
    </section>
  )
}
