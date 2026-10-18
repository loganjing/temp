// 业务闭环测试：费用重算（AC-05）、费用调整单回写（AC-06）、对账审核事务与自动结算单（AC-07）、
// 开票/核销累计约束（AC-08/09）。
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createKwmsApp, FEE_TYPES, ORGS, OWNERS, WAREHOUSES, CONTRACTS, MEASURE_A2 } from './helpers/kwms-app.mjs'

let ctx
let opsToken
let opsBToken
let financeToken

const quotePayload = (overrides = {}) => ({
  contractId: CONTRACTS.A1,
  orgId: ORGS.A,
  warehouseId: WAREHOUSES.A1,
  ownerType: 'customer',
  ownerId: OWNERS.A2,
  effectStart: '2025-12-01',
  effectEnd: '2026-12-31',
  rentFreeDays: 0,
  billingPeriod: 'daily',
  settlementMode: 'monthly',
  insuranceRequired: false,
  lines: [
    {
      feeTypeId: FEE_TYPES.storage,
      billingMode: 'normal',
      billingBasis: 'stock_qty',
      unitPrice: 100,
      minCharge: 5000,
      discounts: [{ lowerLimit: 0, upperLimit: 10000, discountMode: 'percent', percentValue: 10 }],
    },
    { feeTypeId: FEE_TYPES.loading, billingMode: 'fixed_price', fixedAmount: 8888 },
  ],
  ...overrides,
})

async function runDailyBilling(targetDate) {
  const response = await ctx.api(financeToken, 'POST', '/api/jobs/daily-billing/run', { targetDate })
  const body = await response.json()
  if (response.status !== 200 || body.status === 'failed') throw new Error(`daily-billing failed: ${JSON.stringify(body)}`)
  return body
}

before(async () => {
  ctx = await createKwmsApp()
  opsToken = (await ctx.login('ops@kwms.local', 'Ops@12345')).token
  opsBToken = (await ctx.login('ops-b@kwms.local', 'Ops@12345')).token
  financeToken = (await ctx.login('finance@kwms.local', 'Finance@12345')).token
  // ops 授予 auditor（承载 quote:audit / adjustment:audit 的角色配置授予路径）
  await ctx.grantRole('ops@kwms.local', 'auditor')
  ctx.state = {}
})

after(async () => {
  await ctx.cleanup()
})

test('准备：生效合同 + 自动计费生成两条明细（分段优惠与一口价并存）', async () => {
  const created = await ctx.api(opsToken, 'POST', '/api/quotes', quotePayload())
  assert.equal(created.status, 201)
  const createdBody = await created.json()
  const audited = await ctx.api(opsToken, 'POST', `/api/quotes/${createdBody.id}/audit`)
  assert.equal(audited.status, 200)
  ctx.state.quote = createdBody

  await runDailyBilling('2026-02-15')
  const list = await ctx.api(financeToken, 'GET', '/api/receivables?periodStart=2026-02-15&periodEnd=2026-02-15&pageSize=50')
  const body = await list.json()
  assert.equal(body.total, 2)
  const storage = body.items.find((item) => item.feeTypeId === FEE_TYPES.storage)
  const loading = body.items.find((item) => item.feeTypeId === FEE_TYPES.loading)
  // 普通+分段优惠：600×100=60000 → 9 折 54000，高于最低收费 5000
  assert.equal(storage.rawAmount, 60000)
  assert.equal(storage.discountedAmount, 54000)
  assert.equal(storage.minCharge, 5000)
  assert.equal(storage.finalAmount, 54000)
  assert.equal(loading.finalAmount, 8888)
  ctx.state.storageDetail = storage
  ctx.state.loadingDetail = loading
})

