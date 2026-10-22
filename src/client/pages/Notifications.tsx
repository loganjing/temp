import { useState, useCallback, useEffect } from 'react'
import { listNotifications } from '../api'
import type { Notification, NotificationStatus } from '../api/types'
import { Loading, EmptyState, ErrorState } from '../components/common'
import { fmtTime } from '../components/common'

const statusLabels: Record<NotificationStatus, string> = {
  queued: '排队中', sent: '已发送', failed: '失败',
}

export default function Notifications() {
  const [items, setItems] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ticketId, setTicketId] = useState('')
  const [status, setStatus] = useState<NotificationStatus | ''>('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await listNotifications({
        ticketId: ticketId || undefined,
        status: status || undefined,
      })
      setItems(resp.items)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [ticketId, status])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div>
      <div className="page-header">
        <div className="page-title">通知核对</div>
      </div>

      <div className="card mb-24">
        <div className="split-master-toolbar">
          <div className="toolbar-row">
            <input className="form-input" placeholder="工单 ID 筛选" value={ticketId} onChange={e => setTicketId(e.target.value)} />
            <select className="form-select" value={status} onChange={e => setStatus(e.target.value as NotificationStatus | '')}>
              <option value="">全部状态</option>
              <option value="queued">排队中</option>
              <option value="sent">已发送</option>
              <option value="failed">失败</option>
            </select>
          </div>
        </div>

        {loading ? <Loading /> :
          error ? <ErrorState message={error} onRetry={fetchData} /> :
          items.length === 0 ? <EmptyState text="暂无通知记录" /> : (
            <div className="card-body">
              <table className="table">
                <thead><tr><th>ID</th><th>工单 ID</th><th>收件人</th><th>主题</th><th>状态</th><th>创建时间</th><th>发送时间</th><th>错误</th></tr></thead>
                <tbody>
                  {items.map(n => (
                    <tr key={n.id}>
                      <td>{n.id}</td>
                      <td>{n.ticketId}</td>
                      <td>{n.toEmail}</td>
                      <td>{n.subject}</td>
                      <td>
                        <span className={`badge ${n.status === 'sent' ? 'badge-completed' : n.status === 'failed' ? 'badge-cancelled' : 'badge-pending_assignment'}`}>
                          {statusLabels[n.status]}
                        </span>
                      </td>
                      <td>{fmtTime(n.createdAt)}</td>
                      <td>{fmtTime(n.sentAt)}</td>
                      <td className="text-muted">{n.error || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </div>
    </div>
  )
}
