import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiRequest } from '../../platform/api-client'
import { errorText } from '../../platform/errors'
import { useSession } from '../../platform/session'
import { Alert, Modal, PageHeader } from '../../components/ui'
import { useOptionList } from '../../components/options'
import { formatCents, formatDateTime, parseYuanToCents } from '../../platform/format'
import { BILLING_MODE_LABELS, labelOf } from '../../labels'
import type { SettlementDetailResponse } from '../../types'

// 结算单详情：头部四个金额字段只读（系统累加）、结算金额微调（抹零）、
// 开票弹窗（累计开票 ≤ 结算总额，前端拦截）、核销弹窗（需有效开票且累计核销 ≤ 开票总额）、
// 费用明细 / 开票明细（含核销记录）标签页。
export default function SettlementDetail() {
  const { id } = useParams()
  const { can, orgName } = useSession()
  const [detail, setDetail] = useState<SettlementDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState<'lines' | 'invoices'>('lines')
  const [busy, setBusy] = useState(false)

  // 结算金额微调弹窗
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustError, setAdjustError] = useState('')

  // 开票弹窗
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [invoiceForm, setInvoiceForm] = useState({ invoicer: '', invoiceNo: '', amount: '' })
  const [invoiceError, setInvoiceError] = useState('')

  // 核销弹窗
  const [writeoffOpen, setWriteoffOpen] = useState(false)
  const [writeoffAmount, setWriteoffAmount] = useState('')
  const [writeoffError, setWriteoffError] = useState('')

  const warehouses = useOptionList<Record<string, unknown>>('/api/warehouses', (item) => String(item.name ?? ''))
  const owners = useOptionList<Record<string, unknown>>('/api/owners', (item) => String(item.name ?? ''))
  const feeTypes = useOptionList<Record<string, unknown>>('/api/masterdata/fee-types', (item) => String(item.name ?? ''))
  const goodsCategories = useOptionList<Record<string, unknown>>('/api/masterdata/goods-categories', (item) => String(item.name ?? ''))

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError('')
    try {
      setDetail(await apiRequest<SettlementDetailResponse>(`/api/settle-statements/${encodeURIComponent(id)}`))
    } catch (cause) {
      setError(errorText(cause, '结算单加载失败'))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  // 详情响应为平铺结构（头部字段 + lines + invoices + writeoffs）
  const statement = detail
  const invoices = detail?.invoices ?? []
  const writeoffs = detail?.writeoffs ?? []

  const openAdjust = () => {
    if (!statement) return
    setAdjustAmount(statement.settleTotalAmount === null ? '' : (statement.settleTotalAmount / 100).toFixed(2))
    setAdjustError('')
    setActionError('')
    setNotice('')
    setAdjustOpen(true)
  }

  const submitAdjust = async () => {
    if (!statement || !id) return
    const parsed = parseYuanToCents(adjustAmount, { required: true })
    if (!parsed.ok || parsed.cents === null) {
      setAdjustError('结算总金额为必填项，须为数字（最多 2 位小数）')
      return
    }
    if (parsed.cents <= 0) {
      setAdjustError('禁止输入负数或零')
      return
    }
    if (statement.reconTotalAmount !== null && parsed.cents > statement.reconTotalAmount) {
      setAdjustError(`金额超出允许范围：结算总金额不可超过对账总金额（${formatCents(statement.reconTotalAmount)} 元）`)
      return
    }
    setBusy(true)
    setActionError('')
    try {
      await apiRequest(`/api/settle-statements/${encodeURIComponent(id)}/settle-amount`, {
        method: 'PUT',
        body: JSON.stringify({ settleTotalAmount: parsed.cents }),
      })
      setAdjustOpen(false)
      setNotice('结算总金额已更新（默认等于对账总金额，支持少量抹零微调）。')
      await load()
    } catch (cause) {
      setActionError(errorText(cause, '结算金额调整失败'))
      setAdjustOpen(false)
    } finally {
      setBusy(false)
    }
  }

  const openInvoice = () => {
    setInvoiceForm({ invoicer: '', invoiceNo: '', amount: '' })
    setInvoiceError('')
    setActionError('')
    setNotice('')
    setInvoiceOpen(true)
  }

  const submitInvoice = async () => {
    if (!statement || !id) return
    const fieldErrors: string[] = []
    if (!invoiceForm.invoicer.trim()) fieldErrors.push('开票人为必填项')
    if (!invoiceForm.invoiceNo.trim()) fieldErrors.push('发票号码为必填项')
    const parsed = parseYuanToCents(invoiceForm.amount, { required: true })
    if (!parsed.ok || parsed.cents === null) {
      fieldErrors.push('本次开票金额为必填项，须为数字（最多 2 位小数）')
    } else if (parsed.cents <= 0) {
      fieldErrors.push('本次开票金额必须为正数')
    }
    if (fieldErrors.length > 0) {
      setInvoiceError(fieldErrors[0])
      return
    }
    const cents = (parsed as { ok: true; cents: number }).cents
    // 前端累计拦截：累计开票金额不可超过结算总金额（INVOICE_EXCEED_TOTAL）
    if (statement.settleTotalAmount !== null && statement.invoiceTotalAmount !== null) {
      if (statement.invoiceTotalAmount + cents > statement.settleTotalAmount) {
        setInvoiceError(`累计开票金额不可超过结算总金额：已开 ${formatCents(statement.invoiceTotalAmount)} 元 + 本次 ${formatCents(cents)} 元 > 结算总额 ${formatCents(statement.settleTotalAmount)} 元，请调整本次开票金额。`)
        return
      }
    }
    setBusy(true)
    try {
      await apiRequest(`/api/settle-statements/${encodeURIComponent(id)}/invoices`, {
        method: 'POST',
        body: JSON.stringify({ invoicer: invoiceForm.invoicer.trim(), invoiceNo: invoiceForm.invoiceNo.trim(), amount: cents }),
      })
      setInvoiceOpen(false)
      setNotice('开票成功：开票明细已新增，开票总金额已累加。')
      await load()
    } catch (cause) {
      setInvoiceError(errorText(cause, '开票失败'))
    } finally {
      setBusy(false)
    }
  }

  const openWriteoff = () => {
    setWriteoffAmount('')
    setWriteoffError('')
    setActionError('')
    setNotice('')
    setWriteoffOpen(true)
  }

  const submitWriteoff = async () => {
    if (!statement || !id) return
    // 前端前置拦截：存在有效开票记录才可核销（NO_VALID_INVOICE）
    if (invoices.length === 0) {
      setWriteoffError('无有效开票记录，不可核销。请先完成开票。')
      return
    }
    const parsed = parseYuanToCents(writeoffAmount, { required: true })
    if (!parsed.ok || parsed.cents === null) {
      setWriteoffError('本次核销金额为必填项，须为数字（最多 2 位小数）')
      return
    }
    if (parsed.cents <= 0) {
      setWriteoffError('本次核销金额必须为正数')
      return
    }
    const cents = (parsed as { ok: true; cents: number }).cents
    // 前端累计拦截：累计核销金额不可超过累计开票金额（WRITEOFF_EXCEED_INVOICE）
    if (statement.invoiceTotalAmount !== null && statement.writeoffTotalAmount !== null) {
      if (statement.writeoffTotalAmount + cents > statement.invoiceTotalAmount) {
        setWriteoffError(`累计核销金额不可超过累计开票金额：已核销 ${formatCents(statement.writeoffTotalAmount)} 元 + 本次 ${formatCents(cents)} 元 > 累计开票 ${formatCents(statement.invoiceTotalAmount)} 元，请调整本次核销金额。`)
        return
      }
    }
    setBusy(true)
    try {
      await apiRequest(`/api/settle-statements/${encodeURIComponent(id)}/writeoffs`, {
        method: 'POST',
        body: JSON.stringify({ amount: cents }),
      })
      setWriteoffOpen(false)
      setNotice('核销成功：核销总金额已累加（核销代表已收到客户对应款项）。')
      await load()
    } catch (cause) {
      setWriteoffError(errorText(cause, '核销失败'))
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="card"><div className="card-body"><p className="muted" style={{ margin: 0 }}>加载中…</p></div></div>
  if (error) {
    return (
      <div className="section-gap">
        <Alert kind="error">{error}</Alert>
        <div><Link className="btn btn-secondary" to="/settlements">返回列表</Link></div>
      </div>
    )
  }
  if (!detail || !statement) return null

  const nameOfRef = (items: Array<Record<string, unknown>>, refId: string | null) =>
    refId ? String(items.find((item) => item.id === refId)?.name ?? refId) : '—'

  const remainingInvoice = statement.settleTotalAmount !== null && statement.invoiceTotalAmount !== null
    ? statement.settleTotalAmount - statement.invoiceTotalAmount
    : null
  const remainingWriteoff = statement.invoiceTotalAmount !== null && statement.writeoffTotalAmount !== null
    ? statement.invoiceTotalAmount - statement.writeoffTotalAmount
    : null

  return (
    <div className="section-gap">
      <PageHeader
        title={`结算单 ${statement.billNo}`}
        description="对账单审核通过后自动生成（一一绑定）；开票、核销记录永久留存。"
        actions={
          <>
            <Link className="btn btn-secondary" to="/settlements">返回列表</Link>
            {can('settlement:adjust') && (
              <button type="button" className="btn btn-secondary" onClick={openAdjust}>调整结算金额</button>
            )}
            {can('invoice:issue') && (
              <button type="button" className="btn" onClick={openInvoice}>开票</button>
            )}
            {can('writeoff:record') && (
              <button type="button" className="btn" onClick={openWriteoff}>核销</button>
            )}
          </>
        }
      />
      {actionError && <Alert kind="error">{actionError}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">头部信息（金额字段只读，系统自动累加）</h2>
          <span className="badge badge-neutral">暂存（可开票/核销，无终态）</span>
        </div>
        <div className="card-body">
          <div className="kv-grid">
            <div className="kv"><span className="kv-label">单据编号</span><span className="kv-value">{statement.billNo}</span></div>
            <div className="kv"><span className="kv-label">关联对账单</span><span className="kv-value"><Link to={`/recon-statements/${statement.reconStatementId}`} style={{ color: 'var(--primary)' }}>查看对账单</Link></span></div>
            <div className="kv"><span className="kv-label">组织机构</span><span className="kv-value">{orgName(statement.orgId)}</span></div>
            <div className="kv"><span className="kv-label">仓库</span><span className="kv-value">{nameOfRef(warehouses.items, statement.warehouseId)}</span></div>
            <div className="kv"><span className="kv-label">结算方（货主）</span><span className="kv-value">{nameOfRef(owners.items, statement.ownerId)}</span></div>
            <div className="kv"><span className="kv-label">对账总金额</span><span className="kv-value money">{formatCents(statement.reconTotalAmount)} 元</span></div>
            <div className="kv"><span className="kv-label">结算总金额（可抹零微调）</span><span className="kv-value money">{formatCents(statement.settleTotalAmount)} 元</span></div>
            <div className="kv"><span className="kv-label">开票总金额</span><span className="kv-value money">{formatCents(statement.invoiceTotalAmount)} 元{remainingInvoice !== null && remainingInvoice >= 0 ? `（剩余可开 ${formatCents(remainingInvoice)} 元）` : ''}</span></div>
            <div className="kv"><span className="kv-label">核销总金额</span><span className="kv-value money">{formatCents(statement.writeoffTotalAmount)} 元{remainingWriteoff !== null && remainingWriteoff >= 0 ? `（剩余可核销 ${formatCents(remainingWriteoff)} 元）` : ''}</span></div>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <div className="tabs" style={{ borderBottom: 'none', marginBottom: 0 }}>
            <button type="button" className={`tab${tab === 'lines' ? ' active' : ''}`} onClick={() => setTab('lines')}>费用明细</button>
            <button type="button" className={`tab${tab === 'invoices' ? ' active' : ''}`} onClick={() => setTab('invoices')}>开票明细</button>
          </div>
        </div>
        <div className="card-body card-body-tight">
          {tab === 'lines' && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>记账日期</th>
                    <th>费用类型</th>
                    <th>计费模式</th>
                    <th>货品类别</th>
                    <th className="num">业务量</th>
                    <th className="num">单价（元）</th>
                    <th className="num">最低收费（元）</th>
                    <th className="num">计算金额（元）</th>
                    <th className="num">最终计费金额（元）</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.lines.map((line) => (
                    <tr key={line.id}>
                      <td>{line.billDate}</td>
                      <td>{nameOfRef(feeTypes.items, line.feeTypeId)}</td>
                      <td>{labelOf(BILLING_MODE_LABELS, line.billingMode)}</td>
                      <td>{line.goodsCategoryId ? nameOfRef(goodsCategories.items, line.goodsCategoryId) : <span className="muted">全货品</span>}</td>
                      <td className="num">{String(line.businessQty)}</td>
                      <td className="num">{formatCents(line.unitPrice)}</td>
                      <td className="num">{formatCents(line.minCharge)}</td>
                      <td className="num">{formatCents(line.rawAmount)}</td>
                      <td className="num">{formatCents(line.finalAmount)}</td>
                    </tr>
                  ))}
                  {detail.lines.length === 0 && <tr><td colSpan={9} className="muted" style={{ textAlign: 'center' }}>暂无费用明细</td></tr>}
                </tbody>
              </table>
            </div>
          )}
          {tab === 'invoices' && (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>开票日期</th>
                      <th>开票人</th>
                      <th>发票号码</th>
                      <th className="num">开票金额（元）</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((invoice) => (
                      <tr key={invoice.id}>
                        <td>{invoice.invoiceDate}</td>
                        <td>{invoice.invoicer}</td>
                        <td><span className="cell-ellipsis" title={invoice.invoiceNo}>{invoice.invoiceNo}</span></td>
                        <td className="num">{formatCents(invoice.amount)}</td>
                      </tr>
                    ))}
                    {invoices.length === 0 && <tr><td colSpan={4} className="muted" style={{ textAlign: 'center' }}>暂无开票记录</td></tr>}
                  </tbody>
                </table>
              </div>
              <h3 className="card-title" style={{ margin: '20px 16px 8px', fontSize: 14 }}>核销记录</h3>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>核销日期</th>
                      <th>操作人</th>
                      <th className="num">核销金额（元）</th>
                    </tr>
                  </thead>
                  <tbody>
                    {writeoffs.map((writeoff) => (
                      <tr key={writeoff.id}>
                        <td>{writeoff.writeoffDate}</td>
                        <td>{writeoff.operator}</td>
                        <td className="num">{formatCents(writeoff.amount)}</td>
                      </tr>
                    ))}
                    {writeoffs.length === 0 && <tr><td colSpan={3} className="muted" style={{ textAlign: 'center' }}>暂无核销记录</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </section>

      {/* 调整结算金额弹窗 */}
      <Modal
        open={adjustOpen}
        title="调整结算总金额"
        onClose={() => setAdjustOpen(false)}
        width={460}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setAdjustOpen(false)} disabled={busy}>取消</button>
            <button type="button" className="btn" onClick={() => void submitAdjust()} disabled={busy}>{busy ? '提交中…' : '提交'}</button>
          </>
        }
      >
        {adjustError && <Alert kind="error">{adjustError}</Alert>}
        <div className="field">
          <span className="field-label">结算总金额（元）<span className="required">*</span></span>
          <input className="input" inputMode="decimal" value={adjustAmount} onChange={(event) => setAdjustAmount(event.currentTarget.value)} />
          <span className="field-hint">
            默认等于对账总金额（{formatCents(statement.reconTotalAmount)} 元），支持少量抹零人工微调；不可超过对账总金额。
          </span>
        </div>
      </Modal>

      {/* 开票弹窗 */}
      <Modal
        open={invoiceOpen}
        title="结算单开票"
        onClose={() => setInvoiceOpen(false)}
        width={480}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setInvoiceOpen(false)} disabled={busy}>取消</button>
            <button type="button" className="btn" onClick={() => void submitInvoice()} disabled={busy}>{busy ? '提交中…' : '提交开票'}</button>
          </>
        }
      >
        {invoiceError && <Alert kind="error">{invoiceError}</Alert>}
        <div className="stack">
          <div className="field">
            <span className="field-label">开票人<span className="required">*</span></span>
            <input className="input" maxLength={100} value={invoiceForm.invoicer} onChange={(event) => setInvoiceForm((current) => ({ ...current, invoicer: event.currentTarget.value }))} />
          </div>
          <div className="field">
            <span className="field-label">发票号码<span className="required">*</span></span>
            <input className="input" maxLength={100} value={invoiceForm.invoiceNo} onChange={(event) => setInvoiceForm((current) => ({ ...current, invoiceNo: event.currentTarget.value }))} />
          </div>
          <div className="field">
            <span className="field-label">本次开票金额（元）<span className="required">*</span></span>
            <input className="input" inputMode="decimal" placeholder="0.00" value={invoiceForm.amount} onChange={(event) => setInvoiceForm((current) => ({ ...current, amount: event.currentTarget.value }))} />
            <span className="field-hint">
              累计开票金额不可超过结算总金额：已开 {formatCents(statement.invoiceTotalAmount)} 元，结算总额 {formatCents(statement.settleTotalAmount)} 元。
            </span>
          </div>
        </div>
      </Modal>

      {/* 核销弹窗 */}
      <Modal
        open={writeoffOpen}
        title="收款核销"
        onClose={() => setWriteoffOpen(false)}
        width={460}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setWriteoffOpen(false)} disabled={busy}>取消</button>
            <button type="button" className="btn" onClick={() => void submitWriteoff()} disabled={busy}>{busy ? '提交中…' : '提交核销'}</button>
          </>
        }
      >
        {writeoffError && <Alert kind="error">{writeoffError}</Alert>}
        <div className="field">
          <span className="field-label">本次核销金额（元）<span className="required">*</span></span>
          <input className="input" inputMode="decimal" placeholder="0.00" value={writeoffAmount} onChange={(event) => setWriteoffAmount(event.currentTarget.value)} />
          <span className="field-hint">
            前置条件：存在有效开票记录才可核销；累计核销金额不可超过累计开票金额：已核销 {formatCents(statement.writeoffTotalAmount)} 元，累计开票 {formatCents(statement.invoiceTotalAmount)} 元。
          </span>
        </div>
      </Modal>
    </div>
  )
}
