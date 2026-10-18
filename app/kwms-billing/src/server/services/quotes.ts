import type { DbClient } from '@commonapp/dbkit'
import type { AuthUser } from '@commonapp/userkit'
import type { MasterdataService } from './masterdata'
import {
  compareDates,
  freeRentEndDate,
  intervalsOverlap,
  RENT_FREE_DAY_OPTIONS,
  validateDiscountIntervals,
  type BillingBasis,
  type BillingMode,
  type BillingPeriod,
  type DiscountRulePayload,
  type OwnerType,
  type QuoteLinePayload,
  type QuotePayload,
  type SettlementMode,
} from '../../shared/contracts'
import { newId, nextBillNo, nowIso, today } from '../common/billno'
import { BusinessError, errors } from '../common/errors'
import { assertCanAccessOrg, type OrgScope } from '../common/scope'
import { recordAuditEvent, writeChangeLog } from './auditlog'

// quotes 域：仓储合同报价单（CCHT）头部/明细行/分段优惠的维护、全部保存校验（后端权威复验）、
// 状态流转（审核生效/终止）、修改前后快照日志。

export interface QuoteRow {
  id: string
  bill_no: string
  contract_id: string
  contract_no: string
  org_id: string
  warehouse_id: string
  owner_type: string
  owner_id: string
  effect_start: string
  effect_end: string
  rent_free_days: number
  billing_period: string
  settlement_mode: string
  insurance_required: number
  status: string
  remark: string | null
  created_at: string
  updated_at: string
}

export interface QuoteLineRow {
  id: string
  quote_id: string
  line_no: number
  fee_type_id: string
  billing_mode: string
  billing_basis: string | null
  goods_category_id: string | null
  unit_price: number | null
  min_charge: number | null
  fixed_amount: number | null
}

export interface DiscountRow {
  id: string
  quote_line_id: string
  lower_limit: number
  upper_limit: number
  discount_mode: string
  percent_value: number | null
  fixed_value: number | null
}

export interface QuoteFilters {
  orgId?: string | null
  warehouseId?: string | null
  ownerId?: string | null
  status?: string | null
  page: number
  pageSize: number
}

