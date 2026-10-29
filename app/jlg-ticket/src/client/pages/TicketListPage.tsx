import { useCallback, useEffect, useState } from 'react'
import { Link, Outlet, useNavigate } from 'react-router-dom'
import { apiGet } from '../platform/api-client'
import {
  type TicketsResponse,
  type CategoriesResponse,
  type TicketSummary,
  type Category,
  type TicketStatus,
  type Priority,
  PRIORITY_OPTIONS,
} from '../platform/types'
import {
  StatusBadge,
  PriorityBadge,
  TicketCardSkeleton,
  EmptyState,
  ErrorBanner,
  formatDate,
} from '../components/ui'
import { PlusIcon } from '../components/icons'

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '全部状态' },
  { value: 'created', label: '创建' },
  { value: 'pending_assignment', label: '待分配' },
  { value: 'pending_processing', label: '待处理' },
  { value: 'completed', label: '完成' },
  { value: 'cancelled', label: '取消' },
]

export default function TicketListPage() {
  const navigate = useNavigate()
  const [tickets, setTickets] = useState<TicketSummary[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filterStatus, setFilterStatus] = useState('')
  const [filterCategoryId, setFilterCategoryId] = useState('')
  const [filterPriority, setFilterPriority] = useState('')

  const fetchTickets = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, string | number | undefined | null> = {}
      if (filterStatus) params.status = filterStatus
      if (filterCategoryId) params.categoryId = filterCategoryId
      if (filterPriority) params.priority = filterPriority
      const data = await apiGet<TicketsResponse>('/api/tickets', params)
      setTickets(data.tickets ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载工单列表失败')
    } finally {
      setLoading(false)
    }
  }, [filterStatus, filterCategoryId, filterPriority])

  useEffect(() => {
    apiGet<CategoriesResponse>('/api/categories')
      .then((d) => setCategories(d.categories ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchTickets()
  }, [fetchTickets])

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Top context bar */}
      <div className="border-b border-gray-200 bg-white px-6 py-3 flex items-center justify-between flex-shrink-0">
        <h1 className="text-lg font-semibold text-gray-800">工单列表</h1>
        <Link
          to="/create"
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          创建工单
        </Link>
      </div>

      {/* Split master-detail */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: filters + ticket list */}
        <div className="w-96 border-r border-gray-200 flex flex-col overflow-hidden bg-white flex-shrink-0">
          {/* Filter bar */}
          <div className="p-3 border-b border-gray-200 space-y-2 flex-shrink-0">
            <div className="grid grid-cols-3 gap-2">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="text-xs border border-gray-300 rounded px-2 py-1.5 bg-white"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select
                value={filterCategoryId}
                onChange={(e) => setFilterCategoryId(e.target.value)}
                className="text-xs border border-gray-300 rounded px-2 py-1.5 bg-white"
              >
                <option value="">全部分类</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="text-xs border border-gray-300 rounded px-2 py-1.5 bg-white"
              >
                <option value="">全部优先级</option>
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Ticket list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <TicketCardSkeleton />
            ) : error ? (
              <div className="p-4">
                <ErrorBanner message={error} onRetry={fetchTickets} />
              </div>
            ) : tickets.length === 0 ? (
              <EmptyState
                title="暂无工单"
                description="创建第一个工单开始处理流程"
                actionLabel="创建工单"
                onAction={() => navigate('/create')}
              />
            ) : (
              <ul className="divide-y divide-gray-100">
                {tickets.map((t) => (
                  <li key={t.id}>
                    <Link
                      to={`/tickets/${t.id}`}
                      className="block px-4 py-3 hover:bg-blue-50 transition-colors border-l-2 border-transparent [&.active]:border-blue-500"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-400 font-mono">{t.ticketNo}</span>
                        <span className="text-xs text-gray-400">{formatDate(t.createdAt)}</span>
                      </div>
                      <p
                        className="text-sm font-medium text-gray-800 truncate"
                        title={t.subject}
                      >
                        {t.subject}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <StatusBadge status={t.status as TicketStatus} />
                        <PriorityBadge priority={t.priority as Priority} />
                        <span className="text-xs text-gray-400">{t.categoryName}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">提交人: {t.submitterName}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right: detail (Outlet) */}
        <div className="flex-1 overflow-y-auto bg-gray-50">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
