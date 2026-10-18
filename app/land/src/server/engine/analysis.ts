/**
 * 敏感性矩阵、目标利润率反算与方案比较（契约第 8 节 / AC-07、AC-13）。
 * 维度 values 语义：相对因子（1 = 当前值），逐组合对方案输入做确定性变换后全链重算。
 */
import { add, cmp, dec, decInt, decOrNull, div, fmt, mul, pctShare, sub, type Decimal, isZero } from './decimal'
import { errors } from '../lib/api'
import {
  computePlanResults, sumCategory, type AreaConventionContent, type PlanInputs, type PlanResults, type CostCategory, COST_CATEGORIES,
} from './plan-engine'

export const SENSITIVITY_VARIABLES = [
  'land-price', 'unit-price', 'construction-cost', 'plot-ratio', 'efficiency', 'conversion-premium',
  'finance-rate', 'finance-term', 'affordable-ratio', 'parking-count', 'product-mix',
] as const
export type SensitivityVariable = (typeof SENSITIVITY_VARIABLES)[number]

export const BACK_SOLVE_TARGETS = ['max-land-price', 'min-unit-price', 'max-construction-cost'] as const
export type BackSolveTarget = (typeof BACK_SOLVE_TARGETS)[number]

const ZERO: Decimal = decInt(0)

function scaleDecimal(value: string | number, factor: Decimal): string {
  const base = decOrNull(value)
  if (base === null) return String(value)
  return fmt(mul(base, factor))
}

function clone(inputs: PlanInputs): PlanInputs {
  return JSON.parse(JSON.stringify(inputs)) as PlanInputs
}

/** 对方案输入施加一个维度的因子变换（服务端确定性重算的基础）。
 *  currentEfficiency：efficiency 维度的当前基准值（1=当前值口径下的锚点），
 *  由调用方按 nfaMode/口径解析后传入；缺省时回退 1（相对因子语义）。 */
export function applySensitivity(
  inputs: PlanInputs,
  variable: SensitivityVariable,
  factor: Decimal,
  currentEfficiency?: string | null,
): PlanInputs {
  const next = clone(inputs)
  const scaleCategory = (category: CostCategory) => {
    for (const item of next.costs) if (item.category === category) item.value = scaleDecimal(item.value, factor)
    for (const pool of next.commonPools) if (pool.category === category) pool.amount = scaleDecimal(pool.amount, factor)
  }
  switch (variable) {
    case 'land-price': {
      if (next.landPrice.total) next.landPrice.total = scaleDecimal(next.landPrice.total, factor)
      if (next.landPrice.perSqft) next.landPrice.perSqft = scaleDecimal(next.landPrice.perSqft, factor)
      scaleCategory('land')
      return next
    }
    case 'unit-price': {
      for (const phase of next.phases) {
        for (const product of phase.products) {
          if (product.price) product.price = scaleDecimal(product.price, factor)
          if (product.pricePerSqft) product.pricePerSqft = scaleDecimal(product.pricePerSqft, factor)
          if (product.affordableQuota?.price) product.affordableQuota.price = scaleDecimal(product.affordableQuota.price, factor)
        }
      }
      return next
    }
    case 'construction-cost': scaleCategory('construction'); return next
    case 'plot-ratio': {
      next.areaBasis.plotRatioOrDensity = scaleDecimal(next.areaBasis.plotRatioOrDensity, factor)
      return next
    }
    case 'efficiency': {
      const manual = decOrNull(next.areaBasis.manualEfficiency)
      const current = decOrNull(currentEfficiency ?? null)
      const base = next.areaBasis.nfaMode === 'manual' && manual ? manual : (current ?? dec('1'))
      next.areaBasis.nfaMode = 'manual'
      next.areaBasis.manualEfficiency = fmt(mul(base, factor))
      return next
    }
    case 'conversion-premium': scaleCategory('misc-gov'); return next
    case 'finance-rate':
    case 'finance-term': scaleCategory('finance'); return next
    case 'affordable-ratio': {
      for (const phase of next.phases) {
        for (const product of phase.products) {
          if (product.affordableQuota?.units) {
            product.affordableQuota.units = Math.max(0, Math.round(product.affordableQuota.units * Number(fmt(factor))))
          }
        }
      }
      return next
    }
    case 'parking-count': {
      next.parking.govMin = Math.max(0, Math.round(next.parking.govMin * Number(fmt(factor))))
      next.parking.internalTarget = Math.max(0, Math.round(next.parking.internalTarget * Number(fmt(factor))))
      return next
    }
    case 'product-mix': {
      for (const phase of next.phases) {
        if (phase.products.length < 2) continue
        const primary = phase.products[0]
        const others = phase.products.slice(1)
        const primaryShare = decOrNull(primary.sharePct) ?? dec('0')
        const remaining = sub(dec('100'), primaryShare)
        if (isZero(remaining)) continue
        let scaledOthers: Decimal = ZERO
        for (const product of others) {
          const share = decOrNull(product.sharePct) ?? dec('0')
          scaledOthers = add(scaledOthers, mul(share, factor))
        }
        for (const product of others) {
          const share = decOrNull(product.sharePct) ?? dec('0')
          product.sharePct = fmt(div(mul(mul(share, factor), remaining), isZero(scaledOthers) ? decInt(1) : scaledOthers))
        }
      }
      return next
    }
    default: return next
  }
}

