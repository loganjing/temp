// 审计页：按工单 / 公司 / 动作检索审计事件，支持分页。
// 访问角色：handler（本公司，服务端强制数据域）/ ops（全量）；submitter 由路由守卫拦截。

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listAuditEvents } from '../api'
import { describeApiError } from '../platform/api-client'
import { AUDIT_ACTIONS, AUDIT_ACTION_LABELS, type AuditEvent, type Paged } from '../contracts'
import { formatDateTime } from '../format'
import { useAuth } from '../state/auth'
import { useCompanyDirectory } from '../state/company-directory'
import { EmptyBlock, ErrorBlock, LoadingBlock, Pagination } from '../components/ui'

const PAGE_SIZE = 20

export default function AuditPage() {
  const { user } = useAuth()
  const { companies, resolve } = useCompanyDirectory()
  const isOps = user.role === 'ops'
  const [ticketIdText, setTicketIdText] = useState('')
  const [ticketId, setTicketId] = useState<number | ''>('')
  const [companyId, setCompanyId] = useState<number | ''>('')
  const [action, setAction] = useState('')
  const [page, setPage] = useState(1)
  const [nonce, setNonce] = useState(0)
  const [result, setResult] = useState<Paged<AuditEvent> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 工单号输入防抖后生效
  useEffect(() => {
    const timer = setTimeout(() => {
      setTicketId(/^\d+$/.test(ticketIdText.trim()) ? Number(ticketIdText.trim()) : '')
      setPage(1)
    }, 400)
    return () => clearTimeout(timer)
  }, [ticketIdText])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const data = await listAuditEvents({
          ticket_id: ticketId === '' ? undefined : ticketId,
          company_id: isOps && companyId !== '' ? companyId : undefined,
          action: action || undefined,
          page,
          page_size: PAGE_SIZE,
        })
        if (cancelled) return
        setResult(data)
      } catch (cause) {
        if (!cancelled) setError(describeApiError(cause))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [ticketId, companyId, action, page, nonce, isOps])

  const items = result?.items ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">审计日志</h1>
        <p className="text-xs text-slate-500">
          {isOps ? '检索全部公司的关键操作记录' : `检索本公司（${resolve(user.company_id)}）的关键操作记录`}
        </p>
      </div>

      <section className="card p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label" htmlFor="audit-ticket">
              工单 ID
            </label>
            <input
              id="audit-ticket"
              className="input"
              inputMode="numeric"
              placeholder="按工单内部 ID 精确检索"
              value={ticketIdText}
              onChange={(event) => setTicketIdText(event.currentTarget.value)}
            />
          </div>
          {isOps && (
            <div>
              <label className="label" htmlFor="audit-company">
                公司
              </label>
              <select
                id="audit-company"
                className="input"
                value={companyId}
                onChange={(event) => {
                  const value = event.currentTarget.value
                  setCompanyId(value === '' ? '' : Number(value))
                  setPage(1)
                }}
              >
                <option value="">全部公司</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="label" htmlFor="audit-action">
              动作
            </label>
            <select
              id="audit-action"
              className="input"
              value={action}
              onChange={(event) => {
                setAction(event.currentTarget.value)
                setPage(1)
              }}
            >
              <option value="">全部动作</option>
              {AUDIT_ACTIONS.map((item) => (
                <option key={item} value={item}>
                  {AUDIT_ACTION_LABELS[item] ?? item}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button type="button" className="btn btn-secondary w-full" onClick={() => setPage(1)}>
              应用筛选
            </button>
          </div>
        </div>
      </section>

      <section className="card">
        {loading ? (
          <LoadingBlock label="加载审计事件…" />
        ) : error ? (
          <ErrorBlock message={error} onRetry={() => setNonce((value) => value + 1)} />
        ) : items.length === 0 ? (
          <EmptyBlock title="暂无符合条件的审计事件" hint="可调整工单、公司或动作筛选条件" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="table-th">时间</th>
                  <th className="table-th">动作</th>
                  <th className="table-th">操作者</th>
                  <th className="table-th">工单</th>
                  <th className="table-th">公司</th>
                  <th className="table-th">详情</th>
                </tr>
              </thead>
              <tbody>
                {items.map((event) => (
                  <tr key={event.id}>
                    <td className="table-td whitespace-nowrap text-xs text-slate-500">{formatDateTime(event.occurred_at)}</td>
                    <td className="table-td text-xs">{AUDIT_ACTION_LABELS[event.action] ?? event.action}</td>
                    <td className="table-td text-sm">{event.actor_name}</td>
                    <td className="table-td text-xs">
                      {event.ticket_id != null ? (
                        <Link className="text-indigo-600 hover:underline" to={`/workbench?ticket=${event.ticket_id}`}>
                          #{event.ticket_id}
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="table-td text-xs">{resolve(event.company_id)}</td>
                    <td className="table-td">
                      <DetailsCell details={event.details} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-slate-200 p-3">
          <Pagination page={result?.page ?? page} pageSize={result?.page_size ?? PAGE_SIZE} total={result?.total ?? 0} onPage={setPage} />
        </div>
      </section>
    </div>
  )
}

function DetailsCell({ details }: { details: Record<string, unknown> }) {
  const entries = Object.entries(details ?? {})
  if (entries.length === 0) {
    return <span className="text-xs text-slate-400">—</span>
  }
  return (
    <details className="text-xs">
      <summary className="cursor-pointer select-none text-indigo-600">查看</summary>
      <pre className="mt-1 max-w-md overflow-x-auto rounded bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-600">
        {JSON.stringify(details, null, 2)}
      </pre>
    </details>
  )
}