test('费用重算（AC-05）：清空原金额并按最新生效规则重新核算，写前后金额变更日志', async () => {
  // 终止旧合同，新建生效合同（单价 200、无优惠、无保底）后重算
  const terminated = await ctx.api(opsToken, 'POST', `/api/quotes/${ctx.state.quote.id}/terminate`)
  assert.equal(terminated.status, 200)

  const replacement = await ctx.api(opsToken, 'POST', '/api/quotes', quotePayload({
    effectStart: '2026-01-01',
    effectEnd: '2027-12-31',
    lines: [
      { feeTypeId: FEE_TYPES.storage, billingMode: 'normal', billingBasis: 'stock_qty', unitPrice: 200, minCharge: null },
      { feeTypeId: FEE_TYPES.loading, billingMode: 'fixed_price', fixedAmount: 8888 },
    ],
  }))
  assert.equal(replacement.status, 201)
  const replacementBody = await replacement.json()
  const audited = await ctx.api(opsToken, 'POST', `/api/quotes/${replacementBody.id}/audit`)
  assert.equal(audited.status, 200)

  // 仓储运营无 receivable:recalc 被拒绝
  const denied = await ctx.api(opsToken, 'POST', '/api/receivables/recalc', { ids: [ctx.state.storageDetail.id] })
  assert.equal(denied.status, 403)
  assert.equal((await denied.json()).error.code, 'PERMISSION_DENIED')

  const recalc = await ctx.api(financeToken, 'POST', '/api/receivables/recalc', { ids: [ctx.state.storageDetail.id] })
  assert.equal(recalc.status, 200)
  const recalcBody = await recalc.json()
  assert.equal(recalcBody.recalculated, 1)
  assert.equal(recalcBody.skipped.length, 0)

  const detail = await ctx.api(financeToken, 'GET', `/api/receivables/${ctx.state.storageDetail.id}`)
  const detailBody = await detail.json()
  // 重新匹配最新生效规则：600 × 200 = 120000
  assert.equal(detailBody.rawAmount, 120000)
  assert.equal(detailBody.discountedAmount, 120000)
  assert.equal(detailBody.finalAmount, 120000)
  assert.equal(detailBody.quoteBillNo, replacementBody.billNo)

  // 重算变更日志：前后金额与原因
  const logs = await ctx.api(financeToken, 'GET', `/api/audit/change-logs?entityType=receivable&entityId=${ctx.state.storageDetail.id}`)
  const logBody = await logs.json()
  const entry = logBody.items.find((item) => item.changeType === '重算')
  assert.ok(entry, '缺少重算类型 change_log')
  assert.equal(entry.before.finalAmount, 54000)
  assert.equal(entry.after.finalAmount, 120000)
  assert.ok(entry.reason.includes('重算'))
  assert.equal(entry.operatorName, '财务-沈默')
})

test('费用调整单（AC-06）：周期加载暂存明细、负数拦截、审核生效后回写应收明细金额', async () => {
  const created = await ctx.api(opsToken, 'POST', '/api/adjustments', {
    orgId: ORGS.A,
    periodStart: '2026-02-15',
    periodEnd: '2026-02-15',
    remark: '库存误差修正',
  })
  assert.equal(created.status, 201)
  const adjustment = (await created.json())
  assert.equal(adjustment.status, 'draft')
  assert.match(adjustment.billNo, /^YSTZ-\d{8}-\d{5}$/)
  const adjustmentId = adjustment.id

  // 财务无 adjustment:create（契约 1.1：调整单由仓储运营发起）
  const financeDenied = await ctx.api(financeToken, 'POST', '/api/adjustments', { orgId: ORGS.A, periodStart: '2026-02-15', periodEnd: '2026-02-15' })
  assert.equal(financeDenied.status, 403)

  // 加载周期内暂存明细（两条均为未对账）
  const loaded = await ctx.api(opsToken, 'POST', `/api/adjustments/${adjustmentId}/details/load`)
  assert.equal(loaded.status, 200)
  const loadedBody = await loaded.json()
  assert.equal(loadedBody.lines.length, 2)
  const storageLine = loadedBody.lines.find((line) => line.feeTypeId === FEE_TYPES.storage)
  assert.ok(storageLine.receivableDetailId)
  assert.equal(storageLine.amountBefore, 120000)

  // 负数调整金额被拦截：ADJUSTMENT_NEGATIVE（调减须新增反向调整单）
  const negative = await ctx.api(opsToken, 'PUT', `/api/adjustments/${adjustmentId}`, {
    lines: [{ receivableDetailId: storageLine.receivableDetailId, adjustmentAmount: -500, reason: '负数调整' }],
  })
  assert.equal(negative.status, 400)
  assert.equal((await negative.json()).error.code, 'ADJUSTMENT_NEGATIVE')

  // 正数调整 + 手动空白行（无合同匹配的临时费用，费用类型自选）
  const updated = await ctx.api(opsToken, 'PUT', `/api/adjustments/${adjustmentId}`, {
    lines: [
      { receivableDetailId: storageLine.receivableDetailId, adjustmentAmount: 5000, reason: '库存盘点误差补收' },
      { feeTypeId: FEE_TYPES.insurance, businessQty: 10, adjustmentAmount: 3000, reason: '临时增值保险服务费' },
    ],
  })
  assert.equal(updated.status, 200)
  const updatedBody = await updated.json()
  assert.equal(updatedBody.lines[0].amountBefore, 120000)
  assert.equal(updatedBody.lines[0].amountAfter, 125000)
  assert.equal(updatedBody.lines[1].amountBefore, 0)
  assert.equal(updatedBody.lines[1].amountAfter, 3000)

  // 未授予 auditor 的仓储运营无 adjustment:audit 被拒绝；ops 的 auditor 角色审核生效
  const denied = await ctx.api(opsBToken, 'POST', `/api/adjustments/${adjustmentId}/audit`)
  assert.equal(denied.status, 403)
  const approved = await ctx.api(opsToken, 'POST', `/api/adjustments/${adjustmentId}/audit`)
  assert.equal(approved.status, 200)
  assert.equal((await approved.json()).status, 'effective')

  // 审核生效后同步回写应收明细金额
  const detail = await ctx.api(financeToken, 'GET', `/api/receivables/${storageLine.receivableDetailId}`)
  assert.equal((await detail.json()).finalAmount, 125000)

  // 调整变更日志含前后金额与原因
  const logs = await ctx.api(financeToken, 'GET', `/api/audit/change-logs?entityType=receivable&entityId=${storageLine.receivableDetailId}`)
  const logBody = await logs.json()
  const entry = logBody.items.find((item) => item.changeType === '调整')
  assert.ok(entry, '缺少调整类型 change_log')
  assert.equal(entry.before.finalAmount, 120000)
  assert.equal(entry.after.finalAmount, 125000)
  assert.ok(entry.reason.includes('盘点误差'))

  // 已生效调整单不可再编辑
  const editDenied = await ctx.api(opsToken, 'PUT', `/api/adjustments/${adjustmentId}`, {
    lines: [{ receivableDetailId: storageLine.receivableDetailId, adjustmentAmount: 100, reason: '再次调整' }],
  })
  assert.equal(editDenied.status, 409)
  ctx.state.adjustedStorageDetailId = storageLine.receivableDetailId
})

