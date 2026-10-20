import { useCallback, useEffect, useState } from 'react'
import { apiErrorText } from '../../api/helpers'
import { fetchSubmitterInfo } from '../../api/tickets'
import type { SubmitterInfo, Ticket } from '../../api/types'
import { formatDateTime, formatText } from '../../format'
import { EmptyState, ErrorBanner, PriorityBadge, SkeletonBlock, StatusBadge } from '../ui'

export function SubmitterInfoCard({ ticket, onOpenTicket }: { ticket: Ticket; onOpenTicket?: (ticketId: string) => void }) {
  const [info, setInfo] = useState<SubmitterInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  const ticketId = ticket.id
  const refresh = useCallback(async () => {
    setError(null)
    try {
      setInfo(await fetchSubmitterInfo(ticketId))
    } catch (err) {
      setError(apiErrorText(err))
    }
  }, [ticketId])

  useEffect(() => {
    setInfo(null)
    void refresh()
  }, [refresh])

  return (
    <div className="card-base p-4">
      <h3 className="section-title">提交人信息</h3>
      {error ? (
        <div className="mt-3">
          <ErrorBanner message={error} onRetry={() => void refresh()} />
        </div>
      ) : !info ? (
        <div className="mt-3 space-y-2">
          <SkeletonBlock className="h-8 w-full" />
          <SkeletonBlock className="h-24 w-full" />
        </div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm lg:grid-cols-4">
            <InfoItem label="姓名" value={info.user.name} />
            <InfoItem label="公司" value={info.user.companyName} />
            <InfoItem label="部门" value={formatText(info.user.department)} />
            <InfoItem label="邮箱" value={info.user.email} />
          </div>
          <div className="mt-4">
            <h4 className="text-xs font-medium text-slate-500">历史工单（{info.historyTickets.length}）</h4>
            {info.historyTickets.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">该提交人暂无历史工单</p>
            ) : (
              <div className="mt-2 overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {info.historyTickets.map(item => (
                      <tr key={item.id} className="cursor-pointer hover:bg-slate-50" onClick={() => onOpenTicket?.(item.id)}>
                        <td className="w-28 px-3 py-2 font-mono text-xs text-slate-500">{item.id}</td>
                        <td className="max-w-56 truncate px-2 py-2 text-slate-800" title={item.title}>
                          {item.title}
                        </td>
                        <td className="px-2 py-2">
                          <PriorityBadge priority={item.priority} />
                        </td>
                        <td className="px-2 py-2">
                          <StatusBadge status={item.status} />
                        </td>
                        <td className="w-32 whitespace-nowrap px-3 py-2 text-xs text-slate-400">{formatDateTime(item.createdAt)}</td>
                        {item.id === ticket.id && (
                          <td className="w-12 px-2 py-2 text-xs text-indigo-600">当前</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-0.5 truncate text-slate-800" title={value}>
        {value}
      </p>
    </div>
  )
}
