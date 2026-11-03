import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { logApi } from '../api'
import type { LogEntry } from '../types'
import { useToast } from '../hooks/useToast'
import {
  EmptyState,
  ErrorState,
  LOG_ACTION_LABELS,
  LOG_ACTION_OPTIONS,
  PageCard,
  Pagination,
  Skeleton,
  formatDateTime,
} from '../components/common'

const PAGE_SIZE = 20

export default function LogsPage() {
  const { notify } = useToast()
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [ticketId, setTicketId] = useState('')
  const [action, setAction] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await logApi.list({
        ticketId: ticketId || undefined,
        action: action || undefined,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        endDate: endDate ? new Date(endDate + 'T23:59:59').toISOString() : undefined,
        page,
        pageSize: PAGE_SIZE,
      })
      setLogs(result.items)
      setTotal(result.total)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载日志失败')
    } finally {
      setLoading(false)
    }
  }, [ticketId, action, startDate, endDate, page])

  useEffect(() => { void load() }, [load])

  const onFilter = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setPage(1)
    void load()
    notify('已应用筛选', 'info')
  }

  return (
    <PageCard title="操作日志">
      <form className="filter-bar" onSubmit={onFilter}>
        <label className="filter-field">
          <span>工单 ID</span>
          <input type="number" value={ticketId} onChange={(e) => setTicketId(e.target.value)} placeholder="按工单筛选" min={1} />
        </label>
        <label className="filter-field">
          <span>操作类型</span>
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            {LOG_ACTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="filter-field">
          <span>起始时间</span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label className="filter-field">
          <span>截止时间</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
        <button className="secondary">筛选</button>
      </form>

      {error ? (
        <ErrorState message={error} />
      ) : loading ? (
        <Skeleton lines={6} />
      ) : logs.length === 0 ? (
        <EmptyState message="没有符合条件的日志" />
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>操作类型</th><th>工单 ID</th><th>操作人</th><th>操作时间</th></tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td><span className="badge badge-neutral">{LOG_ACTION_LABELS[l.action] ?? l.action}</span></td>
                  <td>{l.ticketId}</td>
                  <td>{l.userName}</td>
                  <td>{formatDateTime(l.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
    </PageCard>
  )
}
