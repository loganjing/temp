import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { apiRequest } from '../../platform/api-client'
import { errorText } from '../../platform/errors'
import { useSession } from '../../platform/session'
import { Alert, ConfirmDialog, PageHeader, StatusBadge, statusTone } from '../../components/ui'
import { useOptionList } from '../../components/options'
import { formatCents, formatDateTime } from '../../platform/format'
import { BILLING_MODE_LABELS, RECON_STATUS_LABELS, labelOf } from '../../labels'
import type { ReconDetailResponse } from '../../types'

// 对账单详情：总金额只读自动汇总、明细快照展示；审核通过后锁定态（明细不可增删改）。
export default function ReconDetail() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const { can, orgName } = useSession()
  const [detail, setDetail] = useState<ReconDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirmAudit, setConfirmAudit] = useState(params.get('audit') === '1')
  const [busy, setBusy] = useState(false)

  const warehouses = useOptionList<Record<string, unknown>>('/api/warehouses', (item) => String(item.name ?? ''))
  const owners = useOptionList<Record<string, unknown>>('/api/owners', (item) => String(item.name ?? ''))
  const feeTypes = useOptionList<Record<string, unknown>>('/api/masterdata/fee-types', (item) => String(item.name ?? ''))
  const goodsCategories = useOptionList<Record<string, unknown>>('/api/masterdata/goods-categories', (item) => String(item.name ?? ''))

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError('')
    try {
      setDetail(await apiRequest<ReconDetailResponse>(`/api/recon-statements/${encodeURIComponent(id)}`))
    } catch (cause) {
      setError(errorText(cause, '对账单加载失败'))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  const audit = async () => {
    if (!detail) return
    setBusy(true)
    setActionError('')
    try {
      await apiRequest(`/api/recon-statements/${encodeURIComponent(detail.id)}/audit`, { method: 'POST' })
      setConfirmAudit(false)
      setNotice(`对账单审核通过：关联明细已锁定为「已对账」，已自动生成应收结算单（可前往「应收结算单」查看，编号可在列表中按对账单关联）。`)
      await load()
    } catch (cause) {
      setActionError(errorText(cause, '审核失败'))
      setConfirmAudit(false)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="card"><div className="card-body"><p className="muted" style={{ margin: 0 }}>加载中…</p></div></div>
  if (error) {
    return (
      <div className="section-gap">
        <Alert kind="error">{error}</Alert>
        <div><Link className="btn btn-secondary" to="/recon-statements">返回列表</Link></div>
      </div>
    )
  }
  if (!detail) return null

  // 详情响应为平铺结构（头部字段 + lines）
  const { lines } = detail
  const statement = detail
  const nameOfRef = (items: Array<Record<string, unknown>>, refId: string | null) =>
    refId ? String(items.find((item) => item.id === refId)?.name ?? refId) : '—'

  return (
    <div className="section-gap">
      <PageHeader
        title={`对账单 ${statement.billNo}`}
        description="总金额自动汇总（只读）；审核通过后明细锁定不可增删改，并自动生成应收结算单。"
        actions={
          <>
            <Link className="btn btn-secondary" to="/recon-statements">返回列表</Link>
            {can('recon:audit') && statement.status === 'draft' && (
              <button type="button" className="btn" onClick={() => setConfirmAudit(true)}>审核</button>
            )}
          </>
        }
      />
      {actionError && <Alert kind="error">{actionError}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}
      {statement.status === 'approved' && (
        <Alert kind="info">
          单据已审核通过：明细已锁定，不可新增、删除或编辑；关联应收明细状态已更新为「已对账」，结算单已自动生成。
          {statement.auditedAt ? ` 审核时间：${formatDateTime(statement.auditedAt)}。` : ''}
        </Alert>
      )}

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">头部信息</h2>
          <StatusBadge label={labelOf(RECON_STATUS_LABELS, statement.status)} tone={statusTone(statement.status)} />
        </div>
        <div className="card-body">
          <div className="kv-grid">
            <div className="kv"><span className="kv-label">单据编号</span><span className="kv-value">{statement.billNo}</span></div>
            <div className="kv"><span className="kv-label">组织机构</span><span className="kv-value">{orgName(statement.orgId)}</span></div>
            <div className="kv"><span className="kv-label">仓库</span><span className="kv-value">{nameOfRef(warehouses.items, statement.warehouseId)}</span></div>
            <div className="kv"><span className="kv-label">结算方（货主）</span><span className="kv-value">{nameOfRef(owners.items, statement.ownerId)}</span></div>
            <div className="kv"><span className="kv-label">业务周期</span><span className="kv-value">{statement.periodStart} ~ {statement.periodEnd}</span></div>
            <div className="kv"><span className="kv-label">总金额（自动汇总，只读）</span><span className="kv-value money">{formatCents(statement.totalAmount)} 元</span></div>
            <div className="kv"><span className="kv-label">明细条数</span><span className="kv-value">{statement.lineCount}</span></div>
            <div className="kv"><span className="kv-label">备注</span><span className="kv-value" title={statement.remark ?? ''}>{statement.remark ?? '—'}</span></div>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-header"><h2 className="card-title">对账明细（{lines.length}）</h2></div>
        <div className="card-body card-body-tight">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>行号</th>
                  <th>货品类别</th>
                  <th>记账日期</th>
                  <th>费用类型</th>
                  <th>计费模式</th>
                  <th className="num">业务量</th>
                  <th className="num">单价（元）</th>
                  <th className="num">最低收费（元）</th>
                  <th className="num">计算金额（元）</th>
                  <th className="num">最终计费金额（元）</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => (
                  <tr key={line.id}>
                    <td>{index + 1}</td>
                    <td>{line.goodsCategoryId ? nameOfRef(goodsCategories.items, line.goodsCategoryId) : <span className="muted">全货品</span>}</td>
                    <td>{line.billDate}</td>
                    <td>{nameOfRef(feeTypes.items, line.feeTypeId)}</td>
                    <td>{labelOf(BILLING_MODE_LABELS, line.billingMode)}</td>
                    <td className="num">{String(line.businessQty)}</td>
                    <td className="num">{formatCents(line.unitPrice)}</td>
                    <td className="num">{formatCents(line.minCharge)}</td>
                    <td className="num">{formatCents(line.rawAmount)}</td>
                    <td className="num">{formatCents(line.finalAmount)}</td>
                  </tr>
                ))}
                {lines.length === 0 && <tr><td colSpan={10} className="muted" style={{ textAlign: 'center' }}>周期内暂无暂存应收明细</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={confirmAudit}
        title="审核对账单"
        message={`审核通过后单据 ${statement.billNo} 明细锁定（不可增删改），关联应收明细更新为「已对账」，并自动创建一一绑定的应收结算单。确认审核？`}
        confirmText="确认审核"
        busy={busy}
        onCancel={() => setConfirmAudit(false)}
        onConfirm={() => void audit()}
      />
    </div>
  )
}
