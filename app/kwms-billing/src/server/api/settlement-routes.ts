import type { Hono } from 'hono'
import { errors } from '../common/errors'
import { jsonBody, paramOf, paginated, paginationOf, route } from '../common/http'
import { assertOrgFilterAllowed, currentUserOf, orgScopeOf, requirePermission, type Platform } from '../common/scope'
import { authorizationRegistry } from '../platform/authorization'
import { createSettlementService, type InvoiceRow, type SettleStatementRow, type WriteoffRow } from '../services/settlement'
import { defaultAmountVisibility, amountValue } from '../common/visibility'

// settlement 域路由：结算单查询/金额微调/开票/核销。
// 金额字段可见性策略点：对账总额/结算总额/开票累计/核销累计与发生金额仅 finance 角色。

function serializeSettlement(row: SettleStatementRow, roles: readonly string[]) {
  return {
    id: row.id,
    billNo: row.bill_no,
    reconStatementId: row.recon_statement_id,
    orgId: row.org_id,
    warehouseId: row.warehouse_id,
    ownerId: row.owner_id,
    reconTotalAmount: amountValue(defaultAmountVisibility, roles, row.recon_total_amount),
    settleTotalAmount: amountValue(defaultAmountVisibility, roles, row.settle_total_amount),
    invoiceTotalAmount: amountValue(defaultAmountVisibility, roles, row.invoice_total_amount),
    writeoffTotalAmount: amountValue(defaultAmountVisibility, roles, row.writeoff_total_amount),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function serializeInvoice(row: InvoiceRow, roles: readonly string[]) {
  return {
    id: row.id,
    settlementId: row.settlement_id,
    invoiceDate: row.invoice_date,
    invoicer: row.invoicer,
    invoiceNo: row.invoice_no,
    amount: amountValue(defaultAmountVisibility, roles, row.amount),
    createdAt: row.created_at,
  }
}

function serializeWriteoff(row: WriteoffRow, roles: readonly string[]) {
  return {
    id: row.id,
    settlementId: row.settlement_id,
    writeoffDate: row.writeoff_date,
    amount: amountValue(defaultAmountVisibility, roles, row.amount),
    operator: row.operator,
    createdAt: row.created_at,
  }
}

export function registerSettlementRoutes(app: Hono, platform: Platform) {
  const settlements = createSettlementService(platform.db, platform.auditKit)

  app.get('/api/settle-statements', requirePermission(platform, authorizationRegistry.permissions.settlementView.key), route(async (context) => {
    const user = currentUserOf(context)
    const requestedOrgId = context.req.query('orgId') || null
    assertOrgFilterAllowed(user, requestedOrgId)
    const pagination = paginationOf(context)
    const result = await settlements.list(
      { orgId: requestedOrgId, status: context.req.query('status') || null, page: pagination.page, pageSize: pagination.pageSize },
      orgScopeOf(user),
    )
    return context.json(paginated(result.items.map((row) => serializeSettlement(row, user.roles)), result.total, pagination))
  }))

  app.get('/api/settle-statements/:id', requirePermission(platform, authorizationRegistry.permissions.settlementView.key), route(async (context) => {
    const user = currentUserOf(context)
    const result = await settlements.detail(paramOf(context, 'id'))
    if (!result) throw errors.notFound('结算单不存在或不可见')
    // 契约 8：平铺头部字段 + lines（对账明细快照）+ invoices
    return context.json({
      ...serializeSettlement(result.statement, user.roles),
      lines: result.lines.map((line) => ({
        id: line.id,
        receivableDetailId: line.receivable_detail_id,
        goodsCategoryId: line.goods_category_id ?? null,
        billDate: line.bill_date,
        feeTypeId: line.fee_type_id,
        billingMode: line.billing_mode,
        businessQty: line.business_qty,
        unitPrice: amountValue(defaultAmountVisibility, user.roles, line.unit_price),
        minCharge: amountValue(defaultAmountVisibility, user.roles, line.min_charge),
        rawAmount: amountValue(defaultAmountVisibility, user.roles, line.raw_amount),
        finalAmount: amountValue(defaultAmountVisibility, user.roles, line.final_amount),
      })),
      invoices: result.invoices.map((invoice) => serializeInvoice(invoice, user.roles)),
      writeoffs: result.writeoffs.map((writeoff) => serializeWriteoff(writeoff, user.roles)),
    })
  }))

  // PUT /api/settle-statements/:id/settle-amount {settleTotalAmount}
  app.put('/api/settle-statements/:id/settle-amount', requirePermission(platform, authorizationRegistry.permissions.settlementAdjust.key), route(async (context) => {
    const user = currentUserOf(context)
    const body = await jsonBody(context)
    const statement = await settlements.adjustSettleAmount(user, paramOf(context, 'id'), body.settleTotalAmount as number)
    return context.json(serializeSettlement(statement, user.roles))
  }))

  // POST /api/settle-statements/:id/invoices {invoicer,invoiceNo,amount}
  app.post('/api/settle-statements/:id/invoices', requirePermission(platform, authorizationRegistry.permissions.invoiceIssue.key), route(async (context) => {
    const user = currentUserOf(context)
    const body = await jsonBody(context) as unknown as { invoicer?: string; invoiceNo?: string; amount?: number }
    const result = await settlements.issueInvoice(user, paramOf(context, 'id'), body)
    return context.json({
      ...serializeSettlement(result.statement, user.roles),
      invoice: serializeInvoice(result.invoice, user.roles),
    }, 201)
  }))

  // POST /api/settle-statements/:id/writeoffs {amount}
  app.post('/api/settle-statements/:id/writeoffs', requirePermission(platform, authorizationRegistry.permissions.writeoffRecord.key), route(async (context) => {
    const user = currentUserOf(context)
    const body = await jsonBody(context)
    const result = await settlements.recordWriteoff(user, paramOf(context, 'id'), { amount: body.amount as number })
    return context.json({
      ...serializeSettlement(result.statement, user.roles),
      writeoff: serializeWriteoff(result.writeoff, user.roles),
    }, 201)
  }))
}
