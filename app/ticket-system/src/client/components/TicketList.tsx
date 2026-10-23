import type { WorkbenchTicket } from '../api/ticket-api'
import { STATUS_LABELS, formatDateTime } from '../api/ticket-api'

interface Props {
  items: WorkbenchTicket[]
  loading: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  total: number
  page: number
  pageSize: number
  onPageChange: (page: number) => void
}

const priorityColor: Record<string, string> = {
  P0: 'var(--danger)', P1: 'var(--danger)', P2: 'var(--accent)', P3: 'var(--muted)', P4: 'var(--muted)',
}

export default function TicketList({ items, loading, selectedId, onSelect, total, page, pageSize, onPageChange }: Props) {
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="card" style={{ height: '64px', opacity: 0.4, animation: 'pulse 1.5s ease-in-out infinite' }} />
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
        <p style={{ color: 'var(--muted)' }}>暂无待处理工单</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {items.map((ticket) => {
        const active = ticket.id === selectedId
        return (
          <button
            key={ticket.id}
            onClick={() => onSelect(ticket.id)}
            className={active ? '' : 'secondary'}
            style={{
              textAlign: 'left', padding: '0.75rem 1rem', minHeight: 'auto',
              borderLeft: `3px solid ${priorityColor[ticket.priority] ?? 'var(--border)'}`,
              background: active ? 'var(--accent)' : 'var(--surface)',
              color: active ? 'white' : 'var(--text)',
              borderColor: active ? 'var(--accent)' : 'var(--border)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
              <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '260px' }}>
                {ticket.subject}
              </strong>
              <span style={{
                fontSize: '0.75rem', padding: '0.1rem 0.4rem', borderRadius: '4px',
                background: active ? 'rgba(255,255,255,0.2)' : 'var(--page)',
                color: active ? 'white' : 'var(--muted)', whiteSpace: 'nowrap',
              }}>
                {ticket.priority}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem', fontSize: '0.8rem', opacity: 0.8 }}>
              <span>{STATUS_LABELS[ticket.status] ?? ticket.status}</span>
              <span>{ticket.category}</span>
              <span>{ticket.submitterName}</span>
            </div>
            <div style={{ fontSize: '0.75rem', marginTop: '0.15rem', opacity: 0.6 }}>
              {formatDateTime(ticket.createdAt)}
            </div>
          </button>
        )
      })}
      {total > pageSize && (
        <div className="section-heading" style={{ marginTop: '0.5rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} / {total}
          </span>
          <div className="row-actions">
            <button className="secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>上一页</button>
            <button className="secondary" disabled={page * pageSize >= total} onClick={() => onPageChange(page + 1)}>下一页</button>
          </div>
        </div>
      )}
    </div>
  )
}
