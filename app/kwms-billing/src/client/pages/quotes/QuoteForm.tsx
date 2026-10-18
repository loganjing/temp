import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { compareDates, freeRentEndDate, type BillingMode, type DiscountRulePayload, type QuoteLinePayload } from '../../../shared/contracts'
import { apiRequest } from '../../platform/api-client'
import { errorText } from '../../platform/errors'
import { useSession } from '../../platform/session'
import { Alert, ConfirmDialog, PageHeader, StatusBadge, statusTone } from '../../components/ui'
import { CheckField, DateField, InputField, SelectField, TextareaField } from '../../components/form'
import { useOptionList, codeNameOf } from '../../components/options'
import { parseYuanToCents } from '../../platform/format'
import {
  BILLING_BASIS_LABELS,
  BILLING_MODE_LABELS,
  BILLING_PERIOD_LABELS,
  OWNER_TYPE_LABELS,
  QUOTE_STATUS_LABELS,
  SETTLEMENT_MODE_LABELS,
  labelOf,
} from '../../labels'
import type { Quote, QuoteDetailResponse } from '../../types'
import DiscountModal, { DiscountRulesView } from './DiscountModal'

interface LineDraft {
  key: number
  feeTypeId: string
  billingMode: BillingMode | ''
  billingBasis: string
  goodsCategoryId: string
  unitPrice: string
  minCharge: string
  fixedAmount: string
  discounts?: DiscountRulePayload[]
}

let lineKeySeed = 1
const emptyLine = (): LineDraft => ({
  key: lineKeySeed++,
  feeTypeId: '',
  billingMode: '',
  billingBasis: '',
  goodsCategoryId: '',
  unitPrice: '',
  minCharge: '',
  fixedAmount: '',
})

interface HeaderState {
  contractId: string
  orgId: string
  warehouseId: string
  ownerType: string
  ownerId: string
  effectStart: string
  effectEnd: string
  rentFreeDays: string
  billingPeriod: string
  settlementMode: string
  insuranceRequired: boolean
  remark: string
}

const EMPTY_HEADER: HeaderState = {
  contractId: '',
  orgId: '',
  warehouseId: '',
  ownerType: '',
  ownerId: '',
  effectStart: '',
  effectEnd: '',
  rentFreeDays: '',
  billingPeriod: '',
  settlementMode: 'monthly',
  insuranceRequired: false,
  remark: '',
}

