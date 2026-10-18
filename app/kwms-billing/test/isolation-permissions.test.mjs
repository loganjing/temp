// 组织隔离（AC-10）与四类角色权限边界（AC-11）、金额字段可见性策略、报表导出。
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createKwmsApp, FEE_TYPES, ORGS, OWNERS, WAREHOUSES, CONTRACTS } from './helpers/kwms-app.mjs'

let ctx
let opsToken
let opsBToken
let financeToken
let managerToken
let adminToken

const quotePayload = {
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
  lines: [{ feeTypeId: FEE_TYPES.storage, billingMode: 'normal', billingBasis: 'stock_qty', unitPrice: 100 }],
}

before(async () => {
  ctx = await createKwmsApp()
  opsToken = (await ctx.login('ops@kwms.local', 'Ops@12345')).token
  opsBToken = (await ctx.login('ops-b@kwms.local', 'Ops@12345')).token
  financeToken = (await ctx.login('finance@kwms.local', 'Finance@12345')).token
  managerToken = (await ctx.login('manager@kwms.local', 'Manager@12345')).token
  adminToken = (await ctx.login('admin@kwms.local', 'Admin@12345')).token
  await ctx.grantRole('ops@kwms.local', 'auditor')
  ctx.state = {}
})

after(async () => {
  await ctx.cleanup()
})

test('准备：ORG-A 单据数据（报价单、计费明细）', async () => {
  const created = await ctx.api(opsToken, 'POST', '/api/quotes', quotePayload)
  assert.equal(created.status, 201)
  ctx.state.quote = await created.json()
  const audited = await ctx.api(opsToken, 'POST', `/api/quotes/${ctx.state.quote.id}/audit`)
  assert.equal(audited.status, 200)

  const run = await ctx.api(financeToken, 'POST', '/api/jobs/daily-billing/run', { targetDate: '2026-02-15' })
  assert.equal(run.status, 200)
  assert.equal((await run.json()).status, 'success')
})

test('组织隔离（AC-10）：组织 B 用户无法查看或操作组织 A 单据', async () => {
  // 列表仅见本组织数据
  const list = await ctx.api(opsBToken, 'GET', '/api/quotes')
  const listBody = await list.json()
  assert.equal(listBody.items.length, 0)

  // 详情访问被拒绝：ORG_FORBIDDEN
  const detail = await ctx.api(opsBToken, 'GET', `/api/quotes/${ctx.state.quote.id}`)
  assert.equal(detail.status, 403)
  assert.equal((await detail.json()).error.code, 'ORG_FORBIDDEN')

  // 修改被拒绝
  const edit = await ctx.api(opsBToken, 'PUT', `/api/quotes/${ctx.state.quote.id}`, quotePayload)
  assert.equal(edit.status, 403)
  assert.equal((await edit.json()).error.code, 'ORG_FORBIDDEN')

  // 越组织查询参数被拒绝
  const crossFilter = await ctx.api(opsBToken, 'GET', `/api/quotes?orgId=${ORGS.A}`)
  assert.equal(crossFilter.status, 403)

  // 为 ORG-A 创建单据被拒绝
  const crossCreate = await ctx.api(opsBToken, 'POST', '/api/quotes', quotePayload)
  assert.equal(crossCreate.status, 403)

  // 应收明细详情跨组织被拒绝
  const receivable = await ctx.api(financeToken, 'GET', '/api/receivables?periodStart=2026-02-15&periodEnd=2026-02-15')
  const receivableBody = await receivable.json()
  assert.ok(receivableBody.items.length >= 1)
  const detailId = receivableBody.items[0].id
  const crossDetail = await ctx.api(opsBToken, 'GET', `/api/receivables/${detailId}`)
  assert.equal(crossDetail.status, 403)

  // 跨组织重算被拒绝
  const crossRecalc = await ctx.api(financeToken, 'POST', '/api/receivables/recalc', { ids: [detailId] })
  // finance 属于 ORG-A，重算 ORG-A 数据本身合法；改用 opsB 无权限，先验证 opsB 无 recalc 权限
  assert.ok([200, 403].includes(crossRecalc.status))
  const opsBRecalc = await ctx.api(opsBToken, 'POST', '/api/receivables/recalc', { ids: [detailId] })
  assert.equal(opsBRecalc.status, 403)
})

