/**
 * 正式测算计算引擎（契约第 7/14 节）：面积口径换算、收入链、九类成本归集与分摊、
 * TDC/PBT/PM 与单位指标。服务端唯一计算权威；金额以 decimal 全精度运算。
 */
import { cmp, dec, decInt, decOrNull, div, fmt, mul, pctShare, sub, sum, type Decimal, DecimalFormatError } from './decimal'
import { errors } from '../lib/api'

export const COST_CATEGORIES = [
  'land', 'construction', 'infrastructure', 'furniture-equipment', 'contingency-tax',
  'misc-gov', 'professional-pm', 'sales-marketing', 'finance',
] as const
export type CostCategory = (typeof COST_CATEGORIES)[number]

export const PRODUCT_FORMATS = [
  'residential', 'apartment', 'service-apartment', 'hotel', 'office', 'retail', 'other', 'mixed-use',
] as const
export type ProductFormat = (typeof PRODUCT_FORMATS)[number]

export const COST_BASES = [
  'fixed', 'per-land-area', 'per-gfa', 'per-saleable', 'pct-revenue', 'pct-cost', 'per-unit', 'per-parking', 'per-year',
] as const
export type CostBasis = (typeof COST_BASES)[number]

export const SOURCE_TYPES = ['government', 'historical-project', 'market-judgment', 'client-input', 'manual-estimate'] as const
export type SourceType = (typeof SOURCE_TYPES)[number]

export const PLAN_STATUSES = ['draft', 'saved', 'formalized', 'in_review', 'adopted', 'not_selected', 'returned'] as const
export type PlanStatus = (typeof PLAN_STATUSES)[number]

export const ALLOCATION_BASES = ['saleable-area', 'gfa', 'units', 'custom-ratio'] as const
export type AllocationBasis = (typeof ALLOCATION_BASES)[number]

export const LOCKED_STATUSES: readonly PlanStatus[] = ['formalized', 'in_review', 'adopted', 'not_selected', 'returned']

export type AreaConventionContent = {
  name?: string
  efficiencyExParkingDefault?: string
  description?: string
  nfaMode?: string
}

export type PlanProductInput = {
  id: string
  format: ProductFormat
  tier: string | null
  sharePct: string
  units: number
  unitAreaSqft: string
  saleableAreaSqft: string
  price: string | null
  pricePerSqft: string | null
  priceBasis: 'unit-price' | 'per-sqft' | 'policy-fixed'
  bumiQuotaPct: string | null
  bumiDiscountPct: string | null
  affordableQuota: { units?: number; price?: string; ratio?: string } | null
  parkingPerUnit: string | null
}

export type PlanPhaseInput = {
  id: string
  name: string
  seq: number
  landAllocation: { method: 'by-land-area' | 'by-gfa' | 'manual'; value: string | null }
  products: PlanProductInput[]
  gfaBreakdown: Record<string, unknown> | null
}

export type PlanCostInput = {
  id: string
  phaseId: string | null
  category: CostCategory
  itemName: string
  basis: CostBasis
  value: string
  sourceType: SourceType
  status: 'confirmed' | 'zero' | 'pending'
  note: string | null
}

export type PlanCommonPoolInput = {
  id: string
  category: CostCategory
  amount: string
  allocationBasis: AllocationBasis
  customRatios: Record<string, string> | null
  ruleNote: string | null
}

export type PlanInputs = {
  areaBasis: {
    landAreaSqft: string
    plotRatioOrDensity: string
    densityBasis: 'plot-ratio' | 'units-per-acre'
    areaConventionId: string | null
    areaConventionReason: string | null
    gfaIncludesParking: boolean
    nfaMode: 'convention-default' | 'manual'
    manualEfficiency: string | null
  }
  phases: PlanPhaseInput[]
  parking: {
    govMin: number
    internalTarget: number
    usedBasis: 'gov' | 'internal'
    visitorSlots: number | null
    extraInternalSlots: number | null
    areaPerSlotSqft: string
  }
  costs: PlanCostInput[]
  commonPools: PlanCommonPoolInput[]
  landPrice: { total: string | null; perSqft: string | null; lastEditedBasis: 'total' | 'per-sqft' }
}

