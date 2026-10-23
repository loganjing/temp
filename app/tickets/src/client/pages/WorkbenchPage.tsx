import { useCallback, useEffect, useState } from 'react'
import { apiRequest, apiPost, buildQuery } from '../platform/api-client'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import {
  StatusBadge,
  PriorityBadge,
  SkeletonRows,
  EmptyState,
  ErrorBanner,
  Pagination,
  formatDate,
  Spinner,
} from '../components/common'
import { TicketDetail as TicketDetailPanel } from '../components/TicketDetail'
import type {
  Paginated,
  TicketListItem,
  TicketDetail as TicketDetailType,
  TicketCreateBody,
  TicketStatus,
  SlaPriority,
} from '../hooks/types'

const STATUSES: TicketStatus[] = [
  'created',
  'pending_assignment',
  'pending_processing',
  'completed',
  'cancelled',
]

const statusLabel = (s: string): string => {
  const map: Record<string, string> = {
    created: '已创建',
    pending_assignment: '待分配',
    pending_processing: '待处理',
    completed: '已完成',
    cancelled: '已取消',
  }
  return map[s] ?? s
}

const PRIORITIES: SlaPriority[] = ['P0', 'P1', 'P2', 'P3', 'P4']

export function WorkbenchPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const isAdmin = user?.role === 'admin'
  const isSubmitter = user?.role === 'submitter'

  // Filter state
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const [slaPriority, setSlaPriority] = useState('')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('createdAt')
  const [page, setPage] = useState(1)
  const pageSize = 20

  // Data state
  const [tickets, setTickets] = useState<Paginated<TicketListItem>>({
    items: [],
    total: 0,
    page: 1,
    pageSize,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Selected ticket detail
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [ticketDetail, setTicketDetail] = useState<TicketDetailType | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Create ticket modal
  const [showCreate, setShowCreate] = useState(false)

  const fetchTickets = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = buildQuery({
        status: status || undefined,
        category: category || undefined,
        slaPriority: slaPriority || undefined,
        search: search || undefined,
        sortBy: sortBy || undefined,
        page,
        pageSize,
      })
      const res = await apiRequest<Paginated<TicketListItem>>(`/api/tickets${query}`)
      setTickets(res)
      // Auto-select first ticket if none selected
      if (!selectedId && res.items.length > 0) {
        setSelectedId(res.items[0].id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载工单列表失败')
    } finally {
      setLoading(false)
    }
  }, [status, category, slaPriority, search, sortBy, page, selectedId])

  useEffect(() => {
    fetchTickets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, category, slaPriority, sortBy, page])

  // Fetch ticket detail when selectedId changes
  useEffect(() => {
    if (!selectedId) {
      setTicketDetail(null)
      return
    }
    setDetailLoading(true)
    apiRequest<TicketDetailType>(`/api/tickets/${selectedId}`)
      .then(setTicketDetail)
      .catch(() => {
        setTicketDetail(null)
        showToast('加载工单详情失败', 'error')
      })
      .finally(() => setDetailLoading(false))
  }, [selectedId, showToast])

  const refreshDetail = useCallback(async () => {
    if (!selectedId) return
    try {
      const detail = await apiRequest<TicketDetailType>(`/api/tickets/${selectedId}`)
      setTicketDetail(detail)
    } catch {
      // ignore
    }
  }, [selectedId])

  const handleSearch = () => {
    setPage(1)
    fetchTickets()
  }

  const handleFilterChange = () => {
    setPage(1)
  }

  return (
    <div className="flex h-full">
      {/* Left: ticket list */}
      <div className="w-[45%] flex flex-col border-r border-gray-200 bg-white">
        {/* Filters */}
        <div className="p-3 border-b border-gray-200 space-y-2">
          <div className="flex gap-2">
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value)
                handleFilterChange()
              }}
              className="text-xs px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">全部状态</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value)
                handleFilterChange()
              }}
              placeholder="分类"
              className="text-xs px-2 py-1.5 border border-gray-200 rounded flex-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <select
              value={slaPriority}
              onChange={(e) => {
                setSlaPriority(e.target.value)
                handleFilterChange()
              }}
              className="text-xs px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">全部优先级</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="搜索主题或工单ID..."
              className="text-xs px-2 py-1.5 border border-gray-200 rounded flex-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value)
                handleFilterChange()
              }}
              className="text-xs px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="createdAt">创建时间排序</option>
              <option value="slaPriority">优先级排序</option>
            </select>
          </div>
          {(isSubmitter || isAdmin) && (
            <button
              onClick={() => setShowCreate(true)}
              className="w-full py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              + 新建工单
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="p-2">
            <ErrorBanner message={error} onRetry={fetchTickets} />
          </div>
        )}

        {/* Ticket list */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <SkeletonRows count={6} />
          ) : tickets.items.length === 0 ? (
            <EmptyState message="暂无工单" icon="📭" />
          ) : (
            tickets.items.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                  selectedId === t.id ? 'bg-blue-50 border-l-2 border-l-blue-600' : ''
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-gray-400">#{t.id}</span>
                  <PriorityBadge priority={t.slaPriority} />
                  <StatusBadge status={t.status} />
                </div>
                <div className="text-sm font-medium text-gray-800 truncate">{t.title}</div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-gray-400">{t.submitterName}</span>
                  <span className="text-xs text-gray-400">{formatDate(t.createdAt)}</span>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Pagination */}
        {!loading && tickets.total > pageSize && (
          <Pagination
            page={tickets.page}
            total={tickets.total}
            pageSize={tickets.pageSize}
            onPageChange={(p) => setPage(p)}
          />
        )}
      </div>

      {/* Right: ticket detail */}
      <div className="flex-1 flex flex-col bg-gray-50">
        {!selectedId ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState message="请选择左侧工单查看详情" icon="👈" />
          </div>
        ) : detailLoading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <Spinner className="w-6 h-6" />
          </div>
        ) : ticketDetail ? (
          <TicketDetailPanel ticket={ticketDetail} onTicketUpdated={refreshDetail} />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState message="加载工单详情失败" icon="⚠" />
          </div>
        )}
      </div>

      {/* Create ticket modal */}
      {showCreate && (
        <CreateTicketModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false)
            showToast('工单创建成功')
            setSelectedId(id)
            fetchTickets()
          }}
        />
      )}
    </div>
  )
}

