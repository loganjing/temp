/**
 * 快速评估计算引擎（契约第 6 节 / AC-03）。
 * 输入缺失时 verdict=INSUFFICIENT 并列出缺失项，不输出伪造精确结论。
 */
import { cmp, dec, decInt, decOrNull, div, fmt, mul, pctShare, sub, sum, type Decimal, isZero } from './decimal'
import type { PlanResults } from './plan-engine'

export type QuickAssessmentInputs = {
  locationNote: string | null
  landAreaSqft: string
  useOrZoning: string | null
  plotRatioOrDensity: string
  productMixNote: string | null
  estimatedUnitsOrSaleableArea: string
  unitPriceOrPricePerSqft: string
  landCostTotal: string | null
  landCostPerSqft: string | null
  landCostLastEditedBasis: 'total' | 'per-sqft' | null
  constructionCostPerSqft: string
  miscGovPerSqft: string | null
  professionalFeePct: string | null
  salesMarketingPct: string | null
  financeCostPct: string | null
  policyAssumptions: { bumiQuotaPct?: string; bumiDiscountPct?: string; affordableRatio?: string; targetPm?: string } | null
  costPackageId: string | null
}

export type QuickAssessmentResults = {
  gdv: string
  bumiQuotaDiscount: string
  netGdv: string
  constructionCost: string
  miscGov: string
  professionalFee: string
  salesMarketing: string
  financeCost: string
  tdc: string
  pbt: string
  pm: string
  landCostPerSqft: string
  landCostToNetRevenueRatio: string
  tdcToRevenueRatio: string
}

export type QuickVerdict = 'PASS' | 'REJECT' | 'DROP' | 'INSUFFICIENT'
export type NextAction = 'market-research' | 'title-verification' | 'site-visit' | 'price-negotiation' | 'jv' | 'abandon'

const ZERO: Decimal = decInt(0)
const add = (a: Decimal, b: Decimal): Decimal => sum([a, b])
const DEFAULT_TARGET_PM = '18'

function toDecimal(value: string | null | undefined): Decimal | null {
  if (value === null || value === undefined || value === '') return null
  return dec(value)
}