export type PlanResults = {
  gfaTotal: string
  gfaExParking: string
  nfaTotal: string
  efficiencyExParking: string
  efficiencyInclParking: string
  totalUnits: number
  unitsPerAcre: string
  revenue: {
    byProduct: Array<{ productId: string; format: ProductFormat; revenue: string; bumiAdjustment: string }>
    gdv: string
    bumiQuotaDiscount: string
    netGdv: string
    parkingRevenue: string
    otherSaleableRevenue: string
  }
  costs: {
    byCategory: Array<{ category: CostCategory; amount: string; items: Array<{ costItemId: string; itemName: string; amount: string; sourceType: SourceType; status: string }> }>
    commonPoolAllocations: Array<{ poolId: string; phaseId: string; amount: string; basis: string }>
    tdc: string
  }
  profit: {
    pbt: string
    pat: string | null
    pm: string
    perUnit: Record<string, string>
    perSqft: Record<string, string>
    perAcre: Record<string, string>
  }
  computedAt: string
  basis: { areaConventionId: string | null; landPriceBasis: string | null }
}

const SQFT_PER_ACRE = 43560
const ZERO: Decimal = decInt(0)
const ONE: Decimal = decInt(1)

function d(value: string | number | null | undefined, field: string): Decimal {
  try {
    return decOrNull(value) ?? ZERO
  } catch (error) {
    if (error instanceof DecimalFormatError) {
      throw errors.validationFailed([{ field, reason: `invalid decimal: ${String(value)}` }])
    }
    throw error
  }
}

const add = (a: Decimal, b: Decimal) => sum([a, b])
const isZero = (a: Decimal) => a.i === 0n

