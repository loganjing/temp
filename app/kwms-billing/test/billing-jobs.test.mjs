// 定时任务测试（AC-04）：计费过滤（免租期/效期/状态/账期）、合同过期检测、job_runs 防重、库存缺失通知。
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createKwmsApp, FEE_TYPES, ORGS, OWNERS, WAREHOUSES, CONTRACTS, MEASURE_B1, MEASURE_A2 } from './helpers/kwms-app.mjs'

let ctx
let opsToken
let financeToken
let opsBToken
let financeBToken

const quotePayload = (overrides = {}) => ({
  contractId: CONTRACTS.A1,
  orgId: ORGS.A,
  warehouseId: WAREHOUSES.A1,
  ownerType: 'customer',
  ownerId: OWNERS.A2,
  effectStart: '2026-02-01',
  effectEnd: '2026-06-30',
  rentFreeDays: 0,
  billingPeriod: 'daily',
  settlementMode: 'monthly',
  insuranceRequired: false,
  lines: [
    { feeTypeId: FEE_TYPES.storage, billingMode: 'normal', billingBasis: 'stock_qty', unitPrice: 200 },
  ],
  ...overrides,
})

async function createEffectiveQuote(token, payload) {
  const created = await ctx.api(token, 'POST', '/api/quotes', payload)
  if (created.status !== 201) throw new Error(`create quote failed: HTTP ${created.status} ${JSON.stringify(await created.json())}`)
  const createdBody = await created.json()
  const audited = await ctx.api(token, 'POST', `/api/quotes/${createdBody.id}/audit`)
  if (audited.status !== 200) throw new Error(`audit quote failed: HTTP ${audited.status}`)
  return createdBody
}

async function runJob(token, type, targetDate) {
  const response = await ctx.api(token, 'POST', `/api/jobs/${type}/run`, targetDate ? { targetDate } : {})
  return { status: response.status, body: await response.json() }
}

before(async () => {
  ctx = await createKwmsApp()
  opsToken = (await ctx.login('ops@kwms.local', 'Ops@12345')).token
  financeToken = (await ctx.login('finance@kwms.local', 'Finance@12345')).token
  opsBToken = (await ctx.login('ops-b@kwms.local', 'Ops@12345')).token
  // quote:audit / adjustment:audit 默认不绑定角色；测试以角色配置授予 auditor 后贯通
  await ctx.grantRole('ops@kwms.local', 'auditor')
  await ctx.grantRole('ops-b@kwms.local', 'auditor')
  // 组织隔离（AC-10）：ORG-A 财务不可见 ORG-B 单据；经用户管理 API 创建 ORG-B 财务用户用于 ORG-B 金额验证
  const adminToken = (await ctx.login('admin@kwms.local', 'Admin@12345')).token
  const financeB = await ctx.api(adminToken, 'POST', '/api/users', {
    username: 'finance-b@kwms.local',
    password: 'FinanceB@123456',
    name: '组织B财务',
    roles: ['finance'],
    orgId: ORGS.B,
  })
  assert.equal(financeB.status, 201)
  financeBToken = (await ctx.login('finance-b@kwms.local', 'FinanceB@123456')).token
  ctx.state = {}
})

after(async () => {
  await ctx.cleanup()
})

test('计费任务执行前准备五类合同（AC-04 场景）', async () => {
  // ③ 已过期（结束日期早于计算日 2026-02-15）
  ctx.state.expired = await createEffectiveQuote(opsToken, quotePayload({ effectStart: '2025-01-01', effectEnd: '2025-06-30' }))
  // ⑤ 已生效且到期日已过（2026-01-31 < 2026-02-15，将被过期检测终止）
  ctx.state.due = await createEffectiveQuote(opsToken, quotePayload({ effectStart: '2026-01-01', effectEnd: '2026-01-31' }))
  // ① 已生效且当前处于免租期内（免租期至 2026-02-15，含当日 → 不计费）
  ctx.state.inRentFree = await createEffectiveQuote(opsToken, quotePayload({ effectStart: '2026-02-01', effectEnd: '2026-06-30', rentFreeDays: 15 }))
  // ④ 暂存状态（不参与自动计费）
  const draft = await ctx.api(opsToken, 'POST', '/api/quotes', quotePayload({ effectStart: '2026-07-01', effectEnd: '2026-12-31' }))
  assert.equal(draft.status, 201)
  ctx.state.draft = await draft.json()
  // ② ORG-B 正常计费合同（WH-B1 / OWN-B1 有库存）
  const billing = await ctx.api(opsBToken, 'POST', '/api/quotes', {
    contractId: CONTRACTS.B1,
    orgId: ORGS.B,
    warehouseId: WAREHOUSES.B1,
    ownerType: 'customer',
    ownerId: OWNERS.B1,
    effectStart: '2025-12-01',
    effectEnd: '2026-12-31',
    rentFreeDays: 0,
    billingPeriod: 'daily',
    settlementMode: 'monthly',
    insuranceRequired: false,
    lines: [
      { feeTypeId: FEE_TYPES.storage, billingMode: 'normal', billingBasis: 'stock_qty', unitPrice: 200 },
      { feeTypeId: FEE_TYPES.loading, billingMode: 'fixed_price', fixedAmount: 50000 },
    ],
  })
  assert.equal(billing.status, 201)
  const billingBody = await billing.json()
  const audited = await ctx.api(opsBToken, 'POST', `/api/quotes/${billingBody.id}/audit`)
  assert.equal(audited.status, 200)
  ctx.state.billing = billingBody
})

