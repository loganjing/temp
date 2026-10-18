// 报价单 API 测试：保存校验逐条拦截（AC-01）、单据编码格式、状态流转约束、修改前后快照日志。
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createKwmsApp, FEE_TYPES, GOODS_CATEGORIES, ORGS, OWNERS, WAREHOUSES, CONTRACTS } from './helpers/kwms-app.mjs'

let ctx
let opsToken
let financeToken

const baseQuote = {
  contractId: CONTRACTS.A1,
  orgId: ORGS.A,
  warehouseId: WAREHOUSES.A1,
  ownerType: 'customer',
  ownerId: OWNERS.A2,
  effectStart: '2026-01-01',
  effectEnd: '2026-12-31',
  rentFreeDays: 0,
  billingPeriod: 'daily',
  settlementMode: 'monthly',
  insuranceRequired: false,
  remark: '集成测试报价单',
  lines: [
    { feeTypeId: FEE_TYPES.storage, billingMode: 'normal', billingBasis: 'stock_qty', goodsCategoryId: null, unitPrice: 100, minCharge: null, fixedAmount: null, discounts: [] },
  ],
}

async function createQuote(token, overrides = {}) {
  const payload = { ...baseQuote, ...overrides }
  if (overrides.lines !== undefined) payload.lines = overrides.lines
  const response = await ctx.api(token, 'POST', '/api/quotes', payload)
  return { status: response.status, body: await response.json() }
}

before(async () => {
  ctx = await createKwmsApp()
  opsToken = (await ctx.login('ops@kwms.local', 'Ops@12345')).token
  financeToken = (await ctx.login('finance@kwms.local', 'Finance@12345')).token
})

after(async () => {
  await ctx.cleanup()
})

test('未认证访问业务 API 返回 401 UNAUTHENTICATED', async () => {
  const response = await ctx.api(null, 'GET', '/api/quotes')
  assert.equal(response.status, 401)
  assert.equal((await response.json()).error.code, 'UNAUTHENTICATED')
})

test('登录凭证错误返回 401 UNAUTHENTICATED', async () => {
  const response = await ctx.app.fetch(new Request('http://local/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'ops@kwms.local', password: 'wrong-password' }),
  }))
  assert.equal(response.status, 401)
  assert.equal((await response.json()).error.code, 'UNAUTHENTICATED')
})

test('保存成功：单据编号格式 CCHT-YYYYMMDD-NNNNN，默认暂存状态', async () => {
  const { status, body } = await createQuote(opsToken)
  assert.equal(status, 201)
  assert.equal(body.status, 'draft')
  assert.match(body.billNo, /^CCHT-\d{8}-\d{5}$/)
  assert.equal(body.orgId, ORGS.A)
  assert.equal(body.contractNo, 'HT-2026-A001')
  assert.equal(body.lines.length, 1)
  assert.equal(body.lines[0].unitPrice, 100)
  // 第二张同日单据流水号自增
  const second = await createQuote(opsToken, { contractId: CONTRACTS.A2, effectStart: '2027-01-01', effectEnd: '2027-12-31' })
  assert.equal(second.status, 201)
  const [prefix, date, seq] = second.body.billNo.split('-')
  assert.equal(prefix, 'CCHT')
  assert.equal(seq.length, 5)
  assert.notEqual(second.body.billNo, body.billNo)
})

test('必填缺失被拦截：VALIDATION_REQUIRED', async () => {
  const { status, body } = await createQuote(opsToken, { effectEnd: undefined })
  assert.equal(status, 400)
  assert.equal(body.error.code, 'VALIDATION_REQUIRED')
  assert.equal(body.error.field, 'effectEnd')
})

test('合同开始日期不早于结束日期被拦截：VALIDATION_DATE_ORDER', async () => {
  const { status, body } = await createQuote(opsToken, { effectStart: '2026-12-31', effectEnd: '2026-01-01' })
  assert.equal(status, 400)
  assert.equal(body.error.code, 'VALIDATION_DATE_ORDER')
  assert.equal(body.error.field, 'effectStart')
})

test('免租期结束日晚于合同结束日被拦截：VALIDATION_FREE_RENT_END', async () => {
  const { status, body } = await createQuote(opsToken, { effectStart: '2026-12-01', effectEnd: '2026-12-10', rentFreeDays: 15 })
  assert.equal(status, 400)
  assert.equal(body.error.code, 'VALIDATION_FREE_RENT_END')
})

