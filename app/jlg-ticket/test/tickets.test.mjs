import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { createApp } from '../src/server/app.ts'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'
import { registerPublicRoutes, registerProtectedRoutes } from '../src/server/routes.ts'
import { withHttpServer } from './with-http-server.mjs'

// 种子数据 ID（见 002_seed_data.sql）
const COMPANY = '11111111-1111-1111-1111-111111111111'
const SUBMITTER = '22222222-2222-2222-2222-222222222222' // 张三
const HANDLER = '33333333-3333-3333-3333-333333333333' // 李四
const CAT_TECH = 'aaaaaaaa-0000-0000-0000-000000000001' // 技术问题（有分配规则）
const CAT_BUG = 'aaaaaaaa-0000-0000-0000-000000000003' // 故障报告（无规则）
const GROUP_TECH = 'bbbbbbbb-0000-0000-0000-000000000001' // 技术支持组

async function withApp(verify) {
  const dir = await mkdtemp(path.join(tmpdir(), 'ticket-api-'))
  const prevDb = process.env.DB_PATH
  process.env.DB_PATH = path.join(dir, 'test.db')
  const platform = await initializePlatform()
  const app = createApp({
    registerPublicRoutes: (routes) => registerPublicRoutes(routes, platform),
    registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
  })
  try {
    await withHttpServer({ fetch: app.fetch, close: () => platform.close() }, verify)
  } finally {
    if (prevDb === undefined) delete process.env.DB_PATH
    else process.env.DB_PATH = prevDb
    await rm(dir, { recursive: true, force: true })
  }
}

async function json(res) {
  return { status: res.status, body: await res.json() }
}

test('seed data is available: companies, categories, business groups', async () => {
  await withApp(async (url) => {
    const companies = await json(await fetch(`${url}/api/companies`))
    assert.equal(companies.status, 200)
    assert.ok(companies.body.items.some((c) => c.id === COMPANY))

    const categories = await json(await fetch(`${url}/api/categories`))
    assert.equal(categories.status, 200)
    assert.equal(categories.body.items.length, 4)

    const groups = await json(await fetch(`${url}/api/companies/${COMPANY}/business-groups`))
    assert.equal(groups.status, 200)
    assert.ok(groups.body.items.some((g) => g.id === GROUP_TECH))
  })
})

test('create ticket with matching rule auto-assigns to group and sets pending_process', async () => {
  await withApp(async (url) => {
    const res = await json(await fetch(`${url}/api/tickets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '数据库连接失败', description: '生产环境无法连接', categoryId: CAT_TECH, submitterId: SUBMITTER, priority: 'P1' }),
    }))
    assert.equal(res.status, 201)
    assert.equal(res.body.status, 'pending_process')
    assert.equal(res.body.assignedGroupId, GROUP_TECH)
    assert.equal(res.body.assignedGroupName, '技术支持组')
    assert.equal(res.body.categoryName, '技术问题')
    assert.equal(res.body.submitterName, '张三')
    assert.equal(res.body.submitterEmail, 'zhangsan@demo-tech.cn')
  })
})

test('create ticket without matching rule stays pending_assign', async () => {
  await withApp(async (url) => {
    const res = await json(await fetch(`${url}/api/tickets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '页面 500', description: '偶发错误', categoryId: CAT_BUG, submitterId: SUBMITTER, priority: 'P2' }),
    }))
    assert.equal(res.status, 201)
    assert.equal(res.body.status, 'pending_assign')
    assert.equal(res.body.assignedGroupId, null)
  })
})

test('ticket lifecycle: create → assign → reply → transfer → complete → evaluate', async () => {
  await withApp(async (url) => {
    // 创建无规则工单
    const created = await json(await fetch(`${url}/api/tickets`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '功能异常', description: '需要排查', categoryId: CAT_BUG, submitterId: SUBMITTER, priority: 'P2' }),
    }))
    const ticketId = created.body.id
    assert.equal(created.body.status, 'pending_assign')

    // 手动分配
    const assigned = await json(await fetch(`${url}/api/tickets/${ticketId}/assign`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ groupId: GROUP_TECH }),
    }))
    assert.equal(assigned.status, 200)
    assert.equal(assigned.body.status, 'pending_process')

    // 添加回复
    const reply = await json(await fetch(`${url}/api/tickets/${ticketId}/replies`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ replierId: HANDLER, content: '已收到，正在排查' }),
    }))
    assert.equal(reply.status, 201)
    assert.equal(reply.body.replierName, '李四')

    // 转派到处理人
    const transferred = await json(await fetch(`${url}/api/tickets/${ticketId}/transfer`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ transferredBy: HANDLER, toHandlerId: HANDLER }),
    }))
    assert.equal(transferred.status, 200)
    assert.equal(transferred.body.status, 'pending_process')
    assert.ok(transferred.body.transferRecord)

    // 完成工单
    const completed = await json(await fetch(`${url}/api/tickets/${ticketId}/complete`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ processedBy: HANDLER }),
    }))
    assert.equal(completed.status, 200)
    assert.equal(completed.body.status, 'completed')
    assert.ok(completed.body.processedAt)

    // 评价
    const evalRes = await json(await fetch(`${url}/api/tickets/${ticketId}/evaluation`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ submitterId: SUBMITTER, rating: 5, comment: '处理及时' }),
    }))
    assert.equal(evalRes.status, 201)
    assert.equal(evalRes.body.rating, 5)

    // 获取评价
    const evalGet = await json(await fetch(`${url}/api/tickets/${ticketId}/evaluation`))
    assert.equal(evalGet.status, 200)
    assert.equal(evalGet.body.rating, 5)

    // 详情包含回复、转派、评价
    const detail = await json(await fetch(`${url}/api/tickets/${ticketId}`))
    assert.equal(detail.status, 200)
    assert.equal(detail.body.replies.length, 1)
    assert.equal(detail.body.transfers.length, 1)
    assert.equal(detail.body.evaluation.rating, 5)
    assert.equal(detail.body.processedByName, '李四')
  })
})

