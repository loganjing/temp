import { useEffect, useState } from 'react'
import { ticketApi, formatDateTime, STATUS_LABELS, type SubmitterInfo } from '../api/ticket-api'

interface Props {
  ticketId: string
}

export default function SubmitterInfo({ ticketId }: Props) {
  const [info, setInfo] = useState<SubmitterInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    ticketApi.getSubmitterInfo(ticketId)
      .then((data) => { if (!cancelled) setInfo(data) })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : '加载提交人信息失败') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ticketId])

  if (loading) return <section className="card"><p style={{ color: 'var(--muted)' }}>加载提交人信息…</p></section>
  if (error) return <section className="card"><p className="error">{error}</p></section>
  if (!info) return null

  return (
    <section className="card">
      <h3 style={{ margin: '0 0 0.75rem' }}>提交人信息</h3>
      <div style={{ display: 'grid', gap: '0.4rem', fontSize: '0.9rem' }}>
        <div><span style={{ color: 'var(--muted)' }}>姓名：</span>{info.name}</div>
        <div><span style={{ color: 'var(--muted)' }}>邮箱：</span>{info.email}</div>
        <div><span style={{ color: 'var(--muted)' }}>公司：</span>{info.companyName}</div>
        <div><span style={{ color: 'var(--muted)' }}>部门：</span>{info.department ?? '—'}</div>
      </div>
      <h4 style={{ margin: '0.75rem 0 0.5rem', fontSize: '0.9rem' }}>历史工单 ({info.historyTickets.length})</h4>
      {info.historyTickets.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>暂无历史工单</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead><tr><th>主题</th><th>状态</th><th>优先级</th><th>创建时间</th></tr></thead>
            <tbody>
              {info.historyTickets.map((t) => (
                <tr key={t.id}>
                  <td><strong title={t.subject} style={{ maxWidth: '180px' }}>{t.subject}</strong></td>
                  <td>{STATUS_LABELS[t.status] ?? t.status}</td>
                  <td>{t.priority}</td>
                  <td style={{ fontSize: '0.85rem' }}>{formatDateTime(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
