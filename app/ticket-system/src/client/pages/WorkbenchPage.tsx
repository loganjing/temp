import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiRequest } from '../platform/api-client'
import { LoadingView, EmptyView, ErrorView } from '../components/StateViews'
import { StatusBadge, PriorityBadge } from '../components/Badges'
import type { TicketListResponse, TicketStatus } from '../types'

type SortField = 'created_at' | 'sla_priority' | 'status'
type TabKey = 'pending_processing' | 'completed' | 'cancelled' | 'all'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'pending_processing', label: '待处理' },
  { key: 'completed', label: '已完成' },
  { key: 'cancelled', label: '已取消' },
  { key: 'all', label: '全部' },
]

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function WorkbenchPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<TabKey>('pending_processing')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortField>('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<TicketListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const pageSize = 20

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (tab !== 'all') params.set('status', tab)
      if (search.trim()) params.set('search', search.trim())
      params.set('sortBy', sortBy)
      params.set('sortOrder', sortOrder)
      params.set('page', String(page))
      params.set('pageSize', String(pageSize))
      const result = await apiRequest<TicketListResponse>(`/api/tickets?${params.toString()}`)
      setData(result)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [tab, search, sortBy, sortOrder, page])

  useEffect(() => { void load() }, [load])

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('desc')
    }
    setPage(1)
  }

  const handleSearch = (value: string) => {
    setSearch(value)
    setPage(1)
  }

  const handleTabChange = (key: TabKey) => {
    setTab(key)
    setPage(1)
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>工单工作台</h1>
      </div>

      <div className="tab-bar">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab-btn${tab === t.key ? ' active' : ''}`}
            onClick={() => handleTabChange(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="toolbar">
        <input
          className="search-input"
          placeholder="搜索工单主题或描述…"
          value={search}
          onChange={(e) => handleSearch(e.currentTarget.value)}
        />
      </div>

      {loading ? <LoadingView /> :
       error ? <ErrorView message={error} onRetry={load} /> :
       !data || data.items.length === 0 ? (
         <EmptyView text="暂无工单" hint="创建新工单后将会显示在这里" />
       ) : (
        <>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>主题</th>
                  <th>分类</th>
                  <th>提交人</th>
                  <th className="sortable" onClick={() => handleSort('sla_priority')}>优先级 {sortBy === 'sla_priority' && (sortOrder === 'asc' ? '↑' : '↓')}</th>
                  <th className="sortable" onClick={() => handleSort('status')}>状态 {sortBy === 'status' && (sortOrder === 'asc' ? '↑' : '↓')}</th>
                  <th className="sortable" onClick={() => handleSort('created_at')}>创建时间 {sortBy === 'created_at' && (sortOrder === 'asc' ? '↑' : '↓')}</th>
                  <th>处理人</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((ticket) => (
                  <tr key={ticket.id} className="clickable-row" onClick={() => navigate(`/tickets/${ticket.id}`)}>
                    <td><strong>{ticket.subject}</strong></td>
                    <td>{ticket.category}</td>
                    <td>{ticket.submitterName}</td>
                    <td><PriorityBadge priority={ticket.slaPriority} /></td>
                    <td><StatusBadge status={ticket.status} /></td>
                    <td className="muted">{formatDate(ticket.createdAt)}</td>
                    <td className="muted">{ticket.assignedHandlerName ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination-bar">
            <span className="muted">共 {data.total} 条</span>
            <div className="page-controls">
              <button className="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</button>
              <span className="page-info">{page} / {totalPages}</span>
              <button className="secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>下一页</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
