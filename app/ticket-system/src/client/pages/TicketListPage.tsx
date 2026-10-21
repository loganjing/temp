import { Plus, Search, Ticket } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { listCategories, listTickets, type TicketListQuery } from '../api/endpoints'
import type { Category, TicketListResult } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { PriorityBadge, StatusBadge } from '../components/badges'
import { EmptyState, ErrorBanner, SkeletonList } from '../components/feedback'
import { Pagination } from '../components/Pagination'
import { useToast } from '../components/Toast'
import { formatDateTime, TICKET_STATUS_LABELS } from '../lib/labels'
import TicketCreateForm from './TicketCreateForm'
import TicketDetailPanel from './TicketDetailPanel'

const PAGE_SIZE = 20

const COMPANY_STATUS_OPTIONS = [
  { value: 'pending_process', label: '待处理' },
  { value: 'pending_assignment', label: '待分配' },
]

const MINE_STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  ...Object.entries(TICKET_STATUS_LABELS).map(([value, label]) => ({ value, label })),
]

const SORT_OPTIONS = [
  { value: 'createdAt', label: '创建时间' },
  { value: 'priority', label: '优先级' },
]

const ORDER_OPTIONS = [
  { value: 'desc', label: '降序' },
  { value: 'asc', label: '升序' },
]

interface TicketListFilters {
  status: string
  categoryId: number | null
  priority: string
  companyId: number | null
  q: string
  sort: 'createdAt' | 'priority'
  order: 'asc' | 'desc'
}

