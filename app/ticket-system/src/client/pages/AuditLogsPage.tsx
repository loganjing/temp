import { useCallback, useEffect, useState } from 'react'
import { listAuditLogs } from '../api/audit-api'
import type { AuditLogItem } from '../api/types'
import { Loading, EmptyState, ErrorState } from '../components/States'
import { formatDateTime } from '../components/format'

const EVENT_TYPES = [
  'ticket.created', 'ticket.assigned', 'ticket.transferred',
  'ticket.processed', 'ticket.completed', 'ticket.cancelled',
]

const EVENT_LABEL: Record<string, string> = {
  'ticket.created': '创建',
  'ticket.assigned': '分配',
  'ticket.transferred': '转派',
  'ticket.processed': '处理',
  'ticket.completed': '完成',
  'ticket.cancelled': '取消',
}

export default function AuditLogsPage() {
  const [items, setItems] = useState<AuditLogItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [ticketId, setTicketId] = useState('')
  const [eventType, setEventType] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await listAuditLogs({
        ticketId: ticketId || undefined,
        eventType: eventType || undefined,
        page,
        pageSize,
      })
      setItems(result.items)
      setTotal(result.total)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载审计日志失败')
    } finally {
      setLoading(false)
    }
  }, [ticketId, eventType, page, pageSize])

  useEffect(() => { void load() }, [load])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="audit-page">
      <div className="filter-bar">
        <label className="filter-item">
          <span>工单 ID</span>
          <input value={ticketId} onChange={(e) => { setTicketId(e.target.value); setPage(1) }} placeholder="按工单 ID 筛选" />
        </label>
        <label className="filter-item">
          <span>事件类型</span>
          <select value={eventType} onChange={(e) => { setEventType(e.target.value); setPage(1) }}>
            <option value="">全部</option>
            {EVENT_TYPES.map((t) => <option key={t} value={t}>{EVENT_LABEL[t]} ({t})</option>)}
          </select>
        </label>
      </div>

      <section className="card">
        {loading ? <Loading /> : error ? <ErrorState message={error} /> : items.length === 0 ? <EmptyState message="暂无审计日志" /> : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>事件类型</th><th>操作人</th><th>关联工单</th><th>元数据</th><th>时间</th></tr></thead>
              <tbody>{items.map((item) => (
                <tr key={item.id}>
                  <td>{EVENT_LABEL[item.eventType] ?? item.eventType}</td>
                  <td>{item.actorName}</td>
                  <td className="mono-id" title={item.targetId}>{item.targetId}</td>
                  <td className="mono-id">{Object.keys(item.metadata).length > 0 ? JSON.stringify(item.metadata) : '—'}</td>
                  <td>{formatDateTime(item.createdAt)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <div className="pagination-bar">
          <span className="subtext">{total === 0 ? '无数据' : `第 ${page} / ${totalPages} 页 · 共 ${total} 条`}</span>
          <div className="row-actions">
            <button className="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</button>
            <button className="secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>下一页</button>
          </div>
        </div>
      </section>
    </div>
  )
}
