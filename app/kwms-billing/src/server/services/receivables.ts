import type { DbClient } from '@commonapp/dbkit'
import type { AuthUser } from '@commonapp/userkit'
import { freeRentEndDate, compareDates } from '../../shared/contracts'
import { computeLine, type BillingMeasure } from './billing-engine'
import { dailyMeasureProvider } from './billing-measures'
import { recordAuditEvent, writeChangeLog } from './auditlog'
import { errors } from '../common/errors'
import { assertCanAccessOrg, type OrgScope } from '../common/scope'

// billing 域（查询与重算）：应收费用明细由定时任务生成；重算清空原金额并按最新生效规则重新核算。

export interface ReceivableRow {
  id: string
  bill_date: string
  org_id: string
  warehouse_id: string
  owner_id: string
  fee_type_id: string
  goods_category_id: string | null
  billing_mode: string
  billing_basis: string | null
  business_qty: number | null
  raw_amount: number
  discounted_amount: number
  min_charge: number | null
  final_amount: number
  quote_bill_no: string
  status: string
  created_at: string
}

export interface ReceivableFilters {
  periodStart?: string | null
  periodEnd?: string | null
  orgId?: string | null
  warehouseId?: string | null
  ownerId?: string | null
  feeTypeId?: string | null
  status?: string | null
  page: number
  pageSize: number
}

interface QuoteLineWithDiscounts {
  quote: {
    id: string
    bill_no: string
    org_id: string
    warehouse_id: string
    owner_id: string
    effect_start: string
    rent_free_days: number
  }
  line: {
    id: string
    fee_type_id: string
    billing_mode: string
    billing_basis: string | null
    goods_category_id: string | null
    unit_price: number | null
    min_charge: number | null
    fixed_amount: number | null
  }
  discounts: Array<{ lower_limit: number; upper_limit: number; discount_mode: string; percent_value: number | null; fixed_value: number | null }>
}

export interface RecalcResult {
  recalculated: number
  skipped: Array<{ id: string; reason: string }>
}

