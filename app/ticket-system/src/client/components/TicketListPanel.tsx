import { useEffect, useState, type FormEvent } from 'react'
import { apiErrorText } from '../api/helpers'
import { fetchCompanies } from '../api/config'
import { fetchTickets } from '../api/tickets'
import type { Company, PageResult, Priority, TicketListItem, TicketSortField, TicketStatusFilter, SortOrder } from '../api/types'
import { formatDateTime } from '../format'
import { EmptyState, ErrorBanner, ListSkeleton, Pagination, PriorityBadge, StatusBadge } from './ui'

const PAGE_SIZE = 20

interface TicketListPanelProps {
  variant: 'workbench' | 'mine'
  selectedId: string | null
  onSelect: (ticketId: string) => void
  version: number
}

const workbenchStatusOptions: { value: TicketStatusFilter; label: string }[] = [
  { value: 'PROCESSING', label: '待处理' },
  { value: 'PENDING_ASSIGNMENT', label: '待分配' },
  { value: 'COMPLETED', label: '已完成' },
  { value: 'CANCELLED', label: '已取消' },
  { value: 'ALL', label: '全部状态' },
]

const mineStatusOptions: { value: TicketStatusFilter; label: string }[] = [
  { value: 'ALL', label: '全部状态' },
  { value: 'PENDING_ASSIGNMENT', label: '待分配' },
  { value: 'PROCESSING', label: '待处理' },
  { value: 'COMPLETED', label: '已完成' },
  { value: 'CANCELLED', label: '已取消' },
]

const sortOptions: { value: TicketSortField; label: string }[] = [
  { value: 'createdAt', label: '创建时间' },
  { value: 'priority', label: '优先级（P0 在前）' },
  { value: 'firstReplyAt', label: '首次回复时间' },
]

const priorityOptions: Priority[] = ['P0', 'P1', 'P2', 'P3', 'P4']

