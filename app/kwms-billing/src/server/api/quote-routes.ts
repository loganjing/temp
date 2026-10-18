import type { Hono } from 'hono'
import { jsonBody, paramOf, paginated, paginationOf, route } from '../common/http'
import { assertOrgFilterAllowed, assertCanAccessOrg, currentUserOf, orgScopeOf, requirePermission, type Platform } from '../common/scope'
import { authorizationRegistry } from '../platform/authorization'
import type { QuotePayload } from '../../shared/contracts'
import { createMasterdataService } from '../services/masterdata'
import { createQuotesService, type DiscountRow, type QuoteLineRow, type QuoteRow } from '../services/quotes'
import { errors } from '../common/errors'

// quotes 域路由：报价单查询/维护/审核/终止。序列化统一转 camelCase；
// 报价规则字段（单价、保底、一口价）不属金额可见性过滤范围（技术契约第 1 节策略点）。

function serializeQuote(quote: QuoteRow) {
  return {
    id: quote.id,
    billNo: quote.bill_no,
    contractId: quote.contract_id,
    contractNo: quote.contract_no,
    orgId: quote.org_id,
    warehouseId: quote.warehouse_id,
    ownerType: quote.owner_type,
    ownerId: quote.owner_id,
    effectStart: quote.effect_start,
    effectEnd: quote.effect_end,
    rentFreeDays: quote.rent_free_days,
    billingPeriod: quote.billing_period,
    settlementMode: quote.settlement_mode,
    insuranceRequired: Boolean(quote.insurance_required),
    status: quote.status,
    remark: quote.remark ?? null,
    createdAt: quote.created_at,
    updatedAt: quote.updated_at,
  }
}

function serializeLines(lines: Array<QuoteLineRow & { discounts: DiscountRow[] }>) {
  return lines.map((line) => ({
    id: line.id,
    lineNo: line.line_no,
    feeTypeId: line.fee_type_id,
    billingMode: line.billing_mode,
    billingBasis: line.billing_basis ?? null,
    goodsCategoryId: line.goods_category_id ?? null,
    unitPrice: line.unit_price ?? null,
    minCharge: line.min_charge ?? null,
    fixedAmount: line.fixed_amount ?? null,
    discounts: line.discounts.map((discount) => ({
      lowerLimit: discount.lower_limit,
      upperLimit: discount.upper_limit,
      discountMode: discount.discount_mode,
      percentValue: discount.percent_value ?? null,
      fixedValue: discount.fixed_value ?? null,
    })),
  }))
}

function serializeQuoteDetail(quote: QuoteRow, lines: Array<QuoteLineRow & { discounts: DiscountRow[] }>) {
  return { ...serializeQuote(quote), lines: serializeLines(lines) }
}

export function registerQuoteRoutes(app: Hono, platform: Platform) {
  const masterdata = createMasterdataService(platform.db, platform.auditKit)
  const quotes = createQuotesService(platform.db, masterdata, platform.auditKit)

  app.get('/api/quotes', requirePermission(platform, authorizationRegistry.permissions.quoteView.key), route(async (context) => {
    const user = currentUserOf(context)
    const requestedOrgId = context.req.query('orgId') || null
    assertOrgFilterAllowed(user, requestedOrgId)
    const pagination = paginationOf(context)
    const result = await quotes.list(
      {
        orgId: requestedOrgId,
        warehouseId: context.req.query('warehouseId') || null,
        ownerId: context.req.query('ownerId') || null,
        status: context.req.query('status') || null,
        page: pagination.page,
        pageSize: pagination.pageSize,
      },
      orgScopeOf(user),
    )
    return context.json(paginated(result.items.map(serializeQuote), result.total, pagination))
  }))

  app.get('/api/quotes/:id', requirePermission(platform, authorizationRegistry.permissions.quoteView.key), route(async (context) => {
    const user = currentUserOf(context)
    const result = await quotes.detail(paramOf(context, 'id'))
    if (!result) throw errors.notFound('报价单不存在或不可见')
    assertCanAccessOrg(user, result.quote.org_id)
    return context.json(serializeQuoteDetail(result.quote, result.lines))
  }))

  // 报价规则字段全集由服务层权威复验（契约 1.2 校验规则）
  app.post('/api/quotes', requirePermission(platform, authorizationRegistry.permissions.quoteCreate.key), route(async (context) => {
    const user = currentUserOf(context)
    const payload = await jsonBody(context) as unknown as QuotePayload
    const created = await quotes.create(user, payload)
    const result = await quotes.detail(created.id)
    return context.json(serializeQuoteDetail(result!.quote, result!.lines), 201)
  }))

  app.put('/api/quotes/:id', requirePermission(platform, authorizationRegistry.permissions.quoteEdit.key), route(async (context) => {
    const user = currentUserOf(context)
    const payload = await jsonBody(context) as unknown as QuotePayload
    await quotes.update(user, paramOf(context, 'id'), payload)
    const result = await quotes.detail(paramOf(context, 'id'))
    return context.json(serializeQuoteDetail(result!.quote, result!.lines))
  }))

  app.post('/api/quotes/:id/audit', requirePermission(platform, authorizationRegistry.permissions.quoteAudit.key), route(async (context) => {
    const user = currentUserOf(context)
    const audited = await quotes.audit(user, paramOf(context, 'id'))
    return context.json(serializeQuote(audited))
  }))

  app.post('/api/quotes/:id/terminate', requirePermission(platform, authorizationRegistry.permissions.quoteTerminate.key), route(async (context) => {
    const user = currentUserOf(context)
    const terminated = await quotes.terminate(user, paramOf(context, 'id'))
    return context.json(serializeQuote(terminated))
  }))
}
