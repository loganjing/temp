import type { Hono } from 'hono'
import { jsonBody, paramOf, paginated, paginationOf, route } from '../common/http'
import { assertOrgFilterAllowed, currentUserOf, orgScopeOf, requirePermission, type Platform } from '../common/scope'
import { authorizationRegistry } from '../platform/authorization'
import { createAdjustmentsService, type AdjustmentLineRow, type AdjustmentRow } from '../services/adjustments'
import { errors } from '../common/errors'

// adjustments 域路由：费用调整单查询/创建/明细加载/行维护/审核。
// 金额可见性策略点（需求未规定事项 4）适用范围是「仓储运营查询应收明细」场景（receivables 应答掩码）；
// 调整单行金额（调整前基准/调整金额/调整后）是仓储运营发起调整（AC-06）的业务操作基准，直接输出。

function serializeAdjustment(row: AdjustmentRow) {
  return {
    id: row.id,
    billNo: row.bill_no,
    orgId: row.org_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    status: row.status,
    remark: row.remark ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function serializeAdjustmentLines(lines: AdjustmentLineRow[]) {
  return lines.map((line) => ({
    id: line.id,
    receivableDetailId: line.receivable_detail_id ?? null,
    feeTypeId: line.fee_type_id,
    businessQty: line.business_qty,
    amountBefore: line.amount_before,
    adjustmentAmount: line.adjustment_amount,
    amountAfter: line.amount_after,
    reason: line.reason ?? null,
    lineNo: line.line_no,
  }))
}

export function registerAdjustmentRoutes(app: Hono, platform: Platform) {
  const adjustments = createAdjustmentsService(platform.db, platform.auditKit)

  app.get('/api/adjustments', requirePermission(platform, authorizationRegistry.permissions.adjustmentView.key), route(async (context) => {
    const user = currentUserOf(context)
    const requestedOrgId = context.req.query('orgId') || null
    assertOrgFilterAllowed(user, requestedOrgId)
    const pagination = paginationOf(context)
    const result = await adjustments.list(
      { orgId: requestedOrgId, status: context.req.query('status') || null, page: pagination.page, pageSize: pagination.pageSize },
      orgScopeOf(user),
    )
    return context.json(paginated(result.items.map(serializeAdjustment), result.total, pagination))
  }))

  app.get('/api/adjustments/:id', requirePermission(platform, authorizationRegistry.permissions.adjustmentView.key), route(async (context) => {
    const user = currentUserOf(context)
    const result = await adjustments.detail(paramOf(context, 'id'))
    if (!result) throw errors.notFound('调整单不存在或不可见')
    return context.json({
      ...serializeAdjustment(result.adjustment),
      lines: serializeAdjustmentLines(result.lines),
    })
  }))

  // POST /api/adjustments {orgId,periodStart,periodEnd,remark}
  app.post('/api/adjustments', requirePermission(platform, authorizationRegistry.permissions.adjustmentCreate.key), route(async (context) => {
    const user = currentUserOf(context)
    const body = await jsonBody(context)
    const created = await adjustments.create(user, {
      orgId: strOrUndefined(body.orgId),
      periodStart: strOrUndefined(body.periodStart),
      periodEnd: strOrUndefined(body.periodEnd),
      remark: strOrUndefined(body.remark) ?? null,
    })
    return context.json(serializeAdjustment(created), 201)
  }))

  // POST /api/adjustments/:id/details/load：按业务周期批量加载暂存明细
  app.post('/api/adjustments/:id/details/load', requirePermission(platform, authorizationRegistry.permissions.adjustmentEdit.key), route(async (context) => {
    const user = currentUserOf(context)
    const lines = await adjustments.loadDetails(user, paramOf(context, 'id'))
    return context.json({ lines: serializeAdjustmentLines(lines) })
  }))

  // PUT /api/adjustments/:id {lines:[{receivableDetailId,feeTypeId,businessQty,adjustmentAmount,reason}]}
  app.put('/api/adjustments/:id', requirePermission(platform, authorizationRegistry.permissions.adjustmentEdit.key), route(async (context) => {
    const user = currentUserOf(context)
    const body = await jsonBody(context)
    if (!Array.isArray(body.lines)) throw errors.required('lines')
    const lines = await adjustments.updateLines(user, paramOf(context, 'id'), body.lines as never[])
    return context.json({ lines: serializeAdjustmentLines(lines) })
  }))

  app.post('/api/adjustments/:id/audit', requirePermission(platform, authorizationRegistry.permissions.adjustmentAudit.key), route(async (context) => {
    const user = currentUserOf(context)
    const audited = await adjustments.audit(user, paramOf(context, 'id'))
    return context.json(serializeAdjustment(audited))
  }))
}

function strOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}
