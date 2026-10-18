import { useState } from 'react'
import { apiDownload } from '../../platform/api-client'
import { errorText } from '../../platform/errors'
import { useSession } from '../../platform/session'
import { Alert, PageHeader } from '../../components/ui'
import { DateField, SelectField } from '../../components/form'
import { useOptionList, codeNameOf } from '../../components/options'
import { REPORT_TYPE_LABELS } from '../../labels'

// 报表导出：按货主、仓库、业务周期导出计费 / 对账 / 结算 Excel 报表（浏览器下载 xlsx）。
export default function ReportsPage() {
  const { user } = useSession()
  const [type, setType] = useState('billing')
  const [ownerId, setOwnerId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const orgs = useOptionList<Record<string, unknown>>('/api/orgs', codeNameOf)
  const warehouses = useOptionList<Record<string, unknown>>('/api/warehouses', (item) => String(item.name ?? ''))
  const owners = useOptionList<Record<string, unknown>>('/api/owners', (item) => String(item.name ?? ''))

  const download = async () => {
    setError('')
    setNotice('')
    if (periodStart && periodEnd && periodStart > periodEnd) {
      setError('业务周期结束不可早于开始。')
      return
    }
    setBusy(true)
    try {
      const params = new URLSearchParams({ type })
      if (ownerId) params.set('ownerId', ownerId)
      if (warehouseId) params.set('warehouseId', warehouseId)
      if (periodStart) params.set('periodStart', periodStart)
      if (periodEnd) params.set('periodEnd', periodEnd)
      const filename = await apiDownload(`/api/reports/export?${params.toString()}`, `${type}-report.xlsx`)
      setNotice(`报表已导出：${filename}。内容与系统单据数据一致。`)
    } catch (cause) {
      setError(errorText(cause, '报表导出失败'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="section-gap">
      <PageHeader
        title="报表导出"
        description="按货主、仓库、业务周期导出计费、对账、结算 Excel 报表；数据范围限当前组织。"
        actions={<button type="button" className="btn" disabled={busy} onClick={() => void download()}>{busy ? '导出中…' : '导出 Excel'}</button>}
      />
      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}
      <section className="card">
        <div className="card-header"><h2 className="card-title">导出条件</h2></div>
        <div className="card-body">
          <div className="form-grid">
            <SelectField
              label="报表类型"
              required
              options={Object.entries(REPORT_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
              value={type}
              onChange={(value) => setType(value)}
              allowEmpty={false}
            />
            <SelectField
              label="货主（缺省全量）"
              options={owners.options}
              value={ownerId}
              onChange={(value) => setOwnerId(value)}
            />
            <SelectField
              label="仓库（缺省全量）"
              options={warehouses.options}
              value={warehouseId}
              onChange={(value) => setWarehouseId(value)}
            />
            <DateField label="业务周期-开始（缺省不限）" value={periodStart} onChange={(event) => setPeriodStart(event.currentTarget.value)} />
            <DateField label="业务周期-结束（缺省不限）" value={periodEnd} onChange={(event) => setPeriodEnd(event.currentTarget.value)} />
          </div>
          <p className="field-hint" style={{ marginTop: 12 }}>
            当前数据组织：{orgs.options.length > 0 ? orgs.options.map((option) => option.label).join('、') : '加载中'}。导出参数缺省时按本组织全量输出。
          </p>
        </div>
      </section>
    </div>
  )
}