// --- Create ticket modal ---
function CreateTicketModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const { showToast } = useToast()
  const [form, setForm] = useState<TicketCreateBody>({
    title: '',
    description: '',
    category: '',
    slaPriority: 'P2',
  })
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim() || !form.description.trim() || !form.category.trim()) {
      showToast('请填写完整信息', 'error')
      return
    }
    setSubmitting(true)
    try {
      const res = await apiPost<{ id: string }>('/api/tickets', {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category.trim(),
        slaPriority: form.slaPriority,
      })
      onCreated(res.id)
    } catch (err) {
      showToast(err instanceof Error ? err.message : '创建失败', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-lg shadow-xl w-[480px] p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-gray-900">新建工单</h3>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">主题</label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            maxLength={200}
            placeholder="工单标题"
            className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            maxLength={5000}
            placeholder="详细描述问题..."
            rows={4}
            className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">分类</label>
            <input
              type="text"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="如: auth, network"
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">SLA优先级</label>
            <select
              value={form.slaPriority}
              onChange={(e) => setForm({ ...form, slaPriority: e.target.value as SlaPriority })}
              className="text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-50">
            取消
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-40 hover:bg-blue-700 flex items-center gap-2"
          >
            {submitting && <Spinner className="w-4 h-4" />}
            {submitting ? '创建中...' : '创建工单'}
          </button>
        </div>
      </form>
    </div>
  )
}
