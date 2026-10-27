import { useState } from 'react'
import { auditApi } from '../platform/api-client'
import { useAsync } from '../platform/hooks'
import { ErrorBanner, Skeleton } from '../platform/ui'

function formatTime(value: string): string {
  return new Date(value).toLocaleString()
}

export default function AuditLogPage() {
  const [ticketId, setTicketId] = useState('')
  const [eventType, setEventType] = useState('')
  const [actorId, setActorId] = useState('')
  const [submitted, setSubmitted] = useState({ ticketId: '', eventType: '', actorId: '' })

  const logs = useAsync(
    () => auditApi.list({ ticketId: submitted.ticketId || undefined, eventType: submitted.eventType || undefined, actorId: submitted.actorId || undefined, pageSize: 100 }),
    [submitted],
  )

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitted({ ticketId: ticketId.trim(), eventType: eventType.trim(), actorId: actorId.trim() })
  }

  return (
    <div className="admin-grid">
      <section className="card">
        <div className="section-heading">
          <h2>审计日志 / Audit logs</h2>
        </div>
        <form className="form-grid" onSubmit={submit}>
          <label>工单 ID / Ticket ID<input value={ticketId} onChange={(e) => setTicketId(e.currentTarget.value)} /></label>
          <label>事件类型 / Event type<input value={eventType} onChange={(e) => setEventType(e.currentTarget.value)} placeholder="ticket.created" /></label>
          <label>操作人 ID / Actor ID<input value={actorId} onChange={(e) => setActorId(e.currentTarget.value)} /></label>
          <button className="secondary">筛选 / Filter</button>
        </form>

        {logs.loading ? <Skeleton lines={6} /> : logs.error ? <ErrorBanner message={logs.error} /> : logs.data && logs.data.items.length > 0 ? (
          <div className="table-scroll">
            <table>
              <thead><tr><th>时间</th><th>事件</th><th>实体</th><th>操作人</th><th>详情</th></tr></thead>
              <tbody>
                {logs.data.items.map((log) => (
                  <tr key={log.id}>
                    <td>{formatTime(log.createdAt)}</td>
                    <td>{log.eventType}</td>
                    <td>{log.entityType}<span className="muted"> · {log.entityId}</span></td>
                    <td>{log.actorName}<span className="muted"> · {log.actorId}</span></td>
                    <td><code className="payload-cell">{JSON.stringify(log.payload)}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="muted">无日志 / No logs</p>}
        {logs.data && <p className="muted">共 {logs.data.total} 条</p>}
      </section>
    </div>
  )
}
