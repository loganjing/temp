import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { createApp } from '../src/server/app.ts'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'
import { registerProtectedRoutes } from '../src/server/routes.ts'
import { withHttpServer } from './with-http-server.mjs'

const API = '/api/asset-apply-bills'

// 每个用例独立的临时 SQLite 库 + 真实 HTTP 服务，互不串扰。
async function withBillApi(verify) {
  const directory = await mkdtemp(path.join(tmpdir(), 'asset-apply-bill-'))
  const previous = process.env.DB_PATH
  process.env.DB_PATH = path.join(directory, 'application.db')
  try {
    const platform = await initializePlatform()
    const app = createApp({
      registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
    })
    await withHttpServer({ fetch: app.fetch, close: () => platform.close() }, verify)
  } finally {
    if (previous === undefined) delete process.env.DB_PATH
    else process.env.DB_PATH = previous
    await rm(directory, { recursive: true, force: true })
  }
}

function postBill(base, payload) {
  return fetch(`${base}${API}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

async function postValidBill(base, payload) {
  const response = await postBill(base, payload)
  assert.equal(response.status, 201, `保存应成功，实际状态 ${response.status}`)
  return response.json()
}

function validPayload(overrides = {}) {
  return {
    pick_date: '2026-10-18',
    picker: '张三',
    pick_dept: '行政部',
    org: '示例公司',
    purpose: '新员工办公设备领用',
    remark: '',
    entries: [
      {
        asset_name: '笔记本电脑',
        asset_code: 'ZC-0001',
        spec_model: 'ThinkPad X1',
        qty: 1,
        unit: '台',
        location: 'A区库房',
        line_remark: '',
      },
    ],
    ...overrides,
  }
}

test('POST saves a bill with generated billno and system fields, and the detail reads back identically', async () => {
  await withBillApi(async (base) => {
    const startedAt = Date.now()
    // 请求中出现的系统字段（billno/creator/billstatus、分录 id/seq）一律忽略。
    const payload = validPayload({
      billno: 'FAKE0001',
      creator: '恶意用户',
      billstatus: '已审核',
      entries: [
        {
          asset_name: '笔记本电脑',
          asset_code: 'ZC-0001',
          spec_model: 'ThinkPad X1',
          qty: 1,
          unit: '台',
          location: 'A区库房',
          line_remark: '',
          id: 999,
          seq: 99,
        },
        { asset_name: '显示器', qty: 2.5, unit: '台', location: 'B区库房' },
      ],
    })
    const response = await postBill(base, payload)
    assert.equal(response.status, 201)
    const elapsed = Date.now() - startedAt
    assert.ok(elapsed < 2000, `保存响应应在 2 秒内完成，实际 ${elapsed}ms`)
    const bill = await response.json()

    // 单号：LY + 服务器本地日期 + 至少 4 位流水，且与系统字段同日生成。
    assert.match(bill.billno, /^LY\d{8}\d{4,}$/)
    assert.notEqual(bill.billno, 'FAKE0001')
    assert.equal(bill.billno.slice(2, 10), bill.createtime.slice(0, 10).replace(/-/g, ''))
    // 系统字段由服务端生成。
    assert.equal(bill.billstatus, '创建')
    assert.equal(bill.creator, '系统用户')
    assert.equal(bill.modifier, '系统用户')
    assert.match(bill.createtime, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
    assert.equal(bill.modifytime, bill.createtime)
    assert.ok(Number.isInteger(bill.id) && bill.id >= 1)
    // 主表回显；可选字段空串视为 NULL。
    assert.equal(bill.pick_date, '2026-10-18')
    assert.equal(bill.picker, '张三')
    assert.equal(bill.pick_dept, '行政部')
    assert.equal(bill.org, '示例公司')
    assert.equal(bill.purpose, '新员工办公设备领用')
    assert.equal(bill.remark, null)
    assert.equal(bill.auditor, null)
    assert.equal(bill.auditdate, null)
    // 分录按录入顺序重排 seq，忽略请求中的 id/seq。
    assert.equal(bill.entries.length, 2)
    const [first, second] = bill.entries
    assert.ok(Number.isInteger(first.id) && first.id >= 1)
    assert.equal(first.seq, 1)
    assert.equal(first.asset_name, '笔记本电脑')
    assert.equal(first.asset_code, 'ZC-0001')
    assert.equal(first.spec_model, 'ThinkPad X1')
    assert.equal(first.qty, 1)
    assert.equal(first.unit, '台')
    assert.equal(first.location, 'A区库房')
    assert.equal(first.line_remark, null)
    assert.equal(first.modifierfield, '系统用户')
    assert.equal(first.modifydatefield, bill.createtime)
    assert.ok(Number.isInteger(second.id) && second.id >= 1)
    assert.equal(second.seq, 2)
    assert.equal(second.asset_name, '显示器')
    assert.equal(second.asset_code, null)
    assert.equal(second.spec_model, null)
    assert.equal(second.qty, 2.5)
    assert.equal(second.unit, '台')
    assert.equal(second.location, 'B区库房')
    assert.equal(second.line_remark, null)

    // 详情回读与保存响应完全一致（详情与打印视图的数据源）。
    const detailResponse = await fetch(`${base}${API}/${bill.id}`)
    assert.equal(detailResponse.status, 200)
    assert.deepEqual(await detailResponse.json(), bill)
  })
})

test('POST blocks invalid payloads with field-level errors and writes no bill', async () => {
  await withBillApi(async (base) => {
    // 1) 主表必填字段缺失或非法。
    const missingRequired = await postBill(base, {
      pick_date: '2026-02-30',
      picker: '   ',
      pick_dept: '',
      entries: [{ asset_name: '笔记本电脑', qty: 1 }],
    })
    assert.equal(missingRequired.status, 400)
    const missingBody = await missingRequired.json()
    assert.equal(missingBody.error.code, 'VALIDATION_FAILED')
    assert.equal(missingBody.error.message, '保存校验未通过')
    assert.deepEqual(new Set(missingBody.error.details), new Set([
      { path: 'pick_date', message: '领用日期格式不正确，应为 yyyy-MM-dd' },
      { path: 'picker', message: '领用人不能为空' },
      { path: 'pick_dept', message: '领用部门不能为空' },
      { path: 'org', message: '组织不能为空' },
    ]))

    // 2) 明细分录为空。
    const emptyEntries = await postBill(base, validPayload({ entries: [] }))
    assert.equal(emptyEntries.status, 400)
    const emptyBody = await emptyEntries.json()
    assert.equal(emptyBody.error.code, 'VALIDATION_FAILED')
    assert.deepEqual(emptyBody.error.details, [
      { path: 'entries', message: '明细分录不能为空' },
    ])

    // 3) 分录行字段缺失：第 0 行数量缺失、第 1 行资产名称为空。
    const badEntries = await postBill(base, validPayload({
      entries: [
        { asset_name: '笔记本电脑' },
        { asset_name: '', qty: 1 },
      ],
    }))
    assert.equal(badEntries.status, 400)
    const badBody = await badEntries.json()
    assert.deepEqual(badBody.error.details, [
      { path: 'entries[0].qty', message: '数量不能为空' },
      { path: 'entries[1].asset_name', message: '资产名称不能为空' },
    ])

    // 4) 非法 JSON 请求体也按校验失败处理，不产生数据。
    const broken = await fetch(`${base}${API}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    })
    assert.equal(broken.status, 400)
    const brokenBody = await broken.json()
    assert.equal(brokenBody.error.code, 'VALIDATION_FAILED')

    // 校验失败不产生任何单据。
    const listResponse = await fetch(`${base}${API}`)
    assert.equal(listResponse.status, 200)
    const list = await listResponse.json()
    assert.equal(list.total, 0)
    assert.deepEqual(list.items, [])
  })
})