/** 面积口径换算 + 全链计算。convention 为 null 时效率必须由 manualEfficiency 提供。 */
export function computePlanResults(inputs: PlanInputs, convention: AreaConventionContent | null, computedAt: string): PlanResults {
  const area = inputs.areaBasis
  const landArea = d(area.landAreaSqft, 'areaBasis.landAreaSqft')
  const plotRatio = d(area.plotRatioOrDensity, 'areaBasis.plotRatioOrDensity')

  const conventionEfficiency = convention?.efficiencyExParkingDefault ? d(convention.efficiencyExParkingDefault, 'convention.efficiency') : null
  if (area.nfaMode === 'convention-default' && !conventionEfficiency && !area.manualEfficiency) {
    throw errors.validationFailed([{ field: 'areaBasis', reason: 'area convention efficiency is required when nfaMode=convention-default' }])
  }
  const efficiency = area.nfaMode === 'manual' ? d(area.manualEfficiency, 'areaBasis.manualEfficiency') : (conventionEfficiency ?? d(area.manualEfficiency, 'areaBasis.manualEfficiency'))

  // —— 面积链 ——
  let gfaTotal: Decimal = ZERO
  let totalUnits = 0
  const phaseSaleable = new Map<string, Decimal>()
  const phaseGfa = new Map<string, Decimal>()
  const phaseUnits = new Map<string, number>()
  for (const phase of inputs.phases) {
    let phaseGfaValue: Decimal = ZERO
    const breakdown = phase.gfaBreakdown ?? {}
    for (const key of Object.keys(breakdown)) {
      const value = d(String(breakdown[key] ?? 0), `phases[${phase.seq}].gfaBreakdown.${key}`)
      phaseGfaValue = add(phaseGfaValue, value)
    }
    let productAreaTotal: Decimal = ZERO
    let productUnits = 0
    let saleableTotal: Decimal = ZERO
    for (const product of phase.products) {
      const unitArea = d(product.unitAreaSqft, 'product.unitAreaSqft')
      productUnits += product.units
      productAreaTotal = add(productAreaTotal, mul(unitArea, decInt(product.units)))
      saleableTotal = add(saleableTotal, d(product.saleableAreaSqft, 'product.saleableAreaSqft'))
    }
    if (isZero(phaseGfaValue) && !isZero(productAreaTotal) && !isZero(efficiency)) {
      phaseGfaValue = div(productAreaTotal, efficiency)
    }
    phaseGfa.set(phase.id, phaseGfaValue)
    phaseUnits.set(phase.id, productUnits)
    phaseSaleable.set(phase.id, saleableTotal)
    gfaTotal = add(gfaTotal, phaseGfaValue)
    totalUnits += productUnits
  }

  // —— 车位链（政府要求与内部目标分离；usedBasis 决定测算组，AC-12）——
  const parking = inputs.parking
  const usedBasisValue = parking.usedBasis === 'gov' ? parking.govMin : parking.internalTarget
  const parkingSlots = usedBasisValue + (parking.visitorSlots ?? 0) + (parking.extraInternalSlots ?? 0)
  const parkingArea = mul(d(parking.areaPerSlotSqft, 'parking.areaPerSlotSqft'), decInt(parkingSlots))
  const gfaExParking = area.gfaIncludesParking && cmp(gfaTotal, parkingArea) > 0 ? sub(gfaTotal, parkingArea) : gfaTotal
  const nfaTotal = mul(gfaExParking, efficiency)

  // —— 收入链 ——
  const byProduct: PlanResults['revenue']['byProduct'] = []
  let productRevenueTotal: Decimal = ZERO
  let bumiTotal: Decimal = ZERO
  for (const phase of inputs.phases) {
    for (const product of phase.products) {
      let revenue: Decimal = ZERO
      if (product.priceBasis === 'unit-price') {
        revenue = mul(d(product.price, 'product.price'), decInt(product.units))
      } else if (product.priceBasis === 'per-sqft') {
        revenue = mul(d(product.pricePerSqft, 'product.pricePerSqft'), d(product.saleableAreaSqft, 'product.saleableAreaSqft'))
      } else {
        const quotaUnits = product.affordableQuota?.units ?? product.units
        const quotaPrice = product.affordableQuota?.price ?? product.price
        revenue = mul(d(quotaPrice, 'affordableQuota.price'), decInt(quotaUnits))
      }
      const quotaPct = product.bumiQuotaPct ? pctShare(product.bumiQuotaPct) : null
      const discountPct = product.bumiDiscountPct ? pctShare(product.bumiDiscountPct) : null
      const bumiAdjustment = quotaPct && discountPct ? mul(mul(revenue, quotaPct), discountPct) : ZERO
      productRevenueTotal = add(productRevenueTotal, revenue)
      bumiTotal = add(bumiTotal, bumiAdjustment)
      byProduct.push({ productId: product.id, format: product.format, revenue: fmt(revenue), bumiAdjustment: fmt(bumiAdjustment) })
    }
  }
  const parkingRevenue: Decimal = ZERO
  const otherSaleableRevenue: Decimal = ZERO
  const gdv = sum([productRevenueTotal, parkingRevenue, otherSaleableRevenue])
  const netGdv = sub(gdv, bumiTotal)

  // —— 成本归集（九类）——
  const constructionDirect = inputs.costs
    .filter((item) => item.category === 'construction')
    .reduce<Decimal>((acc, item) => add(acc, d(item.value, 'cost.value')), ZERO)
  const costAmount = (item: PlanCostInput): Decimal => {
    const value = d(item.value, 'cost.value')
    switch (item.basis) {
      case 'fixed': return value
      case 'per-land-area': return mul(value, landArea)
      case 'per-gfa': return mul(value, gfaTotal)
      case 'per-saleable': return mul(value, nfaTotal)
      case 'pct-revenue': return mul(div(value, decInt(100)), netGdv)
      case 'pct-cost': return mul(div(value, decInt(100)), constructionDirect)
      case 'per-unit': return mul(value, decInt(totalUnits))
      case 'per-parking': return mul(value, decInt(parkingSlots))
      case 'per-year': return value
      default: return value
    }
  }

  const byCategoryMap = new Map<CostCategory, { amount: Decimal; items: PlanResults['costs']['byCategory'][number]['items'] }>()
  for (const category of COST_CATEGORIES) byCategoryMap.set(category, { amount: ZERO, items: [] })
  for (const item of inputs.costs) {
    const amount = costAmount(item)
    const bucket = byCategoryMap.get(item.category)
    if (!bucket) continue
    bucket.amount = add(bucket.amount, amount)
    bucket.items.push({ costItemId: item.id, itemName: item.itemName, amount: fmt(amount), sourceType: item.sourceType, status: item.status })
  }

  // —— 地价（D4 双向录入：lastEditedBasis 决定计算输入）——
  const landPrice = inputs.landPrice
  let landPriceAmount: Decimal = ZERO
  if (landPrice.lastEditedBasis === 'total' && landPrice.total) {
    landPriceAmount = d(landPrice.total, 'landPrice.total')
  } else if (landPrice.lastEditedBasis === 'per-sqft' && landPrice.perSqft) {
    landPriceAmount = mul(d(landPrice.perSqft, 'landPrice.perSqft'), landArea)
  }
  const landBucket = byCategoryMap.get('land')!
  landBucket.amount = add(landBucket.amount, landPriceAmount)

  // —— 公共成本分摊（AC-11：分摊前后金额与规则可见，总额一致）——
  const commonPoolAllocations: PlanResults['costs']['commonPoolAllocations'] = []
  const phaseIds = inputs.phases.map((phase) => phase.id)
  const totalSaleable = [...phaseSaleable.values()].reduce<Decimal>((acc, value) => add(acc, value), ZERO)
  const phaseWeight = (basis: AllocationBasis, phaseId: string, pool: PlanCommonPoolInput): Decimal | null => {
    switch (basis) {
      case 'saleable-area': return isZero(totalSaleable) ? null : div(phaseSaleable.get(phaseId) ?? ZERO, totalSaleable)
      case 'gfa': return isZero(gfaTotal) ? null : div(phaseGfa.get(phaseId) ?? ZERO, gfaTotal)
      case 'units': return totalUnits === 0 ? null : div(decInt(phaseUnits.get(phaseId) ?? 0), decInt(totalUnits))
      case 'custom-ratio': {
        const raw = pool.customRatios?.[phaseId]
        return raw === undefined ? null : pctShare(raw)
      }
      default: return null
    }
  }
  for (const pool of inputs.commonPools) {
    const amount = d(pool.amount, 'commonPool.amount')
    const targets = pool.allocationBasis === 'custom-ratio' && pool.customRatios ? Object.keys(pool.customRatios) : phaseIds
    let allocatedTotal: Decimal = ZERO
    for (const phaseId of targets) {
      const weight = phaseWeight(pool.allocationBasis, phaseId, pool)
      if (weight === null) continue
      const allocated = mul(amount, weight)
      commonPoolAllocations.push({ poolId: pool.id, phaseId, amount: fmt(allocated), basis: pool.allocationBasis })
      allocatedTotal = add(allocatedTotal, allocated)
    }
    const bucket = byCategoryMap.get(pool.category)
    if (bucket) bucket.amount = add(bucket.amount, allocatedTotal)
  }

  const byCategory = [...byCategoryMap.entries()]
    .map(([category, bucket]) => ({ category, amount: fmt(bucket.amount), items: bucket.items }))
    .filter((entry) => entry.amount !== '0' || entry.items.length > 0)
  const tdc = [...byCategoryMap.values()].reduce<Decimal>((acc, bucket) => add(acc, bucket.amount), ZERO)

  // —— 收益链 ——
  const pbt = sub(netGdv, tdc)
  const pm = isZero(netGdv) ? ZERO : div(pbt, netGdv)
  const perMetrics = (divisor: Decimal) =>
    isZero(divisor)
      ? { gdv: '0', netGdv: '0', tdc: '0', pbt: '0' }
      : { gdv: fmt(div(gdv, divisor)), netGdv: fmt(div(netGdv, divisor)), tdc: fmt(div(tdc, divisor)), pbt: fmt(div(pbt, divisor)) }
  const unitsPerAcre = isZero(landArea) ? ZERO : div(decInt(totalUnits), div(landArea, decInt(SQFT_PER_ACRE)))

  return {
    gfaTotal: fmt(gfaTotal),
    gfaExParking: fmt(gfaExParking),
    nfaTotal: fmt(nfaTotal),
    efficiencyExParking: isZero(gfaExParking) ? '0' : fmt(div(nfaTotal, gfaExParking)),
    efficiencyInclParking: isZero(gfaTotal) ? '0' : fmt(div(nfaTotal, gfaTotal)),
    totalUnits,
    unitsPerAcre: fmt(unitsPerAcre),
    revenue: {
      byProduct,
      gdv: fmt(gdv),
      bumiQuotaDiscount: fmt(bumiTotal),
      netGdv: fmt(netGdv),
      parkingRevenue: fmt(parkingRevenue),
      otherSaleableRevenue: fmt(otherSaleableRevenue),
    },
    costs: { byCategory, commonPoolAllocations, tdc: fmt(tdc) },
    profit: {
      pbt: fmt(pbt),
      pat: null,
      pm: fmt(pm),
      perUnit: perMetrics(totalUnits > 0 ? decInt(totalUnits) : ONE),
      perSqft: perMetrics(isZero(gfaTotal) ? ONE : gfaTotal),
      perAcre: perMetrics(isZero(landArea) ? ONE : div(landArea, decInt(SQFT_PER_ACRE))),
    },
    computedAt,
    basis: { areaConventionId: area.areaConventionId ?? null, landPriceBasis: landPrice.lastEditedBasis ?? null },
  }
}

export function sumCategory(results: PlanResults, category: CostCategory): string {
  const entry = results.costs.byCategory.find((item) => item.category === category)
  return entry?.amount ?? '0'
}

/** 新建方案的单期骨架输入（POST /api/parcels/:id/plans 与复制回退用）。 */
export function emptyPlanInputs(): PlanInputs {
  return {
    areaBasis: {
      landAreaSqft: '0',
      plotRatioOrDensity: '0',
      densityBasis: 'plot-ratio',
      areaConventionId: null,
      areaConventionReason: null,
      gfaIncludesParking: false,
      nfaMode: 'convention-default',
      manualEfficiency: null,
    },
    phases: [],
    parking: { govMin: 0, internalTarget: 0, usedBasis: 'gov', visitorSlots: null, extraInternalSlots: null, areaPerSlotSqft: '0' },
    costs: [],
    commonPools: [],
    landPrice: { total: null, perSqft: null, lastEditedBasis: 'total' },
  }
}
