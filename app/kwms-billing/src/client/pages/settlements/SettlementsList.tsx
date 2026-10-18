import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest } from '../../platform/api-client'
import { errorText } from '../../platform/errors'
import { useSession } from '../../platform/session'
import { DataTable, type Column } from '../../components/DataTable'
import { SelectField } from '../../components/form'
import { useOptionList, codeNameOf } from '../../components/options'
import { Alert, PageHeader, Pagination } from '../../components/ui'
import { formatCents, formatDateTime } from '../../platform/format'
import type { Paged, Settlement } from '../../types'

const PAGE_SIZE = 20

// 应收结算单列表：对账审核后自动生成，一一绑定对账单；四个金额字段只读（按角色可见性输出）。
export default function SettlementsList() {
  const [rows, setRows] = useState<Settlement[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const orgs = useOptionList<Record<string, unknown>>('/api/orgs', codeNameOf)
  const warehouses = useOptionList<Record<string, unknown>>('/api/warehouses', (item) => String(item.name ?? ''))
  const owners = useOptionList<Record<string, unknown>>('/api/owners', (item) => String(item.name ?? ''))

  const load = useCallback(async () => {
    setError('')
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
    if (status) params.set('status', status)
    try {
      const result = await apiRequest<Paged<Settlement>>(`/api/settle-statements?${params.toString()}`)
      setRows(result.items)
      setTotal(result.total)
    } catch (cause) {
      setRows([])
      setTotal(0)
      setError(errorText(cause, '结算单列表加载失败'))
    }
  }, [page, status])

  useEffect(() => { void load() }, [load])

  const nameOfRef = (items: Array<Record<string, unknown>>, refId: string | null) =>
    refId ? String(items.find((item) => item.id === refId)?.name ?? refId) : '—'

  const columns: Column<Settlement>[] = [
    {
      key: 'billNo',
      title: '单据编号',
      render: (row) => <Link to={`/settlements/${row.id}`} style={{ color: 'var(--primary)' }}>{row.billNo}</Link>,
      width: '170px',
    },
    { key: 'org', title: '组织机构', render: (row) => nameOfRef(orgs.items, row.orgId) },
    { key: 'warehouse', title: '仓库', render: (row) => nameOfRef(warehouses.items, row.warehouseId) },
    { key: 'owner', title: '结算方（货主）', render: (row) => nameOfRef(owners.items, row.ownerId) },
    { key: 'reconTotal', title: '对账总金额（元）', render: (row) => formatCents(row.reconTotalAmount), numeric: true },
    { key: 'settleTotal', title: '结算总金额（元）', render: (row) => formatCents(row.settleTotalAmount), numeric: true },
    { key: 'invoiceTotal', title: '开票总金额（元）', render: (row) => formatCents(row.invoiceTotalAmount), numeric: true },
    { key: 'writeoffTotal', title: '核销总金额（元）', render: (row) => formatCents(row.writeoffTotalAmount), numeric: true },
    { key: 'status', title: '单据状态', render: () => <span className="badge badge-neutral">暂存</span> },
    { key: 'createdAt', title: '创建时间', render: (row) => formatDateTime(row.createdAt) },
    {
      key: 'actions',
      title: '操作',
      render: (row) => <Link className="btn btn-secondary btn-sm" to={`/settlements/${row.id}`}>详情（开票/核销）</Link>,
      width: '130px',
    },
  ]

  return (
    <div className="section-gap">
      <PageHeader
        title="应收结算单"
        description="对账单审核通过后自动生成；支持结算金额微调、开票与收款核销，开票、核销记录永久留存。"
      />
      {error && <Alert kind="error">{error}</Alert>}
      <section className="card">
        <div className="card-body">
          <div className="filter-bar">
            <SelectField
              label="单据状态"
              options={[{ value: 'draft', label: '暂存' }]}
              value={status}
              onChange={(value) => { setStatus(value); setPage(1) }}
              hint="结算单无终态"
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
          emptyTitle="暂无结算单"
          emptyDescription="结算单在对账单审核通过后自动生成；请先在「应收对账单」完成审核。"
          emptyAction={<Link className="btn btn-sm" to="/recon-statements">前往对账单</Link>}
        />
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
      </section>
    </div>
  )
}
