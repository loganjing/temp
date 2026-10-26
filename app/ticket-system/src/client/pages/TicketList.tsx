import { useCallback, useEffect, useState } from 'react'
import { ticketApi, ApiRequestError } from '../platform/api'
import type { Ticket } from '../../shared/types'

const STATUS_LABELS: Record<string, string> = {
  created: '创建', pending_assign: '待分配', pending_process: '待处理', completed: '完成', cancelled: '已取消',
}
const PRIORITY_COLORS: Record<string, string> = {
  P0: 'var(--danger)', P1: '#e67e22', P2: 'var(--accent)', P3: 'var(--muted)', P4: 'var(--muted)',
}

export default function TicketList({ role, onOpenTicket }: { role: string; onOpenTicket: (id: string) => void }) {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [total, setTotal] = useState(0)
  const [statusFilter, setStatusFilter] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await ticketApi.list(statusFilter ? { status: statusFilter } : undefined)
      setTickets(result.items)
      setTotal(result.total)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载失败')
    } finally { setLoading(false) }
  }, [statusFilter])

  useEffect(() => { void load() }, [load])

  return (
    <section className="card">
      <div className="section-heading">
        <h2>{role === 'submitter' ? '我的工单' : role === 'handler' ? '待处理工单' : '全部工单'} ({total})</h2>
        <label className="search">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">全部状态</option>
            <option value="created">创建</option>
            <option value="pending_assign">待分配</option>
            <option value="pending_process">待处理</option>
            <option value="completed">完成</option>
            <option value="cancelled">已取消</option>
          </select>
        </label>
      </div>
      {error && <p role="alert" className="error">{error}</p>}
      {loading ? <p>加载中…</p> : tickets.length === 0 ? <p className="empty">暂无工单</p> : (
        <div className="table-scroll">
          <table>
            <thead><tr><th>主题</th><th>分类</th><th>优先级</th><th>状态</th><th>创建时间</th></tr></thead>
            <tbody>{tickets.map((t) => (
              <tr key={t.id} className="clickable" onClick={() => onOpenTicket(t.id)}>
                <td><strong>{t.subject}</strong></td>
                <td>{t.category}</td>
                <td><span style={{ color: PRIORITY_COLORS[t.sla_priority] ?? 'inherit', fontWeight: 600 }}>{t.sla_priority}</span></td>
                <td>{STATUS_LABELS[t.status] ?? t.status}</td>
                <td className="subtext">{new Date(t.created_at).toLocaleString('zh-CN')}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  )
}