test('同单内两条同费用类型+同货品类别明细被拦截：VALIDATION_DUPLICATE_LINE', async () => {
  const { status, body } = await createQuote(opsToken, {
    lines: [
      { feeTypeId: FEE_TYPES.storage, billingMode: 'normal', billingBasis: 'stock_qty', unitPrice: 100 },
      { feeTypeId: FEE_TYPES.storage, billingMode: 'normal', billingBasis: 'locations', unitPrice: 50 },
    ],
  })
  assert.equal(status, 400)
  assert.equal(body.error.code, 'VALIDATION_DUPLICATE_LINE')
})

test('分段优惠区间断层被拦截：VALIDATION_DISCOUNT_OVERLAP', async () => {
  const { status, body } = await createQuote(opsToken, {
    lines: [{
      feeTypeId: FEE_TYPES.storage,
      billingMode: 'normal',
      billingBasis: 'stock_qty',
      unitPrice: 100,
      discounts: [
        { lowerLimit: 0, upperLimit: 100, discountMode: 'percent', percentValue: 5 },
        { lowerLimit: 200, upperLimit: 1000, discountMode: 'percent', percentValue: 10 },
      ],
    }],
  })
  assert.equal(status, 400)
  assert.equal(body.error.code, 'VALIDATION_DISCOUNT_OVERLAP')
})

test('分段优惠区间重叠被拦截：VALIDATION_DISCOUNT_OVERLAP', async () => {
  const { status, body } = await createQuote(opsToken, {
    lines: [{
      feeTypeId: FEE_TYPES.storage,
      billingMode: 'normal',
      billingBasis: 'stock_qty',
      unitPrice: 100,
      discounts: [
        { lowerLimit: 0, upperLimit: 200, discountMode: 'percent', percentValue: 5 },
        { lowerLimit: 100, upperLimit: 1000, discountMode: 'percent', percentValue: 10 },
      ],
    }],
  })
  assert.equal(status, 400)
  assert.equal(body.error.code, 'VALIDATION_DISCOUNT_OVERLAP')
})

test('优惠百分比超 100 被拦截：VALIDATION_AMOUNT_EXCEED', async () => {
  const { status, body } = await createQuote(opsToken, {
    lines: [{
      feeTypeId: FEE_TYPES.storage,
      billingMode: 'normal',
      billingBasis: 'stock_qty',
      unitPrice: 100,
      discounts: [{ lowerLimit: 0, upperLimit: 1000, discountMode: 'percent', percentValue: 150 }],
    }],
  })
  assert.equal(status, 400)
  assert.equal(body.error.code, 'VALIDATION_AMOUNT_EXCEED')
})

test('负数单价被拦截：VALIDATION_NEGATIVE', async () => {
  const { status, body } = await createQuote(opsToken, {
    lines: [{ feeTypeId: FEE_TYPES.storage, billingMode: 'normal', billingBasis: 'stock_qty', unitPrice: -100 }],
  })
  assert.equal(status, 400)
  assert.equal(body.error.code, 'VALIDATION_NEGATIVE')
  assert.equal(body.error.field, 'lines[0].unitPrice')
})

test('一口价模式传入单价被拦截（单价锁定置灰的服务端复验）', async () => {
  const { status, body } = await createQuote(opsToken, {
    lines: [{ feeTypeId: FEE_TYPES.loading, billingMode: 'fixed_price', unitPrice: 100, fixedAmount: 5000 }],
  })
  assert.equal(status, 400)
  assert.equal(body.error.field, 'lines[0].unitPrice')
})

test('普通模式缺少计费方式被拦截：VALIDATION_REQUIRED', async () => {
  const { status, body } = await createQuote(opsToken, {
    lines: [{ feeTypeId: FEE_TYPES.storage, billingMode: 'normal', unitPrice: 100 }],
  })
  assert.equal(status, 400)
  assert.equal(body.error.code, 'VALIDATION_REQUIRED')
  assert.equal(body.error.field, 'lines[0].billingBasis')
})

test('免租期取值超出 0/7/15/30 被拦截', async () => {
  const { status, body } = await createQuote(opsToken, { rentFreeDays: 5 })
  assert.equal(status, 400)
  assert.equal(body.error.field, 'rentFreeDays')
})

