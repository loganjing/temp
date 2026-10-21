import { useState } from 'react'
import { auditApi } from '../platform/api-client'
import { AUDIT_ACTIONS, AUDIT_ACTION_LABEL, type AuditAction, type SessionUser } from '../components/contracts'
import { Card, EmptyState, SectionHeading, TableSkeleton, useAsync } from '../components/ui'

interface Props { currentUser: SessionUser }

export default function AuditLogsPage({ currentUser }: Props) {
  const [action, setAction] = useState<AuditAction | ''>('')
  const [ticketNo, setTicketNo] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [filterNonce, setFilterNonce] = useState(0)

  const list = useAsync(
    () => auditApi.list({ action: action || undefined, ticketNo: ticketNo.trim() || undefined, from: from ? new Date(from).toISOString() : undefined, to: to ? new Date(to + 'T23:59:59').toISOString() : undefined }),
    [filterNonce],
  )

  const apply = () => setFilterNonce((n) => n + 1)
  const items = list.data?.items ?? []

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <SectionHeading title="操作日志查询" subtitle={`审计范围：${currentUser.company.name}`} />
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
            操作类型
            <select value={action} onChange={(e) => setAction(e.target.value as AuditAction | '')}>
              <option value="">全部</option>
              {AUDIT_ACTIONS.map((a) => <option key={a} value={a}>{AUDIT_ACTION_LABEL[a]}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
            工单编号
            <input className="min-w-40" value={ticketNo} onChange={(e) => setTicketNo(e.target.value)} placeholder="如 TKT-000001" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
            起始日期
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
            截止日期
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button className="secondary" onClick={apply}>查询</button>
        </div>
      </Card>

      <Card className="p-0">
        <div className="px-5 py-4">
          <SectionHeading title="审计日志" subtitle={`${items.length} 条 · 时间倒序`} />
        </div>
        {list.loading ? <TableSkeleton rows={8} cols={5} /> : list.error ? (
          <div className="px-5 pb-5"><p className="text-sm text-red-600 dark:text-red-400">{list.error}</p></div>
        ) : items.length === 0 ? (
          <EmptyState title="暂无日志" hint="调整筛选条件后查询" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead><tr>
                <th className="p-3 text-xs text-slate-500">时间</th>
                <th className="p-3 text-xs text-slate-500">操作</th>
                <th className="p-3 text-xs text-slate-500">操作人</th>
                <th className="p-3 text-xs text-slate-500">工单</th>
                <th className="p-3 text-xs text-slate-500">详情</th>
              </tr></thead>
              <tbody>
                {items.map((e) => (
                  <tr key={e.id} className="border-t border-slate-200 dark:border-slate-700">
                    <td className="p-3 whitespace-nowrap text-xs text-slate-500">{new Date(e.createdAt).toLocaleString('zh-CN', { hour12: false })}</td>
                    <td className="p-3"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">{AUDIT_ACTION_LABEL[e.action]}</span></td>
                    <td className="p-3">{e.operator.name}</td>
                    <td className="p-3 font-mono text-xs">{e.ticketNo}</td>
                    <td className="p-3 text-xs text-slate-500 dark:text-slate-400">{e.detail ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
