import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { listTickets } from '../api'
import type { Ticket, Priority, SortOrder } from '../api/types'
import { useSession } from '../hooks/useSession'
import { Loading, EmptyState, ErrorState, PriorityBadge, StatusBadge } from '../components/common'
import { fmtTime } from '../components/common'

export default function Workbench() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [items, setItems] = useState<Ticket[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [priority, setPriority] = useState<Priority | ''>('')
  const [sort, setSort] = useState<SortOrder>('createdAt_desc')
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await listTickets({
        status: 'pending_handling',
        q: q || undefined,
        category: category || undefined,
        priority: priority || undefined,
        sort,
        page,
        pageSize,
      })
      setItems(resp.items)
      setTotal(resp.total)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [q, category, priority, sort, page, pageSize])

  useEffect(() => { fetchData() }, [fetchData])

  const totalPages = Math.ceil(total / pageSize) || 1

  return (
    <div>
      <div className="page-header">
        <div className="page-title">工作台 · 待处理工单</div>
        <button className="btn btn-primary btn-sm" onClick={() => navigate('/tickets/new')}>提交工单</button>
      </div>

      <div className="card mb-24">
        <div className="split-master-toolbar">
          <div className="toolbar-row">
            <input
              className="form-input toolbar-search"
              placeholder="搜索主题/描述/工单 ID"
              value={q}
              onChange={e => { setQ(e.target.value); setPage(1) }}
            />
          </div>
          <div className="toolbar-row">
            <input
              className="form-input"
              placeholder="分类"
              value={category}
              onChange={e => { setCategory(e.target.value); setPage(1) }}
            />
            <select
              className="form-select"
              value={priority}
              onChange={e => { setPriority(e.target.value as Priority || ''); setPage(1) }}
            >
              <option value="">全部优先级</option>
              <option value="P0">P0</option>
              <option value="P1">P1</option>
              <option value="P2">P2</option>
              <option value="P3">P3</option>
              <option value="P4">P4</option>
            </select>
            <select
              className="form-select"
              value={sort}
              onChange={e => setSort(e.target.value as SortOrder)}
            >
              <option value="createdAt_desc">创建时间 ↓</option>
              <option value="createdAt_asc">创建时间 ↑</option>
            </select>
            <span className="text-muted nowrap">公司: {session?.user?.companyName || '-'}</span>
          </div>
        </div>

        {loading ? <Loading /> :
          error ? <ErrorState message={error} onRetry={fetchData} /> :
          items.length === 0 ? (
            <EmptyState text="暂无待处理工单" hint="工单分配后将出现在这里" />
          ) : (
            <div className="split-master-list">
              {items.map(t => (
                <div
                  key={t.id}
                  className="ticket-list-item"
                  onClick={() => navigate(`/tickets/${t.id}`)}
                >
                  <div className="ticket-list-item-subject">{t.subject}</div>
                  <div className="ticket-list-item-meta">
                    <PriorityBadge priority={t.priority} />
                    <StatusBadge status={t.status} />
                    <span>{t.category}</span>
                    <span>{t.id}</span>
                    <span>{fmtTime(t.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )
        }

        <div className="split-master-footer">
          <span>共 {total} 条</span>
          <div className="pagination">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
            <span className="current">{page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页</button>
          </div>
        </div>
      </div>
    </div>
  )
}