test('对账单（AC-07）：汇总暂存明细、审核锁定明细并自动生成一一绑定结算单', async () => {
  const generated = await ctx.api(financeToken, 'POST', '/api/recon-statements', {
    orgId: ORGS.A,
    warehouseId: WAREHOUSES.A1,
    ownerId: OWNERS.A2,
    periodStart: '2026-02-15',
    periodEnd: '2026-02-15',
  })
  assert.equal(generated.status, 201)
  const statement = await generated.json()
  assert.match(statement.billNo, /^YSDZ-\d{8}-\d{5}$/)
  assert.equal(statement.status, 'draft')
  // 总金额 = 125000（调整后仓储费） + 8888（一口价装卸费）
  assert.equal(statement.totalAmount, 133888)
  assert.equal(statement.lineCount, 2)

  // 仓储运营无 recon:generate 与 recon:audit
  const opsDenied = await ctx.api(opsToken, 'POST', '/api/recon-statements', {
    orgId: ORGS.A, warehouseId: WAREHOUSES.A1, ownerId: OWNERS.A2, periodStart: '2026-02-15', periodEnd: '2026-02-15',
  })
  assert.equal(opsDenied.status, 403)

  // 审核通过：明细锁定 + 状态已对账 + 自动创建结算单
  const approved = await ctx.api(financeToken, 'POST', `/api/recon-statements/${statement.id}/audit`)
  assert.equal(approved.status, 200)
  const approvedBody = await approved.json()
  assert.equal(approvedBody.status, 'approved')
  assert.ok(approvedBody.settlementId)

  // 关联明细更新为已对账
  for (const detailId of [ctx.state.adjustedStorageDetailId, ctx.state.loadingDetail.id]) {
    const detail = await ctx.api(financeToken, 'GET', `/api/receivables/${detailId}`)
    assert.equal((await detail.json()).status, 'reconciled')
  }

  // 结算单与对账单一一绑定，对账总金额完全联动
  const settlement = await ctx.api(financeToken, 'GET', `/api/settle-statements/${approvedBody.settlementId}`)
  assert.equal(settlement.status, 200)
  const settlementBody = await settlement.json()
  assert.match(settlementBody.billNo, /^YSJS-\d{8}-\d{5}$/)
  assert.equal(settlementBody.reconStatementId, statement.id)
  assert.equal(settlementBody.reconTotalAmount, 133888)
  assert.equal(settlementBody.settleTotalAmount, 133888)
  assert.equal(settlementBody.invoiceTotalAmount, 0)
  assert.equal(settlementBody.writeoffTotalAmount, 0)
  assert.equal(settlementBody.status, 'draft')
  // 费用明细标签页：对账明细快照
  assert.equal(settlementBody.lines.length, 2)
  const storageSnapshot = settlementBody.lines.find((line) => line.feeTypeId === FEE_TYPES.storage)
  assert.equal(storageSnapshot.finalAmount, 125000)

  // 重复审核幂等返回 200
  const again = await ctx.api(financeToken, 'POST', `/api/recon-statements/${statement.id}/audit`)
  assert.equal(again.status, 200)
  assert.equal((await again.json()).settlementId, approvedBody.settlementId)

  ctx.state.settlementId = approvedBody.settlementId
  ctx.state.reconStatementId = statement.id
})