export function TicketListPanel({ variant, selectedId, onSelect, version }: TicketListPanelProps) {
  const isWorkbench = variant === 'workbench'
  const [status, setStatus] = useState<TicketStatusFilter>(isWorkbench ? 'PROCESSING' : 'ALL')
  const [company, setCompany] = useState('')
  const [category, setCategory] = useState('')
  const [priority, setPriority] = useState('')
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [sort, setSort] = useState<TicketSortField>('createdAt')
  const [order, setOrder] = useState<SortOrder>('desc')
  const [page, setPage] = useState(1)
  const [companies, setCompanies] = useState<Company[]>([])
  const [data, setData] = useState<PageResult<TicketListItem> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isWorkbench) return
    let cancelled = false
    fetchCompanies()
      .then(result => {
        if (!cancelled) setCompanies(result.items)
      })
      .catch(() => {
        // 公司选项加载失败时保持空列表，主列表错误另行提示
      })
    return () => {
      cancelled = true
    }
  }, [isWorkbench])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchTickets({
      status,
      company: isWorkbench && company ? company : undefined,
      category: category.trim() || undefined,
      priority: priority || undefined,
      q: keyword || undefined,
      sort,
      order,
      page,
      pageSize: PAGE_SIZE,
    })
      .then(result => {
        if (!cancelled) setData(result)
      })
      .catch(err => {
        if (!cancelled) {
          setData(null)
          setError(apiErrorText(err))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isWorkbench, status, company, category, priority, keyword, sort, order, page, version])

  useEffect(() => {
    if (data && data.items.length === 0 && data.page > 1 && data.total > 0) setPage(1)
  }, [data])

  const resetFilters = () => {
    setStatus(isWorkbench ? 'PROCESSING' : 'ALL')
    setCompany('')
    setCategory('')
    setPriority('')
    setKeywordInput('')
    setKeyword('')
    setSort('createdAt')
    setOrder('desc')
    setPage(1)
  }

  const applyKeyword = (event: FormEvent) => {
    event.preventDefault()
    setPage(1)
    setKeyword(keywordInput.trim())
  }

  const items = data?.items ?? []

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="shrink-0 space-y-2.5 border-b border-slate-200 p-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500">状态</span>
            <select
              value={status}
              onChange={event => {
                setStatus(event.target.value as TicketStatusFilter)
                setPage(1)
              }}
              className="input-base w-28 py-1.5"
            >
              {(isWorkbench ? workbenchStatusOptions : mineStatusOptions).map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {isWorkbench && (
            <label className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500">公司</span>
              <select
                value={company}
                onChange={event => {
                  setCompany(event.target.value)
                  setPage(1)
                }}
                className="input-base w-32 py-1.5"
              >
                <option value="">全部公司</option>
                {companies.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500">优先级</span>
            <select
              value={priority}
              onChange={event => {
                setPriority(event.target.value)
                setPage(1)
              }}
              className="input-base w-20 py-1.5"
            >
              <option value="">全部</option>
              {priorityOptions.map(option => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500">分类</span>
            <input
              value={category}
              onChange={event => {
                setCategory(event.target.value)
                setPage(1)
              }}
              placeholder="按分类筛选"
              className="input-base w-28 py-1.5"
            />
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500">排序</span>
            <select
              value={sort}
              onChange={event => {
                setSort(event.target.value as TicketSortField)
                setPage(1)
              }}
              className="input-base w-36 py-1.5"
            >
              {sortOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500">方向</span>
            <select
              value={order}
              onChange={event => {
                setOrder(event.target.value as SortOrder)
                setPage(1)
              }}
              className="input-base w-20 py-1.5"
            >
              <option value="desc">降序</option>
              <option value="asc">升序</option>
            </select>
          </label>
        </div>
        <div className="flex items-center gap-2">
          <form onSubmit={applyKeyword} className="flex flex-1 items-center gap-2">
            <input
              value={keywordInput}
              onChange={event => setKeywordInput(event.target.value)}
              placeholder="搜索工单号 / 主题 / 描述"
              className="input-base flex-1 py-1.5"
            />
            <button type="submit" className="btn-secondary py-1.5">
              搜索
            </button>
          </form>
          <button type="button" onClick={resetFilters} className="btn-secondary py-1.5">
            清除条件
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <ListSkeleton rows={8} cols={isWorkbench ? 6 : 6} />
        ) : error ? (
          <div className="p-4">
            <ErrorBanner message={error} onRetry={resetFilters} />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="暂无符合条件的工单"
            description={isWorkbench ? '可调整筛选条件后重试' : '点击左上角“新建工单”提交第一张工单'}
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 border-b border-slate-200 bg-white text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left font-medium">工单号</th>
                <th className="px-2 py-2 text-left font-medium">主题</th>
                {isWorkbench ? (
                  <th className="px-2 py-2 text-left font-medium">公司</th>
                ) : (
                  <th className="px-2 py-2 text-left font-medium">分类</th>
                )}
                <th className="px-2 py-2 text-left font-medium">优先级</th>
                <th className="px-2 py-2 text-left font-medium">状态</th>
                <th className="px-2 py-2 text-left font-medium">提交人</th>
                <th className="px-2 py-2 text-right font-medium">回复</th>
                <th className="px-4 py-2 text-left font-medium">创建时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map(ticket => (
                <tr
                  key={ticket.id}
                  onClick={() => onSelect(ticket.id)}
                  className={`cursor-pointer ${selectedId === ticket.id ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                >
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-slate-500">{ticket.id}</td>
                  <td className="max-w-56 px-2 py-2.5">
                    <span className="block truncate text-slate-900" title={ticket.title}>
                      {ticket.title}
                    </span>
                  </td>
                  {isWorkbench ? (
                    <td className="whitespace-nowrap px-2 py-2.5 text-slate-600">{ticket.companyName}</td>
                  ) : (
                    <td className="max-w-24 truncate px-2 py-2.5 text-slate-600" title={ticket.category}>
                      {ticket.category}
                    </td>
                  )}
                  <td className="px-2 py-2.5">
                    <PriorityBadge priority={ticket.priority} />
                  </td>
                  <td className="px-2 py-2.5">
                    <StatusBadge status={ticket.status} />
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-slate-600">{ticket.submitter.name}</td>
                  <td className="px-2 py-2.5 text-right text-slate-600">{ticket.replyCount}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{formatDateTime(ticket.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Pagination page={data?.page ?? 1} pageSize={data?.pageSize ?? PAGE_SIZE} total={data?.total ?? 0} onPage={setPage} />
    </div>
  )
}