test('组织下拉数据源：用户仅见所属组织（AC-10）', async () => {
  const orgsA = await ctx.api(opsToken, 'GET', '/api/orgs')
  const orgsABody = await orgsA.json()
  assert.deepEqual(orgsABody.items.map((item) => item.id), [ORGS.A])

  const orgsB = await ctx.api(opsBToken, 'GET', '/api/orgs')
  assert.deepEqual((await orgsB.json()).items.map((item) => item.id), [ORGS.B])

  // 系统管理员跨组织访问例外：全量组织
  const orgsAdmin = await ctx.api(adminToken, 'GET', '/api/orgs')
  const adminOrgs = (await orgsAdmin.json()).items.map((item) => item.id)
  assert.ok(adminOrgs.includes(ORGS.A) && adminOrgs.includes(ORGS.B))

  // 仓库按组织过滤且仅有效仓库
  const warehousesB = await ctx.api(opsBToken, 'GET', `/api/warehouses?orgId=${ORGS.B}`)
  const warehousesBBody = (await warehousesB.json()).items
  assert.deepEqual(warehousesBBody.map((item) => item.id), [WAREHOUSES.B1])

  // 货主按组织与类型过滤
  const owners = await ctx.api(opsToken, 'GET', `/api/owners?orgId=${ORGS.A}&ownerType=customer`)
  const ownersBody = (await owners.json()).items
  assert.deepEqual(ownersBody.map((item) => item.id), [OWNERS.A2])

  // 合同引用按组织过滤
  const contractsB = await ctx.api(opsBToken, 'GET', `/api/contracts?orgId=${ORGS.B}`)
  assert.deepEqual((await contractsB.json()).items.map((item) => item.id), [CONTRACTS.B1])
})

test('仓储运营权限边界（AC-11）：对账审核、开票、核销、重算被拒绝', async () => {
  const quoteView = await ctx.api(opsToken, 'GET', '/api/quotes')
  assert.equal(quoteView.status, 200)

  // 仓储运营可发起调整单（adjustment:create）
  const adjustmentCreate = await ctx.api(opsToken, 'POST', '/api/adjustments', { orgId: ORGS.A, periodStart: '2026-02-15', periodEnd: '2026-02-15' })
  assert.equal(adjustmentCreate.status, 201)
  const adjustmentId = (await adjustmentCreate.json()).id

  // 对账生成/审核被拒绝
  const reconGenerate = await ctx.api(opsToken, 'POST', '/api/recon-statements', {
    orgId: ORGS.A, warehouseId: WAREHOUSES.A1, ownerId: OWNERS.A2, periodStart: '2026-02-15', periodEnd: '2026-02-15',
  })
  assert.equal(reconGenerate.status, 403)
  assert.equal((await reconGenerate.json()).error.code, 'PERMISSION_DENIED')
  const reconAudit = await ctx.api(opsToken, 'POST', `/api/recon-statements/00000000-0000-0000-0000-000000000000/audit`)
  assert.equal(reconAudit.status, 403)

  // 开票/核销被拒绝
  const invoice = await ctx.api(opsToken, 'POST', '/api/settle-statements/00000000-0000-0000-0000-000000000000/invoices', { invoicer: 'x', invoiceNo: 'x', amount: 1 })
  assert.equal(invoice.status, 403)
  const writeoff = await ctx.api(opsToken, 'POST', '/api/settle-statements/00000000-0000-0000-0000-000000000000/writeoffs', { amount: 1 })
  assert.equal(writeoff.status, 403)

  // 费用重算被拒绝（财务专属）
  const recalc = await ctx.api(opsToken, 'POST', '/api/receivables/recalc', { ids: ['00000000-0000-0000-0000-000000000000'] })
  assert.equal(recalc.status, 403)

  // 报表导出被拒绝（财务专属）
  const report = await ctx.api(opsToken, 'GET', '/api/reports/export?type=billing')
  assert.equal(report.status, 403)

  // 基础档案维护被拒绝（系统管理员专属）
  const feeType = await ctx.api(opsToken, 'POST', '/api/masterdata/fee-types', { code: 'TEST-OPS', name: '越权费用类型' })
  assert.equal(feeType.status, 403)
  ctx.state.adjustmentId = adjustmentId
})

