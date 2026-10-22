import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { describeError } from '../platform/api-client'
import { EmptyState, ErrorState, LoadingState } from '../platform/states'
import { Pagination } from '../platform/Pagination'
import { listAuditEvents } from '../tickets/api'
import { auditActionOptions, auditObjectTypeOptions, formatDateTime, label, objectTypeLabels } from '../tickets/labels'
import type { AuditEventRecord, MeContext, Page } from '../../shared/contracts'

const emptyFilters = { objectType: '', objectId: '', actorMemberId: '', action: '', from: '', to: '', page: 1, pageSize: 20 }

function dayRange(from: string, to: string) {
  return {
    from: from ? `${from}T00:00:00.000Z` : undefined,
    to: to ? `${to}T23:59:59.999Z` : undefined,
  }
}

// 操作日志：按对象类型、对象 ID、操作人、操作与时间范围过滤，分页展示。
export default function AuditLogPage({ context }: { context: MeContext }) {
  const [inputs, setInputs] = useState(emptyFilters)
  const [applied, setApplied] = useState(emptyFilters)
  const [data, setData] = useState<Page<AuditEventRecord> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const range = dayRange(applied.from, applied.to)
    try {
      const result = await listAuditEvents({
        objectType: applied.objectType || undefined,
        objectId: applied.objectId.trim() || undefined,
        actorMemberId: applied.actorMemberId.trim() || undefined,
        action: applied.action || undefined,
        ...range,
        page: applied.page,
        pageSize: applied.pageSize,
      })
      setData(result)
    } catch (cause) {
      setError(describeError(cause, '无法加载操作日志 / Could not load audit events'))
    } finally {
      setLoading(false)
    }
  }, [applied])

  useEffect(() => { void load() }, [load])

  const submitFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setApplied({ ...inputs, page: 1, pageSize: inputs.pageSize })
  }

  const items = data?.items ?? []

  return (
    <div className="page">
      <div className="section-heading">
        <h1>操作日志 / Audit log</h1>
        <span className="subtext">范围：{context.companyName}</span>
      </div>

      <section className="panel">
        <form className="filters" onSubmit={submitFilters}>
          <label>对象类型 / Object type
            <select value={inputs.objectType} onChange={(event) => setInputs({ ...inputs, objectType: event.currentTarget.value })}>
              <option value="">全部 / All</option>
              {auditObjectTypeOptions.map((item) => <option key={item} value={item}>{label(objectTypeLabels, item)}</option>)}
            </select>
          </label>
          <label>对象 ID / Object ID<input value={inputs.objectId} onChange={(event) => setInputs({ ...inputs, objectId: event.currentTarget.value })} /></label>
          <label>操作人 / Actor<input value={inputs.actorMemberId} onChange={(event) => setInputs({ ...inputs, actorMemberId: event.currentTarget.value })} placeholder="成员 ID 或 system" /></label>
          <label>操作 / Action
            <select value={inputs.action} onChange={(event) => setInputs({ ...inputs, action: event.currentTarget.value })}>
              <option value="">全部 / All</option>
              {auditActionOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>开始时间 / From<input type="date" value={inputs.from} onChange={(event) => setInputs({ ...inputs, from: event.currentTarget.value })} /></label>
          <label>结束时间 / To<input type="date" value={inputs.to} onChange={(event) => setInputs({ ...inputs, to: event.currentTarget.value })} /></label>
          <label>每页 / Page size
            <select value={inputs.pageSize} onChange={(event) => setInputs({ ...inputs, pageSize: Number(event.currentTarget.value) })}>
              {[20, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
          <div className="filter-actions">
            <button disabled={loading}>查询 / Search</button>
            <button type="button" className="secondary" onClick={() => { setInputs(emptyFilters); setApplied(emptyFilters) }}>重置 / Reset</button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>日志记录 / Events ({data?.total ?? 0})</h2>
          <button className="secondary" onClick={() => void load()} disabled={loading}>刷新 / Refresh</button>
        </div>
        {loading && <LoadingState />}
        {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}
        {!loading && !error && items.length === 0 && <EmptyState message="当前条件下没有日志记录。/ No audit events match the filters." />}
        {!loading && !error && items.length > 0 && (
          <>
            <div className="table-scroll">
              <table className="data-table">
                <thead><tr><th>时间</th><th>操作</th><th>对象类型</th><th>对象 ID</th><th>操作人</th><th>详情</th></tr></thead>
                <tbody>
                  {items.map((item) => {
                    const details: unknown = item.details
                    const detailsText = details === undefined || details === null ? '—' : JSON.stringify(details)
                    return (
                      <tr key={item.id}>
                        <td>{formatDateTime(item.occurredAt)}</td>
                        <td><strong>{item.action}</strong></td>
                        <td>{label(objectTypeLabels, item.objectType)}</td>
                        <td className="truncate" title={item.objectId}>{item.objectId}</td>
                        <td>{item.actorName || item.actorMemberId}</td>
                        <td className="truncate" title={detailsText}>{detailsText}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={data?.page ?? 1} pageSize={applied.pageSize} total={data?.total ?? 0} onPage={(page) => setApplied({ ...applied, page })} />
          </>
        )}
      </section>
    </div>
  )
}
