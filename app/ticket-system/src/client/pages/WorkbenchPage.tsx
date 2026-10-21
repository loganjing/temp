// 工作台（agent）：split-master-detail 主布局。
// 左侧待处理工单队列（公司筛选 / 搜索 / 排序 + 状态、优先级、分类筛选），右侧当前工单详情。
// 视图域（assigned_group_id ∈ 用户所属业务组）由服务端强制；A 的默认视图为 status=in_progress（前端显式传参）。
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { listTickets } from '../api/tickets'
import { listCategories } from '../api/org'
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  inputClass,
  PriorityBadge,
  StatusBadge,
} from '../components/ui'
import { TicketDetailPanel } from '../components/TicketDetailPanel'
import { IconChevronRight, IconInbox, IconRefreshCw, IconSearch } from '../components/icons'
import { formatDateTime } from '../contracts/labels'
import type {
  Priority,
  TicketSortField,
  TicketStatus,
} from '../contracts/types'
import { useAsync } from '../hooks/useAsync'

const PAGE_SIZE = 20
const STATUS_OPTIONS: { value: '' | TicketStatus; label: string }[] = [
  { value: 'in_progress', label: '待处理' },
  { value: '', label: '全部状态' },
  { value: 'created', label: '创建' },
  { value: 'pending_assignment', label: '待分配' },
  { value: 'completed', label: '完成' },
  { value: 'cancelled', label: '取消' },
]
const PRIORITY_OPTIONS: { value: '' | Priority; label: string }[] = [
  { value: '', label: '全部优先级' },
  { value: 'P0', label: 'P0' },
  { value: 'P1', label: 'P1' },
  { value: 'P2', label: 'P2' },
  { value: 'P3', label: 'P3' },
  { value: 'P4', label: 'P4' },
]
const SORT_OPTIONS: { value: TicketSortField; label: string }[] = [
  { value: 'createdAt', label: '创建时间' },
  { value: 'priority', label: '优先级' },
  { value: 'ticketNo', label: '工单号' },
]

interface CompanyOption {
  id: number
  name: string
}

