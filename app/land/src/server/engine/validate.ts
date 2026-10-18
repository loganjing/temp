/**
 * 方案输入校验（契约 PATCH /api/plans/:id/inputs 与 formalize 前置）。
 * 校验失败统一 422 VALIDATION_FAILED / FORMALIZE_CHECKS_FAILED，details 列字段+原因。
 */
import { dec, decInt, fmt, mul, sum, cmp, type Decimal, isZero } from './decimal'
import { COST_CATEGORIES, ALLOCATION_BASES, type PlanInputs } from './plan-engine'

export type ValidationDetail = { field: string; reason: string }

const ZERO: Decimal = decInt(0)
const add = (a: Decimal, b: Decimal): Decimal => sum([a, b])
const show = (value: Decimal): string => fmt(value)

/** 基础结构校验（PATCH 保存路径）。 */
export function validatePlanInputs(inputs: PlanInputs): ValidationDetail[] {
  const details: ValidationDetail[] = []
  const phaseIds = new Set(inputs.phases.map((phase) => phase.id))

  inputs.phases.forEach((phase, phaseIndex) => {
    let shareTotal: Decimal = ZERO
    let shareBroken = false
    for (const product of phase.products) {
      try {
        shareTotal = add(shareTotal, dec(product.sharePct))
      } catch {
        shareBroken = true
      }
    }
    if (phase.products.length > 0 && (shareBroken || show(shareTotal) !== '100')) {
      details.push({ field: `phases[${phaseIndex}].products.sharePct`, reason: `share percentages must total 100, got ${show(shareTotal)}` })
    }
    phase.products.forEach((product, productIndex) => {
      try {
        const unitAreaTotal = show(mul(dec(product.unitAreaSqft), decInt(product.units)))
        const saleable = product.saleableAreaSqft
        if (product.units > 0 && saleable !== null && saleable !== '' && saleable !== '0' && unitAreaTotal !== saleable) {
          details.push({
            field: `phases[${phaseIndex}].products[${productIndex}].saleableAreaSqft`,
            reason: `units × unitArea (${unitAreaTotal}) must equal saleableAreaSqft (${saleable})`,
          })
        }
      } catch {
        details.push({ field: `phases[${phaseIndex}].products[${productIndex}].unitAreaSqft`, reason: 'invalid decimal value' })
      }
    })
  })

  // 车位：产品车位需求不得低于 usedBasis 组数值（契约校验规则）。
  let parkingDemand: Decimal = ZERO
  for (const phase of inputs.phases) {
    for (const product of phase.products) {
      if (!product.parkingPerUnit) continue
      try {
        parkingDemand = add(parkingDemand, mul(dec(product.parkingPerUnit), decInt(product.units)))
      } catch {
        // 无效值在输入解析层已拦截；此处忽略避免重复报错。
      }
    }
  }
  const usedParking = inputs.parking.usedBasis === 'gov' ? inputs.parking.govMin : inputs.parking.internalTarget
  if (!isZero(parkingDemand) && cmp(parkingDemand, decInt(usedParking)) < 0) {
    details.push({
      field: 'parking',
      reason: `product parking demand (${show(parkingDemand)}) is below the ${inputs.parking.usedBasis} basis requirement (${usedParking})`,
    })
  }

  // 成本行：phaseId 引用存在；category 枚举。
  inputs.costs.forEach((item, index) => {
    if (item.phaseId && !phaseIds.has(item.phaseId)) {
      details.push({ field: `costs[${index}].phaseId`, reason: `unknown phase reference ${item.phaseId}` })
    }
    if (!(COST_CATEGORIES as readonly string[]).includes(item.category)) {
      details.push({ field: `costs[${index}].category`, reason: `invalid category ${item.category}` })
    }
  })

  // 公共分摊：custom-ratio 合计为 1（100%）。
  inputs.commonPools.forEach((pool, index) => {
    if (!(ALLOCATION_BASES as readonly string[]).includes(pool.allocationBasis)) {
      details.push({ field: `commonPools[${index}].allocationBasis`, reason: `invalid allocation basis ${pool.allocationBasis}` })
    }
    if (pool.allocationBasis === 'custom-ratio') {
      const ratios = pool.customRatios ?? {}
      const keys = Object.keys(ratios)
      if (keys.length === 0) {
        details.push({ field: `commonPools[${index}].customRatios`, reason: 'custom-ratio allocation requires ratios' })
      }
      let total: Decimal = ZERO
      for (const key of keys) {
        if (!phaseIds.has(key)) {
          details.push({ field: `commonPools[${index}].customRatios.${key}`, reason: `unknown phase reference ${key}` })
          continue
        }
        try {
          total = add(total, dec(ratios[key]))
        } catch {
          details.push({ field: `commonPools[${index}].customRatios.${key}`, reason: 'invalid decimal ratio' })
        }
      }
      if (keys.length > 0 && show(total) !== '100') {
        details.push({ field: `commonPools[${index}].customRatios`, reason: `custom ratios must total 100, got ${show(total)}` })
      }
    }
  })

  // 地价：lastEditedBasis 与两字段一致性（D4）。
  const landPrice = inputs.landPrice
  if (landPrice.lastEditedBasis === 'total' && !landPrice.total) {
    details.push({ field: 'landPrice.total', reason: 'lastEditedBasis=total requires totalLandPrice' })
  }
  if (landPrice.lastEditedBasis === 'per-sqft' && !landPrice.perSqft) {
    details.push({ field: 'landPrice.perSqft', reason: 'lastEditedBasis=per-sqft requires perSqft price' })
  }
  return details
}

/** formalize 前置（严格模式）：基础校验 + 地价/口径引用/可计算性。 */
export function validateForFormalize(inputs: PlanInputs): ValidationDetail[] {
  const details = validatePlanInputs(inputs)
  if (!inputs.landPrice.total && !inputs.landPrice.perSqft) {
    details.push({ field: 'landPrice', reason: 'formalization requires a land price input' })
  }
  if (!inputs.areaBasis.areaConventionId) {
    details.push({ field: 'areaBasis.areaConventionId', reason: 'formalization requires a referenced area convention version' })
  }
  if (!inputs.areaBasis.landAreaSqft || inputs.areaBasis.landAreaSqft === '0') {
    details.push({ field: 'areaBasis.landAreaSqft', reason: 'formalization requires land area' })
  }
  if (inputs.phases.length === 0) {
    details.push({ field: 'phases', reason: 'formalization requires at least one phase' })
  }
  return details
}