// 报价单新建/编辑表单：头部字段联动（组织→仓库/货主、货主类型→货主）、
// 费用明细行增删、分段优惠弹窗、一口价模式单价置灰金额可编辑、billNo 只读、前端第一道校验。
export default function QuoteForm({ mode }: { mode: 'create' | 'edit' }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { can, user } = useSession()

  const [header, setHeader] = useState<HeaderState>(EMPTY_HEADER)
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()])
  const [billNo, setBillNo] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(mode === 'edit')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [lineErrors, setLineErrors] = useState<Record<number, Record<string, string>>>({})
  const [discountLine, setDiscountLine] = useState<LineDraft | null>(null)
  const [loadingError, setLoadingError] = useState('')
  const [terminated, setTerminated] = useState(false)

  // 编辑态：仅暂存单据可编辑；已生效/已终止直接引导回详情
  useEffect(() => {
    if (mode !== 'edit' || !id) return
    setLoading(true)
    apiRequest<QuoteDetailResponse>(`/api/quotes/${encodeURIComponent(id)}`)
      .then((result) => {
        // 详情响应为平铺结构（头部字段 + lines）
        const quote: Quote = result
        if (quote.status !== 'draft') {
          setTerminated(true)
          setBillNo(quote.billNo)
          setStatus(quote.status)
        } else {
          setHeader({
            contractId: quote.contractId,
            orgId: quote.orgId,
            warehouseId: quote.warehouseId,
            ownerType: quote.ownerType,
            ownerId: quote.ownerId,
            effectStart: quote.effectStart,
            effectEnd: quote.effectEnd,
            rentFreeDays: String(quote.rentFreeDays),
            billingPeriod: quote.billingPeriod,
            settlementMode: quote.settlementMode,
            insuranceRequired: quote.insuranceRequired,
            remark: quote.remark ?? '',
          })
          setLines(result.lines.map((line) => ({
            key: lineKeySeed++,
            feeTypeId: line.feeTypeId,
            billingMode: line.billingMode,
            billingBasis: line.billingBasis ?? '',
            goodsCategoryId: line.goodsCategoryId ?? '',
            unitPrice: line.unitPrice === null || line.unitPrice === undefined ? '' : (line.unitPrice / 100).toFixed(2),
            minCharge: line.minCharge === null || line.minCharge === undefined ? '' : (line.minCharge / 100).toFixed(2),
            fixedAmount: line.fixedAmount === null || line.fixedAmount === undefined ? '' : (line.fixedAmount / 100).toFixed(2),
            discounts: line.discounts,
          })))
          setBillNo(quote.billNo)
          setStatus(quote.status)
        }
      })
      .catch((cause) => setLoadingError(errorText(cause, '报价单加载失败')))
      .finally(() => setLoading(false))
  }, [mode, id])

  const orgs = useOptionList<Record<string, unknown>>('/api/orgs', codeNameOf)
  const contracts = useOptionList<Record<string, unknown>>(
    header.orgId ? `/api/contracts?orgId=${encodeURIComponent(header.orgId)}` : '/api/contracts',
    (item) => String(item.contractNo ?? ''),
  )
  const warehouses = useOptionList<Record<string, unknown>>(
    header.orgId ? `/api/warehouses?orgId=${encodeURIComponent(header.orgId)}` : '/api/warehouses',
    (item) => String(item.name ?? ''),
  )
  const owners = useOptionList<Record<string, unknown>>(
    `/api/owners?orgId=${encodeURIComponent(header.orgId)}&ownerType=${header.ownerType}`,
    (item) => String(item.name ?? ''),
  )
  const feeTypes = useOptionList<Record<string, unknown>>('/api/masterdata/fee-types', (item) => String(item.name ?? ''))
  const goodsCategories = useOptionList<Record<string, unknown>>('/api/masterdata/goods-categories', (item) => String(item.name ?? ''))

  const feeTypeName = (feeTypeId: string) => String(feeTypes.items.find((item) => item.id === feeTypeId)?.name ?? (feeTypeId || '未选费用类型'))

  useEffect(() => {
    if (mode === 'create' && user?.orgId && !header.orgId) {
      setHeader((current) => ({ ...current, orgId: user.orgId! }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.orgId, mode])

  const updateHeader = (patch: Partial<HeaderState>) => setHeader((current) => ({ ...current, ...patch }))

  const updateLine = (key: number, patch: Partial<LineDraft>) => {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }

  // 计费模式切换的字段置灰/清空联动
  const changeBillingMode = (key: number, billingMode: string) => {
    setLines((current) => current.map((line) => {
      if (line.key !== key) return line
      const mode = billingMode as BillingMode | ''
      if (mode === 'fixed_price') {
        return { ...line, billingMode: mode, billingBasis: '', unitPrice: '' }
      }
      return { ...line, billingMode: mode, fixedAmount: '' }
    }))
  }

  // —— 前端第一道校验（错误码总表对应的中文文案，字段定位） ——
  const validate = (): boolean => {
    const errors: Record<string, string> = {}
    const headerLabels: Record<string, string> = {
      contractId: '合同编号',
      orgId: '组织机构',
      warehouseId: '仓库名称',
      ownerType: '货主类型',
      ownerId: '货主',
      effectStart: '合同效期-开始时间',
      effectEnd: '合同效期-结束时间',
      rentFreeDays: '免租期',
      billingPeriod: '结算账期',
      settlementMode: '结算方式',
    }
    for (const [field, label] of Object.entries(headerLabels)) {
      if (!header[field as keyof HeaderState]) errors[field] = `${label}为必填项`
    }
    if (header.effectStart && header.effectEnd && compareDates(header.effectStart, header.effectEnd) >= 0) {
      errors.effectStart = '合同开始日期必须早于结束日期'
    }
    if (header.effectStart && header.effectEnd && header.rentFreeDays) {
      const freeEnd = freeRentEndDate(header.effectStart, Number(header.rentFreeDays))
      if (compareDates(freeEnd, header.effectEnd) > 0) {
        errors.rentFreeDays = '免租期结束日期不可晚于合同结束日期'
      }
    }
    if (header.remark.length > 500) errors.remark = '备注不可超过 500 字'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return false

    const lineErrs: Record<number, Record<string, string>> = {}
    const seen = new Set<string>()
    for (const line of lines) {
      const current: Record<string, string> = {}
      if (!line.feeTypeId) current.feeTypeId = '费用类型为必填项'
      if (!line.billingMode) current.billingMode = '计费模式为必填项'
      if (line.billingMode === 'normal' && !line.billingBasis) current.billingBasis = '普通模式必须选择计费方式'
      if (line.billingMode !== 'fixed_price') {
        if (!line.unitPrice.trim()) {
          current.unitPrice = '单价为必填项'
        } else {
          const parsed = parseYuanToCents(line.unitPrice)
          if (!parsed.ok || parsed.cents === null || parsed.cents <= 0) current.unitPrice = '单价必须为正数，最多 2 位小数'
        }
      }
      if (line.billingMode === 'fixed_price') {
        if (!line.fixedAmount.trim()) {
          current.fixedAmount = '金额为必填项'
        } else {
          const parsed = parseYuanToCents(line.fixedAmount)
          if (!parsed.ok || parsed.cents === null || parsed.cents <= 0) current.fixedAmount = '金额必须为正数，最多 2 位小数'
        }
      }
      if (line.minCharge.trim()) {
        const parsed = parseYuanToCents(line.minCharge)
        if (!parsed.ok) current.minCharge = parsed.message
        else if (parsed.cents !== null && parsed.cents <= 0) current.minCharge = '最低收费须为正数（留空表示无保底）'
      }
      if (line.discounts && line.discounts.length > 0) {
        const total = line.discounts.reduce((sum, rule) => sum + 1, 0)
        if (total > 0) {
          const intervalError = validateIntervalRules(line.discounts)
          if (intervalError) current.discounts = intervalError
        }
      }
      const dedupeKey = `${line.feeTypeId}|${line.goodsCategoryId || ''}`
      if (line.feeTypeId && seen.has(dedupeKey)) {
        current.feeTypeId = '同一单据内存在同费用类型+同货品类别的重复明细行'
      } else {
        seen.add(dedupeKey)
      }
      if (Object.keys(current).length > 0) lineErrs[line.key] = current
    }
    setLineErrors(lineErrs)
    return Object.keys(lineErrs).length === 0
  }

  const buildPayload = () => {
    const payloadLines: QuoteLinePayload[] = lines.map((line) => {
      const isFixed = line.billingMode === 'fixed_price'
      return {
        feeTypeId: line.feeTypeId,
        billingMode: line.billingMode as Exclude<typeof line.billingMode, ''>,
        billingBasis: line.billingMode === 'normal' ? (line.billingBasis as NonNullable<QuoteLinePayload['billingBasis']>) : null,
        goodsCategoryId: line.goodsCategoryId || null,
        unitPrice: isFixed ? null : (parseYuanToCents(line.unitPrice).ok ? (parseYuanToCents(line.unitPrice) as { cents: number | null }).cents : null),
        minCharge: line.minCharge.trim() ? (parseYuanToCents(line.minCharge) as { cents: number | null }).cents : null,
        fixedAmount: isFixed ? (parseYuanToCents(line.fixedAmount) as { cents: number | null }).cents : null,
        discounts: line.discounts && line.discounts.length > 0 ? line.discounts : undefined,
      }
    })
    return {
      contractId: header.contractId,
      orgId: header.orgId,
      warehouseId: header.warehouseId,
      ownerType: header.ownerType,
      ownerId: header.ownerId,
      effectStart: header.effectStart,
      effectEnd: header.effectEnd,
      rentFreeDays: Number(header.rentFreeDays),
      billingPeriod: header.billingPeriod,
      settlementMode: header.settlementMode,
      insuranceRequired: header.insuranceRequired,
      remark: header.remark.trim() || null,
      lines: payloadLines,
    }
  }

  const save = async () => {
    setError('')
    if (!validate()) {
      setError('请先修正表单中的校验错误（必填、数值或区间约束），再保存。')
      return
    }
    if (lines.length === 0) {
      setError('至少需要一条费用明细行。')
      return
    }
    setBusy(true)
    try {
      const payload = buildPayload()
      const saved = mode === 'create'
        ? await apiRequest<QuoteDetailResponse>('/api/quotes', { method: 'POST', body: JSON.stringify(payload) })
        : await apiRequest<QuoteDetailResponse>(`/api/quotes/${encodeURIComponent(id ?? '')}`, { method: 'PUT', body: JSON.stringify(payload) })
      navigate(`/quotes/${saved.id}`, { replace: true })
    } catch (cause) {
      setError(errorText(cause, '保存失败，请稍后重试'))
    } finally {
      setBusy(false)
    }
  }

  const billingBasisOptions = Object.entries(BILLING_BASIS_LABELS).map(([value, label]) => ({ value, label }))

  if (loading) return <div className="card"><div className="card-body"><p className="muted" style={{ margin: 0 }}>加载中…</p></div></div>
  if (loadingError) return <Alert kind="error">{loadingError}</Alert>
  if (terminated) {
    return (
      <div className="section-gap">
        <Alert kind="info">
          报价单 {billNo} 当前状态为「{labelOf(QUOTE_STATUS_LABELS, status)}」，计费规则不可修改。如需变更，请终止旧合同后新建续签报价单。
        </Alert>
        <div><Link className="btn btn-secondary" to={`/quotes/${id}`}>返回详情</Link></div>
      </div>
    )
  }

  return (
    <div className="section-gap">
      <PageHeader
        title={mode === 'create' ? '新建仓储合同报价单' : `编辑报价单 ${billNo}`}
        description={mode === 'create' ? '保存后单据编号由系统自动生成（只读）；审核生效后参与自动计费。' : '仅暂存状态可编辑；保存时前后端双重校验。'}
        actions={
          <>
            <Link className="btn btn-secondary" to={mode === 'edit' && id ? `/quotes/${id}` : '/quotes'}>返回</Link>
            <button type="button" className="btn" disabled={busy} onClick={() => void save()}>{busy ? '保存中…' : '保存'}</button>
          </>
        }
      />
      {error && <Alert kind="error">{error}</Alert>}
      {billNo && (
        <section className="card">
          <div className="card-body" style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="kv"><span className="kv-label">单据编号（系统生成，只读）</span><span className="kv-value">{billNo}</span></div>
            <div className="kv"><span className="kv-label">单据状态</span><span className="kv-value"><StatusBadge label={labelOf(QUOTE_STATUS_LABELS, status)} tone={statusTone(status)} /></span></div>
          </div>
        </section>
      )}

      <section className="card">
        <div className="card-header"><h2 className="card-title">头部信息</h2></div>
        <div className="card-body">
          <div className="form-grid">
            <SelectField
              label="合同编号"
              required
              options={contracts.options}
              value={header.contractId}
              error={fieldErrors.contractId}
              onChange={(value) => updateHeader({ contractId: value })}
              hint="关联外部仓储合作合同，支持多报价单绑定同一合同"
            />
            <SelectField
              label="组织机构"
              required
              options={orgs.options}
              value={header.orgId}
              error={fieldErrors.orgId}
              onChange={(value) => updateHeader({ orgId: value, warehouseId: '', ownerId: '' })}
              hint="数据按组织隔离"
            />
            <SelectField
              label="仓库名称"
              required
              options={warehouses.options}
              value={header.warehouseId}
              error={fieldErrors.warehouseId}
              disabled={!header.orgId}
              onChange={(value) => updateHeader({ warehouseId: value })}
              hint={header.orgId ? '仅展示所选组织下有效仓库' : '请先选择组织机构'}
            />
            <SelectField
              label="货主类型"
              required
              options={[
                { value: 'business', label: OWNER_TYPE_LABELS.business },
                { value: 'customer', label: OWNER_TYPE_LABELS.customer },
              ]}
              value={header.ownerType}
              error={fieldErrors.ownerType}
              onChange={(value) => updateHeader({ ownerType: value, ownerId: '' })}
            />
            <SelectField
              label="货主"
              required
              options={owners.options}
              value={header.ownerId}
              error={fieldErrors.ownerId}
              disabled={!header.orgId || !header.ownerType}
              onChange={(value) => updateHeader({ ownerId: value })}
              hint={header.orgId ? (header.ownerType ? '按组织与货主类型过滤' : '请先选择货主类型') : '请先选择组织机构'}
            />
            <DateField
              label="合同效期-开始时间"
              required
              value={header.effectStart}
              error={fieldErrors.effectStart}
              onChange={(event) => updateHeader({ effectStart: event.currentTarget.value })}
              hint="计费生效起始日，免租期从该日期起算"
            />
            <DateField
              label="合同效期-结束时间"
              required
              value={header.effectEnd}
              error={fieldErrors.effectEnd}
              onChange={(event) => updateHeader({ effectEnd: event.currentTarget.value })}
            />
            <SelectField
              label="免租期（天）"
              required
              options={[0, 7, 15, 30].map((days) => ({ value: String(days), label: `${days} 天` }))}
              value={header.rentFreeDays}
              error={fieldErrors.rentFreeDays}
              onChange={(value) => updateHeader({ rentFreeDays: value })}
              hint="免租期内系统不生成任何费用明细"
            />
            <SelectField
              label="结算账期"
              required
              options={Object.entries(BILLING_PERIOD_LABELS).map(([value, labelText]) => ({ value, label: labelText }))}
              value={header.billingPeriod}
              error={fieldErrors.billingPeriod}
              onChange={(value) => updateHeader({ billingPeriod: value })}
            />
            <SelectField
              label="结算方式"
              required
              options={Object.entries(SETTLEMENT_MODE_LABELS).map(([value, labelText]) => ({ value, label: labelText }))}
              value={header.settlementMode}
              error={fieldErrors.settlementMode}
              onChange={(value) => updateHeader({ settlementMode: value })}
              hint="默认月结，预留扩展能力"
            />
            <div className="field">
              <span className="field-label">需要保险</span>
              <CheckField
                label={header.insuranceRequired ? '是（联动保险费自动计费）' : '否'}
                checked={header.insuranceRequired}
                onChange={(checked) => updateHeader({ insuranceRequired: checked })}
              />
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <TextareaField
              label="备注（选填）"
              value={header.remark}
              error={fieldErrors.remark}
              maxLength={500}
              placeholder="记录合同特殊计费约定、补充说明"
              onChange={(event) => updateHeader({ remark: event.currentTarget.value })}
            />
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">费用明细行（{lines.length}）</h2>
          <div className="toolbar">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setLines((current) => [...current, emptyLine()])}>增行</button>
          </div>
        </div>
        <div className="card-body">
          <p className="field-hint" style={{ margin: '0 0 12px' }}>
            每条明细代表单一费用类型的计费规则；普通模式=业务量×单价后与最低收费取大；一口价直接取「金额」；取大值按体积/重量计费金额取大后再对比最低收费。
          </p>
          {lines.map((line, index) => {
            const lineError = lineErrors[line.key] ?? {}
            const isFixed = line.billingMode === 'fixed_price'
            return (
              <div key={line.key} className="card" style={{ marginBottom: 12, background: 'var(--page)' }}>
                <div className="card-header">
                  <h3 className="card-title" style={{ fontSize: 13.5 }}>第 {index + 1} 行</h3>
                  <div className="toolbar">
                    {can('discount:edit') && (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDiscountLine(line)}>
                        分段优惠{line.discounts && line.discounts.length > 0 ? `（${line.discounts.length} 段）` : ''}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}
                    >删行</button>
                  </div>
                </div>
                <div className="card-body">
                  <div className="form-grid">
                    <SelectField
                      label="费用类型"
                      required
                      options={feeTypes.options}
                      value={line.feeTypeId}
                      error={lineError.feeTypeId}
                      onChange={(value) => updateLine(line.key, { feeTypeId: value })}
                    />
                    <SelectField
                      label="计费模式"
                      required
                      options={Object.entries(BILLING_MODE_LABELS).map(([value, labelText]) => ({ value, label: labelText }))}
                      value={line.billingMode}
                      error={lineError.billingMode}
                      onChange={(value) => changeBillingMode(line.key, value)}
                    />
                    <SelectField
                      label="计费方式"
                      required={line.billingMode === 'normal'}
                      options={billingBasisOptions}
                      value={line.billingBasis}
                      error={lineError.billingBasis}
                      disabled={line.billingMode !== 'normal'}
                      onChange={(value) => updateLine(line.key, { billingBasis: value })}
                      hint={line.billingMode === 'normal' ? undefined : '一口价、取大值模式不可编辑'}
                    />
                    <SelectField
                      label="货品类别（选填）"
                      options={goodsCategories.options}
                      value={line.goodsCategoryId}
                      onChange={(value) => updateLine(line.key, { goodsCategoryId: value })}
                      hint="不选代表全货品共用一套单价"
                    />
                    <InputField
                      label="单价（元）"
                      required={!isFixed}
                      inputMode="decimal"
                      placeholder="0.00"
                      value={line.unitPrice}
                      disabled={isFixed}
                      error={lineError.unitPrice}
                      onChange={(event) => updateLine(line.key, { unitPrice: event.currentTarget.value })}
                      hint={isFixed ? '一口价模式置灰' : undefined}
                    />
                    <InputField
                      label="最低收费（元，选填）"
                      inputMode="decimal"
                      placeholder="留空表示无保底"
                      value={line.minCharge}
                      error={lineError.minCharge}
                      onChange={(event) => updateLine(line.key, { minCharge: event.currentTarget.value })}
                    />
                    <InputField
                      label="金额（元）"
                      required={isFixed}
                      inputMode="decimal"
                      placeholder="固定总价"
                      value={line.fixedAmount}
                      disabled={!isFixed}
                      error={lineError.fixedAmount}
                      onChange={(event) => updateLine(line.key, { fixedAmount: event.currentTarget.value })}
                      hint={isFixed ? '一口价固定总价' : '仅一口价模式可编辑'}
                    />
                  </div>
                  {lineError.discounts && <div className="alert alert-error" style={{ marginTop: 10 }}>{lineError.discounts}</div>}
                  {line.discounts && line.discounts.length > 0 && (
                    <p className="field-hint" style={{ margin: '10px 0 0' }}>
                      已配置分段优惠：<DiscountRulesView rules={line.discounts} />
                    </p>
                  )}
                </div>
              </div>
            )
          })}
          {lines.length === 0 && <Alert kind="info">已删除全部明细行；保存前请至少保留一行（或直接放弃保存）。</Alert>}
        </div>
      </section>

      {discountLine && (
        <DiscountModal
          open
          feeTypeName={feeTypeName(discountLine.feeTypeId)}
          initialRules={discountLine.discounts}
          onClose={() => setDiscountLine(null)}
          onSave={(rules) => {
            updateLine(discountLine.key, { discounts: rules.length > 0 ? rules : undefined })
            setDiscountLine(null)
          }}
        />
      )}
    </div>
  )
}

function validateIntervalRules(rules: DiscountRulePayload[]): string | null {
  for (const rule of rules) {
    if (!(rule.lowerLimit >= 0)) return '业务量下限不可为负数'
    if (!(rule.upperLimit > rule.lowerLimit)) return '业务量上限必须大于业务量下限'
    if (rule.discountMode === 'percent' && (rule.percentValue === null || rule.percentValue === undefined || rule.percentValue < 0 || rule.percentValue > 100)) {
      return '优惠百分比须为 0~100'
    }
    if (rule.discountMode === 'fixed' && (rule.fixedValue === null || rule.fixedValue === undefined || rule.fixedValue < 0)) {
      return '固定金额须为非负数'
    }
  }
  const sorted = [...rules].sort((a, b) => a.lowerLimit - b.lowerLimit)
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]
    const current = sorted[index]
    if (current.lowerLimit < previous.upperLimit) return '分段优惠区间存在重叠'
    if (current.lowerLimit > previous.upperLimit) return '分段优惠区间存在断层'
  }
  return null
}
