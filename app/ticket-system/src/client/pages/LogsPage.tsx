import { useState } from 'react'
import { apiRequest } from '../platform/api-client'
import { useAsyncData } from '../components/useAsyncData'
import {
  ACTION_LABELS,
  EmptyState,
  ErrorNotice,
  PageHeader,
  Pagination,
  SkeletonList,
  formatDateTime,
} from '../components/ui'
import type { AuditEvent, Page } from '../types'

const PAGE_SIZE = 20

/** 操作日志：本公司关键操作日志（时间倒序，公司隔离），含操作人与操作时间。 */
export default function LogsPage() {
  const [page, setPage] = useState(1)
  const logs = useAsyncData<Page<AuditEvent>>(
    () => apiRequest(`/api/logs?${new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })}`),
    [page],
  )

  const items = logs.data?.items ?? []

  return (
    <div>
      <PageHeader
        title="操作日志"
        description="记录创建、分配、回复、转派、完成、取消、评价及配置变更等关键操作（本公司范围，时间倒序）。"
      />
      <section className="card">
        <div className="border-b border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-700">操作记录（{logs.data?.total ?? 0}）</h2>
        </div>
        {logs.loading ? (
          <SkeletonList rows={8} />
        ) : logs.error ? (
          <div className="p-4">
            <ErrorNotice error={logs.error} onRetry={logs.reload} />
          </div>
        ) : items.length === 0 ? (
          <EmptyState title="暂无操作日志" hint="执行工单提交、分配、回复等操作后，将在此记录。" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">操作时间</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">操作</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">操作人</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">工单号</th>
                  <th className="px-3 py-2 font-medium">详情</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((log) => (
                  <tr key={log.eventId}>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">
                      <time dateTime={log.occurredAt}>{formatDateTime(log.occurredAt)}</time>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span className="badge border-slate-200 bg-slate-50 text-slate-600">
                        {ACTION_LABELS[log.action] ?? log.action}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">{log.operatorName}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-slate-500">
                      {log.ticketNo ?? '—'}
                    </td>
                    <td className="max-w-[28rem] truncate px-3 py-2.5 text-slate-600" title={log.detail}>
                      {log.detail}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!logs.loading && !logs.error && (
          <Pagination
            page={logs.data?.page ?? page}
            pageSize={logs.data?.pageSize ?? PAGE_SIZE}
            total={logs.data?.total ?? 0}
            onPage={setPage}
          />
        )}
      </section>
    </div>
  )
}
