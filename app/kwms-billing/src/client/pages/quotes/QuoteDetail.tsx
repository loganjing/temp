import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { apiRequest } from '../../platform/api-client'
import { errorText } from '../../platform/errors'
import { useSession } from '../../platform/session'
import { Alert, ConfirmDialog, PageHeader, StatusBadge, statusTone } from '../../components/ui'
import { useOptionList, codeNameOf } from '../../components/options'
import { formatCents } from '../../platform/format'
import {
  BILLING_BASIS_LABELS,
  BILLING_MODE_LABELS,
  BILLING_PERIOD_LABELS,
  OWNER_TYPE_LABELS,
  QUOTE_STATUS_LABELS,
  SETTLEMENT_MODE_LABELS,
  labelOf,
} from '../../labels'
import type { QuoteDetailResponse } from '../../types'
import DiscountModal, { DiscountRulesView } from './DiscountModal'

// 报价单详情：billNo 只读、头部与明细展示、分段优惠查看、审核/终止操作（按权限与状态）。
export default function QuoteDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { can, user, orgName } = useSession()
  const [detail, setDetail] = useState<QuoteDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [confirmAudit, setConfirmAudit] = useState(params.get('audit') === '1')
  const [confirmTerminate, setConfirmTerminate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [discountLineIndex, setDiscountLineIndex] = useState<number | null>(null)

  const feeTypes = useOptionList<Record<string, unknown>>('/api/masterdata/fee-types', (item) => String(item.name ?? ''))
  const goodsCategories = useOptionList<Record<string, unknown>>('/api/masterdata/goods-categories', (item) => String(item.name ?? ''))
  const warehouses = useOptionList<Record<string, unknown>>('/api/warehouses', (item) => String(item.name ?? ''))
  const owners = useOptionList<Record<string, unknown>>('/api/owners', (item) => String(item.name ?? ''))

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError('')
    try {
      setDetail(await apiRequest<QuoteDetailResponse>(`/api/quotes/${encodeURIComponent(id)}`))
    } catch (cause) {
      setError(errorText(cause, '报价单加载失败'))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  const runAudit = async () => {
    if (!detail) return
    setBusy(true)
    setActionError('')
    try {
      await apiRequest(`/api/quotes/${encodeURIComponent(detail.id)}/audit`, { method: 'POST' })
      await load()
      setConfirmAudit(false)
    } catch (cause) {
      setActionError(errorText(cause, '审核失败'))
      setConfirmAudit(false)
    } finally {
      setBusy(false)
    }
  }

  const runTerminate = async () => {
    if (!detail) return
    setBusy(true)
    setActionError('')
    try {
      await apiRequest(`/api/quotes/${encodeURIComponent(detail.id)}/terminate`, { method: 'POST' })
      await load()
      setConfirmTerminate(false)
    } catch (cause) {
      setActionError(errorText(cause, '终止失败'))
      setConfirmTerminate(false)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="card"><div className="card-body"><p className="muted" style={{ margin: 0 }}>加载中…</p></div></div>
  if (error) {
    return (
      <div className="section-gap">
        <Alert kind="error">{error}</Alert>
        <div><Link className="btn btn-secondary" to="/quotes">返回列表</Link></div>
      </div>
    )
  }
  if (!detail) return null

  // 详情响应为平铺结构（头部字段 + lines）
  const quote = detail
  const { lines } = detail
  const nameOfId = (items: Array<Record<string, unknown>>, refId: string | null) =>
    refId ? String(items.find((item) => item.id === refId)?.name ?? refId) : '—'

  return (
    <div className="section-gap">
      <PageHeader
        title={`报价单 ${quote.billNo}`}
        description="单据编号由系统自动生成，页面只读。"
        actions={
          <>
            <Link className="btn btn-secondary" to="/quotes">返回列表</Link>
            {can('quote:edit') && quote.status === 'draft' && (
              <button type="button" className="btn btn-secondary" onClick={() => navigate(`/quotes/${quote.id}/edit`)}>编辑</button>
            )}
            {can('quote:audit') && quote.status === 'draft' && (
              <button type="button" className="btn" onClick={() => setConfirmAudit(true)}>审核</button>
            )}
            {can('quote:terminate') && quote.status === 'effective' && (
              <button type="button" className="btn btn-danger" onClick={() => setConfirmTerminate(true)}>终止</button>
            )}
          </>
        }
      />
      {actionError && <Alert kind="error">{actionError}</Alert>}
      {quote.status !== 'draft' && (
        <Alert kind="info">
          {quote.status === 'effective'
            ? '单据已生效：系统按账期自动计费，计费规则不可修改；如需变更请终止本合同后新建续签报价单。'
            : '单据已终止：不再生成新的费用明细，历史已生成明细数据永久保留。'}
        </Alert>
      )}

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">头部信息</h2>
          <StatusBadge label={labelOf(QUOTE_STATUS_LABELS, quote.status)} tone={statusTone(quote.status)} />
        </div>
        <div className="card-body">
          <div className="kv-grid">
            <div className="kv"><span className="kv-label">单据编号</span><span className="kv-value">{quote.billNo}</span></div>
            <div className="kv"><span className="kv-label">合同编号</span><span className="kv-value">{quote.contractNo ?? quote.contractId}</span></div>
            <div className="kv"><span className="kv-label">组织机构</span><span className="kv-value">{orgName(quote.orgId)}</span></div>
            <div className="kv"><span className="kv-label">仓库</span><span className="kv-value">{nameOfId(warehouses.items, quote.warehouseId)}</span></div>
            <div className="kv"><span className="kv-label">货主</span><span className="kv-value">{nameOfId(owners.items, quote.ownerId)}（{labelOf(OWNER_TYPE_LABELS, quote.ownerType)}）</span></div>
            <div className="kv"><span className="kv-label">合同效期</span><span className="kv-value">{quote.effectStart} ~ {quote.effectEnd}</span></div>
            <div className="kv"><span className="kv-label">免租期</span><span className="kv-value">{quote.rentFreeDays} 天（免租期结束日 {freeRentEndText(quote.effectStart, quote.rentFreeDays)}）</span></div>
            <div className="kv"><span className="kv-label">结算账期</span><span className="kv-value">{labelOf(BILLING_PERIOD_LABELS, quote.billingPeriod)}</span></div>
            <div className="kv"><span className="kv-label">结算方式</span><span className="kv-value">{labelOf(SETTLEMENT_MODE_LABELS, quote.settlementMode)}</span></div>
            <div className="kv"><span className="kv-label">需要保险</span><span className="kv-value">{quote.insuranceRequired ? '是' : '否'}</span></div>
            <div className="kv"><span className="kv-label">备注</span><span className="kv-value" title={quote.remark ?? ''}>{quote.remark ?? '—'}</span></div>
            <div className="kv"><span className="kv-label">创建时间</span><span className="kv-value">{formatDateTimeLocal(quote.createdAt)}</span></div>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-header"><h2 className="card-title">费用明细行（{lines.length}）</h2></div>
        <div className="card-body card-body-tight">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 44 }}>行号</th>
                  <th>费用类型</th>
                  <th>计费模式</th>
                  <th>计费方式</th>
                  <th>货品类别</th>
                  <th className="num">单价（元）</th>
                  <th className="num">最低收费（元）</th>
                  <th className="num">金额（元）</th>
                  <th>分段优惠</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => (
                  <tr key={line.id}>
                    <td>{index + 1}</td>
                    <td>{nameOfId(feeTypes.items, line.feeTypeId)}</td>
                    <td>{labelOf(BILLING_MODE_LABELS, line.billingMode)}</td>
                    <td>{line.billingBasis ? labelOf(BILLING_BASIS_LABELS, line.billingBasis) : <span className="muted">—</span>}</td>
                    <td>{line.goodsCategoryId ? nameOfId(goodsCategories.items, line.goodsCategoryId) : <span className="muted">全货品</span>}</td>
                    <td className="num">{line.billingMode === 'fixed_price' ? <span className="muted">置灰</span> : formatCents(line.unitPrice)}</td>
                    <td className="num">{formatCents(line.minCharge)}</td>
                    <td className="num">{line.billingMode === 'fixed_price' ? formatCents(line.fixedAmount) : <span className="muted">—</span>}</td>
                    <td>
                      {line.discounts && line.discounts.length > 0 ? (
                        <>
                          <span className="cell-ellipsis" style={{ maxWidth: 220, display: 'inline-block', verticalAlign: 'bottom' }} title="点击查看分段优惠">
                            <DiscountRulesView rules={line.discounts} />
                          </span>
                          <button type="button" className="btn-link" onClick={() => setDiscountLineIndex(index)} style={{ marginLeft: 6 }}>查看</button>
                        </>
                      ) : <span className="muted">未配置</span>}
                    </td>
                  </tr>
                ))}
                {lines.length === 0 && <tr><td colSpan={9} className="muted" style={{ textAlign: 'center' }}>暂无费用明细行</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {discountLineIndex !== null && lines[discountLineIndex] && (
        <DiscountModal
          open
          readOnly
          feeTypeName={nameOfId(feeTypes.items, lines[discountLineIndex].feeTypeId)}
          initialRules={lines[discountLineIndex].discounts}
          onClose={() => setDiscountLineIndex(null)}
        />
      )}

      <ConfirmDialog
        open={confirmAudit}
        title="审核报价单"
        message={`审核通过后单据 ${quote.billNo} 将由「暂存」切换为「已生效」，系统按结算账期自动计费，生效后计费规则不可修改。确认审核？`}
        confirmText="确认审核"
        busy={busy}
        onCancel={() => setConfirmAudit(false)}
        onConfirm={() => void runAudit()}
      />
      <ConfirmDialog
        open={confirmTerminate}
        title="终止报价单"
        message={`终止后单据 ${quote.billNo} 不再生成新的费用明细，历史已生成明细数据永久保留。确认终止？`}
        confirmText="确认终止"
        busy={busy}
        onCancel={() => setConfirmTerminate(false)}
        onConfirm={() => void runTerminate()}
      />
      {user === null && null}
    </div>
  )
}

function freeRentEndText(effectStart: string, rentFreeDays: number): string {
  if (rentFreeDays <= 0) return effectStart
  const [year, month, day] = effectStart.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + rentFreeDays - 1)
  return date.toISOString().slice(0, 10)
}

function formatDateTimeLocal(iso: string | null): string {
  if (!iso) return '—'
  return iso.replace('T', ' ').slice(0, 19)
}
