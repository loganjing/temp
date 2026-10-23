// 操作日志页 — 查询工单操作日志，支持按工单 ID 和操作类型筛选
import { useCallback, useEffect, useState } from 'react'
import { auditLogsApi } from '../api'
import { AUDIT_ACTIONS, AUDIT_ACTION_LABELS } from '../types'
import type { AuditLog } from '../types'
import {
  EmptyState,
  ErrorBanner,
  Loading,
  Pagination,
  SkeletonRows,
  formatTime,
  useToast,
} from '../components'

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(50)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [ticketId, setTicketId] = useState('')
  const [action, setAction] = useState('')

  const [, , toastView] = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await auditLogsApi.list({
        ticketId: ticketId || undefined,
        action: action || undefined,
        page,
        pageSize,
      })
      setLogs(result.items)
      setTotal(result.total)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载操作日志失败')
    } finally {
      setLoading(false)
    }
  }, [ticketId, action, page, pageSize])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>操作日志</h1>
        <p>查询工单关键操作日志，支持按工单 ID 和操作类型筛选</p>
      </div>
      {toastView}
      <ErrorBanner error={error} onClose={() => setError('')} />

      <section className="card filter-bar">
        <div className="form-grid">
          <label>
            工单 ID
            <input
              value={ticketId}
              onChange={(e) => {
                setTicketId(e.currentTarget.value)
                setPage(1)
              }}
              placeholder="输入工单 ID"
            />
          </label>
          <label>
            操作类型
            <select
              value={action}
              onChange={(e) => {
                setAction(e.currentTarget.value)
                setPage(1)
              }}
            >
              <option value="">全部操作</option>
              {AUDIT_ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {AUDIT_ACTION_LABELS[a]}
                </option>
              ))}
            </select>
          </label>
          <button className="secondary" onClick={() => { setTicketId(''); setAction(''); setPage(1) }}>
            重置筛选
          </button>
        </div>
      </section>

      <section className="card">
        {loading ? (
          <SkeletonRows count={6} />
        ) : logs.length === 0 ? (
          <EmptyState message="暂无操作日志" />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>操作人</th>
                  <th>操作类型</th>
                  <th>工单 ID</th>
                  <th>操作时间</th>
                  <th>详情</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <strong>{log.actorName}</strong>
                      <span className="subtext">{log.actorId}</span>
                    </td>
                    <td>
                      <span className={`action-badge action-${log.action}`}>
                        {AUDIT_ACTION_LABELS[log.action] ?? log.action}
                      </span>
                    </td>
                    <td>
                      <span className="subtext">{log.targetTicketId}</span>
                    </td>
                    <td>{formatTime(log.createdAt)}</td>
                    <td>{log.details ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} />
      </section>
    </div>
  )
}
