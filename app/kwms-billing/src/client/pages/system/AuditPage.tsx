import { useCallback, useEffect, useState } from 'react'
import { apiRequest } from '../../platform/api-client'
import { errorText } from '../../platform/errors'
import { DataTable, type Column } from '../../components/DataTable'
import { SelectField } from '../../components/form'
import { Alert, PageHeader, Pagination } from '../../components/ui'
import { formatDateTime } from '../../platform/format'
import { ENTITY_TYPE_LABELS, labelOf } from '../../labels'
import type { AuditEvent, ChangeLog, Paged } from '../../types'

const PAGE_SIZE = 20
const ENTITY_OPTIONS = Object.entries(ENTITY_TYPE_LABELS).map(([value, label]) => ({ value, label }))

type AuditTab = 'events' | 'changes'

function describeValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') {
    const text = JSON.stringify(value)
    return text === '{}' || text === '[]' ? '—' : text
  }
  return String(value)
}

// 审计查询：业务审计事件与变更日志双视图（audit:view），支持按实体类型与实体 ID 过滤。
export default function AuditPage() {
  const [tab, setTab] = useState<AuditTab>('events')
  const [entityType, setEntityType] = useState('')
  const [entityId, setEntityId] = useState('')
  const [rows, setRows] = useState<Array<AuditEvent | ChangeLog> | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
    if (entityType) params.set('entityType', entityType)
    if (entityId.trim()) params.set('entityId', entityId.trim())
    const path = tab === 'events' ? '/api/audit/events' : '/api/audit/change-logs'
    try {
      const result = await apiRequest<Paged<AuditEvent | ChangeLog>>(`${path}?${params.toString()}`)
      setRows(result.items)
      setTotal(result.total)
    } catch (cause) {
      setRows([])
      setTotal(0)
      setError(errorText(cause, '审计数据加载失败'))
    }
  }, [tab, page, entityType, entityId])

  useEffect(() => { void load() }, [load])

  const switchTab = (next: AuditTab) => {
    setTab(next)
    setPage(1)
    setRows(null)
  }

  const eventColumns: Column<AuditEvent>[] = [
    { key: 'operatorName', title: '操作人', render: (row) => row.operatorName ?? '系统', width: '120px' },
    { key: 'action', title: '操作', render: (row) => row.action || '—', width: '80px' },
    { key: 'entityType', title: '业务对象', render: (row) => labelOf(ENTITY_TYPE_LABELS, row.entityType), width: '140px' },
    { key: 'entityId', title: '对象标识', render: (row) => <span className="cell-ellipsis" title={row.entityId}>{row.entityId}</span> },
    { key: 'operatedAt', title: '操作时间', render: (row) => formatDateTime(row.operatedAt), width: '150px' },
  ]

  const changeColumns: Column<ChangeLog>[] = [
    { key: 'operatorName', title: '操作人', render: (row) => row.operatorName ?? '系统', width: '120px' },
    { key: 'changeType', title: '变更类型', render: (row) => row.changeType, width: '90px' },
    { key: 'entityType', title: '业务对象', render: (row) => labelOf(ENTITY_TYPE_LABELS, row.entityType), width: '140px' },
    { key: 'entityId', title: '对象标识', render: (row) => <span className="cell-ellipsis" title={row.entityId}>{row.entityId}</span> },
    { key: 'before', title: '变更前', render: (row) => <span className="cell-ellipsis" title={describeValue(row.before)}>{describeValue(row.before)}</span> },
    { key: 'after', title: '变更后', render: (row) => <span className="cell-ellipsis" title={describeValue(row.after)}>{describeValue(row.after)}</span> },
    { key: 'reason', title: '变更原因', render: (row) => (row.reason ? <span className="cell-ellipsis" title={row.reason}>{row.reason}</span> : <span className="muted">—</span>) },
    { key: 'operatedAt', title: '操作时间', render: (row) => formatDateTime(row.operatedAt), width: '150px' },
  ]

  return (
    <div className="section-gap">
      <PageHeader
        title="审计查询"
        description="查询业务审计事件（新增、编辑、审核、重算、开票、核销、终止）与金额变更日志，支持按业务对象过滤。"
      />
      {error && <Alert kind="error">{error}</Alert>}
      <div className="tabs" role="tablist" aria-label="审计视图">
        <button type="button" role="tab" aria-selected={tab === 'events'} className={`tab${tab === 'events' ? ' active' : ''}`} onClick={() => switchTab('events')}>审计事件</button>
        <button type="button" role="tab" aria-selected={tab === 'changes'} className={`tab${tab === 'changes' ? ' active' : ''}`} onClick={() => switchTab('changes')}>变更日志</button>
      </div>
      <section className="card">
        <div className="card-body">
          <div className="filter-bar">
            <SelectField
              label="业务对象类型"
              options={ENTITY_OPTIONS}
              value={entityType}
              onChange={(value) => { setEntityType(value); setPage(1) }}
            />
            <label className="field">
              <span className="field-label">对象标识（实体 ID）</span>
              <input className="input" value={entityId} placeholder="例如报价单明细 ID" onChange={(event) => setEntityId(event.currentTarget.value)} />
            </label>
            <div className="toolbar">
              <button type="button" className="btn btn-secondary" onClick={() => { setEntityType(''); setEntityId(''); setPage(1) }}>重置筛选</button>
            </div>
          </div>
        </div>
        {tab === 'events' ? (
          <DataTable
            columns={eventColumns}
            rows={rows as AuditEvent[] | null}
            rowKey={(row) => row.id}
            emptyTitle="暂无审计事件"
            emptyDescription="尚未记录业务操作事件；完成单据操作后此处可追溯操作人、动作与时间。"
          />
        ) : (
          <DataTable
            columns={changeColumns}
            rows={rows as ChangeLog[] | null}
            rowKey={(row) => row.id}
            emptyTitle="暂无变更日志"
            emptyDescription="尚未记录金额/规则变更；费用重算、调整审核等操作会在此留存变更前后值与原因。"
          />
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
      </section>
    </div>
  )
}
