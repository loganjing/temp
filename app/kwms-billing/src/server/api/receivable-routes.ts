import type { Hono } from 'hono'
import { jsonBody, paramOf, paginated, paginationOf, route, strArrayField } from '../common/http'
import { assertOrgFilterAllowed, assertCanAccessOrg, currentUserOf, orgScopeOf, requirePermission, type Platform } from '../common/scope'
import { authorizationRegistry } from '../platform/authorization'
import { createReceivablesService, type ReceivableRow } from '../services/receivables'
import { defaultAmountVisibility, amountValue } from '../common/visibility'
import { errors } from '../common/errors'

// receivables 域路由：应收费用明细查询与重算。
// 金额字段可见性策略点：rawAmount/discountedAmount/minCharge/finalAmount 仅 finance 角色。

function serializeDetail(row: ReceivableRow, roles: readonly string[]) {
  return {
    id: row.id,
    billDate: row.bill_date,
    orgId: row.org_id,
    warehouseId: row.warehouse_id,
    ownerId: row.owner_id,
    feeTypeId: row.fee_type_id,
    goodsCategoryId: row.goods_category_id ?? null,
    billingMode: row.billing_mode,
    billingBasis: row.billing_basis ?? null,
    businessQty: row.business_qty,
    rawAmount: amountValue(defaultAmountVisibility, roles, row.raw_amount),
    discountedAmount: amountValue(defaultAmountVisibility, roles, row.discounted_amount),
    minCharge: amountValue(defaultAmountVisibility, roles, row.min_charge),
    finalAmount: amountValue(defaultAmountVisibility, roles, row.final_amount),
    quoteBillNo: row.quote_bill_no,
    status: row.status,
    createdAt: row.created_at,
  }
}

export function registerReceivableRoutes(app: Hono, platform: Platform) {
  const receivables = createReceivablesService(platform.db, platform.auditKit)

  app.get('/api/receivables', requirePermission(platform, authorizationRegistry.permissions.receivableView.key), route(async (context) => {
    const user = currentUserOf(context)
    const requestedOrgId = context.req.query('orgId') || null
    assertOrgFilterAllowed(user, requestedOrgId)
    const pagination = paginationOf(context)
    const result = await receivables.list(
      {
        orgId: requestedOrgId,
        warehouseId: context.req.query('warehouseId') || null,
        ownerId: context.req.query('ownerId') || null,
        feeTypeId: context.req.query('feeTypeId') || null,
        status: context.req.query('status') || null,
        periodStart: context.req.query('periodStart') || null,
        periodEnd: context.req.query('periodEnd') || null,
        page: pagination.page,
        pageSize: pagination.pageSize,
      },
      orgScopeOf(user),
    )
    return context.json(paginated(result.items.map((row) => serializeDetail(row, user.roles)), result.total, pagination))
  }))

  app.get('/api/receivables/:id', requirePermission(platform, authorizationRegistry.permissions.receivableView.key), route(async (context) => {
    const user = currentUserOf(context)
    const detail = await receivables.detail(paramOf(context, 'id'))
    if (!detail) throw errors.notFound('应收明细不存在或不可见')
    assertCanAccessOrg(user, String(detail.org_id))
    return context.json(serializeDetail(detail, user.roles))
  }))

  // POST /api/receivables/recalc {ids:[...]} → {recalculated, skipped:[{id,reason}]}
  app.post('/api/receivables/recalc', requirePermission(platform, authorizationRegistry.permissions.receivableRecalc.key), route(async (context) => {
    const user = currentUserOf(context)
    const body = await jsonBody(context)
    const ids = strArrayField(body, 'ids')
    const result = await receivables.recalc(user, ids)
    return context.json(result)
  }))
}