test('已对账明细禁止重算：RECONCILED_LOCKED（AC-05 强限制）', async () => {
  const recalc = await ctx.api(financeToken, 'POST', '/api/receivables/recalc', { ids: [ctx.state.adjustedStorageDetailId] })
  assert.equal(recalc.status, 409)
  assert.equal((await recalc.json()).error.code, 'RECONCILED_LOCKED')
})

test('已对账数据不再进入新对账单（AC-07 过滤）', async () => {
  const generated = await ctx.api(financeToken, 'POST', '/api/recon-statements', {
    orgId: ORGS.A,
    warehouseId: WAREHOUSES.A1,
    ownerId: OWNERS.A2,
    periodStart: '2026-02-15',
    periodEnd: '2026-02-15',
  })
  assert.equal(generated.status, 201)
  const body = await generated.json()
  assert.equal(body.lineCount, 0)
  assert.equal(body.totalAmount, 0)
})

test('结算金额微调校验（AC-07）：仅允许 0 < 值 ≤ 对账总金额', async () => {
  const settlementId = ctx.state.settlementId
  const exceed = await ctx.api(financeToken, 'PUT', `/api/settle-statements/${settlementId}/settle-amount`, { settleTotalAmount: 200000 })
  assert.equal(exceed.status, 400)
  assert.equal((await exceed.json()).error.code, 'VALIDATION_AMOUNT_EXCEED')

  const negative = await ctx.api(financeToken, 'PUT', `/api/settle-statements/${settlementId}/settle-amount`, { settleTotalAmount: 0 })
  assert.equal(negative.status, 400)
  assert.equal((await negative.json()).error.code, 'VALIDATION_NEGATIVE')

  // 少量抹零：133888 → 133800
  const adjusted = await ctx.api(financeToken, 'PUT', `/api/settle-statements/${settlementId}/settle-amount`, { settleTotalAmount: 133800 })
  assert.equal(adjusted.status, 200)
  assert.equal((await adjusted.json()).settleTotalAmount, 133800)
})

test('开票累计约束（AC-08）：累计开票金额不超过结算总金额，超额提交被拦截', async () => {
  const settlementId = ctx.state.settlementId

  // 仓储运营无 invoice:issue
  const opsDenied = await ctx.api(opsToken, 'POST', `/api/settle-statements/${settlementId}/invoices`, { invoicer: '出纳', invoiceNo: 'INV-001', amount: 1000 })
  assert.equal(opsDenied.status, 403)

  const first = await ctx.api(financeToken, 'POST', `/api/settle-statements/${settlementId}/invoices`, { invoicer: '财务-沈默', invoiceNo: 'INV-2026-001', amount: 50000 })
  assert.equal(first.status, 201)
  assert.equal((await first.json()).invoiceTotalAmount, 50000)

  // 开票至累计金额等于结算总金额（133800）
  const second = await ctx.api(financeToken, 'POST', `/api/settle-statements/${settlementId}/invoices`, { invoicer: '财务-沈默', invoiceNo: 'INV-2026-002', amount: 83800 })
  assert.equal(second.status, 201)
  assert.equal((await second.json()).invoiceTotalAmount, 133800)

  // 超额提交被拦截：INVOICE_EXCEED_TOTAL
  const exceed = await ctx.api(financeToken, 'POST', `/api/settle-statements/${settlementId}/invoices`, { invoicer: '财务-沈默', invoiceNo: 'INV-2026-003', amount: 1 })
  assert.equal(exceed.status, 409)
  assert.equal((await exceed.json()).error.code, 'INVOICE_EXCEED_TOTAL')

  // 必填校验：开票人与发票号码
  const missingInvoicer = await ctx.api(financeToken, 'POST', `/api/settle-statements/${settlementId}/invoices`, { invoiceNo: 'INV-X', amount: 1 })
  assert.equal(missingInvoicer.status, 400)
  assert.equal((await missingInvoicer.json()).error.code, 'VALIDATION_REQUIRED')

  // 开票明细与头部累计金额
  const detail = await ctx.api(financeToken, 'GET', `/api/settle-statements/${settlementId}`)
  const detailBody = await detail.json()
  assert.equal(detailBody.invoiceTotalAmount, 133800)
  assert.equal(detailBody.invoices.length, 2)
  assert.equal(detailBody.invoices[0].invoiceNo, 'INV-2026-001')
  assert.ok(detailBody.invoices[0].invoiceDate)
})

