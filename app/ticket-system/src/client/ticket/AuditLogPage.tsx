import { useCallback, useEffect, useState } from 'react'
import * as api from './api'
import type { AuditLog } from './types'
import { EmptyState, ErrorCard, SectionCard, Skeleton, formatTime } from './ui'

const EVENT_TYPES = [
  'ticket_created',
  'ticket_assigned',
  'ticket_transferred',
  'ticket_completed',
  'ticket_cancelled',
]

export default function AuditLogPage() {
  const [items, setItems] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 50
  const [ticketId, setTicketId] = useState('')
  const [eventType, setEventType] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.listAuditLogs({
        ticketId: ticketId.trim(),
        eventType,
        page,
        pageSize,
      })
      setItems(res.items)
      setTotal(res.total)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '日志加载失败 / Failed to load logs')
    } finally {
      setLoading(false)
    }
  }, [ticketId, eventType, page, pageSize])

  useEffect(() => {
    void load()
  }, [load])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <SectionCard title={`操作日志 / Audit logs (${total})`}>
      <div className="form-grid">
        <label>工单 ID / Ticket ID
          <input value={ticketId} onChange={(e) => { setTicketId(e.target.value); setPage(1) }} placeholder="工单 ID" />
        </label>
        <label>操作类型 / Event type
          <select value={eventType} onChange={(e) => { setEventType(e.target.value); setPage(1) }}>
            <option value="">全部 / All</option>
            {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <div style={{ alignSelf: 'end' }}>
          <button className="secondary" onClick={() => void load()}>查询 / Query</button>
        </div>
      </div>

      {loading ? (
        <Skeleton lines={4} />
      ) : error ? (
        <ErrorCard message={error} onRetry={() => void load()} />
      ) : items.length === 0 ? (
        <EmptyState title="暂无日志 / No logs" hint="执行工单操作后日志将出现在此。" />
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>操作类型 / Type</th>
                <th>操作人 / Actor</th>
                <th>工单 ID / Ticket</th>
                <th>详情 / Detail</th>
                <th>时间 / Time</th>
              </tr>
            </thead>
            <tbody>
              {items.map((log) => (
                <tr key={log.id}>
                  <td>{log.eventType}</td>
                  <td>{log.actorName || log.actorId}</td>
                  <td className="subtext">{log.ticketId}</td>
                  <td className="subtext" style={{ maxWidth: 320, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {Object.keys(log.detail).length === 0 ? '—' : JSON.stringify(log.detail)}
                  </td>
                  <td className="subtext">{formatTime(log.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="section-heading pagination">
        <span className="subtext">
          {total === 0 ? '无 / None' : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} / ${total}`}
        </span>
        <div className="row-actions">
          <button className="secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>上一页 / Previous</button>
          <button className="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>下一页 / Next</button>
        </div>
      </div>
    </SectionCard>
  )
}
