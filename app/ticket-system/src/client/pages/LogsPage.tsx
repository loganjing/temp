import { useState, type FormEvent } from 'react'
import { useAsyncData, type AsyncHandle } from '../app/useAsyncData'
import { useCompanyOptions } from '../app/useCompanyOptions'
import { useCurrentUser } from '../app/session'
import { fetchLogs } from '../api'
import { TICKET_ACTIONS, type DistributionStats, type LogListResult, type TicketAction } from '../contract'
import { ACTION_LABELS, formatDateTime } from '../labels'
import { Card, DataState, Field, Pagination } from '../components/ui'

const LOGS_PAGE_SIZE = 20

export default function LogsPage() {
  const me = useCurrentUser()
  const companyOptions = useCompanyOptions(me)
  const [filters, setFilters] = useState<{ ticketId?: number; action?: TicketAction; companyId?: number }>({})
  const [page, setPage] = useState(1)
  const logs = useAsyncData(
    () => fetchLogs({ ticketId: filters.ticketId, action: filters.action, companyId: filters.companyId, page, pageSize: LOGS_PAGE_SIZE }),
    [filters, page],
  )

  return (
    <LogsView
      me={me}
      logs={logs}
      companyOptions={companyOptions}
      onApplyFilters={(next) => { setFilters(next); setPage(1) }}
      onPageChange={setPage}
    />
  )
}

export interface LogsViewProps {
  me: { crossCompanyView: boolean }
  logs: AsyncHandle<LogListResult>
  companyOptions: AsyncHandle<DistributionStats> | null
  onApplyFilters: (filters: { ticketId?: number; action?: TicketAction; companyId?: number }) => void
  onPageChange: (page: number) => void
}

export function LogsView(props: LogsViewProps) {
  const [ticketIdDraft, setTicketIdDraft] = useState('')
  const [actionDraft, setActionDraft] = useState<TicketAction | ''>('')
  const [companyDraft, setCompanyDraft] = useState('')
  const ticketIdDraftInvalid = ticketIdDraft.trim() !== '' && !/^\d+$/.test(ticketIdDraft.trim())

  const apply = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    const trimmed = ticketIdDraft.trim()
    props.onApplyFilters({
      ticketId: /^\d+$/.test(trimmed) ? Number(trimmed) : undefined,
      action: actionDraft === '' ? undefined : actionDraft,
      companyId: props.me.crossCompanyView && companyDraft !== '' ? Number(companyDraft) : undefined,
    })
  }

  const reset = () => {
    setTicketIdDraft('')
    setActionDraft('')
    setCompanyDraft('')
    props.onApplyFilters({})
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <Card
        title="操作日志"
        actions={props.logs.phase === 'ready' ? <span className="text-xs text-slate-500">{`共 ${props.logs.data.total} 条`}</span> : null}
      >
        <form className="grid items-end gap-3 sm:grid-cols-4" onSubmit={(event) => apply(event)}>
          <Field label="工单ID">
            <input
              className="input-base"
              value={ticketIdDraft}
              onChange={(event) => setTicketIdDraft(event.currentTarget.value)}
              inputMode="numeric"
              placeholder="如 12"
            />
          </Field>
          <Field label="操作类型">
            <select
              className="input-base"
              value={actionDraft}
              onChange={(event) => setActionDraft(event.currentTarget.value as TicketAction | '')}
            >
              <option value="">全部操作</option>
              {TICKET_ACTIONS.map((action) => (
                <option key={action} value={action}>{ACTION_LABELS[action]}</option>
              ))}
            </select>
          </Field>
          {props.companyOptions !== null ? (
            <Field label="公司">
              <select className="input-base" value={companyDraft} onChange={(event) => setCompanyDraft(event.currentTarget.value)}>
                <option value="">全部公司</option>
                {props.companyOptions.phase === 'ready'
                  ? props.companyOptions.data.items.map((item) => (
                    <option key={String(item.key)} value={item.key}>{item.label}</option>
                  ))
                  : null}
              </select>
            </Field>
          ) : null}
          <div className="flex gap-2">
            <button type="submit" className="btn-primary">查询</button>
            <button type="button" className="btn-secondary" onClick={reset}>重置</button>
          </div>
        </form>
        {ticketIdDraftInvalid && <p className="mt-2 text-xs text-red-600">工单ID需为数字</p>}
        <div className="mt-4">
          <DataState state={props.logs} isEmpty={(result) => result.items.length === 0} empty="没有符合条件的日志记录">
            {(result) => (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs text-slate-500">
                      <th className="py-2 pr-3 font-medium">时间</th>
                      <th className="py-2 pr-3 font-medium">操作</th>
                      <th className="py-2 pr-3 font-medium">操作人</th>
                      <th className="py-2 pr-3 font-medium">工单</th>
                      <th className="py-2 font-medium">摘要</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {result.items.map((entry) => (
                      <tr key={entry.id}>
                        <td className="whitespace-nowrap py-2.5 pr-3 text-xs text-slate-500">{formatDateTime(entry.createdAt)}</td>
                        <td className="whitespace-nowrap py-2.5 pr-3 text-xs font-medium text-slate-700">{ACTION_LABELS[entry.action]}</td>
                        <td className="whitespace-nowrap py-2.5 pr-3 text-slate-700">
                          {entry.actor === 'system' ? '系统' : entry.actor.displayName}
                        </td>
                        <td className="whitespace-nowrap py-2.5 pr-3 text-xs text-slate-500">
                          {entry.ticketId === null ? '—' : `#${entry.ticketId}`}
                        </td>
                        <td className="py-2.5 text-slate-500">{entry.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DataState>
        </div>
        {props.logs.phase === 'ready' && (
          <div className="mt-3 border-t border-slate-100">
            <Pagination
              page={props.logs.data.page}
              pageSize={props.logs.data.pageSize}
              total={props.logs.data.total}
              onChange={props.onPageChange}
            />
          </div>
        )}
      </Card>
    </div>
  )
}