test('cancel ticket from pending_assign', async () => {
  await withApp(async (url) => {
    const created = await json(await fetch(`${url}/api/tickets`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '取消测试', description: 'desc', categoryId: CAT_BUG, submitterId: SUBMITTER, priority: 'P3' }),
    }))
    const ticketId = created.body.id
    const cancelled = await json(await fetch(`${url}/api/tickets/${ticketId}/cancel`, { method: 'POST' }))
    assert.equal(cancelled.status, 200)
    assert.equal(cancelled.body.status, 'cancelled')
  })
})

test('completed ticket cannot be cancelled (409 conflict)', async () => {
  await withApp(async (url) => {
    const created = await json(await fetch(`${url}/api/tickets`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '完成测试', description: 'desc', categoryId: CAT_TECH, submitterId: SUBMITTER, priority: 'P1' }),
    }))
    const ticketId = created.body.id
    assert.equal(created.body.status, 'pending_process')
    await fetch(`${url}/api/tickets/${ticketId}/complete`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ processedBy: HANDLER }),
    })
    const cancelRes = await json(await fetch(`${url}/api/tickets/${ticketId}/cancel`, { method: 'POST' }))
    assert.equal(cancelRes.status, 409)
    assert.equal(cancelRes.body.error.code, 'CONFLICT')
  })
})

test('validation error on missing fields', async () => {
  await withApp(async (url) => {
    const res = await json(await fetch(`${url}/api/tickets`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: 'no title' }),
    }))
    assert.equal(res.status, 400)
    assert.equal(res.body.error.code, 'VALIDATION_ERROR')
  })
})

test('not found on missing ticket', async () => {
  await withApp(async (url) => {
    const res = await json(await fetch(`${url}/api/tickets/nonexistent-id`))
    assert.equal(res.status, 404)
    assert.equal(res.body.error.code, 'NOT_FOUND')
  })
})

test('duplicate evaluation returns 409', async () => {
  await withApp(async (url) => {
    const created = await json(await fetch(`${url}/api/tickets`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '评价重复', description: 'desc', categoryId: CAT_TECH, submitterId: SUBMITTER, priority: 'P1' }),
    }))
    const ticketId = created.body.id
    await fetch(`${url}/api/tickets/${ticketId}/complete`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ processedBy: HANDLER }),
    })
    await fetch(`${url}/api/tickets/${ticketId}/evaluation`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ submitterId: SUBMITTER, rating: 4 }),
    })
    const dup = await json(await fetch(`${url}/api/tickets/${ticketId}/evaluation`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ submitterId: SUBMITTER, rating: 3 }),
    }))
    assert.equal(dup.status, 409)
  })
})

test('user detail and user tickets', async () => {
  await withApp(async (url) => {
    const user = await json(await fetch(`${url}/api/users/${SUBMITTER}`))
    assert.equal(user.status, 200)
    assert.equal(user.body.name, '张三')
    assert.equal(user.body.companyName, '演示科技有限公司')
    assert.equal(user.body.department, '技术部')

    // 创建一个工单后查询历史
    await fetch(`${url}/api/tickets`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '历史工单', description: 'desc', categoryId: CAT_BUG, submitterId: SUBMITTER, priority: 'P2' }),
    })
    const tickets = await json(await fetch(`${url}/api/users/${SUBMITTER}/tickets`))
    assert.equal(tickets.status, 200)
    assert.ok(tickets.body.items.length >= 1)
    assert.ok(tickets.body.items.some((t) => t.title === '历史工单'))
  })
})

test('business group members management', async () => {
  await withApp(async (url) => {
    const members = await json(await fetch(`${url}/api/business-groups/${GROUP_TECH}/members`))
    assert.equal(members.status, 200)
    assert.ok(members.body.items.some((m) => m.userId === HANDLER))

    // 重复添加返回 409
    const dup = await json(await fetch(`${url}/api/business-groups/${GROUP_TECH}/members`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: HANDLER }),
    }))
    assert.equal(dup.status, 409)

    // 移除成员
    const removed = await json(await fetch(`${url}/api/business-groups/${GROUP_TECH}/members/${HANDLER}`, { method: 'DELETE' }))
    assert.equal(removed.status, 200)
    assert.equal(removed.body.removed, true)
  })
})

test('ticket list filters by status', async () => {
  await withApp(async (url) => {
    await fetch(`${url}/api/tickets`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '筛选A', description: 'desc', categoryId: CAT_TECH, submitterId: SUBMITTER, priority: 'P0' }),
    })
    const pending = await json(await fetch(`${url}/api/tickets?status=pending_process`))
    assert.equal(pending.status, 200)
    assert.ok(pending.body.items.every((t) => t.status === 'pending_process'))
  })
})