test('权限边界：仓储运营无 job:run 被拒绝 PERMISSION_DENIED', async () => {
  const denied = await runJob(opsToken, 'daily-billing', '2026-02-15')
  assert.equal(denied.status, 403)
  assert.equal(denied.body.error.code, 'PERMISSION_DENIED')
})

test('按天计费：仅超出免租期且在效期内的生效合同产出明细（AC-04）', async () => {
  const run = await runJob(financeToken, 'daily-billing', '2026-02-15')
  assert.equal(run.status, 200)
  assert.equal(run.body.status, 'success')
  assert.equal(run.body.targetDate, '2026-02-15')
  // 仅合同②两行明细生成
  assert.equal(run.body.generatedCount, 2)
  assert.equal(run.body.errors.length, 0)
  assert.ok(run.body.jobRunId)

  const list = await ctx.api(financeBToken, 'GET', '/api/receivables?periodStart=2026-02-15&periodEnd=2026-02-15&pageSize=50')
  assert.equal(list.status, 200)
  const body = await list.json()
  assert.equal(body.total, 2)
  for (const item of body.items) {
    assert.equal(item.orgId, ORGS.B)
    assert.equal(item.warehouseId, WAREHOUSES.B1)
    assert.equal(item.ownerId, OWNERS.B1)
    assert.equal(item.status, 'draft')
  }
  const normalLine = body.items.find((item) => item.billingMode === 'normal')
  const fixedLine = body.items.find((item) => item.billingMode === 'fixed_price')
  // 普通模式：业务量 300 × 单价 200 分 = 60000 分
  assert.equal(normalLine.businessQty, MEASURE_B1.stockQty)
  assert.equal(normalLine.rawAmount, 60000)
  assert.equal(normalLine.finalAmount, 60000)
  // 一口价：直接取金额 50000 分，不受业务量影响
  assert.equal(fixedLine.businessQty, null)
  assert.equal(fixedLine.finalAmount, 50000)
})

test('job_runs 防重：同 (job_type, target_date) 已成功则跳过', async () => {
  const first = await runJob(financeToken, 'daily-billing', '2026-02-15')
  assert.equal(first.body.status, 'skipped')
  assert.equal(first.body.generatedCount, 2)
  assert.equal(first.body.jobRunId, (await runJob(financeToken, 'daily-billing', '2026-02-15')).body.jobRunId)

  // 明细未重复生成（ORG-B 财务按所属组织查询）
  const list = await ctx.api(financeBToken, 'GET', '/api/receivables?periodStart=2026-02-15&periodEnd=2026-02-15&pageSize=50')
  assert.equal((await list.json()).total, 2)
})

test('合同过期检测：到期生效合同被标记已终止，未到期与暂存不受影响（AC-04）', async () => {
  const run = await runJob(financeToken, 'contract-expiry', '2026-02-15')
  assert.equal(run.status, 200)
  assert.equal(run.body.status, 'success')
  assert.ok(run.body.affectedCount >= 2)

  const expired = await ctx.api(opsToken, 'GET', `/api/quotes/${ctx.state.expired.id}`)
  assert.equal((await expired.json()).status, 'terminated')
  const due = await ctx.api(opsToken, 'GET', `/api/quotes/${ctx.state.due.id}`)
  assert.equal((await due.json()).status, 'terminated')

  const inRentFree = await ctx.api(opsToken, 'GET', `/api/quotes/${ctx.state.inRentFree.id}`)
  assert.equal((await inRentFree.json()).status, 'effective')
  const draft = await ctx.api(opsToken, 'GET', `/api/quotes/${ctx.state.draft.id}`)
  assert.equal((await draft.json()).status, 'draft')

  // 过期检测防重
  const again = await runJob(financeToken, 'contract-expiry', '2026-02-15')
  assert.equal(again.body.status, 'skipped')
})

