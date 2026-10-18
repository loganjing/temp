import type { Hono } from 'hono'
import { jsonBody, paramOf, paginated, paginationOf, route } from '../common/http'
import { assertOrgFilterAllowed, currentUserOf, orgScopeOf, requirePermission, type Platform } from '../common/scope'
import { authorizationRegistry } from '../platform/authorization'
import { createReconService, type ReconStatementLineRow, type ReconStatementRow } from '../services/recon'
import { defaultAmountVisibility, amountValue } from '../common/visibility'
import { errors } from '../common/errors'

// recon 域路由：对账单查询/生成/审核。审核通过返回自动生成的结算单 id。
// 金额字段可见性策略点：totalAmount 与行金额字段仅 finance 角色。

function serializeStatement(row: ReconStatementRow, roles: readonly string[]) {
  return {
    id: row.id,
    billNo: row.bill_no,
    orgId: row.org_id,
    warehouseId: row.warehouse_id,
    ownerId: row.owner_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    totalAmount: amountValue(defaultAmountVisibility, roles, row.total_amount),
    lineCount: row.line_count,
    status: row.status,
    remark: row.remark ?? null,
    createdAt: row.created_at,
    auditedAt: row.audited_at ?? null,
  }
}

function serializeLines(lines: ReconStatementLineRow[], roles: readonly string[]) {
  return lines.map((line) => ({
    id: line.id,
    receivableDetailId: line.receivable_detail_id,
    goodsCategoryId: line.goods_category_id ?? null,
    billDate: line.bill_date,
    feeTypeId: line.fee_type_id,
    billingMode: line.billing_mode,
    businessQty: line.business_qty,
    unitPrice: amountValue(defaultAmountVisibility, roles, line.unit_price),
    minCharge: amountValue(defaultAmountVisibility, roles, line.min_charge),
    rawAmount: amountValue(defaultAmountVisibility, roles, line.raw_amount),
    finalAmount: amountValue(defaultAmountVisibility, roles, line.final_amount),
    lineNo: line.line_no,
  }))
}

function strOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export function registerReconRoutes(app: Hono, platform: Platform) {
  const recon = createReconService(platform.db, platform.auditKit)

  app.get('/api/recon-statements', requirePermission(platform, authorizationRegistry.permissions.reconView.key), route(async (context) => {
    const user = currentUserOf(context)
    const requestedOrgId = context.req.query('orgId') || null
    assertOrgFilterAllowed(user, requestedOrgId)
    const pagination = paginationOf(context)
    const result = await recon.list(
      { orgId: requestedOrgId, status: context.req.query('status') || null, page: pagination.page, pageSize: pagination.pageSize },
      orgScopeOf(user),
    )
    return context.json(paginated(result.items.map((row) => serializeStatement(row, user.roles)), result.total, pagination))
  }))

  app.get('/api/recon-statements/:id', requirePermission(platform, authorizationRegistry.permissions.reconView.key), route(async (context) => {
    const user = currentUserOf(context)
    const result = await recon.detail(paramOf(context, 'id'))
    if (!result) throw errors.notFound('对账单不存在或不可见')
    return context.json({
      ...serializeStatement(result.statement, user.roles),
      lines: serializeLines(result.lines, user.roles),
    })
  }))

  // POST /api/recon-statements {orgId,warehouseId,ownerId,periodStart,periodEnd,remark}
  app.post('/api/recon-statements', requirePermission(platform, authorizationRegistry.permissions.reconGenerate.key), route(async (context) => {
    const user = currentUserOf(context)
    const body = await jsonBody(context)
    const result = await recon.generate(user, {
      orgId: strOrUndefined(body.orgId),
      warehouseId: strOrUndefined(body.warehouseId),
      ownerId: strOrUndefined(body.ownerId),
      periodStart: strOrUndefined(body.periodStart),
      periodEnd: strOrUndefined(body.periodEnd),
      remark: strOrUndefined(body.remark) ?? null,
    })
    // 契约 7：201 {id, billNo, totalAmount, lineCount, status}
    return context.json({ ...serializeStatement(result.statement, user.roles), lineCount: result.lineCount }, 201)
  }))

  app.post('/api/recon-statements/:id/audit', requirePermission(platform, authorizationRegistry.permissions.reconAudit.key), route(async (context) => {
    const user = currentUserOf(context)
    const result = await recon.audit(user, paramOf(context, 'id'))
    return context.json({ id: result.statement.id, status: result.statement.status, settlementId: result.settlementId })
  }))
}