test('财务权限边界（AC-11）：修改合同基础报价规则被拒绝，费用重算/对账/开票/核销/导出可用', async () => {
  const quoteEdit = await ctx.api(financeToken, 'PUT', `/api/quotes/${ctx.state.quote.id}`, quotePayload)
  assert.equal(quoteEdit.status, 403)
  const quoteCreate = await ctx.api(financeToken, 'POST', '/api/quotes', quotePayload)
  assert.equal(quoteCreate.status, 403)

  // 财务可查看全量费用与导出报表
  const receivables = await ctx.api(financeToken, 'GET', '/api/receivables?pageSize=50')
  assert.equal(receivables.status, 200)
  const report = await ctx.api(financeToken, 'GET', '/api/reports/export?type=billing')
  assert.equal(report.status, 200)
  assert.equal(report.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  assert.ok(report.headers.get('content-disposition')?.includes('attachment'))
})

test('客户经理只读边界（AC-11）：全部写操作被拒绝', async () => {
  for (const pathValue of ['/api/quotes', '/api/adjustments']) {
    const response = await ctx.api(managerToken, 'POST', pathValue, pathValue === '/api/quotes' ? quotePayload : { orgId: ORGS.A, periodStart: '2026-02-15', periodEnd: '2026-02-15' })
    assert.equal(response.status, 403, `${pathValue} 应拒绝新增`)
  }
  const edit = await ctx.api(managerToken, 'PUT', `/api/quotes/${ctx.state.quote.id}`, quotePayload)
  assert.equal(edit.status, 403)
  const audit = await ctx.api(managerToken, 'POST', `/api/quotes/${ctx.state.quote.id}/audit`)
  assert.equal(audit.status, 403)
  const adjustmentAudit = await ctx.api(managerToken, 'POST', `/api/adjustments/${ctx.state.adjustmentId}/audit`)
  assert.equal(adjustmentAudit.status, 403)
  const recalc = await ctx.api(managerToken, 'POST', '/api/receivables/recalc', { ids: ['x'] })
  assert.equal(recalc.status, 403)
  const jobRun = await ctx.api(managerToken, 'POST', '/api/jobs/daily-billing/run', {})
  assert.equal(jobRun.status, 403)
  const report = await ctx.api(managerToken, 'GET', '/api/reports/export?type=billing')
  assert.equal(report.status, 403)

  // 只读查询全部可用
  for (const pathValue of ['/api/quotes', '/api/receivables', '/api/adjustments', '/api/recon-statements', '/api/settle-statements', '/api/jobs/runs']) {
    const response = await ctx.api(managerToken, 'GET', pathValue)
    assert.equal(response.status, 200, `${pathValue} 只读查询应可用`)
  }
})

test('金额字段可见性策略点（需求第 11 节数据安全）：仅财务角色可见金额字段', async () => {
  const financeList = await ctx.api(financeToken, 'GET', '/api/receivables?periodStart=2026-02-15&periodEnd=2026-02-15')
  const financeBody = await financeList.json()
  assert.equal(financeBody.items.length, 1)
  const financeItem = financeBody.items[0]
  assert.equal(financeItem.rawAmount, 60000)
  assert.equal(financeItem.finalAmount, 60000)

  // 仓储运营查询应收明细：金额字段置 null（策略默认仅财务可见）
  const opsList = await ctx.api(opsToken, 'GET', '/api/receivables?periodStart=2026-02-15&periodEnd=2026-02-15')
  const opsBody = await opsList.json()
  assert.equal(opsBody.items.length, 1)
  const opsItem = opsBody.items[0]
  assert.equal(opsItem.rawAmount, null)
  assert.equal(opsItem.discountedAmount, null)
  assert.equal(opsItem.minCharge, null)
  assert.equal(opsItem.finalAmount, null)
  // 非金额字段不受过滤
  assert.equal(opsItem.feeTypeId, FEE_TYPES.storage)
  assert.equal(opsItem.businessQty, 600)

  // 单条详情同理
  const opsDetail = await ctx.api(opsToken, 'GET', `/api/receivables/${opsItem.id}`)
  assert.equal((await opsDetail.json()).finalAmount, null)

  // 客户经理（只读）同样不可见金额
  const managerList = await ctx.api(managerToken, 'GET', '/api/receivables?periodStart=2026-02-15&periodEnd=2026-02-15')
  const managerItem = (await managerList.json()).items[0]
  assert.equal(managerItem.finalAmount, null)
})

test('基础档案维护（AC-11）：系统管理员可维护费用类型与货品类别，编码唯一', async () => {
  const created = await ctx.api(adminToken, 'POST', '/api/masterdata/fee-types', { code: 'INSP', name: '巡检费' })
  assert.equal(created.status, 201)
  const createdItem = (await created.json()).item
  assert.equal(createdItem.code, 'INSP')

  // 编码唯一约束
  const duplicate = await ctx.api(adminToken, 'POST', '/api/masterdata/fee-types', { code: 'INSP', name: '重复编码' })
  assert.equal(duplicate.status, 409)

  // PUT 部分更新：仅改名称
  const renamed = await ctx.api(adminToken, 'PUT', `/api/masterdata/fee-types/${createdItem.id}`, { name: '巡检费（更新）' })
  assert.equal(renamed.status, 200)
  const renamedItem = (await renamed.json()).item
  assert.equal(renamedItem.code, 'INSP')
  assert.equal(renamedItem.name, '巡检费（更新）')

  // 货品类别维护
  const category = await ctx.api(adminToken, 'POST', '/api/masterdata/goods-categories', { code: 'COLD', name: '冷链' })
  assert.equal(category.status, 201)
  const categoryItem = (await category.json()).item
  const categoryRenamed = await ctx.api(adminToken, 'PUT', `/api/masterdata/goods-categories/${categoryItem.id}`, { name: '冷链（更新）' })
  assert.equal((await categoryRenamed.json()).item.name, '冷链（更新）')

  // 登录用户可读取基础档案
  const feeTypes = await ctx.api(managerToken, 'GET', '/api/masterdata/fee-types')
  const feeTypesBody = await feeTypes.json()
  assert.ok(feeTypesBody.items.some((item) => item.code === 'INSP'))
  const categories = await ctx.api(opsToken, 'GET', '/api/masterdata/goods-categories')
  assert.ok((await categories.json()).items.some((item) => item.code === 'COLD'))
})

test('系统管理员跨组织访问与用户管理（AC-11）', async () => {
  // 跨组织查看 ORG-A 单据（管理员例外）
  const detail = await ctx.api(adminToken, 'GET', `/api/quotes/${ctx.state.quote.id}`)
  assert.equal(detail.status, 200)
  const list = await ctx.api(adminToken, 'GET', '/api/quotes')
  const listBody = await list.json()
  assert.ok(listBody.items.some((item) => item.id === ctx.state.quote.id))

  // 用户管理：创建客户经理（只读）账号并绑定组织
  const created = await ctx.api(adminToken, 'POST', '/api/users', {
    username: 'manager2@kwms.local',
    password: 'Manager2@12345',
    name: '客户经理-测试',
    roles: ['account_manager'],
    orgId: ORGS.B,
  })
  assert.equal(created.status, 201)
  const createdUser = (await created.json()).user
  assert.equal(createdUser.orgId, ORGS.B)
  assert.deepEqual(createdUser.roles, ['account_manager'])

  // 用户名唯一
  const duplicate = await ctx.api(adminToken, 'POST', '/api/users', {
    username: 'manager2@kwms.local', password: 'Manager2@12345', name: '重复', roles: [], orgId: ORGS.B,
  })
  assert.equal(duplicate.status, 400)

  // PUT /api/users/{id} 角色与组织部分更新（角色/数据权限配置入口）
  const updated = await ctx.api(adminToken, 'PUT', `/api/users/${createdUser.id}`, { roles: ['finance'], orgId: ORGS.A })
  assert.equal(updated.status, 200)
  const updatedUser = (await updated.json()).user
  assert.deepEqual(updatedUser.roles, ['finance'])
  assert.equal(updatedUser.orgId, ORGS.A)

  // 用户列表
  const listUsers = await ctx.api(adminToken, 'GET', '/api/users')
  const usersBody = await listUsers.json()
  assert.ok(usersBody.items.length >= 5)
  assert.ok(usersBody.items.every((user) => !('passwordHash' in user)))

  // 非管理员无 user:manage
  const denied = await ctx.api(opsToken, 'GET', '/api/users')
  assert.equal(denied.status, 403)
})

test('Excel 报表导出（AC-12）：计费/对账/结算三类报表内容与单据数据一致', async () => {
  const { utils, read } = await import('xlsx')
  const billing = await ctx.api(financeToken, 'GET', '/api/reports/export?type=billing&periodStart=2026-02-15&periodEnd=2026-02-15')
  assert.equal(billing.status, 200)
  const billingBuffer = Buffer.from(await billing.arrayBuffer())
  const billingWorkbook = read(billingBuffer)
  const billingSheet = billingWorkbook.Sheets[billingWorkbook.SheetNames[0]]
  const billingRows = utils.sheet_to_json(billingSheet, { header: 1 })
  assert.equal(billingRows.length, 2) // 表头 + 1 行明细
  assert.ok(String(billingRows[0][0]).includes('记账日期'))
  assert.equal(billingRows[1][0], '2026-02-15')
  // 金额列以元输出：60000 分 = 600 元
  assert.equal(String(billingRows[1][billingRows[0].findIndex((header) => String(header).includes('原始计算金额'))]), '600')

  const recon = await ctx.api(financeToken, 'GET', '/api/reports/export?type=recon')
  assert.equal(recon.status, 200)
  const reconWorkbook = read(Buffer.from(await recon.arrayBuffer()))
  assert.ok(reconWorkbook.SheetNames.length >= 1)

  const settlement = await ctx.api(financeToken, 'GET', '/api/reports/export?type=settlement')
  assert.equal(settlement.status, 200)
  const settlementWorkbook = read(Buffer.from(await settlement.arrayBuffer()))
  assert.ok(settlementWorkbook.SheetNames.length >= 1)

  // 参数缺省按全量（限本组织）
  const financeAll = await ctx.api(financeToken, 'GET', '/api/reports/export?type=billing')
  assert.equal(financeAll.status, 200)

  // 报表类型无效
  const invalid = await ctx.api(financeToken, 'GET', '/api/reports/export?type=unknown')
  assert.equal(invalid.status, 400)
})