test('组织隔离：为非所属组织创建报价单被拦截 ORG_FORBIDDEN', async () => {
  const { status, body } = await createQuote(opsToken, { orgId: ORGS.B, warehouseId: WAREHOUSES.B1, ownerId: OWNERS.B1 })
  assert.equal(status, 403)
  assert.equal(body.error.code, 'ORG_FORBIDDEN')
})

test('审核角色边界：仓储运营无 quote:audit 被拒绝 PERMISSION_DENIED；授予 auditor 后审核生效', async () => {
  const created = await createQuote(opsToken, { effectStart: '2028-01-01', effectEnd: '2028-12-31' })
  assert.equal(created.status, 201)
  const quoteId = created.body.id

  const denied = await ctx.api(opsToken, 'POST', `/api/quotes/${quoteId}/audit`)
  assert.equal(denied.status, 403)
  assert.equal((await denied.json()).error.code, 'PERMISSION_DENIED')

  // quote:audit 默认不绑定任何角色（需求未决事项 3）；系统管理员经角色配置授予 auditor 角色后流程贯通
  await ctx.grantRole('ops@kwms.local', 'auditor')
  const approved = await ctx.api(opsToken, 'POST', `/api/quotes/${quoteId}/audit`)
  assert.equal(approved.status, 200)
  const approvedBody = await approved.json()
  assert.equal(approvedBody.status, 'effective')

  // 重复审核幂等返回 200
  const again = await ctx.api(opsToken, 'POST', `/api/quotes/${quoteId}/audit`)
  assert.equal(again.status, 200)
  assert.equal((await again.json()).status, 'effective')

  // 已生效单据不可修改计费规则：INVALID_STATUS
  const editDenied = await ctx.api(opsToken, 'PUT', `/api/quotes/${quoteId}`, { ...baseQuote, effectStart: '2028-01-01', effectEnd: '2028-12-31' })
  assert.equal(editDenied.status, 409)
  assert.equal((await editDenied.json()).error.code, 'INVALID_STATUS')

  ctx.state = ctx.state ?? {}
  ctx.state.effectiveQuoteId = quoteId
})

test('暂存单据可编辑且写修改前后快照 change_logs', async () => {
  const created = await createQuote(opsToken, { effectStart: '2029-01-01', effectEnd: '2029-12-31', lines: [{ feeTypeId: FEE_TYPES.operation, billingMode: 'normal', billingBasis: 'stock_qty', unitPrice: 300, minCharge: 5000 }] })
  const quoteId = created.body.id

  const edited = await ctx.api(opsToken, 'PUT', `/api/quotes/${quoteId}`, {
    ...baseQuote,
    effectStart: '2029-01-01',
    effectEnd: '2029-12-31',
    lines: [{ feeTypeId: FEE_TYPES.operation, billingMode: 'normal', billingBasis: 'stock_qty', unitPrice: 800, minCharge: 9000 }],
  })
  assert.equal(edited.status, 200)
  const editedBody = await edited.json()
  assert.equal(editedBody.lines[0].unitPrice, 800)

  // 修改日志含前后单价与计费规则快照（审计查询权限属财务，技术契约第 12 节 audit:view）
  const logs = await ctx.api(financeToken, 'GET', `/api/audit/change-logs?entityType=quote&entityId=${quoteId}`)
  assert.equal(logs.status, 200)
  const logBody = await logs.json()
  assert.ok(logBody.items.length >= 1)
  const entry = logBody.items.find((item) => item.changeType === '编辑')
  assert.ok(entry, '缺少编辑类型 change_log')
  assert.equal(entry.before.lines[0].unitPrice, 300)
  assert.equal(entry.after.lines[0].unitPrice, 800)
  assert.equal(entry.operatorName, '仓储运营-安晴')
  assert.ok(entry.operatedAt)
})

