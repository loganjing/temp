// 平台中立契约：技术契约（docs/wi-t1000065/technical-contract.md）的字段级承载。
// 前后端共用；禁止引入 Node/Hono/React 依赖。金额字段一律整数「分」。

export type OwnerType = 'business' | 'customer'
export type BillingPeriod = 'daily' | 'monthly'
export type SettlementMode = 'monthly' | 'prepaid'
export type QuoteStatus = 'draft' | 'effective' | 'terminated'
export type BillingMode = 'normal' | 'fixed_price' | 'max_value'
export type BillingBasis = 'stock_qty' | 'locations' | 'volume' | 'weight'
export type DiscountMode = 'percent' | 'fixed'
export type ReceivableStatus = 'draft' | 'reconciled'
export type AdjustmentStatus = 'draft' | 'effective'
export type ReconStatus = 'draft' | 'approved'
export type SettleStatus = 'draft'
export type JobType = 'daily-billing' | 'monthly-billing' | 'contract-expiry'

export const RENT_FREE_DAY_OPTIONS = [0, 7, 15, 30] as const

// 单据编码前缀（格式：前缀-YYYYMMDD-NNNNN，页面只读）
export const BILL_PREFIXES = {
  quote: 'CCHT',
  adjustment: 'YSTZ',
  recon: 'YSDZ',
  settle: 'YSJS',
} as const

// 错误码总表（技术契约第 13 节）
export const ERROR_CODES = {
  VALIDATION_REQUIRED: 'VALIDATION_REQUIRED',
  VALIDATION_DATE_ORDER: 'VALIDATION_DATE_ORDER',
  VALIDATION_FREE_RENT_END: 'VALIDATION_FREE_RENT_END',
  VALIDATION_DUPLICATE_LINE: 'VALIDATION_DUPLICATE_LINE',
  VALIDATION_DISCOUNT_OVERLAP: 'VALIDATION_DISCOUNT_OVERLAP',
  VALIDATION_NEGATIVE: 'VALIDATION_NEGATIVE',
  VALIDATION_AMOUNT_EXCEED: 'VALIDATION_AMOUNT_EXCEED',
  ADJUSTMENT_NEGATIVE: 'ADJUSTMENT_NEGATIVE',
  INVALID_STATUS: 'INVALID_STATUS',
  RECONCILED_LOCKED: 'RECONCILED_LOCKED',
  CONTRACT_CONFLICT: 'CONTRACT_CONFLICT',
  INVOICE_EXCEED_TOTAL: 'INVOICE_EXCEED_TOTAL',
  NO_VALID_INVOICE: 'NO_VALID_INVOICE',
  WRITEOFF_EXCEED_INVOICE: 'WRITEOFF_EXCEED_INVOICE',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  ORG_FORBIDDEN: 'ORG_FORBIDDEN',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  NOT_FOUND: 'NOT_FOUND',
} as const

export interface DiscountRulePayload {
  lowerLimit: number
  upperLimit: number
  discountMode: DiscountMode
  percentValue?: number | null
  fixedValue?: number | null
}

export interface QuoteLinePayload {
  feeTypeId: string
  billingMode: BillingMode
  billingBasis?: BillingBasis | null
  goodsCategoryId?: string | null
  unitPrice?: number | null
  minCharge?: number | null
  fixedAmount?: number | null
  discounts?: DiscountRulePayload[]
}

export interface QuotePayload {
  contractId: string
  orgId: string
  warehouseId: string
  ownerType: OwnerType
  ownerId: string
  effectStart: string
  effectEnd: string
  rentFreeDays: number
  billingPeriod: BillingPeriod
  settlementMode?: SettlementMode
  insuranceRequired: boolean
  remark?: string | null
  lines: QuoteLinePayload[]
}

// 分段优惠区间集合校验（前端第一道 + 后端权威复验共用）：
// 每段下限 ≥ 0、上限 > 下限；集合排序后相邻区间必须首尾相接（不可重叠、不可断层）。
export function validateDiscountIntervals(rules: DiscountRulePayload[]): string | null {
  const sorted = [...rules].sort((a, b) => a.lowerLimit - b.lowerLimit)
  for (let index = 0; index < sorted.length; index += 1) {
    const rule = sorted[index]
    if (!(rule.lowerLimit >= 0)) return '业务量下限不可为负数'
    if (!(rule.upperLimit > rule.lowerLimit)) return '业务量上限必须大于业务量下限'
    if (index > 0) {
      const previous = sorted[index - 1]
      if (rule.lowerLimit < previous.upperLimit) return '分段优惠区间存在重叠'
      if (rule.lowerLimit > previous.upperLimit) return '分段优惠区间存在断层'
    }
  }
  return null
}

// 日期工具（YYYY-MM-DD 文本，本地时区口径）
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const result = new Date(Date.UTC(year, month - 1, day))
  result.setUTCDate(result.getUTCDate() + days)
  return result.toISOString().slice(0, 10)
}

export function compareDates(a: string, b: string): number {
  return a === b ? 0 : a < b ? -1 : 1
}

// 免租期结束日（含首尾）：免租期从合同开始日期起算 N 天
export function freeRentEndDate(effectStart: string, rentFreeDays: number): string {
  if (rentFreeDays <= 0) return effectStart
  return addDays(effectStart, rentFreeDays - 1)
}

// 两个区间（含端点）是否存在重叠
export function intervalsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd
}
