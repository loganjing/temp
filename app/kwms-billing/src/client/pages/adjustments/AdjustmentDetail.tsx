import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { apiRequest } from '../../platform/api-client'
import { errorText } from '../../platform/errors'
import { useSession } from '../../platform/session'
import { Alert, ConfirmDialog, PageHeader, StatusBadge, statusTone } from '../../components/ui'
import { useOptionList } from '../../components/options'
import { centsToYuanText, formatCents, parseYuanToCents } from '../../platform/format'
import { ADJUSTMENT_STATUS_LABELS, labelOf } from '../../labels'
import type { AdjustmentDetailResponse } from '../../types'

interface LineDraft {
  key: number
  receivableDetailId: string | null
  feeTypeId: string
  businessQty: string
  amountBefore: string
  adjustmentAmount: string
  reason: string
  locked: boolean
}

let lineKeySeed = 1

// 调整单编辑/详情：draft 态可【添加费用明细】（加载周期内暂存明细，费用类型锁定）、
// 手动新增空白行、调整金额仅正数（前端拦截）、审核生效；effective 态只读。
export default function AdjustmentDetail() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const { can } = useSession()
  const [detail, setDetail] = useState<AdjustmentDetailResponse | null>(null)
  const [lines, setLines] = useState<LineDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lineErrors, setLineErrors] = useState<Record<number, Record<string, string>>>({})
  const [confirmAudit, setConfirmAudit] = useState(params.get('audit') === '1')

  const feeTypes = useOptionList<Record<string, unknown>>('/api/masterdata/fee-types', (item) => String(item.name ?? ''))

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError('')
    try {
      const result = await apiRequest<AdjustmentDetailResponse>(`/api/adjustments/${encodeURIComponent(id)}`)
      setDetail(result)
      setLines(result.lines.map((line) => ({
        key: lineKeySeed++,
        receivableDetailId: line.receivableDetailId,
        feeTypeId: line.feeTypeId,
        businessQty: line.businessQty === null || line.businessQty === undefined ? '' : String(line.businessQty),
        amountBefore: line.amountBefore === null || line.amountBefore === undefined ? '—' : centsToYuanText(line.amountBefore),
        adjustmentAmount: line.adjustmentAmount === null || line.adjustmentAmount === undefined ? '' : centsToYuanText(line.adjustmentAmount),
        reason: line.reason ?? '',
        locked: true,
      })))
    } catch (cause) {
      setError(errorText(cause, '调整单加载失败'))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  const editable = detail?.status === 'draft' && can('adjustment:edit')

  const loadDetails = async () => {
    if (!detail || !id) return
    setBusy(true)
    setActionError('')
    setNotice('')
    try {
      const result = await apiRequest<{ lines: Array<{ receivableDetailId: string; feeTypeId: string; businessQty: number | null; amountBefore: number | null }> }>(
        `/api/adjustments/${encodeURIComponent(id)}/details/load`,
        { method: 'POST' },
      )
      setLines(result.lines.map((line) => ({
        key: lineKeySeed++,
        receivableDetailId: line.receivableDetailId,
        feeTypeId: line.feeTypeId,
        businessQty: line.businessQty === null || line.businessQty === undefined ? '' : String(line.businessQty),
        amountBefore: line.amountBefore === null || line.amountBefore === undefined ? '—' : centsToYuanText(line.amountBefore),
        adjustmentAmount: '',
        reason: '',
        locked: true,
      })))
      setNotice('已按业务周期加载周期内暂存（未对账）应收明细，已对账明细自动过滤。带出行的费用类型锁定不可修改。')
    } catch (cause) {
      setActionError(errorText(cause, '添加费用明细失败'))
    } finally {
      setBusy(false)
    }
  }

  const addBlankLine = () => {
    setLines((current) => [...current, {
      key: lineKeySeed++,
      receivableDetailId: null,
      feeTypeId: '',
      businessQty: '',
      amountBefore: '0.00',
      adjustmentAmount: '',
      reason: '',
      locked: false,
    }])
  }

  const updateLine = (key: number, patch: Partial<LineDraft>) => {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }

  const removeLine = (key: number) => {
    setLines((current) => current.filter((line) => line.key !== key))
  }

  // 调整后金额 = 调整前 ± 调整金额（带出行为加；手动行调整前为 0）
  const computedAfter = (line: LineDraft): string => {
    if (line.amountBefore === '—') return '—'
    const parsed = parseYuanToCents(line.adjustmentAmount)
    if (!parsed.ok || parsed.cents === null) return '—'
    const before = Math.round(parseFloat(line.amountBefore) * 100)
    return ((before + parsed.cents) / 100).toFixed(2)
  }

  const validateLines = (): boolean => {
    const errors: Record<number, Record<string, string>> = {}
    for (const line of lines) {
      const current: Record<string, string> = {}
      if (!line.receivableDetailId && !line.feeTypeId) current.feeTypeId = '手动新增行必须选择费用类型'
      const amountText = line.adjustmentAmount.trim()
      if (!amountText) {
        current.adjustmentAmount = '调整金额为必填项'
      } else {
        const parsed = parseYuanToCents(amountText)
        if (!parsed.ok) current.adjustmentAmount = '调整金额须为正数，最多 2 位小数'
        else if (parsed.cents === null || parsed.cents <= 0) current.adjustmentAmount = '调整金额仅支持正数，调减请新增反向调整单'
      }
      if (!line.reason.trim()) current.reason = '调整原因为必填项'
      if (Object.keys(current).length > 0) errors[line.key] = current
    }
    setLineErrors(errors)
    return Object.keys(errors).length === 0
  }

  const save = async () => {
    if (!id) return
    setActionError('')
    setNotice('')
    if (!validateLines()) {
      setActionError('请先修正各行校验错误（调整金额须为正数、调整原因必填）。')
      return
    }
    setSaving(true)
    try {
      const payload = lines.map((line) => {
        if (line.receivableDetailId) {
          return {
            receivableDetailId: line.receivableDetailId,
            adjustmentAmount: Math.round(parseFloat(line.adjustmentAmount) * 100),
            reason: line.reason.trim(),
          }
        }
        return {
          feeTypeId: line.feeTypeId,
          businessQty: line.businessQty.trim() ? Number(line.businessQty) : undefined,
          amountBefore: 0,
          adjustmentAmount: Math.round(parseFloat(line.adjustmentAmount) * 100),
          reason: line.reason.trim(),
        }
      })
      await apiRequest(`/api/adjustments/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ lines: payload }) })
      setNotice('调整单已保存。审核生效后将同步更新对应应收明细金额。')
      await load()
    } catch (cause) {
      setActionError(errorText(cause, '调整单保存失败'))
    } finally {
      setSaving(false)
    }
  }

  const audit = async () => {
    if (!id) return
    setBusy(true)
    setActionError('')
    try {
      await apiRequest(`/api/adjustments/${encodeURIComponent(id)}/audit`, { method: 'POST' })
      setConfirmAudit(false)
      setNotice('调整单已审核生效：对应应收明细金额已同步更新，变更已记录日志。')
      await load()
    } catch (cause) {
      setActionError(errorText(cause, '审核失败'))
      setConfirmAudit(false)
    } finally {
      setBusy(false)
    }
  }

  const feeTypeName = (feeTypeId: string) => String(feeTypes.items.find((item) => item.id === feeTypeId)?.name ?? feeTypeId)

  const effectiveNotice = useMemo(() => (
    detail?.status === 'effective'
      ? '调整单已生效：对应应收费用明细金额已同步更新，行内容只读。'
      : null
  ), [detail])

  if (loading) return <div className="card"><div className="card-body"><p className="muted" style={{ margin: 0 }}>加载中…</p></div></div>
  if (error) {
    return (
      <div className="section-gap">
        <Alert kind="error">{error}</Alert>
        <div><Link className="btn btn-secondary" to="/adjustments">返回列表</Link></div>
      </div>
    )
  }
  if (!detail) return null

  // 详情响应为平铺结构（头部字段 + lines）
  const adjustment = detail

  return (
    <div className="section-gap">
      <PageHeader
        title={`调整单 ${adjustment.billNo}`}
        description="单据编号由系统自动生成，页面只读。"
        actions={
          <>
            <Link className="btn btn-secondary" to="/adjustments">返回列表</Link>
            {editable && (
              <>
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void loadDetails()}>{busy ? '加载中…' : '添加费用明细'}</button>
                <button type="button" className="btn btn-secondary" onClick={addBlankLine}>手动新增空白行</button>
                <button type="button" className="btn" disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : '保存'}</button>
              </>
            )}
            {can('adjustment:audit') && adjustment.status === 'draft' && (
              <button type="button" className="btn" onClick={() => setConfirmAudit(true)}>审核</button>
            )}
          </>
        }
      />
      {actionError && <Alert kind="error">{actionError}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}
      {effectiveNotice && <Alert kind="info">{effectiveNotice}</Alert>}

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">头部信息</h2>
          <StatusBadge label={labelOf(ADJUSTMENT_STATUS_LABELS, adjustment.status)} tone={statusTone(adjustment.status)} />
        </div>
        <div className="card-body">
          <div className="kv-grid">
            <div className="kv"><span className="kv-label">单据编号</span><span className="kv-value">{adjustment.billNo}</span></div>
            <div className="kv"><span className="kv-label">业务周期</span><span className="kv-value">{adjustment.periodStart} ~ {adjustment.periodEnd}</span></div>
            <div className="kv"><span className="kv-label">备注</span><span className="kv-value" title={adjustment.remark ?? ''}>{adjustment.remark ?? '—'}</span></div>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-header"><h2 className="card-title">调整明细行（{lines.length}）</h2></div>
        <div className="card-body card-body-tight">
          <p className="field-hint" style={{ margin: '12px 16px 0' }}>
            带出行费用类型锁定不可修改；调整金额仅支持正数（调减须新增反向调整单）；调整后金额=调整前金额+调整金额，审核生效后同步写回应收明细。
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>行号</th>
                  <th>费用类型</th>
                  <th className="num">业务量</th>
                  <th className="num">调整前金额（元）</th>
                  <th className="num">调整金额（元）</th>
                  <th className="num">调整后金额（元）</th>
                  <th>调整原因</th>
                  {editable && <th style={{ width: 64 }}>操作</th>}
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => {
                  const lineError = lineErrors[line.key] ?? {}
                  return (
                    <tr key={line.key}>
                      <td>{index + 1}</td>
                      <td>
                        {line.locked || !editable ? (
                          <span title={feeTypeName(line.feeTypeId)}>{feeTypeName(line.feeTypeId)}</span>
                        ) : (
                          <select className="select" style={{ minWidth: 140 }} value={line.feeTypeId} onChange={(event) => updateLine(line.key, { feeTypeId: event.currentTarget.value })}>
                            <option value="">请选择费用类型</option>
                            {feeTypes.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                        )}
                        {lineError.feeTypeId && <div className="field-error">{lineError.feeTypeId}</div>}
                        {line.locked && <div className="field-hint">带出行（锁定）</div>}
                      </td>
                      <td className="num">
                        {editable && !line.locked ? (
                          <input className="input" style={{ minWidth: 90 }} inputMode="decimal" value={line.businessQty} onChange={(event) => updateLine(line.key, { businessQty: event.currentTarget.value })} placeholder="选填" />
                        ) : (
                          line.businessQty || '—'
                        )}
                      </td>
                      <td className="num">
                        {editable && !line.locked ? (
                          <input className="input" style={{ minWidth: 100 }} disabled value={line.amountBefore} />
                        ) : (
                          formatCents(detail.lines.find((saved) => saved.receivableDetailId === line.receivableDetailId && saved.lineNo === index + 1)?.amountBefore ?? null) !== '—'
                            ? formatCents(detail.lines.find((saved) => saved.lineNo === index + 1)?.amountBefore ?? null)
                            : line.amountBefore === '—' ? '—' : line.amountBefore
                        )}
                      </td>
                      <td className="num">
                        {editable ? (
                          <>
                            <input
                              className="input"
                              style={{ minWidth: 100 }}
                              inputMode="decimal"
                              placeholder="正数"
                              value={line.adjustmentAmount}
                              onChange={(event) => updateLine(line.key, { adjustmentAmount: event.currentTarget.value })}
                            />
                            {lineError.adjustmentAmount && <div className="field-error">{lineError.adjustmentAmount}</div>}
                          </>
                        ) : (
                          formatCents(detail.lines.find((saved) => saved.lineNo === index + 1)?.adjustmentAmount ?? null)
                        )}
                      </td>
                      <td className="num">
                        {editable ? computedAfter(line) : formatCents(detail.lines.find((saved) => saved.lineNo === index + 1)?.amountAfter ?? null)}
                      </td>
                      <td>
                        {editable ? (
                          <>
                            <input
                              className="input"
                              style={{ minWidth: 180 }}
                              value={line.reason}
                              placeholder="库存误差 / 临时服务费 / 客户减免等"
                              maxLength={200}
                              onChange={(event) => updateLine(line.key, { reason: event.currentTarget.value })}
                            />
                            {lineError.reason && <div className="field-error">{lineError.reason}</div>}
                          </>
                        ) : (
                          <span className="cell-ellipsis" title={line.reason}>{line.reason ?? '—'}</span>
                        )}
                      </td>
                      {editable && (
                        <td>
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => removeLine(line.key)}>删除</button>
                        </td>
                      )}
                    </tr>
                  )
                })}
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={editable ? 8 : 7} style={{ textAlign: 'center' }}>
                      <div className="empty">
                        <p className="empty-title" style={{ margin: 0 }}>暂无调整明细行</p>
                        {editable && <p className="empty-desc" style={{ margin: 0 }}>点击【添加费用明细】按业务周期加载暂存明细，或【手动新增空白行】录入临时费用。</p>}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={confirmAudit}
        title="审核调整单"
        message={`审核通过后调整单 ${adjustment.billNo} 生效，各行调整后金额将同步写回对应应收费用明细（已对账明细不生效），并生成变更日志。确认审核？`}
        confirmText="确认审核"
        busy={busy}
        onCancel={() => setConfirmAudit(false)}
        onConfirm={() => void audit()}
      />
    </div>
  )
}