test('POST generates consecutive unique billnos with the agreed format', async () => {
  await withBillApi(async (base) => {
    const first = await postValidBill(base, validPayload())
    const second = await postValidBill(base, validPayload({ picker: '李四' }))

    assert.match(first.billno, /^LY\d{8}\d{4}$/)
    assert.match(second.billno, /^LY\d{8}\d{4}$/)
    assert.notEqual(first.billno, second.billno)
    // 同日同前缀，流水号递增 1。
    assert.equal(second.billno.slice(0, 10), first.billno.slice(0, 10))
    assert.equal(Number(second.billno.slice(10)) - Number(first.billno.slice(10)), 1)
  })
})

test('GET list filters by billno, picker and pick_date, and paginates', async () => {
  await withBillApi(async (base) => {
    const first = await postValidBill(base, validPayload({ pick_date: '2026-10-18', picker: '张三' }))
    const second = await postValidBill(base, validPayload({ pick_date: '2026-10-19', picker: '李四' }))
    const third = await postValidBill(base, validPayload({ pick_date: '2026-10-20', picker: '王五' }))

    const all = await (await fetch(`${base}${API}`)).json()
    assert.equal(all.total, 3)
    assert.equal(all.page, 1)
    assert.equal(all.pageSize, 20)
    // 摘要字段：不含长文本与分录。
    assert.deepEqual(
      Object.keys(all.items[0]).sort(),
      ['billno', 'billstatus', 'createtime', 'id', 'modifier', 'modifytime', 'org', 'pick_date', 'pick_dept', 'picker'],
    )
    // 按创建时间降序（最新单据在前）。
    assert.deepEqual(all.items.map((item) => item.id), [third.id, second.id, first.id])

    // billno 包含匹配（查询值是去掉首字符的单号子串，非完整单号）。
    const byBillno = await (await fetch(`${base}${API}?billno=${encodeURIComponent(second.billno.slice(1))}`)).json()
    assert.equal(byBillno.total, 1)
    assert.equal(byBillno.items[0].id, second.id)
    assert.equal(byBillno.items[0].billno, second.billno)
    assert.equal(byBillno.items[0].picker, '李四')
    assert.equal(byBillno.items[0].pick_date, '2026-10-19')
    assert.equal(byBillno.items[0].billstatus, '创建')

    // picker 包含匹配。
    const byPicker = await (await fetch(`${base}${API}?picker=${encodeURIComponent('李')}`)).json()
    assert.equal(byPicker.total, 1)
    assert.equal(byPicker.items[0].id, second.id)

    // pick_date 精确匹配。
    const byDate = await (await fetch(`${base}${API}?pick_date=2026-10-19`)).json()
    assert.equal(byDate.total, 1)
    assert.equal(byDate.items[0].id, second.id)

    // 组合条件。
    const combined = await (await fetch(`${base}${API}?picker=${encodeURIComponent('张')}&pick_date=2026-10-18`)).json()
    assert.equal(combined.total, 1)
    assert.equal(combined.items[0].id, first.id)

    // 不满足条件的单据不出现在查询结果中。
    const none = await (await fetch(`${base}${API}?pick_date=1999-01-01`)).json()
    assert.equal(none.total, 0)
    assert.deepEqual(none.items, [])

    // 分页。
    const page1 = await (await fetch(`${base}${API}?page=1&pageSize=2`)).json()
    assert.equal(page1.page, 1)
    assert.equal(page1.pageSize, 2)
    assert.equal(page1.total, 3)
    assert.deepEqual(page1.items.map((item) => item.id), [third.id, second.id])
    const page2 = await (await fetch(`${base}${API}?page=2&pageSize=2`)).json()
    assert.equal(page2.page, 2)
    assert.equal(page2.pageSize, 2)
    assert.equal(page2.total, 3)
    assert.deepEqual(page2.items.map((item) => item.id), [first.id])

    // 非法分页参数按默认值处理，超上限按上限处理，不报错。
    const defaults = await (await fetch(`${base}${API}?page=abc&pageSize=-5`)).json()
    assert.equal(defaults.page, 1)
    assert.equal(defaults.pageSize, 20)
    assert.equal(defaults.items.length, 3)
    const capped = await (await fetch(`${base}${API}?pageSize=500`)).json()
    assert.equal(capped.pageSize, 100)
    assert.equal(capped.items.length, 3)
  })
})

test('GET detail of an unknown bill returns 404 BILL_NOT_FOUND', async () => {
  await withBillApi(async (base) => {
    const response = await fetch(`${base}${API}/999999`)
    assert.equal(response.status, 404)
    assert.deepEqual(await response.json(), {
      error: { code: 'BILL_NOT_FOUND', message: '领用单不存在' },
    })
  })
})
