import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiRequest } from '../../platform/api-client'
import { errorText } from '../../platform/errors'
import { useSession } from '../../platform/session'
import { DataTable, type Column } from '../../components/DataTable'
import { SelectField } from '../../components/form'
import { useOptionList, codeNameOf } from '../../components/options'
import { Alert, Modal, PageHeader, Pagination, StatusBadge, statusTone } from '../../components/ui'
import { formatCents, formatDateTime } from '../../platform/format'
import { RECON_STATUS_LABELS, labelOf } from '../../labels'
import type { Paged, ReconStatement } from '../../types'

const PAGE_SIZE = 20

// 应收对账单列表 + 【生成对账单】弹窗（按组织/仓库/结算方/业务周期汇总暂存明细）。
export default function ReconList() {
  const { can, user } = useSession()
  const navigate = useNavigate()
  const [rows, setRows] = useState<ReconStatement[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const [generateOpen, setGenerateOpen] = useState(false)
  const [form, setForm] = useState({ orgId: user?.orgId ?? '', warehouseId: '', ownerId: '', periodStart: '', periodEnd: '', remark: '' })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [generating, setGenerating] = useState(false)

  const orgs = useOptionList<Record<string, unknown>>('/api/orgs', codeNameOf)
  const warehousePath = form.orgId ? `/api/warehouses?orgId=${encodeURIComponent(form.orgId)}` : '/api/warehouses'
  const warehouses = useOptionList<Record<string, unknown>>(warehousePath, (item) => String(item.name ?? ''))
  const ownerPath = `/api/owners${form.orgId ? `?orgId=${encodeURIComponent(form.orgId)}` : ''}`
  const owners = useOptionList<Record<string, unknown>>(ownerPath, (item) => String(item.name ?? ''))

  const load = useCallback(async () => {
    setError('')
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
    if (status) params.set('status', status)
    try {
      const result = await apiRequest<Paged<ReconStatement>>(`/api/recon-statements?${params.toString()}`)
      setRows(result.items)
      setTotal(result.total)
    } catch (cause) {
      setRows([])
      setTotal(0)
      setError(errorText(cause, '对账单列表加载失败'))
    }
  }, [page, status])

  useEffect(() => { void load() }, [load])

  const openGenerate = () => {
    setForm({ orgId: user?.orgId ?? '', warehouseId: '', ownerId: '', periodStart: '', periodEnd: '', remark: '' })
    setFormErrors({})
    setGenerateOpen(true)
  }

  const generate = async () => {
    const errors: Record<string, string> = {}
    if (!form.orgId) errors.orgId = '组织机构为必填项'
    if (!form.warehouseId) errors.warehouseId = '仓库为必填项'
    if (!form.ownerId) errors.ownerId = '结算方（货主）为必填项'
    if (!form.periodStart) errors.periodStart = '业务周期开始为必填项'
    if (!form.periodEnd) errors.periodEnd = '业务周期结束为必填项'
    if (form.periodStart && form.periodEnd && form.periodStart > form.periodEnd) errors.periodEnd = '业务周期结束不可早于开始'
    setFormErrors(errors)
    if (Object.keys(errors).length > 0) return
    setGenerating(true)
    setError('')
    try {
      const created = await apiRequest<ReconStatement>('/api/recon-statements', {
        method: 'POST',
        body: JSON.stringify({
          orgId: form.orgId,
          warehouseId: form.warehouseId,
          ownerId: form.ownerId,
          periodStart: form.periodStart,
          periodEnd: form.periodEnd,
          remark: form.remark.trim() || null,
        }),
      })
      setGenerateOpen(false)
      navigate(`/recon-statements/${created.id}`, { replace: true })
    } catch (cause) {
      setError(errorText(cause, '对账单生成失败'))
    } finally {
      setGenerating(false)
    }
  }

  const nameOfRef = (items: Array<Record<string, unknown>>, refId: string | null) =>
    refId ? String(items.find((item) => item.id === refId)?.name ?? refId) : '—'

  const columns: Column<ReconStatement>[] = [
    {
      key: 'billNo',
      title: '单据编号',
      render: (row) => <Link to={`/recon-statements/${row.id}`} style={{ color: 'var(--primary)' }}>{row.billNo}</Link>,
      width: '170px',
    },
    { key: 'org', title: '组织机构', render: (row) => nameOfRef(orgs.items, row.orgId) },
    { key: 'warehouse', title: '仓库', render: (row) => nameOfRef(warehouses.items, row.warehouseId) },
    { key: 'owner', title: '结算方（货主）', render: (row) => nameOfRef(owners.items, row.ownerId) },
    { key: 'period', title: '业务周期', render: (row) => `${row.periodStart} ~ ${row.periodEnd}` },
    { key: 'total', title: '总金额（元）', render: (row) => formatCents(row.totalAmount), numeric: true },
    { key: 'lineCount', title: '明细条数', render: (row) => String(row.lineCount), numeric: true },
    {
      key: 'status',
      title: '单据状态',
      render: (row) => <StatusBadge label={labelOf(RECON_STATUS_LABELS, row.status)} tone={statusTone(row.status)} />,
    },
    { key: 'remark', title: '备注', render: (row) => <span className="cell-ellipsis" title={row.remark ?? ''}>{row.remark ?? '—'}</span> },
    { key: 'createdAt', title: '生成时间', render: (row) => formatDateTime(row.createdAt) },
    {
      key: 'actions',
      title: '操作',
      render: (row) => (
        <div className="toolbar">
          <Link className="btn btn-secondary btn-sm" to={`/recon-statements/${row.id}`}>详情</Link>
          {can('recon:audit') && row.status === 'draft' && <Link className="btn btn-sm" to={`/recon-statements/${row.id}?audit=1`}>审核</Link>}
        </div>
      ),
      width: '140px',
    },
  ]

  return (
    <div className="section-gap">
      <PageHeader
        title="应收对账单"
        description="按组织、仓库、结算方、业务周期汇总暂存应收明细（已对账自动过滤）；审核通过后明细锁定并自动生成应收结算单。"
        actions={can('recon:generate') ? <button type="button" className="btn" onClick={openGenerate}>生成对账单</button> : null}
      />
      {error && <Alert kind="error">{error}</Alert>}
      <section className="card">
        <div className="card-body">
          <div className="filter-bar">
            <SelectField
              label="单据状态"
              options={[
                { value: 'draft', label: '暂存' },
                { value: 'approved', label: '审核通过' },
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
          emptyTitle="暂无对账单"
          emptyDescription={can('recon:generate') ? '点击「生成对账单」按周期汇总暂存应收明细。' : '当前条件下没有可展示的对账单。'}
          emptyAction={can('recon:generate') ? <button type="button" className="btn btn-sm" onClick={openGenerate}>生成对账单</button> : null}
        />
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
      </section>

      <Modal
        open={generateOpen}
        title="生成应收对账单"
        onClose={() => setGenerateOpen(false)}
        width={560}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setGenerateOpen(false)} disabled={generating}>取消</button>
            <button type="button" className="btn" onClick={() => void generate()} disabled={generating}>{generating ? '生成中…' : '生成'}</button>
          </>
        }
      >
        <p className="field-hint" style={{ margin: '0 0 12px' }}>
          仅汇总单据状态为「暂存」的应收明细；已对账明细自动过滤不展示。总金额自动汇总（只读）。
        </p>
        <div className="form-grid">
          <SelectField label="组织机构" required options={orgs.options} value={form.orgId} error={formErrors.orgId} onChange={(value) => setForm((current) => ({ ...current, orgId: value, warehouseId: '', ownerId: '' }))} />
          <SelectField
            label="仓库"
            required
            options={warehouses.options}
            value={form.warehouseId}
            error={formErrors.warehouseId}
            disabled={!form.orgId}
            onChange={(value) => setForm((current) => ({ ...current, warehouseId: value }))}
            hint={form.orgId ? undefined : '请先选择组织机构'}
          />
          <SelectField
            label="结算方（货主）"
            required
            options={owners.options}
            value={form.ownerId}
            error={formErrors.ownerId}
            disabled={!form.orgId}
            onChange={(value) => setForm((current) => ({ ...current, ownerId: value }))}
          />
        </div>
        <div className="form-grid" style={{ marginTop: 4 }}>
          <div className="field">
            <span className="field-label">业务周期-开始<span className="required">*</span></span>
            <input type="date" className="input" value={form.periodStart} onChange={(event) => setForm((current) => ({ ...current, periodStart: event.currentTarget.value }))} />
            {formErrors.periodStart && <span className="field-error">{formErrors.periodStart}</span>}
          </div>
          <div className="field">
            <span className="field-label">业务周期-结束<span className="required">*</span></span>
            <input type="date" className="input" value={form.periodEnd} onChange={(event) => setForm((current) => ({ ...current, periodEnd: event.currentTarget.value }))} />
            {formErrors.periodEnd && <span className="field-error">{formErrors.periodEnd}</span>}
          </div>
          <div className="field">
            <span className="field-label">备注（选填）</span>
            <input className="input" maxLength={500} value={form.remark} placeholder="对账沟通说明等" onChange={(event) => setForm((current) => ({ ...current, remark: event.currentTarget.value }))} />
          </div>
        </div>
      </Modal>
    </div>
  )
}