// 工作台（scope=company）与我的工单（scope=mine）共用 split-master-detail 布局：
// 左侧工单队列 + 右侧当前工单详情；选中工单以 ?id= 查询参数承载，可直接打开。
export default function TicketListPage({ scope }: { scope: 'company' | 'mine' }) {
  const { user } = useAuth()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = useMemo(() => {
    const raw = searchParams.get('id')
    if (!raw) return null
    const parsed = Number(raw)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null
  }, [searchParams])

  const [categories, setCategories] = useState<Category[] | null>(null)
  const [filters, setFilters] = useState<TicketListFilters>(() => ({
    status: scope === 'company' ? 'pending_process' : '',
    categoryId: null,
    priority: '',
    companyId: null,
    q: '',
    sort: 'createdAt',
    order: 'desc',
  }))
  const [qInput, setQInput] = useState('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<TicketListResult | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [listRefreshKey, setListRefreshKey] = useState(0)
  const [detailRefreshKey, setDetailRefreshKey] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)
  const requestId = useRef(0)

  useEffect(() => {
    listCategories()
      .then((response) => setCategories(response.items))
      .catch(() => setCategories([]))
  }, [])

  // 搜索关键字防抖：关键字提交时重置到第一页
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((previous) => (previous.q === qInput.trim() ? previous : { ...previous, q: qInput.trim() }))
      setPage(1)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [qInput])

  const statusOptions = scope === 'company' ? COMPANY_STATUS_OPTIONS : MINE_STATUS_OPTIONS

  const query = useMemo<TicketListQuery>(() => {
    const value: TicketListQuery = {
      scope,
      sort: filters.sort,
      order: filters.order,
      page,
      pageSize: PAGE_SIZE,
    }
    if (filters.status) value.status = filters.status
    if (filters.categoryId != null) value.categoryId = filters.categoryId
    if (filters.priority) value.priority = filters.priority
    if (filters.companyId != null) value.companyId = filters.companyId
    if (filters.q) value.q = filters.q
    return value
  }, [scope, filters, page])

  // 列表加载：筛选 / 排序 / 分页 / 手动刷新触发；仅采纳最新请求的结果
  useEffect(() => {
    const currentRequestId = requestId.current + 1
    requestId.current = currentRequestId
    setLoading(true)
    setListError(null)
    listTickets(query)
      .then((response) => {
        if (requestId.current !== currentRequestId) return
        setResult(response)
      })
      .catch((err: unknown) => {
        if (requestId.current !== currentRequestId) return
        setResult(null)
        setListError(err instanceof Error ? err.message : '加载工单列表失败')
      })
      .finally(() => {
        if (requestId.current === currentRequestId) setLoading(false)
      })
  }, [query, page, listRefreshKey])

  const updateFilter = (patch: Partial<TicketListFilters>) => {
    setFilters((previous) => ({ ...previous, ...patch }))
    setPage(1)
    setListRefreshKey((key) => key + 1)
  }

  const handlePageChange = (nextPage: number) => {
    setPage(nextPage)
    setListRefreshKey((key) => key + 1)
  }

  const selectTicket = (ticketId: number) => {
    setSearchParams((previous) => {
      const params = new URLSearchParams(previous)
      params.set('id', String(ticketId))
      return params
    })
  }

  const handleDetailChanged = () => {
    setListRefreshKey((key) => key + 1)
    setDetailRefreshKey((key) => key + 1)
  }

  const handleTicketCreated = (ticketId: number) => {
    setCreateOpen(false)
    toast.show('工单创建成功')
    selectTicket(ticketId)
    setPage(1)
    setListRefreshKey((key) => key + 1)
    setDetailRefreshKey((key) => key + 1)
  }

  const items = result?.items ?? []
  const title = scope === 'company' ? '工作台' : '我的工单'
  const subtitle =
    scope === 'company'
      ? '待处理工单队列 · 支持筛选、搜索、排序与公司维度筛选'
      : '我提交的工单 · 支持筛选、搜索、排序，可创建新工单'

  return (
    <div className="flex h-full min-w-0">
      {/* 左侧：队列与筛选 */}
      <section className="flex w-[400px] shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-slate-900">{title}</h1>
              <p className="mt-0.5 text-[11px] leading-4 text-slate-400">{subtitle}</p>
            </div>
            {scope === 'mine' ? (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                创建工单
              </button>
            ) : null}
          </div>

          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
            <input
              type="search"
              value={qInput}
              onChange={(event) => setQInput(event.target.value)}
              placeholder="搜索主题关键字或工单编号"
              aria-label="搜索工单"
              className="w-full rounded-md border border-slate-300 py-2 pl-8 pr-3 text-xs outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <select
              value={filters.status}
              onChange={(event) => updateFilter({ status: event.target.value })}
              aria-label="状态筛选"
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none transition focus:border-indigo-500"
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={filters.categoryId ?? ''}
              onChange={(event) => updateFilter({ categoryId: event.target.value ? Number(event.target.value) : null })}
              aria-label="分类筛选"
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none transition focus:border-indigo-500"
            >
              <option value="">全部分类</option>
              {(categories ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <select
              value={filters.priority}
              onChange={(event) => updateFilter({ priority: event.target.value })}
              aria-label="优先级筛选"
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none transition focus:border-indigo-500"
            >
              <option value="">全部优先级</option>
              {['P0', 'P1', 'P2', 'P3', 'P4'].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <select
              value={filters.companyId ?? ''}
              onChange={(event) => updateFilter({ companyId: event.target.value ? Number(event.target.value) : null })}
              aria-label="公司维度筛选"
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none transition focus:border-indigo-500"
            >
              <option value="">全部公司</option>
              {user ? (
                <option value={user.companyId}>本公司：{user.companyName}</option>
              ) : null}
            </select>
            <select
              value={filters.sort}
              onChange={(event) => updateFilter({ sort: event.target.value as TicketListFilters['sort'] })}
              aria-label="排序字段"
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none transition focus:border-indigo-500"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  排序：{option.label}
                </option>
              ))}
            </select>
            <select
              value={filters.order}
              onChange={(event) => updateFilter({ order: event.target.value as TicketListFilters['order'] })}
              aria-label="排序方向"
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none transition focus:border-indigo-500"
            >
              {ORDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                  {filters.sort === 'priority' && option.value === 'asc' ? '（P0 在前）' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && listError === null ? (
            <SkeletonList rows={6} />
          ) : listError !== null ? (
            <ErrorBanner
              message={listError}
              retrying={loading}
              onRetry={() => {
                setListRefreshKey((key) => key + 1)
              }}
            />
          ) : items.length === 0 ? (
            <EmptyState
              icon={Ticket}
              title={scope === 'company' ? '暂无符合条件的工单' : '暂无工单'}
              hint={
                scope === 'company'
                  ? '当前筛选条件下没有待处理工单，可调整筛选或等待新工单分配。'
                  : '点击右上角「创建工单」提交第一个工单。'
              }
            />
          ) : (
            <ul>
              {items.map((item) => (
                <li key={item.id} className="border-b border-slate-100 last:border-b-0">
                  <button
                    type="button"
                    onClick={() => selectTicket(item.id)}
                    aria-current={item.id === selectedId}
                    className={`w-full px-4 py-3 text-left transition-colors ${
                      item.id === selectedId ? 'bg-indigo-50/70 shadow-[inset_2px_0_0_0_rgb(79_70_229)]' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-slate-400">{item.ticketNo}</span>
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={item.status} />
                        <PriorityBadge priority={item.priority} />
                      </div>
                    </div>
                    <p className="mt-1.5 truncate text-sm font-medium text-slate-800" title={item.subject}>
                      {item.subject}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-400">
                      <span className="truncate">{item.categoryName}</span>
                      <span aria-hidden="true">·</span>
                      <span className="truncate">{item.submitterName}</span>
                      <span aria-hidden="true">·</span>
                      <span className="shrink-0">{formatDateTime(item.createdAt)}</span>
                    </div>
                    <p className="mt-1 truncate text-[11px] text-slate-400" title={item.assignedGroupName ?? undefined}>
                      {item.assignedGroupName ? `归属：${item.assignedGroupName}` : '未分配业务组'}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {result !== null ? (
          <Pagination page={result.page} pageSize={result.pageSize} total={result.total} onChange={handlePageChange} disabled={loading} />
        ) : (
          <div className="border-t border-slate-200 px-4 py-2.5 text-xs text-slate-400">
            {loading ? '加载中…' : '—'}
          </div>
        )}
      </section>

      {/* 右侧：当前工单详情 */}
      <section className="flex min-w-0 flex-1 flex-col bg-white">
        {selectedId == null ? (
          <div className="flex h-full items-center justify-center bg-slate-50/60">
            <EmptyState
              icon={Ticket}
              title="选择左侧工单查看详情"
              hint="详情包含问题描述、提交人信息、回复、操作时间线与工单操作。"
            />
          </div>
        ) : (
          <TicketDetailPanel
            key={selectedId}
            ticketId={selectedId}
            refreshKey={detailRefreshKey}
            onChanged={handleDetailChanged}
            onSelectTicket={selectTicket}
          />
        )}
      </section>

      <TicketCreateForm open={createOpen} onClose={() => setCreateOpen(false)} onCreated={handleTicketCreated} />
    </div>
  )
}