export function computeQuickAssessment(inputs: QuickAssessmentInputs, computedAt: string): {
  results: QuickAssessmentResults | null
  verdict: QuickVerdict
  verdictNote: string | null
  nextAction: NextAction | null
  nextActionNote: string | null
} {
  const missing: string[] = []
  const landArea = toDecimal(inputs.landAreaSqft)
  const qty = toDecimal(inputs.estimatedUnitsOrSaleableArea)
  const price = toDecimal(inputs.unitPriceOrPricePerSqft)
  const plotRatio = toDecimal(inputs.plotRatioOrDensity)
  const constructionPerSqft = toDecimal(inputs.constructionCostPerSqft)
  if (!landArea || isZero(landArea)) missing.push('landAreaSqft')
  if (!qty || isZero(qty)) missing.push('estimatedUnitsOrSaleableArea')
  if (!price || isZero(price)) missing.push('unitPriceOrPricePerSqft')
  if (!plotRatio) missing.push('plotRatioOrDensity')
  if (!constructionPerSqft) missing.push('constructionCostPerSqft')
  const landCostTotal = toDecimal(inputs.landCostTotal)
  const landCostPerSqft = toDecimal(inputs.landCostPerSqft)
  if (!landCostTotal && !landCostPerSqft) missing.push('landCostTotal/landCostPerSqft')

  if (missing.length > 0) {
    return {
      results: null,
      verdict: 'INSUFFICIENT',
      verdictNote: `输入缺失，无法计算：${missing.join('、')}`,
      nextAction: 'title-verification',
      nextActionNote: '先补齐核心输入（面积、密度、售价、成本基数）后再试算。',
    }
  }

  const gdv = mul(qty!, price!)
  const quota = pctShare(inputs.policyAssumptions?.bumiQuotaPct ?? '0')
  const discount = pctShare(inputs.policyAssumptions?.bumiDiscountPct ?? '0')
  const bumiQuotaDiscount = mul(mul(gdv, quota), discount)
  const netGdv = sub(gdv, bumiQuotaDiscount)

  // D4：以最后编辑字段为计算输入（total 直接取总额；per-sqft 按土地面积换算）。
  let landCost: Decimal = ZERO
  let landCostPerSqftValue: Decimal = ZERO
  if (inputs.landCostLastEditedBasis === 'per-sqft' && landCostPerSqft) {
    landCost = mul(landCostPerSqft, landArea!)
    landCostPerSqftValue = landCostPerSqft
  } else if (landCostTotal) {
    landCost = landCostTotal
    landCostPerSqftValue = div(landCostTotal, landArea!)
  } else if (landCostPerSqft) {
    landCost = mul(landCostPerSqft, landArea!)
    landCostPerSqftValue = landCostPerSqft
  }

  const constructionCost = mul(constructionPerSqft!, qty!)
  const miscGov = mul(toDecimal(inputs.miscGovPerSqft) ?? ZERO, landArea!)
  const professionalFee = mul(pctShare(inputs.professionalFeePct ?? '0'), constructionCost)
  const salesMarketing = mul(pctShare(inputs.salesMarketingPct ?? '0'), gdv)
  const financeCost = mul(pctShare(inputs.financeCostPct ?? '0'), add(landCost, constructionCost))
  const tdc = sum([landCost, constructionCost, miscGov, professionalFee, salesMarketing, financeCost])
  const pbt = sub(netGdv, tdc)
  const pm = isZero(netGdv) ? ZERO : div(pbt, netGdv)
  const landCostToNetRevenueRatio = isZero(netGdv) ? ZERO : div(landCost, netGdv)
  const tdcToRevenueRatio = isZero(netGdv) ? ZERO : div(tdc, netGdv)

  const targetPm = pctShare(inputs.policyAssumptions?.targetPm ?? DEFAULT_TARGET_PM)
  let verdict: QuickVerdict
  let verdictNote: string
  let nextAction: NextAction
  let nextActionNote: string
  if (cmp(pm, targetPm) >= 0) {
    verdict = 'PASS'
    verdictNote = `利润率 ${fmt(pm)} 达到目标 ${fmt(targetPm)}。`
    nextAction = 'market-research'
    nextActionNote = '进入正式测算与市场研究，深化产品与成本假设。'
  } else if (pm.i >= 0n) {
    verdict = 'REJECT'
    verdictNote = `利润率 ${fmt(pm)} 低于目标 ${fmt(targetPm)}，按当前假设不值得继续。`
    nextAction = 'price-negotiation'
    nextActionNote = '建议与地主谈价或调整产品/售价假设后再评估。'
  } else {
    verdict = 'DROP'
    verdictNote = `税前利润为负（${fmt(pbt)}），按当前假设应放弃。`
    nextAction = 'abandon'
    nextActionNote = '记录放弃原因；若地价或售价有重大修正空间可重新评估。'
  }

  return {
    results: {
      gdv: fmt(gdv),
      bumiQuotaDiscount: fmt(bumiQuotaDiscount),
      netGdv: fmt(netGdv),
      constructionCost: fmt(constructionCost),
      miscGov: fmt(miscGov),
      professionalFee: fmt(professionalFee),
      salesMarketing: fmt(salesMarketing),
      financeCost: fmt(financeCost),
      tdc: fmt(tdc),
      pbt: fmt(pbt),
      pm: fmt(pm),
      landCostPerSqft: fmt(landCostPerSqftValue),
      landCostToNetRevenueRatio: fmt(landCostToNetRevenueRatio),
      tdcToRevenueRatio: fmt(tdcToRevenueRatio),
    },
    verdict,
    verdictNote,
    nextAction,
    nextActionNote,
  }
}
