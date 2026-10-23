import { useCallback, useEffect, useState } from 'react'
import { apiRequest, buildQuery } from '../platform/api-client'
import {
  ErrorBanner,
  SkeletonRows,
  EmptyState,
  Pagination,
  formatDate,
} from '../components/common'
import type { Paginated, AuditLog } from '../hooks/types'

const ACTION_OPTIONS = [
  'ticket:create',
  'ticket:status-change',
  'ticket:assign',
  'ticket:transfer',
  'ticket:complete',
  'ticket:evaluate',
  'group:create',
  'group:member-add',
  'group:member-remove',
  'rule:create',
]

export function AuditLogPage() {
  const [ticketId, setTicketId] = useState('')
  const [action, setAction] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 20

  const [data, setData] = useState<Paginated<AuditLog>>({
    items: [],
    total: 0,
    page: 1,
    pageSize,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = buildQuery({
        ticketId: ticketId || undefined,
        action: action || undefined,
        page,
        pageSize,
      })
      const res = await apiRequest<Paginated<AuditLog>>(`/api/audit-logs${query}`)
      setData(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载日志失败')
    } finally {
      setLoading(false)
    }
  }, [ticketId, action, page])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const handleFilterChange = () => {
    setPage(1)
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-900 mb-4">操作日志</h1>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          value={ticketId}
          onChange={(e) => {
            setTicketId(e.target.value)
            handleFilterChange()
          }}
          placeholder="按工单ID筛选"
          className="text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 w-48"
        />
        <select
          value={action}
          onChange={(e) => {
            setAction(e.target.value)
            handleFilterChange()
          }}
          className="text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">全部操作类型</option>
          {ACTION_OPTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && <ErrorBanner message={error} onRetry={fetchLogs} />}

      {/* Table */}
      {loading ? (
        <SkeletonRows count={6} />
      ) : data.items.length === 0 ? (
        <EmptyState message="暂无操作日志" icon="📝" />
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2 text-left text-gray-500 font-medium">操作人</th>
                <th className="px-4 py-2 text-left text-gray-500 font-medium">操作类型</th>
                <th className="px-4 py-2 text-left text-gray-500 font-medium">工单ID</th>
                <th className="px-4 py-2 text-left text-gray-500 font-medium">详情</th>
                <th className="px-4 py-2 text-left text-gray-500 font-medium">时间</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((log) => (
                <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-700">{log.actorName}</td>
                  <td className="px-4 py-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-400">#{log.entityId}</td>
                  <td className="px-4 py-2 text-gray-400 text-xs">
                    {log.metadata && Object.keys(log.metadata).length > 0
                      ? JSON.stringify(log.metadata)
                      : '—'}
                  </td>
                  <td className="px-4 py-2 text-gray-400 text-xs">{formatDate(log.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!loading && data.total > pageSize && (
        <Pagination
          page={data.page}
          total={data.total}
          pageSize={data.pageSize}
          onPageChange={(p) => setPage(p)}
        />
      )}
    </div>
  )
}