test('按月计费：账期过滤仅月度合同，月度口径取任务时点库存快照（AC-02/AC-04）', async () => {
  const monthly = await ctx.api(opsToken, 'POST', '/api/quotes', quotePayload({
    effectStart: '2026-08-01',
    effectEnd: '2026-12-31',
    billingPeriod: 'monthly',
    rentFreeDays: 0,
    lines: [{ feeTypeId: FEE_TYPES.operation, billingMode: 'normal', billingBasis: 'volume', unitPrice: 100 }],
  }))
  assert.equal(monthly.status, 201)
  const monthlyBody = await monthly.json()
  const audit = await ctx.api(opsToken, 'POST', `/api/quotes/${monthlyBody.id}/audit`)
  assert.equal(audit.status, 200)

  const run = await runJob(financeToken, 'monthly-billing', '2026-09-30')
  assert.equal(run.status, 200)
  assert.equal(run.body.status, 'success')
  // ②为日账期合同，不参与月度任务；仅月度合同 1 行明细
  assert.equal(run.body.generatedCount, 1)

  const list = await ctx.api(financeToken, 'GET', '/api/receivables?periodStart=2026-09-30&periodEnd=2026-09-30&pageSize=50')
  const body = await list.json()
  assert.equal(body.total, 1)
  const item = body.items[0]
  assert.equal(item.orgId, ORGS.A)
  // 月度口径（实现前固定策略：任务执行时点库存快照聚合）：总体积 370 × 100 分
  assert.equal(item.businessQty, MEASURE_A2.volume)
  assert.equal(item.finalAmount, 37000)
})

test('库存缺失：记录 job_runs 异常并写入站内通知提醒仓储运营（AC-04 异常场景）', async () => {
  // ORG-B 新增无库存货主，构造库存缺失场景
  await ctx.platform.db.run({
    text: 'INSERT INTO owners (id, org_id, owner_type, code, name) VALUES (?, ?, ?, ?, ?)',
    params: ['OWN-B2', ORGS.B, 'customer', 'OWN-B2', '空库存货主（测试）'],
  })
  const missing = await ctx.api(opsBToken, 'POST', '/api/quotes', {
    contractId: CONTRACTS.B1,
    orgId: ORGS.B,
    warehouseId: WAREHOUSES.B1,
    ownerType: 'customer',
    ownerId: 'OWN-B2',
    effectStart: '2026-02-01',
    effectEnd: '2026-06-30',
    rentFreeDays: 0,
    billingPeriod: 'daily',
    settlementMode: 'monthly',
    insuranceRequired: false,
    lines: [{ feeTypeId: FEE_TYPES.storage, billingMode: 'normal', billingBasis: 'stock_qty', unitPrice: 100 }],
  })
  assert.equal(missing.status, 201)
  const missingBody = await missing.json()
  const audit = await ctx.api(opsBToken, 'POST', `/api/quotes/${missingBody.id}/audit`)
  assert.equal(audit.status, 200)

  const run = await runJob(financeToken, 'daily-billing', '2026-03-01')
  assert.equal(run.status, 200)
  assert.equal(run.body.status, 'failed')
  assert.equal(run.body.failedCount, 1)
  assert.equal(run.body.errors[0].orgId, ORGS.B)
  assert.equal(run.body.errors[0].warehouseId, WAREHOUSES.B1)
  assert.equal(run.body.errors[0].ownerId, 'OWN-B2')

  // 通知写入：ORG-B 仓储运营收到库存缺失提醒
  const notification = await ctx.platform.db.queryOne({
    text: `SELECT n.content FROM notifications n JOIN users u ON u.id = n.user_id
           WHERE n.source_run_id = ? AND u.email = ?`,
    params: [run.body.jobRunId, 'ops-b@kwms.local'],
  })
  assert.ok(notification, '未写入库存缺失通知')
  assert.ok(notification.content.includes('库存数据缺失'))
})

test('失败任务允许重跑（防重仅针对成功执行）', async () => {
  const run = await runJob(financeToken, 'daily-billing', '2026-03-01')
  assert.equal(run.status, 200)
  assert.notEqual(run.body.status, 'skipped')
})

test('执行记录查询：job:view 按 type 过滤并返回执行摘要（AC-04）', async () => {
  const response = await ctx.api(financeToken, 'GET', '/api/jobs/runs?type=daily-billing&page=1&pageSize=10')
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.ok(body.items.length >= 2)
  for (const item of body.items) {
    assert.equal(item.jobType, 'daily-billing')
    assert.equal(typeof item.targetDate, 'string')
    assert.equal(typeof item.status, 'string')
  }
  assert.ok(body.items.some((item) => item.status === 'failed' && item.errorMessage))

  // 仓储运营可查看执行记录（job:view）
  const opsView = await ctx.api(opsToken, 'GET', '/api/jobs/runs')
  assert.equal(opsView.status, 200)

  // 客户经理查看执行记录
  const managerToken = (await ctx.login('manager@kwms.local', 'Manager@12345')).token
  const managerView = await ctx.api(managerToken, 'GET', '/api/jobs/runs')
  assert.equal(managerView.status, 200)
})

test('任务类型不存在返回 400', async () => {
  const response = await ctx.api(financeToken, 'POST', '/api/jobs/unknown-job/run', {})
  assert.equal(response.status, 400)
})
