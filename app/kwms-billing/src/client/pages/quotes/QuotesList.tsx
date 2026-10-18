import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiRequest } from '../../platform/api-client'
import { errorText } from '../../platform/errors'
import { useSession } from '../../platform/session'
import { DataTable, type Column } from '../../components/DataTable'
import { SelectField } from '../../components/form'
import { useOptionList, codeNameOf } from '../../components/options'
import { Alert, PageHeader, Pagination, statusTone, StatusBadge } from '../../components/ui'
import { BILLING_PERIOD_LABELS, OWNER_TYPE_LABELS, QUOTE_STATUS_LABELS, labelOf } from '../../labels'
import type { Paged, Quote } from '../../types'

const PAGE_SIZE = 20

// 仓储合同报价单列表：筛选 + 表格 + 行操作（详情/编辑/审核/终止入口按权限与状态渲染）。
export default function QuotesList() {
  const { can, user } = useSession()
  const navigate = useNavigate()
  const [rows, setRows] = useState<Quote[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const [orgId, setOrgId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [status, setStatus] = useState('')

  const orgs = useOptionList<Record<string, unknown>>('/api/orgs', codeNameOf)
  const warehousePath = orgId ? `/api/warehouses?orgId=${encodeURIComponent(orgId)}` : '/api/warehouses'
  const warehouses = useOptionList<Record<string, unknown>>(warehousePath, (item) => String(item.name ?? ''))
  const ownerPath = `/api/owners${orgId ? `?orgId=${encodeURIComponent(orgId)}` : ''}`
  const owners = useOptionList<Record<string, unknown>>(ownerPath, (item) => String(item.name ?? ''))

  const load = useCallback(async () => {
    setError('')
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
    if (orgId) params.set('orgId', orgId)
    if (warehouseId) params.set('warehouseId', warehouseId)
    if (ownerId) params.set('ownerId', ownerId)
    if (status) params.set('status', status)
    try {
      const result = await apiRequest<Paged<Quote>>(`/api/quotes?${params.toString()}`)
      setRows(result.items)
      setTotal(result.total)
    } catch (cause) {
      setRows([])
      setTotal(0)
      setError(errorText(cause, '报价单列表加载失败'))
    }
  }, [page, orgId, warehouseId, ownerId, status])

  useEffect(() => { void load() }, [load])

  const nameOfRef = (items: Array<Record<string, unknown>>, id: string | null) =>
    id ? String(items.find((item) => item.id === id)?.name ?? id) : '—'

  const columns: Column<Quote>[] = [
    {
      key: 'billNo',
      title: '单据编号',
      render: (row) => <Link to={`/quotes/${row.id}`} className="btn-link" style={{ textDecoration: 'none', color: 'var(--primary)' }}>{row.billNo}</Link>,
      width: '160px',
    },
    {
      key: 'contract',
      title: '合同编号',
      render: (row) => {
        const contractNo = String(row.contractNo ?? row.contractId)
        return <span className="cell-ellipsis" title={contractNo}>{contractNo}</span>
      },
    },
    { key: 'org', title: '组织机构', render: (row) => <span title={nameOfRef(orgs.items, row.orgId)}>{nameOfRef(orgs.items, row.orgId)}</span> },
    { key: 'warehouse', title: '仓库', render: (row) => nameOfRef(warehouses.items, row.warehouseId) },
    { key: 'owner', title: '货主', render: (row) => `${nameOfRef(owners.items, row.ownerId)}（${labelOf(OWNER_TYPE_LABELS, row.ownerType)}）` },
    { key: 'effect', title: '合同效期', render: (row) => `${row.effectStart} ~ ${row.effectEnd}` },
    { key: 'period', title: '结算账期', render: (row) => labelOf(BILLING_PERIOD_LABELS, row.billingPeriod).split('（')[0] },
    { key: 'rentFree', title: '免租期', render: (row) => `${row.rentFreeDays} 天`, numeric: true },
    {
      key: 'status',
      title: '单据状态',
      render: (row) => <StatusBadge label={labelOf(QUOTE_STATUS_LABELS, row.status)} tone={statusTone(row.status)} />,
    },
    { key: 'remark', title: '备注', render: (row) => <span className="cell-ellipsis" title={row.remark ?? ''}>{row.remark ?? '—'}</span> },
    {
      key: 'actions',
      title: '操作',
      render: (row) => (
        <div className="toolbar">
          <Link className="btn btn-secondary btn-sm" to={`/quotes/${row.id}`}>详情</Link>
          {can('quote:edit') && row.status === 'draft' && <Link className="btn btn-secondary btn-sm" to={`/quotes/${row.id}/edit`}>编辑</Link>}
          {can('quote:audit') && row.status === 'draft' && <Link className="btn btn-sm" to={`/quotes/${row.id}?audit=1`}>审核</Link>}
        </div>
      ),
      width: '190px',
    },
  ]

  return (
    <div className="section-gap">
      <PageHeader
        title="仓储合同报价单"
        description="维护货主计费单价、计费模式、免租期与分段优惠；审核生效后系统按账期自动计费。"
        actions={can('quote:create') ? <button type="button" className="btn" onClick={() => navigate('/quotes/new')}>新建报价单</button> : null}
      />
      {error && <Alert kind="error">{error}</Alert>}
      <section className="card">
        <div className="card-body">
          <div className="filter-bar">
            <SelectField
              label="组织机构"
              options={orgs.options}
              value={orgId}
              onChange={(value) => { setOrgId(value); setWarehouseId(''); setOwnerId(''); setPage(1) }}
            />
            <SelectField
              label="仓库"
              options={warehouses.options}
              value={warehouseId}
              disabled={!orgId}
              onChange={(value) => { setWarehouseId(value); setPage(1) }}
              hint={orgId ? undefined : '请先选择组织'}
            />
            <SelectField
              label="货主"
              options={owners.options}
              value={ownerId}
              onChange={(value) => { setOwnerId(value); setPage(1) }}
            />
            <SelectField
              label="单据状态"
              options={[
                { value: 'draft', label: '暂存' },
                { value: 'effective', label: '已生效' },
                { value: 'terminated', label: '已终止' },
              ]}
              value={status}
              onChange={(value) => { setStatus(value); setPage(1) }}
            />
            <div className="toolbar">
              <button type="button" className="btn btn-secondary" onClick={() => { setOrgId(user?.orgId ?? ''); setWarehouseId(''); setOwnerId(''); setStatus(''); setPage(1) }}>重置筛选</button>
            </div>
          </div>
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          emptyTitle="暂无报价单"
          emptyDescription={can('quote:create') ? '点击右上角「新建报价单」开始配置计费规则。' : '当前条件下没有可展示的报价单。'}
          emptyAction={can('quote:create') ? <Link className="btn btn-sm" to="/quotes/new">新建报价单</Link> : null}
        />
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
      </section>
    </div>
  )
}