export function createReceivablesService(db: DbClient, auditKit: { record(event: { type: string; actorUserId?: string; metadata?: Record<string, unknown> }): Promise<void> }) {
  async function list(filters: ReceivableFilters, scope: OrgScope): Promise<{ items: ReceivableRow[]; total: number }> {
    const conditions: string[] = ['1 = 1']
    const params: unknown[] = []
    const effectiveOrgId = filters.orgId ?? (scope.isAdmin ? null : scope.orgId)
    if (effectiveOrgId) {
      conditions.push('r.org_id = ?')
      params.push(effectiveOrgId)
    } else if (!scope.isAdmin && scope.orgId) {
      conditions.push('r.org_id = ?')
      params.push(scope.orgId)
    }
    if (filters.periodStart) {
      conditions.push('r.bill_date >= ?')
      params.push(filters.periodStart)
    }
    if (filters.periodEnd) {
      conditions.push('r.bill_date <= ?')
      params.push(filters.periodEnd)
    }
    if (filters.warehouseId) {
      conditions.push('r.warehouse_id = ?')
      params.push(filters.warehouseId)
    }
    if (filters.ownerId) {
      conditions.push('r.owner_id = ?')
      params.push(filters.ownerId)
    }
    if (filters.feeTypeId) {
      conditions.push('r.fee_type_id = ?')
      params.push(filters.feeTypeId)
    }
    if (filters.status) {
      conditions.push('r.status = ?')
      params.push(filters.status)
    }
    const where = `WHERE ${conditions.join(' AND ')}`
    const total = await db.queryOne<{ total: number }>({ text: `SELECT COUNT(*) AS total FROM receivable_details r ${where}`, params })
    const rows = await db.queryAll<ReceivableRow>({
      text: `SELECT r.* FROM receivable_details r ${where} ORDER BY r.bill_date DESC, r.created_at DESC, r.id DESC LIMIT ? OFFSET ?`,
      params: [...params, filters.pageSize, (filters.page - 1) * filters.pageSize],
    })
    return { items: rows, total: Number(total?.total ?? 0) }
  }

  async function detail(id: string): Promise<ReceivableRow | null> {
    return db.queryOne<ReceivableRow>({ text: 'SELECT * FROM receivable_details WHERE id = ?', params: [id] })
  }

  // 匹配记账日期适用的最新生效合同规则（含免租期过滤）
  async function matchRuleOn(client: DbClient, detail: ReceivableRow): Promise<QuoteLineWithDiscounts | null> {
    return matchRuleWith(client, detail)
  }

  // 费用重算：勾选明细在单事务内清空并重写金额，同时写 change_logs；已对账明细拦截。
  async function recalc(user: AuthUser, ids: string[]): Promise<RecalcResult> {
    if (!ids?.length) throw errors.required('ids')
    const skipped: Array<{ id: string; reason: string }> = []
    const recalculated: string[] = []
    let lockedCount = 0

    await db.transaction(async (tx) => {
      const client = tx as unknown as DbClient
      for (const id of ids) {
        const detail = await client.queryOne<ReceivableRow>({ text: 'SELECT * FROM receivable_details WHERE id = ?', params: [id] })
        if (!detail) {
          skipped.push({ id, reason: '应收明细不存在' })
          continue
        }
        // 组织隔离：非管理员不可重算其他组织的明细
        assertCanAccessOrg(user, detail.org_id)
        if (detail.status === 'reconciled') {
          lockedCount += 1
          skipped.push({ id, reason: '已对账明细禁止重算' })
          continue
        }
        const rule = await matchRuleOn(client, detail)
        if (!rule) {
          skipped.push({ id, reason: '未匹配到生效合同规则' })
          continue
        }
        const measure = await dailyMeasureProvider.getMeasure(client, {
          warehouseId: detail.warehouse_id,
          ownerId: detail.owner_id,
          goodsCategoryId: detail.goods_category_id,
        })
        const outcome = computeLine(
          {
            billingMode: rule.line.billing_mode as 'normal' | 'fixed_price' | 'max_value',
            billingBasis: rule.line.billing_basis as 'stock_qty' | 'locations' | 'volume' | 'weight' | null,
            unitPrice: rule.line.unit_price,
            minCharge: rule.line.min_charge,
            fixedAmount: rule.line.fixed_amount,
            discounts: rule.discounts.map((discount) => ({
              lowerLimit: discount.lower_limit,
              upperLimit: discount.upper_limit,
              discountMode: discount.discount_mode as 'percent' | 'fixed',
              percentValue: discount.percent_value,
              fixedValue: discount.fixed_value,
            })),
          },
          measure ?? { stockQty: 0, locations: 0, volume: 0, weight: 0 },
        )
        await client.run({
          text: `UPDATE receivable_details SET billing_mode = ?, billing_basis = ?, business_qty = ?, raw_amount = ?, discounted_amount = ?,
                 min_charge = ?, final_amount = ?, quote_bill_no = ? WHERE id = ?`,
          params: [rule.line.billing_mode, rule.line.billing_basis, outcome.businessQty, outcome.rawAmount, outcome.discountedAmount, outcome.minCharge, outcome.finalAmount, rule.quote.bill_no, id],
        })
        await writeChangeLog(client, {
          entityType: 'receivable',
          entityId: id,
          changeType: '重算',
          before: { rawAmount: detail.raw_amount, discountedAmount: detail.discounted_amount, minCharge: detail.min_charge, finalAmount: detail.final_amount },
          after: { rawAmount: outcome.rawAmount, discountedAmount: outcome.discountedAmount, minCharge: outcome.minCharge, finalAmount: outcome.finalAmount },
          reason: '费用重算（按最新生效合同规则与分段优惠）',
          operatorId: user.id,
        })
        recalculated.push(id)
      }
    })

    await recordAuditEvent(auditKit, {
      action: '重算',
      entityType: 'receivable',
      entityId: recalculated.length === 1 ? recalculated[0] : 'batch',
      actorUserId: user.id,
      metadata: { count: recalculated.length, skipped: skipped.length },
    })

    // 全部选中明细均已对账：整体拦截（RECONCILED_LOCKED）
    if (recalculated.length === 0 && lockedCount > 0) throw errors.reconciledLocked()
    return { recalculated: recalculated.length, skipped }
  }

  async function matchRuleWith(client: DbClient, detail: ReceivableRow): Promise<QuoteLineWithDiscounts | null> {
    const quotes = await client.queryAll<QuoteLineWithDiscounts['quote']>({
      text: `SELECT q.id, q.bill_no, q.org_id, q.warehouse_id, q.owner_id, q.effect_start, q.rent_free_days
             FROM cc_quotes q
             WHERE q.status = 'effective' AND q.org_id = ? AND q.warehouse_id = ? AND q.owner_id = ?
               AND q.effect_start <= ? AND q.effect_end >= ?`,
      params: [detail.org_id, detail.warehouse_id, detail.owner_id, detail.bill_date, detail.bill_date],
    })
    const candidates = quotes.filter((quote) => compareDates(detail.bill_date, freeRentEndDate(quote.effect_start, quote.rent_free_days)) > 0)
    for (const quote of candidates) {
      const lines = await client.queryAll<QuoteLineWithDiscounts['line']>({
        text: `SELECT id, fee_type_id, billing_mode, billing_basis, goods_category_id, unit_price, min_charge, fixed_amount
               FROM cc_quote_lines WHERE quote_id = ? AND fee_type_id = ? AND COALESCE(goods_category_id, '') = COALESCE(?, '')`,
        params: [quote.id, detail.fee_type_id, detail.goods_category_id ?? ''],
      })
      for (const line of lines) {
        const discounts = await client.queryAll<QuoteLineWithDiscounts['discounts'][number]>({
          text: 'SELECT lower_limit, upper_limit, discount_mode, percent_value, fixed_value FROM cc_quote_discounts WHERE quote_line_id = ? ORDER BY lower_limit',
          params: [line.id],
        })
        return { quote, line, discounts }
      }
    }
    return null
  }

  return { list, detail, recalc }
}

export type ReceivablesService = ReturnType<typeof createReceivablesService>
