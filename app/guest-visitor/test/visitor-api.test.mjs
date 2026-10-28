import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createApp } from '../src/server/app.ts'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'
import { registerPublicRoutes, registerProtectedRoutes } from '../src/server/routes.ts'
import { withHttpServer } from './with-http-server.mjs'

// 通过真实 HTTP 服务器测试访客 API 全部 5 个端点。
// 使用 :memory: SQLite，每次测试启动隔离服务器并在结束后关闭。
async function buildServer() {
  const previous = process.env.DB_PATH
  process.env.DB_PATH = ':memory:'
  const platform = await initializePlatform()
  const app = createApp({
    registerPublicRoutes: (routes) => registerPublicRoutes(routes, platform),
    registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
  })
  return {
    fetch: app.fetch,
    close: async () => {
      await platform.close()
      if (previous === undefined) delete process.env.DB_PATH
      else process.env.DB_PATH = previous
    },
  }
}

function validVisitorPayload(overrides = {}) {
  return {
    name: '张三',
    phone: '13800138000',
    idCard: '110101199003074717',
    company: '示例科技有限公司',
    visitReason: '商务洽谈',
    hostName: '李四',
    expectedVisitTime: '2026-11-01T10:00:00.000Z',
    photoUrl: null,
    ...overrides,
  }
}

test('POST /api/visitors 创建访客登记返回 201 与 pending 记录', async () => {
  const server = await buildServer()
  await withHttpServer(server, async (base) => {
    const res = await fetch(`${base}/api/visitors`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validVisitorPayload()),
    })
    assert.equal(res.status, 201)
    const body = await res.json()
    assert.equal(body.status, 'pending')
    assert.equal(body.name, '张三')
    assert.equal(body.idCard, '110101199003074717')
    assert.equal(body.hostName, '李四')
    assert.ok(typeof body.id === 'string' && body.id.length > 0)
    assert.ok(typeof body.createdAt === 'string' && body.createdAt.length > 0)
  })
})

test('POST /api/visitors 校验失败返回 400 VALIDATION_ERROR', async () => {
  const server = await buildServer()
  await withHttpServer(server, async (base) => {
    const res = await fetch(`${base}/api/visitors`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validVisitorPayload({ phone: '999' })),
    })
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.error.code, 'VALIDATION_ERROR')
    assert.ok(typeof body.error.message === 'string' && body.error.message.length > 0)
  })
})

test('GET /api/visitors 列表包含已创建访客且支持状态筛选与分页', async () => {
  const server = await buildServer()
  await withHttpServer(server, async (base) => {
    const created = await fetch(`${base}/api/visitors`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validVisitorPayload({ name: '列表访客' })),
    })
    const createdBody = await created.json()

    const listRes = await fetch(`${base}/api/visitors?page=1&limit=10`)
    assert.equal(listRes.status, 200)
    const listBody = await listRes.json()
    assert.equal(listBody.page, 1)
    assert.equal(listBody.limit, 10)
    assert.ok(listBody.total >= 1)
    const found = listBody.items.find((i) => i.id === createdBody.id)
    assert.ok(found, '列表应包含刚创建的访客')
    assert.equal(found.name, '列表访客')
    assert.equal(found.status, 'pending')

    const pendingRes = await fetch(`${base}/api/visitors?status=pending`)
    const pendingBody = await pendingRes.json()
    assert.ok(pendingBody.items.every((i) => i.status === 'pending'))
  })
})

test('GET /api/visitors/:id 返回详情字段一致，不存在返回 404', async () => {
  const server = await buildServer()
  await withHttpServer(server, async (base) => {
    const created = await fetch(`${base}/api/visitors`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validVisitorPayload({ visitReason: '详情核对' })),
    })
    const createdBody = await created.json()

    const detailRes = await fetch(`${base}/api/visitors/${createdBody.id}`)
    assert.equal(detailRes.status, 200)
    const detail = await detailRes.json()
    assert.equal(detail.id, createdBody.id)
    assert.equal(detail.visitReason, '详情核对')
    assert.equal(detail.status, 'pending')
    assert.equal(detail.reviewComment, null)
    assert.equal(detail.reviewedAt, null)
    assert.ok(typeof detail.updatedAt === 'string')

    const notFoundRes = await fetch(`${base}/api/visitors/non-existent-id`)
    assert.equal(notFoundRes.status, 404)
    const notFoundBody = await notFoundRes.json()
    assert.equal(notFoundBody.error.code, 'NOT_FOUND')
  })
})

test('approve/reject 审批流程：状态更新持久化，重复审批返回 400', async () => {
  const server = await buildServer()
  await withHttpServer(server, async (base) => {
    // 访客 A：审批通过
    const createdA = await fetch(`${base}/api/visitors`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validVisitorPayload({ name: '审批通过访客' })),
    })
    const a = await createdA.json()

    const approveRes = await fetch(`${base}/api/visitors/${a.id}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ comment: '同意来访' }),
    })
    assert.equal(approveRes.status, 200)
    const approved = await approveRes.json()
    assert.equal(approved.id, a.id)
    assert.equal(approved.status, 'approved')
    assert.equal(approved.reviewComment, '同意来访')
    assert.ok(typeof approved.reviewedAt === 'string')

    // 重复审批（驳回）应返回 400
    const rejectAgain = await fetch(`${base}/api/visitors/${a.id}/reject`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    assert.equal(rejectAgain.status, 400)
    const rejectAgainBody = await rejectAgain.json()
    assert.equal(rejectAgainBody.error.code, 'VALIDATION_ERROR')

    // 读回确认状态持久化为 approved
    const detailA = await (await fetch(`${base}/api/visitors/${a.id}`)).json()
    assert.equal(detailA.status, 'approved')
    assert.equal(detailA.reviewComment, '同意来访')

    // 访客 B：审批驳回
    const createdB = await fetch(`${base}/api/visitors`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validVisitorPayload({ name: '审批驳回访客' })),
    })
    const b = await createdB.json()

    const rejectRes = await fetch(`${base}/api/visitors/${b.id}/reject`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ comment: '信息不完整' }),
    })
    assert.equal(rejectRes.status, 200)
    const rejected = await rejectRes.json()
    assert.equal(rejected.status, 'rejected')
    assert.equal(rejected.reviewComment, '信息不完整')

    // 驳回后再次通过应返回 400
    const approveAgain = await fetch(`${base}/api/visitors/${b.id}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    assert.equal(approveAgain.status, 400)
    assert.equal((await approveAgain.json()).error.code, 'VALIDATION_ERROR')

    // 审批不存在的访客返回 404
    const missingReview = await fetch(`${base}/api/visitors/no-such-id/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    assert.equal(missingReview.status, 404)
  })
})