export type MatrixCell = {
  coord: string[]
  pm: string
  pbt: string
  tdc: string
  netGdv: string
  feasibility: 'feasible' | 'marginal' | 'infeasible'
  riskNote: string | null
}

export type ColorRule = { targetLine: string; zones: { aboveTarget: string; nearTarget: string; belowTarget: string } } | null

export function sensitivityMatrix(
  inputs: PlanInputs,
  convention: AreaConventionContent | null,
  dimensions: Array<{ variable: SensitivityVariable; values: string[] }>,
  targetPm: string | null,
  colorRule: ColorRule,
  computedAt: string
): { matrix: MatrixCell[]; colorRuleApplied: ColorRule } {
  if (dimensions.length < 1 || dimensions.length > 2) {
    throw errors.validationFailed([{ field: 'dimensions', reason: '1 to 2 dimensions are required' }])
  }
  const target = pctShare(targetPm ?? '18')
  const matrix: MatrixCell[] = []
  const primary = dimensions[0].values
  const secondary = dimensions.length === 2 ? dimensions[1].values : [null]
  // efficiency 维度的当前基准：manual 模式取手工效率，convention-default 取口径默认（无口径再回退手工值）。
  const currentEfficiency = inputs.areaBasis.nfaMode === 'manual'
    ? inputs.areaBasis.manualEfficiency
    : convention?.efficiencyExParkingDefault ?? inputs.areaBasis.manualEfficiency
  for (const rawFirst of primary) {
    for (const rawSecond of secondary) {
      let variant = clone(inputs)
      variant = applySensitivity(variant, dimensions[0].variable, dec(rawFirst), currentEfficiency)
      if (dimensions.length === 2 && rawSecond !== null) {
        variant = applySensitivity(variant, dimensions[1].variable, dec(rawSecond), currentEfficiency)
      }
      const results = computePlanResults(variant, convention, computedAt)
      const pm = dec(results.profit.pm)
      const pbt = dec(results.profit.pbt)
      const feasibility: MatrixCell['feasibility'] = pbt.i < 0n ? 'infeasible' : cmp(pm, target) >= 0 ? 'feasible' : 'marginal'
      matrix.push({
        coord: [rawFirst, ...(rawSecond !== null ? [rawSecond] : [])],
        pm: results.profit.pm,
        pbt: results.profit.pbt,
        tdc: results.costs.tdc,
        netGdv: results.revenue.netGdv,
        feasibility,
        riskNote: pbt.i < 0n
          ? '该组合税前利润为负，按当前假设不可行。'
          : feasibility === 'marginal'
            ? `低于目标利润率 ${fmt(target)}，需要关注售价/成本假设。`
            : null,
      })
    }
  }
  const applied: ColorRule = colorRule ?? {
    targetLine: fmt(target),
    zones: { aboveTarget: 'ok', nearTarget: 'warning', belowTarget: 'danger' },
  }
  return { matrix, colorRuleApplied: applied }
}

