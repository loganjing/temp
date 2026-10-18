import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest } from '../../platform/api-client'
import { errorText } from '../../platform/errors'
import { useSession } from '../../platform/session'
import { DataTable, type Column } from '../../components/DataTable'
import { SelectField } from '../../components/form'
import { useOptionList, codeNameOf } from '../../components/options'
import { Alert, PageHeader, Pagination, StatusBadge, statusTone } from '../../components/ui'
import { formatDateTime } from '../../platform/format'
import { ADJUSTMENT_STATUS_LABELS, labelOf } from '../../labels'
import type { Adjustment, Paged } from '../../types'

const PAGE_SIZE = 20

// 应收费用调整单列表：状态筛选 + 分页 + 行操作（详情 / 审核入口按权限与状态渲染）。
export default function AdjustmentsList() {
  const { can, user } = useSession()
  const [rows, setRows] = useState<Adjustment[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const orgs = useOptionList<Record<string, unknown>>('/api/orgs', codeNameOf)

  const load = useCallback(async () => {
    setError('')
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
    if (status) params.set('status', status)
    try {
      const result = await apiRequest<Paged<Adjustment>>(`/api/adjustments?${params.toString()}`)
      setRows(result.items)
      setTotal(result.total)
    } catch (cause) {
      setRows([])
      setTotal(0)
      setError(errorText(cause, '调整单列表加载失败'))
    }
  }, [page, status])

  useEffect(() => { void load() }, [load])

  const nameOfRef = (refId: string | null) =>
    refId ? String(orgs.items.find((item) => item.id === refId)?.name ?? refId) : '—'

  const columns: Column<Adjustment>[] = [
    {
      key: 'billNo',
      title: '单据编号',
      render: (row) => <Link to={`/adjustments/${row.id}`} style={{ color: 'var(--primary)' }}>{row.billNo}</Link>,
      width: '170px',
    },
    { key: 'org', title: '组织机构', render: (row) => nameOfRef(row.orgId) },
    { key: 'period', title: '业务周期', render: (row) => `${row.periodStart} ~ ${row.periodEnd}` },
    {
      key: 'status',
      title: '单据状态',
      render: (row) => <StatusBadge label={labelOf(ADJUSTMENT_STATUS_LABELS, row.status)} tone={statusTone(row.status)} />,
    },
    { key: 'remark', title: '备注', render: (row) => <span className="cell-ellipsis" title={row.remark ?? ''}>{row.remark ?? '—'}</span> },
    { key: 'createdAt', title: '创建时间', render: (row) => formatDateTime(row.createdAt) },
    {
      key: 'actions',
      title: '操作',
      render: (row) => (
        <div className="toolbar">
          <Link className="btn btn-secondary btn-sm" to={`/adjustments/${row.id}`}>{row.status === 'draft' ? '继续编辑' : '详情'}</Link>
          {can('adjustment:audit') && row.status === 'draft' && <Link className="btn btn-sm" to={`/adjustments/${row.id}?audit=1`}>审核</Link>}
        </div>
      ),
      width: '170px',
    },
  ]

  return (
    <div className="section-gap">
      <PageHeader
        title="应收费用调整单"
        description="修正自动计费误差、补录临时增值费用；审核生效后同步更新应收明细金额。"
        actions={can('adjustment:create') ? <Link className="btn" to="/adjustments/new">新建调整单</Link> : null}
      />
      {error && <Alert kind="error">{error}</Alert>}
      <section className="card">
        <div className="card-body">
          <div className="filter-bar">
            <SelectField
              label="单据状态"
              options={[
                { value: 'draft', label: '暂存' },
                { value: 'effective', label: '已生效' },
              ]}
              value={status}
              onChange={(value) => { setStatus(value); setPage(1) }}
            />
            <div className="toolbar">
              <button type="button" className="btn btn-secondary" onClick={() => { setStatus(''); setPage(1) }}>重置筛选</button>
            </div>
          </div>
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          emptyTitle="暂无调整单"
          emptyDescription={can('adjustment:create') ? '点击「新建调整单」修正计费误差或补录临时费用。' : '当前条件下没有可展示的调整单。'}
          emptyAction={can('adjustment:create') ? <Link className="btn btn-sm" to="/adjustments/new">新建调整单</Link> : null}
        />
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
      </section>
    </div>
  )
}
