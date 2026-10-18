import { useCallback, useEffect, useState } from 'react'
import { apiRequest } from '../../platform/api-client'
import { errorText } from '../../platform/errors'
import { useSession } from '../../platform/session'
import { DataTable, type Column } from '../../components/DataTable'
import { DateField, SelectField } from '../../components/form'
import { useOptionList, codeNameOf } from '../../components/options'
import { Alert, PageHeader, Pagination, StatusBadge, statusTone } from '../../components/ui'
import { formatCents, formatQty } from '../../platform/format'
import { BILLING_BASIS_LABELS, BILLING_MODE_LABELS, RECEIVABLE_STATUS_LABELS, labelOf } from '../../labels'
import type { Paged, RecalcResponse, ReceivableDetail } from '../../types'

const PAGE_SIZE = 20

// 应收费用明细查询：周期/组织/仓库/货主/费用类型/状态筛选 + 批量【费用重算】。
// 已对账明细前端第一道拦截（RECONCILED_LOCKED）；金额字段按角色可见性可能为 null（显示 —）。
export default function ReceivablesPage() {
  const { can, user } = useSession()
  const [rows, setRows] = useState<ReceivableDetail[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [recalcBusy, setRecalcBusy] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [orgId, setOrgId] = useState(user?.orgId ?? '')
  const [warehouseId, setWarehouseId] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [feeTypeId, setFeeTypeId] = useState('')
  const [status, setStatus] = useState('')

  const orgs = useOptionList<Record<string, unknown>>('/api/orgs', codeNameOf)
  const warehousePath = orgId ? `/api/warehouses?orgId=${encodeURIComponent(orgId)}` : '/api/warehouses'
  const warehouses = useOptionList<Record<string, unknown>>(warehousePath, (item) => String(item.name ?? ''))
  const ownerPath = `/api/owners${orgId ? `?orgId=${encodeURIComponent(orgId)}` : ''}`
  const owners = useOptionList<Record<string, unknown>>(ownerPath, (item) => String(item.name ?? ''))
  const feeTypes = useOptionList<Record<string, unknown>>('/api/masterdata/fee-types', (item) => String(item.name ?? ''))

  const load = useCallback(async () => {
    setError('')
    setNotice('')
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
    if (periodStart) params.set('periodStart', periodStart)
    if (periodEnd) params.set('periodEnd', periodEnd)
    if (orgId) params.set('orgId', orgId)
    if (warehouseId) params.set('warehouseId', warehouseId)
    if (ownerId) params.set('ownerId', ownerId)
    if (feeTypeId) params.set('feeTypeId', feeTypeId)
    if (status) params.set('status', status)
    try {
      const result = await apiRequest<Paged<ReceivableDetail>>(`/api/receivables?${params.toString()}`)
      setRows(result.items)
      setTotal(result.total)
      setSelected(new Set())
    } catch (cause) {
      setRows([])
      setTotal(0)
      setError(errorText(cause, '应收明细加载失败'))
    }
  }, [page, periodStart, periodEnd, orgId, warehouseId, ownerId, feeTypeId, status])

  useEffect(() => { void load() }, [load])

  const toggleRow = (row: ReceivableDetail, selectedState: boolean) => {
    setSelected((current) => {
      const next = new Set(current)
      if (selectedState) next.add(row.id)
      else next.delete(row.id)
      return next
    })
  }

  const toggleAll = (selectedState: boolean) => {
    if (!rows) return
    setSelected((current) => {
      const next = new Set(current)
      for (const row of rows) {
        if (row.status !== 'reconciled') {
          if (selectedState) next.add(row.id)
          else next.delete(row.id)
        }
      }
      return next
    })
  }

  const recalc = async () => {
    if (selected.size === 0) {
      setError('请先勾选需要重算的应收费用明细。')
      return
    }
    const reconciled = (rows ?? []).filter((row) => selected.has(row.id) && row.status === 'reconciled')
    if (reconciled.length > 0) {
      setError(`已对账明细禁止重算（已对账 ${reconciled.length} 条）。请取消勾选已对账明细后重试。`)
      return
    }
    setRecalcBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await apiRequest<RecalcResponse>('/api/receivables/recalc', {
        method: 'POST',
        body: JSON.stringify({ ids: [...selected] }),
      })
      const skippedText = result.skipped.length > 0
        ? `；跳过 ${result.skipped.length} 条：${result.skipped.map((item) => `${item.id.slice(0, 8)}（${item.reason}）`).join('、')}`
        : ''
      setNotice(`费用重算完成：重新核算 ${result.recalculated} 条明细${skippedText}。变更已记录日志。`)
      await load()
    } catch (cause) {
      setError(errorText(cause, '费用重算失败'))
    } finally {
      setRecalcBusy(false)
    }
  }

  const nameOfRef = (items: Array<Record<string, unknown>>, refId: string | null) =>
    refId ? String(items.find((item) => item.id === refId)?.name ?? refId) : '—'

  const columns: Column<ReceivableDetail>[] = [
    { key: 'billDate', title: '记账日期', render: (row) => row.billDate, width: '110px' },
    { key: 'org', title: '组织机构', render: (row) => nameOfRef(orgs.items, row.orgId) },
    { key: 'warehouse', title: '仓库', render: (row) => nameOfRef(warehouses.items, row.warehouseId) },
    { key: 'owner', title: '货主', render: (row) => nameOfRef(owners.items, row.ownerId) },
    { key: 'feeType', title: '费用类型', render: (row) => nameOfRef(feeTypes.items, row.feeTypeId) },
    { key: 'billingMode', title: '计费模式', render: (row) => labelOf(BILLING_MODE_LABELS, row.billingMode) },
    { key: 'billingBasis', title: '计费方式', render: (row) => (row.billingBasis ? labelOf(BILLING_BASIS_LABELS, row.billingBasis) : '—') },
    { key: 'businessQty', title: '业务量', render: (row) => formatQty(row.businessQty), numeric: true },
    { key: 'rawAmount', title: '原始计算金额（元）', render: (row) => formatCents(row.rawAmount), numeric: true },
    { key: 'discountedAmount', title: '优惠后计费金额（元）', render: (row) => formatCents(row.discountedAmount), numeric: true },
    { key: 'minCharge', title: '最低收费（元）', render: (row) => formatCents(row.minCharge), numeric: true },
    { key: 'finalAmount', title: '最终计费金额（元）', render: (row) => formatCents(row.finalAmount), numeric: true },
    { key: 'quoteBillNo', title: '关联合同单号', render: (row) => <span className="cell-ellipsis" title={row.quoteBillNo}>{row.quoteBillNo}</span> },
    {
      key: 'status',
      title: '单据状态',
      render: (row) => <StatusBadge label={labelOf(RECEIVABLE_STATUS_LABELS, row.status)} tone={statusTone(row.status)} />,
    },
  ]

  return (
    <div className="section-gap">
      <PageHeader
        title="应收费用明细"
        description="系统定时任务自动生成的计费明细；已对账明细锁定不可重算。"
        actions={can('receivable:recalc') ? (
          <button type="button" className="btn" disabled={recalcBusy} onClick={() => void recalc()}>{recalcBusy ? '重算中…' : '费用重算'}</button>
        ) : null}
      />
      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}
      <section className="card">
        <div className="card-body">
          <div className="filter-bar">
            <DateField label="业务周期-开始" value={periodStart} onChange={(event) => { setPeriodStart(event.currentTarget.value); setPage(1) }} />
            <DateField label="业务周期-结束" value={periodEnd} onChange={(event) => { setPeriodEnd(event.currentTarget.value); setPage(1) }} />
            <SelectField label="组织机构" options={orgs.options} value={orgId} onChange={(value) => { setOrgId(value); setWarehouseId(''); setOwnerId(''); setPage(1) }} />
            <SelectField label="仓库" options={warehouses.options} value={warehouseId} disabled={!orgId} onChange={(value) => { setWarehouseId(value); setPage(1) }} />
            <SelectField label="货主" options={owners.options} value={ownerId} onChange={(value) => { setOwnerId(value); setPage(1) }} />
            <SelectField label="费用类型" options={feeTypes.options} value={feeTypeId} onChange={(value) => { setFeeTypeId(value); setPage(1) }} />
            <SelectField
              label="单据状态"
              options={[
                { value: 'draft', label: '暂存' },
                { value: 'reconciled', label: '已对账' },
              ]}
              value={status}
              onChange={(value) => { setStatus(value); setPage(1) }}
            />
            <div className="toolbar">
              <button type="button" className="btn btn-secondary" onClick={() => { setPeriodStart(''); setPeriodEnd(''); setOrgId(user?.orgId ?? ''); setWarehouseId(''); setOwnerId(''); setFeeTypeId(''); setStatus(''); setPage(1) }}>重置筛选</button>
            </div>
          </div>
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          selectable={can('receivable:recalc')}
          isRowSelected={(row) => selected.has(row.id)}
          onRowSelectChange={toggleRow}
          isRowSelectable={(row) => row.status !== 'reconciled'}
          allSelected={rows !== null && rows.length > 0 && rows.filter((row) => row.status !== 'reconciled').every((row) => selected.has(row.id))}
          onToggleAll={toggleAll}
          emptyTitle="暂无应收费用明细"
          emptyDescription="明细由定时任务按结算账期自动生成；可在「任务执行记录」中手动触发计费任务。"
        />
        {can('receivable:recalc') && (
          <div className="pagination">
            <span>已勾选 {selected.size} 条（已对账明细不可勾选）</span>
            <span className="muted">金额字段按角色可见性输出，无权限时显示 —。</span>
          </div>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
      </section>
    </div>
  )
}