/** 目标利润率反算：max-land-price 直接解算；售价/建筑成本用二分（确定性收敛）。 */
export function backSolve(
  inputs: PlanInputs,
  convention: AreaConventionContent | null,
  targetPm: string,
  solveFor: BackSolveTarget,
  computedAt: string
): { targetPm: string; solveFor: BackSolveTarget; resultValue: string; basisNote: string } {
  const target = pctShare(targetPm)
  const base = computePlanResults(inputs, convention, computedAt)
  if (solveFor === 'max-land-price') {
    const netGdv = dec(base.revenue.netGdv)
    const pbt = dec(base.profit.pbt)
    const landNow = dec(sumCategory(base, 'land'))
    if (isZero(netGdv)) {
      throw errors.validationFailed([{ field: 'targetPm', reason: 'net revenue is zero; cannot solve for land price' }])
    }
    const pbtTarget = mul(netGdv, target)
    const landTarget = add(landNow, sub(pbt, pbtTarget))
    return {
      targetPm,
      solveFor,
      resultValue: fmt(landTarget),
      basisNote: `土地类成本合计上限（含土地价款与土地类费用，D4 双向录入按 lastEditedBasis 换算）；高于该值时利润率低于目标。`,
    }
  }

  const variable: SensitivityVariable = solveFor === 'min-unit-price' ? 'unit-price' : 'construction-cost'
  const evaluate = (factor: Decimal): Decimal => {
    const variant = applySensitivity(clone(inputs), variable, factor)
    const results = computePlanResults(variant, convention, computedAt)
    return dec(results.profit.pm)
  }
  let low = dec('0.01')
  let high = dec('1000')
  // 单调方向：min-unit-price 利润率随因子升（可行在高端）；max-construction-cost
  // 利润率随因子降（可行在低端）。二分始终朝不可行一侧收缩，收敛到目标利润率临界。
  const pmRisesWithFactor = solveFor === 'min-unit-price'
  for (let i = 0; i < 200; i += 1) {
    const mid = div(add(low, high), decInt(2))
    const pm = evaluate(mid)
    const feasible = cmp(pm, target) >= 0
    if (pmRisesWithFactor ? feasible : !feasible) high = mid
    else low = mid
  }
  const factor = div(add(low, high), decInt(2))
  if (solveFor === 'min-unit-price') {
    const totalUnits = base.totalUnits > 0 ? base.totalUnits : 1
    let weightedPrice: Decimal = ZERO
    let pricedUnits = 0
    for (const phase of inputs.phases) {
      for (const product of phase.products) {
        if (product.price && product.units > 0) {
          weightedPrice = add(weightedPrice, mul(dec(product.price), decInt(product.units)))
          pricedUnits += product.units
        }
      }
    }
    const avgPrice = pricedUnits > 0 ? div(weightedPrice, decInt(pricedUnits)) : div(dec(base.revenue.gdv), decInt(totalUnits))
    return {
      targetPm,
      solveFor,
      resultValue: fmt(mul(avgPrice, factor)),
      basisNote: `最低平均售价（按当前单位售价加权平均 × 反算因子 ${fmt(factor)}）；低于该值时利润率低于目标。`,
    }
  }
  const constructionNow = dec(sumCategory(base, 'construction'))
  return {
    targetPm,
    solveFor,
    resultValue: fmt(mul(constructionNow, factor)),
    basisNote: `可承受建筑类成本合计上限（当前建筑类合计 × 反算因子 ${fmt(factor)}）。`,
  }
}

export type CompareRow = { dimension: string; values: Array<string | number | null> }

export function compareRows(
  entries: Array<{ label: string; inputs: PlanInputs; results: PlanResults }>
): CompareRow[] {
  const rows: CompareRow[] = []
  const push = (dimension: string, read: (entry: { inputs: PlanInputs; results: PlanResults }) => string | number | null) => {
    rows.push({ dimension, values: entries.map(read) })
  }
  push('土地面积(sqft)', (e) => e.inputs.areaBasis.landAreaSqft)
  push('容积率/密度', (e) => e.inputs.areaBasis.plotRatioOrDensity)
  push('效率(不含车位)', (e) => e.results.efficiencyExParking)
  push('总单位数', (e) => e.results.totalUnits)
  push('产品组合', (e) =>
    e.inputs.phases
      .flatMap((phase) => phase.products.map((product) => `${product.format} ${product.sharePct}%`))
      .join(' / ') || null)
  push('可负担住房比例', (e) => {
    const affordable = e.inputs.phases.flatMap((phase) => phase.products.filter((product) => product.affordableQuota))
    return affordable.length === 0 ? null : affordable.map((product) => `${product.format} ${product.affordableQuota?.units ?? 0} 套`).join(' / ')
  })
  push('车位(政府最低/内部目标/采用)', (e) =>
    `${e.inputs.parking.govMin}/${e.inputs.parking.internalTarget}/${e.inputs.parking.usedBasis}`)
  push('GDV', (e) => e.results.revenue.gdv)
  push('净 GDV', (e) => e.results.revenue.netGdv)
  for (const category of COST_CATEGORIES) {
    push(`成本-${category}`, (e) => sumCategory(e.results, category))
  }
  push('TDC', (e) => e.results.costs.tdc)
  push('税前利润 PBT', (e) => e.results.profit.pbt)
  push('利润率 PM', (e) => e.results.profit.pm)
  push('单位 TDC', (e) => e.results.profit.perUnit.tdc)
  push('未确认事项', (e) => {
    const pending = e.inputs.costs.filter((item) => item.status === 'pending').length
    return pending === 0 ? null : `${pending} 项成本待确认`
  })
  return rows
}