test('终止流转：暂存不可终止；生效可终止；重复终止幂等；已终止不可审核', async () => {
  const draft = await createQuote(opsToken, { effectStart: '2030-01-01', effectEnd: '2030-12-31' })
  const draftDenied = await ctx.api(opsToken, 'POST', `/api/quotes/${draft.body.id}/terminate`)
  assert.equal(draftDenied.status, 409)

  const effectiveId = ctx.state.effectiveQuoteId
  const terminated = await ctx.api(opsToken, 'POST', `/api/quotes/${effectiveId}/terminate`)
  assert.equal(terminated.status, 200)
  assert.equal((await terminated.json()).status, 'terminated')

  const again = await ctx.api(opsToken, 'POST', `/api/quotes/${effectiveId}/terminate`)
  assert.equal(again.status, 200)
  assert.equal((await again.json()).status, 'terminated')

  const auditDenied = await ctx.api(opsToken, 'POST', `/api/quotes/${effectiveId}/audit`)
  assert.equal(auditDenied.status, 409)
  assert.equal((await auditDenied.json()).error.code, 'INVALID_STATUS')
})

test('同货主、仓库、周期多份生效合同被拦截：CONTRACT_CONFLICT', async () => {
  // 与 ctx.state.effectiveQuoteId（2028 年效期已终止）不重叠的新合同先审核生效
  const first = await createQuote(opsToken, { effectStart: '2031-01-01', effectEnd: '2031-06-30' })
  await ctx.api(opsToken, 'POST', `/api/quotes/${first.body.id}/audit`)

  // 同货主/仓库/效期重叠的第二份合同保存被拦截，提示终止旧合同
  const conflict = await createQuote(opsToken, { contractId: CONTRACTS.A2, effectStart: '2031-03-01', effectEnd: '2031-12-31' })
  assert.equal(conflict.status, 409)
  assert.equal(conflict.body.error.code, 'CONTRACT_CONFLICT')

  // 已生效合同的同费用类型明细在另一份重叠合同中同样被拦截
  const duplicate = await createQuote(opsToken, { effectStart: '2031-03-01', effectEnd: '2031-12-31', lines: [{ feeTypeId: FEE_TYPES.loading, billingMode: 'fixed_price', fixedAmount: 1000 }] })
  assert.equal(duplicate.status, 409)
  assert.equal(duplicate.body.error.code, 'CONTRACT_CONFLICT')
})

test('不同货品类别不构成明细重复：可保存同费用类型两条明细', async () => {
  const { status } = await createQuote(opsToken, {
    effectStart: '2032-01-01',
    effectEnd: '2032-12-31',
    lines: [
      { feeTypeId: FEE_TYPES.storage, billingMode: 'normal', billingBasis: 'stock_qty', goodsCategoryId: GOODS_CATEGORIES.general, unitPrice: 100 },
      { feeTypeId: FEE_TYPES.storage, billingMode: 'normal', billingBasis: 'stock_qty', goodsCategoryId: GOODS_CATEGORIES.hazardous, unitPrice: 200 },
    ],
  })
  assert.equal(status, 201)
})

test('引用校验：仓库不属于组织、货主类型不符、费用类型不存在均被拦截', async () => {
  const wrongWarehouse = await createQuote(opsToken, { warehouseId: WAREHOUSES.B1 })
  assert.equal(wrongWarehouse.status, 400)

  const wrongOwnerType = await createQuote(opsToken, { ownerType: 'business', ownerId: OWNERS.A2 })
  assert.equal(wrongOwnerType.status, 400)

  const wrongFeeType = await createQuote(opsToken, { lines: [{ feeTypeId: 'FT-NONE', billingMode: 'normal', billingBasis: 'stock_qty', unitPrice: 100 }] })
  assert.equal(wrongFeeType.status, 404)
})

test('详情与列表查询：分页结构与只读字段', async () => {
  const list = await ctx.api(opsToken, 'GET', '/api/quotes?status=draft&page=1&pageSize=10')
  assert.equal(list.status, 200)
  const listBody = await list.json()
  assert.ok(Array.isArray(listBody.items))
  assert.equal(typeof listBody.total, 'number')
  assert.equal(listBody.page, 1)
  assert.equal(listBody.pageSize, 10)

  if (listBody.items.length > 0) {
    const detail = await ctx.api(opsToken, 'GET', `/api/quotes/${listBody.items[0].id}`)
    assert.equal(detail.status, 200)
    const detailBody = await detail.json()
    assert.ok(Array.isArray(detailBody.lines))
    assert.equal(detailBody.id, listBody.items[0].id)
  }

  const missing = await ctx.api(opsToken, 'GET', '/api/quotes/00000000-0000-0000-0000-000000000000')
  assert.equal(missing.status, 404)
  assert.equal((await missing.json()).error.code, 'NOT_FOUND')
})
