import { useState, type ChangeEvent } from 'react'
import { apiRequest, errorText } from '../../platform/api-client'
import { useCan } from '../../platform/permissions'
import { Badge, Banner, Card, EmptyState, KeyValue } from '../ui'
import { displayDateTime, displayMoney, displayNumber, displayPercent, NEXT_ACTION_LABELS, VERDICT_LABELS } from '../../lib/format'
import type { Parcel, QuickAssessment, QuickResults } from '../../types'

type NumberKey = keyof QuickResults

const NUMBER_ROWS: Array<[NumberKey, string]> = [
  ['gdv', '总销售收入 GDV'],
  ['bumiQuotaDiscount', '土著配额/折扣调整'],
  ['netGdv', '净销售收入'],
  ['constructionCost', '建筑及基础设施成本'],
  ['miscGov', '杂项及政府贡献'],
  ['professionalFee', '专业及项目费用'],
  ['salesMarketing', '销售与市场费用'],
  ['financeCost', '融资费用'],
  ['tdc', '总开发成本 TDC'],
  ['pbt', '税前利润 PBT'],
]
const RATIO_ROWS: Array<[NumberKey, string]> = [
  ['pm', '利润率 PM'],
  ['landCostToNetRevenueRatio', '土地成本占净收入比例'],
  ['tdcToRevenueRatio', '总成本占收入比例'],
]