export function createQuotesService(db: DbClient, masterdata: MasterdataService, auditKit: { record(event: { type: string; actorUserId?: string; metadata?: Record<string, unknown> }): Promise<void> }) {
  async function list(filters: QuoteFilters, scope: OrgScope): Promise<{ items: QuoteRow[]; total: number }> {
    const conditions: string[] = ['1 = 1']
    const params: unknown[] = []
    const effectiveOrgId = filters.orgId ?? (scope.isAdmin ? null : scope.orgId)
    if (effectiveOrgId) {
      conditions.push('q.org_id = ?')
      params.push(effectiveOrgId)
    } else if (!scope.isAdmin && scope.orgId) {
      conditions.push('q.org_id = ?')
      params.push(scope.orgId)
    }
    if (filters.warehouseId) {
      conditions.push('q.warehouse_id = ?')
      params.push(filters.warehouseId)
    }
    if (filters.ownerId) {
      conditions.push('q.owner_id = ?')
      params.push(filters.ownerId)
    }
    if (filters.status) {
      conditions.push('q.status = ?')
      params.push(filters.status)
    }
    const where = `WHERE ${conditions.join(' AND ')}`
    const total = await db.queryOne<{ total: number }>({ text: `SELECT COUNT(*) AS total FROM cc_quotes q ${where}`, params })
    const rows = await db.queryAll({
      text: `SELECT q.*, c.contract_no FROM cc_quotes q JOIN contracts c ON c.id = q.contract_id ${where} ORDER BY q.created_at DESC, q.id DESC LIMIT ? OFFSET ?`,
      params: [...params, filters.pageSize, (filters.page - 1) * filters.pageSize],
    })
    return { items: rows as unknown as QuoteRow[], total: Number(total?.total ?? 0) }
  }

  async function loadQuote(id: string): Promise<QuoteRow | null> {
    return db.queryOne<QuoteRow>({ text: 'SELECT q.*, c.contract_no FROM cc_quotes q JOIN contracts c ON c.id = q.contract_id WHERE q.id = ?', params: [id] })
  }

  async function loadLines(quoteId: string): Promise<(QuoteLineRow & { discounts: DiscountRow[] })[]> {
    const lines = await db.queryAll<QuoteLineRow>({ text: 'SELECT * FROM cc_quote_lines WHERE quote_id = ? ORDER BY line_no', params: [quoteId] })
    for (const line of lines) {
      const discounts = await db.queryAll<DiscountRow>({ text: 'SELECT * FROM cc_quote_discounts WHERE quote_line_id = ? ORDER BY lower_limit', params: [line.id] })
      ;(line as QuoteLineRow & { discounts: DiscountRow[] }).discounts = discounts
    }
    return lines as (QuoteLineRow & { discounts: DiscountRow[] })[]
  }

  async function detail(id: string): Promise<{ quote: QuoteRow; lines: (QuoteLineRow & { discounts: DiscountRow[] })[] } | null> {
    const quote = await loadQuote(id)
    if (!quote) return null
    return { quote, lines: await loadLines(id) }
  }

  // ---- 保存校验（需求 5.1，后端权威复验）----

  function validateHeader(user: AuthUser, payload: QuotePayload): void {
    if (!payload.contractId) throw errors.required('contractId')
    if (!payload.orgId) throw errors.required('orgId')
    if (!payload.warehouseId) throw errors.required('warehouseId')
    if (!payload.ownerId) throw errors.required('ownerId')
    if (!payload.effectStart) throw errors.required('effectStart')
    if (!payload.effectEnd) throw errors.required('effectEnd')
    if (!RENT_FREE_DAY_OPTIONS.includes(payload.rentFreeDays as (typeof RENT_FREE_DAY_OPTIONS)[number])) throw errors.invalidInput('免租期仅可为 0/7/15/30 天', 'rentFreeDays')
    if (!['business', 'customer'].includes(payload.ownerType)) throw errors.invalidInput('货主类型取值无效（business|customer）', 'ownerType')
    if (!['daily', 'monthly'].includes(payload.billingPeriod)) throw errors.invalidInput('结算账期取值无效（daily|monthly）', 'billingPeriod')
    if (payload.settlementMode !== undefined && payload.settlementMode !== null && !['monthly', 'prepaid'].includes(payload.settlementMode)) throw errors.invalidInput('结算方式取值无效（monthly|prepaid）', 'settlementMode')
    if (typeof payload.insuranceRequired !== 'boolean') throw errors.invalidInput('需要保险必须为布尔值', 'insuranceRequired')
    assertCanAccessOrg(user, payload.orgId)
    if (compareDates(payload.effectStart, payload.effectEnd) >= 0) throw errors.dateOrder()
    const freeRentEnd = freeRentEndDate(payload.effectStart, payload.rentFreeDays)
    if (compareDates(freeRentEnd, payload.effectEnd) > 0) throw errors.freeRentEnd()
  }

  function validateLine(line: QuoteLinePayload, index: number): void {
    if (!line.feeTypeId) throw errors.required(`lines[${index}].feeTypeId`)
    const mode = line.billingMode
    if (!mode) throw errors.required(`lines[${index}].billingMode`)

    if (mode === 'normal') {
      if (!line.billingBasis) throw errors.required(`lines[${index}].billingBasis`)
      if (line.unitPrice === null || line.unitPrice === undefined) throw errors.required(`lines[${index}].unitPrice`)
      if (line.unitPrice <= 0) throw errors.negative(`lines[${index}].unitPrice`)
      if (line.fixedAmount !== null && line.fixedAmount !== undefined) throw errors.invalidInput('普通模式金额置灰，仅一口价模式可配置金额', `lines[${index}].fixedAmount`)
    } else if (mode === 'fixed_price') {
      if (line.fixedAmount === null || line.fixedAmount === undefined) throw errors.required(`lines[${index}].fixedAmount`)
      if (line.fixedAmount <= 0) throw errors.negative(`lines[${index}].fixedAmount`)
      if (line.unitPrice !== null && line.unitPrice !== undefined) throw errors.invalidInput('一口价模式下单价锁定置灰，不可配置', `lines[${index}].unitPrice`)
      if (line.billingBasis) throw errors.invalidInput('一口价模式计费方式置灰，不可配置', `lines[${index}].billingBasis`)
    } else if (mode === 'max_value') {
      if (line.unitPrice === null || line.unitPrice === undefined) throw errors.required(`lines[${index}].unitPrice`)
      if (line.unitPrice <= 0) throw errors.negative(`lines[${index}].unitPrice`)
      if (line.billingBasis) throw errors.invalidInput('取大值模式计费方式置灰，不可配置', `lines[${index}].billingBasis`)
      if (line.fixedAmount !== null && line.fixedAmount !== undefined) throw errors.invalidInput('取大值模式金额置灰，仅一口价模式可配置金额', `lines[${index}].fixedAmount`)
    } else {
      throw errors.invalidInput('计费模式取值无效', `lines[${index}].billingMode`)
    }

    if (line.minCharge !== null && line.minCharge !== undefined && line.minCharge <= 0) {
      throw errors.negative(`lines[${index}].minCharge`)
    }

    for (const discount of line.discounts ?? []) {
      if (!(discount.lowerLimit >= 0)) throw errors.negative(`lines[${index}].discounts.lowerLimit`)
      if (!(discount.upperLimit > discount.lowerLimit)) throw errors.invalidInput('业务量上限必须大于业务量下限', `lines[${index}].discounts.upperLimit`)
      if (discount.discountMode === 'percent') {
        if (discount.percentValue === null || discount.percentValue === undefined) throw errors.required(`lines[${index}].discounts.percentValue`)
        if (discount.percentValue < 0) throw errors.negative(`lines[${index}].discounts.percentValue`)
        if (discount.percentValue > 100) throw errors.amountExceed()
      } else if (discount.discountMode === 'fixed') {
        if (discount.fixedValue === null || discount.fixedValue === undefined) throw errors.required(`lines[${index}].discounts.fixedValue`)
        if (discount.fixedValue < 0) throw errors.negative(`lines[${index}].discounts.fixedValue`)
      } else {
        throw errors.invalidInput('优惠方式取值无效', `lines[${index}].discounts.discountMode`)
      }
    }

    const intervalError = validateDiscountIntervals(line.discounts ?? [])
    if (intervalError) throw errors.discountOverlap()
  }

  async function validateReferencesAndConflicts(payload: QuotePayload, selfId: string | null): Promise<void> {
    await masterdata.assertContractInOrg(payload.contractId, payload.orgId)
    await masterdata.assertWarehouseInOrg(payload.warehouseId, payload.orgId)
    await masterdata.assertOwnerInOrg(payload.ownerId, payload.orgId, payload.ownerType)

    // 行内重复：同一报价单内同费用类型 + 同货品类别
    const seen = new Set<string>()
    for (const line of payload.lines) {
      const key = `${line.feeTypeId}::${line.goodsCategoryId ?? ''}`
      if (seen.has(key)) throw errors.duplicateLine()
      seen.add(key)
      await masterdata.assertFeeTypeExists(line.feeTypeId)
      if (line.goodsCategoryId) await masterdata.assertGoodsCategoryExists(line.goodsCategoryId)
    }

    // 同货主、仓库、周期多份生效合同（保存时直接拦截，提示终止旧合同）；
    // 头级冲突先于明细重复校验（与 audit 复核顺序一致：周期重叠时合同层面已构成冲突）
    const conflict = await db.queryOne<{ id: string }>({
      text: `SELECT id FROM cc_quotes
             WHERE status = 'effective' AND org_id = ? AND warehouse_id = ? AND owner_id = ?
               AND effect_start <= ? AND effect_end >= ? ${selfId ? 'AND id <> ?' : ''}`,
      params: selfId
        ? [payload.orgId, payload.warehouseId, payload.ownerId, payload.effectEnd, payload.effectStart, selfId]
        : [payload.orgId, payload.warehouseId, payload.ownerId, payload.effectEnd, payload.effectStart],
    })
    if (conflict) throw errors.contractConflict()

    // 同组织/仓库/货主/效期内已存在的生效明细（跨报价单）
    for (const line of payload.lines) {
      const duplicate = await db.queryOne({
        text: `SELECT 1 FROM cc_quote_lines l JOIN cc_quotes q ON q.id = l.quote_id
               WHERE q.status = 'effective' AND q.org_id = ? AND q.warehouse_id = ? AND q.owner_id = ?
                 AND l.fee_type_id = ? AND COALESCE(l.goods_category_id, '') = COALESCE(?, '')
                 AND q.effect_start <= ? AND q.effect_end >= ? ${selfId ? 'AND q.id <> ?' : ''}`,
        params: selfId
          ? [payload.orgId, payload.warehouseId, payload.ownerId, line.feeTypeId, line.goodsCategoryId ?? '', payload.effectEnd, payload.effectStart, selfId]
          : [payload.orgId, payload.warehouseId, payload.ownerId, line.feeTypeId, line.goodsCategoryId ?? '', payload.effectEnd, payload.effectStart],
      })
      if (duplicate) throw errors.duplicateLine()
    }
  }

  function snapshotLines(lines: (QuoteLineRow & { discounts: DiscountRow[] })[]) {
    return lines.map((line) => ({
      lineNo: line.line_no,
      feeTypeId: line.fee_type_id,
      billingMode: line.billing_mode,
      billingBasis: line.billing_basis,
      goodsCategoryId: line.goods_category_id,
      unitPrice: line.unit_price,
      minCharge: line.min_charge,
      fixedAmount: line.fixed_amount,
      discounts: (line.discounts ?? []).map((discount) => ({
        lowerLimit: discount.lower_limit,
        upperLimit: discount.upper_limit,
        discountMode: discount.discount_mode,
        percentValue: discount.percent_value,
        fixedValue: discount.fixed_value,
      })),
    }))
  }

  async function insertLines(client: DbClient, quoteId: string, lines: QuoteLinePayload[]): Promise<void> {
    let lineNo = 1
    for (const line of lines) {
      const lineId = newId()
      await client.run({
        text: `INSERT INTO cc_quote_lines (id, quote_id, line_no, fee_type_id, billing_mode, billing_basis, goods_category_id, unit_price, min_charge, fixed_amount)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [lineId, quoteId, lineNo, line.feeTypeId, line.billingMode, line.billingBasis ?? null, line.goodsCategoryId ?? null, line.unitPrice ?? null, line.minCharge ?? null, line.fixedAmount ?? null],
      })
      for (const discount of line.discounts ?? []) {
        await client.run({
          text: `INSERT INTO cc_quote_discounts (id, quote_line_id, lower_limit, upper_limit, discount_mode, percent_value, fixed_value)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
          params: [newId(), lineId, discount.lowerLimit, discount.upperLimit, discount.discountMode, discount.percentValue ?? null, discount.fixedValue ?? null],
        })
      }
      lineNo += 1
    }
  }

  async function create(user: AuthUser, payload: QuotePayload): Promise<QuoteRow> {
    validateHeader(user, payload)
    if (!payload.lines?.length) throw errors.required('lines')
    for (const [index, line] of payload.lines.entries()) validateLine(line, index)
    await validateReferencesAndConflicts(payload, null)

    const timestamp = nowIso()
    const quoteId = newId()
    let created: QuoteRow | null = null
    await db.transaction(async (tx) => {
      const billNo = await nextBillNo(tx, 'CCHT', today())
      await tx.run({
        text: `INSERT INTO cc_quotes (id, bill_no, contract_id, org_id, warehouse_id, owner_type, owner_id, effect_start, effect_end,
               rent_free_days, billing_period, settlement_mode, insurance_required, status, remark, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
        params: [quoteId, billNo, payload.contractId, payload.orgId, payload.warehouseId, payload.ownerType, payload.ownerId, payload.effectStart, payload.effectEnd,
          payload.rentFreeDays, payload.billingPeriod, payload.settlementMode ?? 'monthly', payload.insuranceRequired ? 1 : 0, payload.remark ?? null, timestamp, timestamp],
      })
      await insertLines(tx, quoteId, payload.lines)
      created = (await tx.queryOne<QuoteRow>({ text: 'SELECT * FROM cc_quotes WHERE id = ?', params: [quoteId] })) ?? null
    })
    if (!created) throw errors.invalidInput('报价单创建失败')
    await recordAuditEvent(auditKit, { action: '新增', entityType: 'quote', entityId: quoteId, actorUserId: user.id, metadata: { billNo: (created as QuoteRow).bill_no } })
    return created as QuoteRow
  }

  async function update(user: AuthUser, id: string, payload: QuotePayload): Promise<QuoteRow> {
    const existing = await loadQuote(id)
    if (!existing) throw errors.notFound('报价单不存在或不可见')
    assertCanAccessOrg(user, existing.org_id)
    if (existing.status !== 'draft') throw errors.invalidStatus('已生效报价单不可修改计费规则，如需变更请终止旧合同并新建续签报价单')
    validateHeader(user, payload)
    if (!payload.lines?.length) throw errors.required('lines')
    for (const [index, line] of payload.lines.entries()) validateLine(line, index)
    await validateReferencesAndConflicts(payload, id)

    const timestamp = nowIso()
    await db.transaction(async (tx) => {
      const beforeLines = await loadLines(id)
      await tx.run({ text: 'DELETE FROM cc_quote_lines WHERE quote_id = ?', params: [id] })
      await insertLines(tx, id, payload.lines)
      await tx.run({
        text: `UPDATE cc_quotes SET contract_id = ?, org_id = ?, warehouse_id = ?, owner_type = ?, owner_id = ?, effect_start = ?, effect_end = ?,
               rent_free_days = ?, billing_period = ?, settlement_mode = ?, insurance_required = ?, remark = ?, updated_at = ? WHERE id = ?`,
        params: [payload.contractId, payload.orgId, payload.warehouseId, payload.ownerType, payload.ownerId, payload.effectStart, payload.effectEnd,
          payload.rentFreeDays, payload.billingPeriod, payload.settlementMode ?? 'monthly', payload.insuranceRequired ? 1 : 0, payload.remark ?? null, timestamp, id],
      })
      // 修改前后快照日志（前单价/优惠区间/计费规则、后值）
      await writeChangeLog(tx as unknown as DbClient, {
        entityType: 'quote',
        entityId: id,
        changeType: '编辑',
        before: { effectStart: existing.effect_start, effectEnd: existing.effect_end, rentFreeDays: existing.rent_free_days, billingPeriod: existing.billing_period, lines: snapshotLines(beforeLines) },
        after: { effectStart: payload.effectStart, effectEnd: payload.effectEnd, rentFreeDays: payload.rentFreeDays, billingPeriod: payload.billingPeriod, lines: payload.lines },
        reason: '报价单修改',
        operatorId: user.id,
      })
    })
    await recordAuditEvent(auditKit, { action: '编辑', entityType: 'quote', entityId: id, actorUserId: user.id, metadata: { billNo: existing.bill_no } })
    const updated = await loadQuote(id)
    return updated as QuoteRow
  }

  async function audit(user: AuthUser, id: string): Promise<QuoteRow> {
    const existing = await loadQuote(id)
    if (!existing) throw errors.notFound('报价单不存在或不可见')
    assertCanAccessOrg(user, existing.org_id)
    if (existing.status === 'effective') return existing
    if (existing.status !== 'draft') throw errors.invalidStatus('已终止报价单不可审核')
    // 审核生效前复核合同冲突（避免与已生效合同重叠）
    const conflict = await db.queryOne<{ id: string }>({
      text: `SELECT id FROM cc_quotes WHERE status = 'effective' AND org_id = ? AND warehouse_id = ? AND owner_id = ?
             AND effect_start <= ? AND effect_end >= ? AND id <> ?`,
      params: [existing.org_id, existing.warehouse_id, existing.owner_id, existing.effect_end, existing.effect_start, id],
    })
    if (conflict) throw errors.contractConflict()
    // 审核生效前复核明细重复（自身即将生效，须满足唯一生效明细不变量）
    const duplicate = await db.queryOne<{ id: string }>({
      text: `SELECT q.id FROM cc_quote_lines l JOIN cc_quotes q ON q.id = l.quote_id
             WHERE q.status = 'effective' AND q.org_id = ? AND q.warehouse_id = ? AND q.owner_id = ?
               AND l.fee_type_id IN (SELECT fee_type_id FROM cc_quote_lines WHERE quote_id = ?)
               AND COALESCE(l.goods_category_id, '') IN (SELECT COALESCE(goods_category_id, '') FROM cc_quote_lines WHERE quote_id = ?)
               AND q.effect_start <= ? AND q.effect_end >= ? AND q.id <> ?
             LIMIT 1`,
      params: [existing.org_id, existing.warehouse_id, existing.owner_id, id, id, existing.effect_end, existing.effect_start, id],
    })
    if (duplicate) throw errors.duplicateLine()
    await db.run({ text: "UPDATE cc_quotes SET status = 'effective', updated_at = ? WHERE id = ?", params: [nowIso(), id] })
    await recordAuditEvent(auditKit, { action: '审核', entityType: 'quote', entityId: id, actorUserId: user.id, metadata: { billNo: existing.bill_no } })
    return (await loadQuote(id)) as QuoteRow
  }

  async function terminate(user: AuthUser, id: string): Promise<QuoteRow> {
    const existing = await loadQuote(id)
    if (!existing) throw errors.notFound('报价单不存在或不可见')
    assertCanAccessOrg(user, existing.org_id)
    if (existing.status === 'terminated') return existing
    if (existing.status !== 'effective') throw errors.invalidStatus('暂存报价单不可终止，请先审核生效')
    await db.run({ text: "UPDATE cc_quotes SET status = 'terminated', updated_at = ? WHERE id = ?", params: [nowIso(), id] })
    await recordAuditEvent(auditKit, { action: '终止', entityType: 'quote', entityId: id, actorUserId: user.id, metadata: { billNo: existing.bill_no } })
    return (await loadQuote(id)) as QuoteRow
  }

  return { list, detail, create, update, audit, terminate, loadQuote }
}

export type QuotesService = ReturnType<typeof createQuotesService>