test('核销前置与累计约束（AC-09）：无有效开票不可核销，累计核销不超过累计开票', async () => {
  const settlementId = ctx.state.settlementId

  // 0 行对账单的结算单无任何开票记录 → 核销被拦截 NO_VALID_INVOICE
  const emptyGenerated = await ctx.api(financeToken, 'POST', '/api/recon-statements', {
    orgId: ORGS.A, warehouseId: WAREHOUSES.A1, ownerId: OWNERS.A2, periodStart: '2026-02-15', periodEnd: '2026-02-15',
  })
  const emptyStatement = await emptyGenerated.json()
  const emptyApproved = await ctx.api(financeToken, 'POST', `/api/recon-statements/${emptyStatement.id}/audit`)
  const emptySettlementId = (await emptyApproved.json()).settlementId
  const noInvoice = await ctx.api(financeToken, 'POST', `/api/settle-statements/${emptySettlementId}/writeoffs`, { amount: 100 })
  assert.equal(noInvoice.status, 409)
  assert.equal((await noInvoice.json()).error.code, 'NO_VALID_INVOICE')

  // 正常核销：50000
  const first = await ctx.api(financeToken, 'POST', `/api/settle-statements/${settlementId}/writeoffs`, { amount: 50000 })
  assert.equal(first.status, 201)
  assert.equal((await first.json()).writeoffTotalAmount, 50000)

  // 核销至等于累计开票金额（133800）
  const second = await ctx.api(financeToken, 'POST', `/api/settle-statements/${settlementId}/writeoffs`, { amount: 83800 })
  assert.equal(second.status, 201)
  assert.equal((await second.json()).writeoffTotalAmount, 133800)

  // 超额核销被拦截：WRITEOFF_EXCEED_INVOICE
  const exceed = await ctx.api(financeToken, 'POST', `/api/settle-statements/${settlementId}/writeoffs`, { amount: 1 })
  assert.equal(exceed.status, 409)
  assert.equal((await exceed.json()).error.code, 'WRITEOFF_EXCEED_INVOICE')

  // 结算单无终态，开票与核销记录永久留存
  const detail = await ctx.api(financeToken, 'GET', `/api/settle-statements/${settlementId}`)
  const detailBody = await detail.json()
  assert.equal(detailBody.status, 'draft')
  assert.equal(detailBody.writeoffTotalAmount, 133800)
  assert.equal(detailBody.writeoffs.length, 2)
})

test('结算单列表与查询（契约 8）', async () => {
  const list = await ctx.api(financeToken, 'GET', '/api/settle-statements?page=1&pageSize=10')
  assert.equal(list.status, 200)
  const body = await list.json()
  assert.ok(body.items.length >= 2)
  assert.ok(body.items.every((item) => item.billNo.startsWith('YSJS-')))

  const missing = await ctx.api(financeToken, 'GET', '/api/settle-statements/00000000-0000-0000-0000-000000000000')
  assert.equal(missing.status, 404)
})

test('审计事件与变更日志查询（AC-12 服务端承载）', async () => {
  const events = await ctx.api(financeToken, 'GET', '/api/audit/events?entityType=receivable&pageSize=50')
  assert.equal(events.status, 200)
  const eventsBody = await events.json()
  assert.ok(eventsBody.items.length >= 1)
  const recalcEvent = eventsBody.items.find((item) => item.action === '重算')
  assert.ok(recalcEvent, '缺少重算审计事件')
  assert.ok(recalcEvent.operatorName)
  assert.ok(recalcEvent.operatedAt)

  const changeLogs = await ctx.api(financeToken, 'GET', '/api/audit/change-logs?entityType=settle_statement&entityId=' + ctx.state.settlementId)
  assert.equal(changeLogs.status, 200)
  const logsBody = await changeLogs.json()
  const types = logsBody.items.map((item) => item.changeType)
  assert.ok(types.includes('开票'))
  assert.ok(types.includes('核销'))
})