/** M05 快速评估：少量关键输入 → 服务端试算与初筛结论（修改=新建+重算，历史版本保留）（AC-03）。 */
export default function QuickAssessTab({ parcel }: { parcel: Parcel }) {
  const can = useCan()
  const editable = can('quick-assessments:write')
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [policy, setPolicy] = useState({ bumiQuotaPct: '', bumiDiscountPct: '', affordableRatio: '', targetPm: '' })
  const [landCost, setLandCost] = useState<{ total: string; perSqft: string; basis: 'total' | 'per-sqft' }>({ total: '', perSqft: '', basis: 'total' })
  const [assessment, setAssessment] = useState<QuickAssessment | null>(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const field = (key: string) => ({
    value: inputs[key] ?? '',
    onChange: (event: ChangeEvent<HTMLInputElement>) => setInputs((prev) => ({ ...prev, [key]: event.currentTarget.value })),
    disabled: !editable,
    inputMode: 'decimal' as const,
  })

  const runAssessment = async () => {
    setBusy(true)
    setError('')
    setNotice('')
    const policyFilled = Object.values(policy).some((value) => value.trim() !== '')
    try {
      const saved = await apiRequest<QuickAssessment>(`/api/parcels/${encodeURIComponent(parcel.id)}/quick-assessments`, {
        method: 'POST',
        body: JSON.stringify({
          inputs: {
            locationNote: inputs.locationNote?.trim() || null,
            landAreaSqft: inputs.landAreaSqft || '0',
            useOrZoning: inputs.useOrZoning?.trim() || null,
            plotRatioOrDensity: inputs.plotRatioOrDensity || '0',
            productMixNote: inputs.productMixNote?.trim() || null,
            estimatedUnitsOrSaleableArea: inputs.estimatedUnitsOrSaleableArea || '0',
            unitPriceOrPricePerSqft: inputs.unitPriceOrPricePerSqft || '0',
            landCostTotal: landCost.total.trim() === '' ? null : landCost.total.trim(),
            landCostPerSqft: landCost.perSqft.trim() === '' ? null : landCost.perSqft.trim(),
            landCostLastEditedBasis: landCost.basis,
            constructionCostPerSqft: inputs.constructionCostPerSqft || '0',
            miscGovPerSqft: inputs.miscGovPerSqft?.trim() === '' ? null : inputs.miscGovPerSqft,
            professionalFeePct: inputs.professionalFeePct?.trim() === '' ? null : inputs.professionalFeePct,
            salesMarketingPct: inputs.salesMarketingPct?.trim() === '' ? null : inputs.salesMarketingPct,
            financeCostPct: inputs.financeCostPct?.trim() === '' ? null : inputs.financeCostPct,
            policyAssumptions: policyFilled
              ? {
                bumiQuotaPct: policy.bumiQuotaPct.trim() === '' ? undefined : policy.bumiQuotaPct,
                bumiDiscountPct: policy.bumiDiscountPct.trim() === '' ? undefined : policy.bumiDiscountPct,
                affordableRatio: policy.affordableRatio.trim() === '' ? undefined : policy.affordableRatio,
                targetPm: policy.targetPm.trim() === '' ? undefined : policy.targetPm,
              }
              : null,
            costPackageId: inputs.costPackageId?.trim() === '' ? null : inputs.costPackageId,
          },
        }),
      })
      const computed = await apiRequest<QuickAssessment>(`/api/quick-assessments/${encodeURIComponent(saved.id)}/compute`, { method: 'POST' })
      setAssessment(computed)
      setNotice('试算完成；修改输入后可再次试算（每次试算保存为独立版本）。')
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  const results = assessment?.results ?? null

  return (
    <div className="stack">
      {notice && <p role="status" className="success">{notice}</p>}
      {error && <p role="alert" className="error">{error}</p>}
      <Banner tone="info">
        快速评估用于机会初筛：结果由服务端计算（GDV → 政策折扣 → 净收入 → 成本 → PBT/PM）；
        输入缺失时返回「资料不足」并列出缺失项，不伪造精确结论。百分比字段按百分数填写（如 18 表示 18%）。
      </Banner>

      <Card title="核心输入">
        <div className="form-grid">
          <label>位置说明<input value={inputs.locationNote ?? ''} onChange={(event) => setInputs((prev) => ({ ...prev, locationNote: event.currentTarget.value }))} disabled={!editable} placeholder="如 吉隆坡市中心南侧 3km" /></label>
          <label>土地面积（sqft）*<input {...field('landAreaSqft')} /></label>
          <label>用途/规划<input value={inputs.useOrZoning ?? ''} onChange={(event) => setInputs((prev) => ({ ...prev, useOrZoning: event.currentTarget.value }))} disabled={!editable} /></label>
          <label>容积率或密度 *<input {...field('plotRatioOrDensity')} /></label>
          <label>初步产品组合说明<input value={inputs.productMixNote ?? ''} onChange={(event) => setInputs((prev) => ({ ...prev, productMixNote: event.currentTarget.value }))} disabled={!editable} /></label>
          <label>预计单位数/可售面积 *<input {...field('estimatedUnitsOrSaleableArea')} /></label>
          <label>单位售价或单价/sqft *<input {...field('unitPriceOrPricePerSqft')} /></label>
          <label>土地成本（总额；编辑则以总额计算）
            <input value={landCost.total} disabled={!editable} inputMode="decimal"
              onChange={(event) => setLandCost((prev) => ({ ...prev, total: event.currentTarget.value, basis: 'total' }))} />
          </label>
          <label>土地成本（/sqft；编辑则以单价计算）
            <input value={landCost.perSqft} disabled={!editable} inputMode="decimal"
              onChange={(event) => setLandCost((prev) => ({ ...prev, perSqft: event.currentTarget.value, basis: 'per-sqft' }))} />
          </label>
          <label>建筑成本（/sqft）*<input {...field('constructionCostPerSqft')} /></label>
          <label>杂项/政府贡献（/sqft）<input {...field('miscGovPerSqft')} /></label>
          <label>专业费用（%）<input {...field('professionalFeePct')} /></label>
          <label>销售市场费用（%）<input {...field('salesMarketingPct')} /></label>
          <label>融资费用（%）<input {...field('financeCostPct')} /></label>
          <label>成本套餐 ID<input value={inputs.costPackageId ?? ''} onChange={(event) => setInputs((prev) => ({ ...prev, costPackageId: event.currentTarget.value }))} disabled={!editable} placeholder="可选，参数域成本套餐" /></label>
        </div>
        <p className="hint">土地成本双向录入：以最后编辑的一侧为计算输入（当前 <Badge tone="info">{landCost.basis === 'total' ? '总额' : '单价'}</Badge>）。</p>
      </Card>

      <Card title="政策假设（可选）">
        <div className="form-grid">
          <label>土著配额（%）<input inputMode="decimal" value={policy.bumiQuotaPct} disabled={!editable} onChange={(event) => setPolicy((prev) => ({ ...prev, bumiQuotaPct: event.currentTarget.value }))} /></label>
          <label>土著折扣（%）<input inputMode="decimal" value={policy.bumiDiscountPct} disabled={!editable} onChange={(event) => setPolicy((prev) => ({ ...prev, bumiDiscountPct: event.currentTarget.value }))} /></label>
          <label>可负担住房比例（%）<input inputMode="decimal" value={policy.affordableRatio} disabled={!editable} onChange={(event) => setPolicy((prev) => ({ ...prev, affordableRatio: event.currentTarget.value }))} /></label>
          <label>目标利润率 PM（%）<input inputMode="decimal" value={policy.targetPm} disabled={!editable} placeholder="默认 18" onChange={(event) => setPolicy((prev) => ({ ...prev, targetPm: event.currentTarget.value }))} /></label>
        </div>
      </Card>

      {editable && (
        <Card>
          <button disabled={busy} onClick={() => void runAssessment()}>{busy ? '试算中…' : '保存并试算'}</button>
        </Card>
      )}

      {assessment && (
        <Card title="初筛结论">
          <KeyValue
            rows={[
              ['结论', assessment.verdict ? <Badge key="v" tone={assessment.verdict === 'PASS' ? 'ok' : assessment.verdict === 'INSUFFICIENT' ? 'warning' : 'danger'}>{VERDICT_LABELS[assessment.verdict]}</Badge> : '—'],
              ['结论说明', assessment.verdictNote ?? '—'],
              ['下一步建议', assessment.nextAction ? `${NEXT_ACTION_LABELS[assessment.nextAction] ?? assessment.nextAction}` : '—'],
              ['建议说明', assessment.nextActionNote ?? '—'],
              ['评估时间', displayDateTime(assessment.updatedAt)],
            ]}
          />
        </Card>
      )}

      {assessment && (
        <Card title="试算结果">
          {results ? (
            <div className="summary-grid">
              {NUMBER_ROWS.map(([key, label]) => (
                <div className="metric-card" key={key}>
                  <div className="metric-label">{label}</div>
                  <div className={`metric-value${key === 'pbt' && Number(results.pbt) < 0 ? ' negative' : ''}`}>{displayMoney(results[key])}</div>
                </div>
              ))}
              {RATIO_ROWS.map(([key, label]) => (
                <div className="metric-card" key={key}>
                  <div className="metric-label">{label}</div>
                  <div className="metric-value">{displayPercent(results[key])}</div>
                </div>
              ))}
              <div className="metric-card">
                <div className="metric-label">单位面积土地成本</div>
                <div className="metric-value">{displayNumber(results.landCostPerSqft)}</div>
              </div>
            </div>
          ) : (
            <EmptyState text="输入缺失，未产出结果；请按结论说明补齐核心输入（面积、密度、售价、成本基数、土地成本）。" />
          )}
        </Card>
      )}
    </div>
  )
}
