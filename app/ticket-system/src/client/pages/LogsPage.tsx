import { useState } from 'react'
import { apiRequest, buildQuery, type Paginated } from '../platform/api-client'
import { useAsync } from '../hooks/useAsync'
import { Skeleton, EmptyState, ErrorState } from '../components/StateViews'
import { Pagination } from '../components/Pagination'
import type { AuditLog } from '../types/ticket'

const ACTIONS = [
  'ticket.created',
  'ticket.assigned',
  'ticket.transferred',
  'ticket.processed',
  'ticket.completed',
  'ticket.cancelled',
]

// 操作日志：全局审计事件列表，支持按公司、操作类型筛选。
export default function LogsPage() {
  const [companyId, setCompanyId] = useState('')
  const [action, setAction] = useState('')
  const [page, setPage] = useState(1)

  const query = buildQuery({ company_id: companyId, action, page, limit: 20 })
  const { data, loading, error, reload } = useAsync<Paginated<AuditLog>>(
    () => apiRequest(`/api/logs${query}`),
    [query],
  )

  const logs = data?.data ?? []
  const resetPage = () => setPage(1)

  return (
    <section className="card">
      <div className="section-heading"><h2>操作日志 ({data?.pagination.total ?? 0})</h2></div>
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); resetPage(); void reload() }}>
        <label>公司 ID（可选）<input value={companyId} onChange={(e) => { setCompanyId(e.currentTarget.value); resetPage() }} /></label>
        <label>操作类型
          <select value={action} onChange={(e) => { setAction(e.currentTarget.value); resetPage() }}>
            <option value="">全部</option>
            {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
      </form>

      <div className="mt-4">
        {loading && <Skeleton lines={5} />}
        {error && <ErrorState message={error} onRetry={reload} />}
        {!loading && !error && logs.length === 0 && <EmptyState title="暂无操作日志" />}
        {!loading && !error && logs.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead><tr><th>操作类型</th><th>操作人</th><th>时间</th></tr></thead>
              <tbody>{logs.map((log) => (
                <tr key={log.id}>
                  <td>{log.action}</td>
                  <td title={log.actor_id}>{log.actor_id}</td>
                  <td>{new Date(log.created_at).toLocaleString()}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {data && data.pagination.total > data.pagination.limit && (
          <Pagination pagination={data.pagination} onPage={setPage} />
        )}
      </div>
    </section>
  )
}