export function WorkbenchPage() {
  const navigate = useNavigate()
  const params = useParams<{ ticketId: string }>()
  const selectedId = Number(params.ticketId)

  const [status, setStatus] = useState<'' | TicketStatus>('in_progress')
  const [priority, setPriority] = useState<'' | Priority>('')
  const [categoryId, setCategoryId] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<TicketSortField>('createdAt')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [companyOptions, setCompanyOptions] = useState<CompanyOption[]>([])

  const categories = useAsync(() => listCategories(), [])
  const tickets = useAsync(
    () =>
      listTickets({
        status: status || undefined,
        priority: priority || undefined,
        categoryId: categoryId ? Number(categoryId) : undefined,
        companyId: companyId ? Number(companyId) : undefined,
        search: search || undefined,
        sort,
        order,
        page,
        pageSize: PAGE_SIZE,
      }),
    [status, priority, categoryId, companyId, search, sort, order, page],
  )

  // 公司筛选选项：聚合本工作台响应中出现过的公司（契约未向 agent 提供公司字典接口）。
  useEffect(() => {
    const data = tickets.data
    if (!data) return
    setCompanyOptions((previous) => {
      const map = new Map(previous.map((company) => [company.id, company]))
      for (const ticket of data.items) {
        map.set(ticket.companyId, { id: ticket.companyId, name: ticket.companyName })
      }
      return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
    })
  }, [tickets.data])

  const resetPage = () => setPage(1)

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSearch(searchInput.trim())
    resetPage()
  }

  const data = tickets.data
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const selectedTicket = useMemo(
    () => data?.items.find((ticket) => ticket.id === selectedId) ?? null,
    [data, selectedId],
  )

  return (
    <div className="flex h-[calc(100vh-7.5rem)] gap-4">
      <aside className="flex w-[26rem] shrink-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="space-y-3 border-b border-slate-100 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">
              处理队列
              {data && <span className="ml-1.5 font-normal text-slate-400">共 {data.total} 张</span>}
            </h2>
            <Button variant="ghost" onClick={tickets.reload} aria-label="刷新队列" title="刷新队列">
              <IconRefreshCw className="size-4" />
            </Button>
          </div>
          <form onSubmit={submitSearch} className="relative">
            <IconSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              className={`${inputClass} pl-9`}
              placeholder="搜索工单号 / 主题"
              value={searchInput}
              onChange={(event) => setSearchInput(event.currentTarget.value)}
            />
          </form>
          <div className="grid grid-cols-2 gap-2">
            <select
              className={inputClass}
              aria-label="按公司筛选"
              value={companyId}
              onChange={(event) => {
                setCompanyId(event.currentTarget.value)
                resetPage()
              }}
            >
              <option value="">全部公司</option>
              {companyOptions.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
            <select
              className={inputClass}
              aria-label="按状态筛选"
              value={status}
              onChange={(event) => {
                setStatus(event.currentTarget.value as '' | TicketStatus)
                resetPage()
              }}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              className={inputClass}
              aria-label="按优先级筛选"
              value={priority}
              onChange={(event) => {
                setPriority(event.currentTarget.value as '' | Priority)
                resetPage()
              }}
            >
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              className={inputClass}
              aria-label="按分类筛选"
              value={categoryId}
              onChange={(event) => {
                setCategoryId(event.currentTarget.value)
                resetPage()
              }}
            >
              <option value="">全部分类</option>
              {categories.data?.items.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <select
              className={inputClass}
              aria-label="排序字段"
              value={sort}
              onChange={(event) => {
                setSort(event.currentTarget.value as TicketSortField)
                resetPage()
              }}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  按{option.label}排序
                </option>
              ))}
            </select>
            <Button
              variant="secondary"
              onClick={() => {
                setOrder(order === 'desc' ? 'asc' : 'desc')
                resetPage()
              }}
              title={order === 'desc' ? '当前：降序，点击切换为升序' : '当前：升序，点击切换为降序'}
            >
              {order === 'desc' ? '降序' : '升序'}
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <ErrorBanner message={tickets.error} />
          {tickets.loading && !data ? (
            <div className="space-y-2.5 p-4" role="status" aria-label="加载中">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="animate-pulse rounded-md border border-slate-100 p-3">
                  <div className="h-4 w-1/3 rounded bg-slate-200/70" />
                  <div className="mt-2 h-4 w-3/4 rounded bg-slate-200/70" />
                </div>
              ))}
            </div>
          ) : !data || data.items.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<IconInbox className="size-5" />}
                title="队列中没有工单"
                description="调整筛选条件，或等待新的工单分配到你的业务组。"
              />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.items.map((ticket) => {
                const active = ticket.id === selectedId
                return (
                  <li key={ticket.id}>
                    <button
                      type="button"
                      className={`flex w-full flex-col gap-1.5 px-4 py-3 text-left transition-colors ${
                        active ? 'bg-blue-50' : 'hover:bg-slate-50'
                      }`}
                      onClick={() => navigate(`/workbench/${ticket.id}`)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-slate-500">{ticket.ticketNo}</span>
                        <div className="flex items-center gap-1.5">
                          <PriorityBadge priority={ticket.priority} />
                          <StatusBadge status={ticket.status} />
                        </div>
                      </div>
                      <span className="truncate text-sm font-medium text-slate-800" title={ticket.subject}>
                        {ticket.subject}
                      </span>
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                        <span className="truncate" title={ticket.companyName}>
                          {ticket.companyName} · {ticket.categoryName}
                        </span>
                        <span title={ticket.createdAt}>{formatDateTime(ticket.createdAt)}</span>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {data && data.total > data.pageSize && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
            <span>
              第 {data.page} / {totalPages} 页 · 共 {data.total} 条
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                上一页
              </Button>
              <Button variant="ghost" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                下一页
              </Button>
            </div>
          </div>
        )}
      </aside>

      <section className="min-w-0 flex-1 overflow-y-auto">
        {Number.isInteger(selectedId) && selectedId > 0 ? (
          <div className="space-y-4">
            {selectedTicket && (
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <button
                  type="button"
                  className="rounded px-1.5 py-0.5 transition-colors hover:bg-slate-100 hover:text-slate-600"
                  onClick={() => navigate('/workbench')}
                >
                  处理队列
                </button>
                <IconChevronRight className="size-3.5" />
                <span className="text-slate-600">{selectedTicket.ticketNo}</span>
              </div>
            )}
            <TicketDetailPanel ticketId={selectedId} layout="panel" onChanged={tickets.reload} />
          </div>
        ) : (
          <Card className="flex h-full items-center justify-center" bodyClassName="flex h-full items-center justify-center">
            <EmptyState
              icon={<IconInbox className="size-5" />}
              title="从左侧队列选择一张工单"
              description="选中后可在此查看提交人完整信息、回复沟通、转派并完成处理。"
            />
          </Card>
        )}
      </section>
    </div>
  )
}
