import type { BillingBasis, BillingMode, DiscountRulePayload } from '../../shared/contracts'

// 计费引擎（架构基线 1.3/第 7 节统一计算管道）：度量 → 基础金额 → 分段优惠 → 最低收费。
// 纯函数、无 IO；金额全部整数「分」。

// 当期库存度量（计费度量源聚合结果）
export interface BillingMeasure {
  stockQty: number
  locations: number
  volume: number
  weight: number
}

export const emptyMeasure: BillingMeasure = { stockQty: 0, locations: 0, volume: 0, weight: 0 }

// 单条费用明细的计费规则快照
export interface LineBillingRule {
  billingMode: BillingMode
  billingBasis: BillingBasis | null
  unitPrice: number | null
  minCharge: number | null
  fixedAmount: number | null
  discounts: DiscountRulePayload[]
}

export interface BillingOutcome {
  businessQty: number | null
  rawAmount: number
  discountedAmount: number
  minCharge: number | null
  finalAmount: number
}

// 金额舍入策略点（需求第 12 节第 2 项未规定，实现前固定）：四舍五入到整数分。
export function roundAmount(value: number): number {
  const rounded = Math.round(value)
  // Math.round(-0.5) 产生 -0；归一化为 0，避免 -0 金额入库
  return rounded === 0 ? 0 : rounded
}

// 分段优惠区间匹配：左闭右开 [lowerLimit, upperLimit)，业务量落入时仅命中一条规则
export function matchDiscount(discounts: DiscountRulePayload[], qty: number): DiscountRulePayload | null {
  for (const rule of discounts) {
    if (qty >= rule.lowerLimit && qty < rule.upperLimit) return rule
  }
  return null
}

function measureValue(measure: BillingMeasure, basis: BillingBasis): number {
  switch (basis) {
    case 'stock_qty': return measure.stockQty
    case 'locations': return measure.locations
    case 'volume': return measure.volume
    case 'weight': return measure.weight
  }
}

// 统一计费管道（需求第 7 节）：
// 1) 按计费模式计算基础金额；2) 按当期业务量匹配分段优惠；3) 与最低收费取最大值。
// 一口价模式直接取明细行「金额」，不受业务量、单价、最低收费影响（需求 5.1）。
export function computeLine(rule: LineBillingRule, measure: BillingMeasure): BillingOutcome {
  if (rule.billingMode === 'fixed_price') {
    const raw = rule.fixedAmount ?? 0
    return { businessQty: null, rawAmount: raw, discountedAmount: raw, minCharge: null, finalAmount: raw }
  }

  let rawAmount: number
  let businessQty: number

  if (rule.billingMode === 'max_value') {
    // 取大值模式：分别计算体积计费金额与重量计费金额，取较大者为基础费用；
    // 业务量取胜出维度的度量值，用于分段优惠区间匹配。
    const unitPrice = rule.unitPrice ?? 0
    const volumeAmount = roundAmount(measure.volume * unitPrice)
    const weightAmount = roundAmount(measure.weight * unitPrice)
    if (volumeAmount >= weightAmount) {
      rawAmount = volumeAmount
      businessQty = measure.volume
    } else {
      rawAmount = weightAmount
      businessQty = measure.weight
    }
  } else {
    const unitPrice = rule.unitPrice ?? 0
    const basis = rule.billingBasis ?? 'stock_qty'
    businessQty = measureValue(measure, basis)
    rawAmount = roundAmount(businessQty * unitPrice)
  }

  // 分段优惠
  const matched = matchDiscount(rule.discounts, businessQty)
  let discountedAmount = rawAmount
  if (matched) {
    if (matched.discountMode === 'percent') {
      const percent = matched.percentValue ?? 0
      discountedAmount = roundAmount(rawAmount * (1 - percent / 100))
    } else {
      const fixed = matched.fixedValue ?? 0
      discountedAmount = Math.max(0, rawAmount - fixed)
    }
  }

  const minCharge = rule.minCharge ?? null
  const finalAmount = Math.max(discountedAmount, minCharge ?? 0)

  return { businessQty, rawAmount, discountedAmount, minCharge, finalAmount }
}
