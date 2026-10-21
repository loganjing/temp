// QA-14（AC-14 操作日志）：依次执行创建、人工分配、回复、转派、回复、完成、评价后，
// 断言每个关键操作都有对应日志条目，包含操作人、操作时间、操作内容，且与实际操作一一对应。
// 基于隔离 DB_PATH 与真实 HTTP 服务，与 tickets.test.mjs 相同的启动方式。
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createApp } from '../src/server/app.ts'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'
import { registerProtectedRoutes, registerPublicRoutes } from '../src/server/routes.ts'
import { withHttpServer } from './with-http-server.mjs'

const directory = await mkdtemp(path.join(tmpdir(), 'ticket-logs-'))
const dbPath = path.join(directory, 'application.db')
const previousDbPath = process.env.DB_PATH
process.env.DB_PATH = dbPath
after(async () => {
  if (previousDbPath === undefined) delete process.env.DB_PATH
  else process.env.DB_PATH = previousDbPath
  await rm(directory, { recursive: true, force: true })
})

async function startApp() {
  const platform = await initializePlatform()
  const app = createApp({
    registerPublicRoutes: (routes) => registerPublicRoutes(routes, platform),
    registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
    protect: platform.auth.requireAnyAuth,
  })
  return { platform, app }
}

test('ticket logs cover every key operation with actor, time and detail', async () => {
  const { platform, app } = await startApp()

  await withHttpServer({ fetch: app.fetch, close: () => platform.close() }, async (url) => {
    const login = async (username) => {
      const response = await fetch(`${url}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password: 'demo-131' }),
      })
      assert.equal(response.status, 200, `login failed for ${username}`)
      return (await response.json()).token
    }

    const request = async (token, apiPath, options = {}) => {
      const headers = { ...(options.headers ?? {}) }
      if (options.body !== undefined) headers['content-type'] = 'application/json'
      headers.authorization = `Bearer ${token}`
      const response = await fetch(`${url}${apiPath}`, { ...options, headers })
      const text = await response.text()
      return { status: response.status, body: text === '' ? undefined : JSON.parse(text) }
    }

    const sub1 = await login('a-sub1')
    const agent1 = await login('a-agent1')
    const agent2 = await login('a-agent2')
    const bSub1 = await login('b-sub1')

    const categories = (await request(sub1, '/api/categories')).body.items
    const otherCategory = categories.find((item) => item.name === '其他')
    assert.ok(otherCategory, 'seed category 其他 should exist')
    const groups = (await request(agent1, '/api/groups?members=1')).body.items
    const firstLine = groups.find((item) => item.name === '一线支持组')
    const secondLine = groups.find((item) => item.name === '二线专家组')
    assert.ok(firstLine && secondLine, 'seed groups should exist')

    // 1. 创建（其他分类无规则 → 待分配 + created 日志）。
    const created = await request(sub1, '/api/tickets', {
      method: 'POST',
      body: JSON.stringify({
        subject: '日志验证工单',
        description: '依次执行关键操作，验证日志与操作一一对应。',
        categoryId: otherCategory.id,
        priority: 'P2',
      }),
    })
    assert.equal(created.status, 201)
    const ticketId = created.body.id
    assert.equal(created.body.status, 'pending_assign')

    // 2. 人工分配 → assigned 日志。
    const assigned = await request(agent1, `/api/tickets/${ticketId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ groupId: firstLine.id }),
    })
    assert.equal(assigned.status, 200)
    assert.equal(assigned.body.status, 'processing')

    // 3. 提交人回复 → replied 日志（操作人 a-sub1）。
    const reply1 = await request(sub1, `/api/tickets/${ticketId}/replies`, {
      method: 'POST',
      body: JSON.stringify({ content: '提交人补充：问题在工作日高频出现。' }),
    })
    assert.equal(reply1.status, 201)

    // 4. 转派到二线专家组 → transferred 日志（含理由）。
    const transferred = await request(agent1, `/api/tickets/${ticketId}/transfer`, {
      method: 'POST',
      body: JSON.stringify({ groupId: secondLine.id, reason: '需要二线专家定位' }),
    })
    assert.equal(transferred.status, 200)

    // 5. 二线处理人回复 → replied 日志（操作人 a-agent2）。
    const reply2 = await request(agent2, `/api/tickets/${ticketId}/replies`, {
      method: 'POST',
      body: JSON.stringify({ content: '二线回复：已定位根因并准备修复。' }),
    })
    assert.equal(reply2.status, 201)

    // 6. 完成 → completed 日志。
    const completed = await request(agent2, `/api/tickets/${ticketId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ resolution: '根因修复完成并已回归验证。' }),
    })
    assert.equal(completed.status, 200)
    assert.equal(completed.body.status, 'completed')

    // 7. 评价 → rated 日志。
    const rated = await request(sub1, `/api/tickets/${ticketId}/rating`, {
      method: 'POST',
      body: JSON.stringify({ score: 5, comment: '处理到位，日志完整。' }),
    })
    assert.equal(rated.status, 200)

    // 断言：7 个关键操作产生 7 条日志，顺序、操作人、操作内容一一对应。
    const logs = await request(sub1, `/api/tickets/${ticketId}/logs`)
    assert.equal(logs.status, 200)
    const items = logs.body.items
    assert.equal(items.length, 7, `expected 7 log entries, got ${items.length}`)

    assert.deepEqual(
      items.map((item) => ({ action: item.action, actor: item.actor?.displayName ?? null })),
      [
        { action: 'created', actor: 'a-sub1' },
        { action: 'assigned', actor: 'a-agent1' },
        { action: 'replied', actor: 'a-sub1' },
        { action: 'transferred', actor: 'a-agent1' },
        { action: 'replied', actor: 'a-agent2' },
        { action: 'completed', actor: 'a-agent2' },
        { action: 'rated', actor: 'a-sub1' },
      ],
    )

    assert.equal(items[0].detail, '创建工单')
    assert.equal(items[1].detail, '人工分配至「一线支持组」')
    assert.equal(items[2].detail, '回复工单')
    assert.equal(items[3].detail, '转派至「二线专家组」：需要二线专家定位')
    assert.equal(items[4].detail, '回复工单')
    assert.equal(items[5].detail, '完成处理：根因修复完成并已回归验证。')
    assert.equal(items[6].detail, '满意度评价 5/5')

    for (const item of items) {
      assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/.test(item.createdAt), `log ${item.action} createdAt format`)
      assert.ok(typeof item.id === 'number' && item.id > 0)
      assert.equal(item.ticketId, ticketId)
    }
    // 操作时间单调不减：日志顺序与实际操作顺序一致。
    for (let i = 1; i < items.length; i += 1) {
      assert.ok(items[i - 1].createdAt <= items[i].createdAt, `log order broken at index ${i}`)
    }

    // 公司隔离同样约束日志访问：B 公司提交人无法读取 A 公司工单日志。
    const crossCompany = await request(bSub1, `/api/tickets/${ticketId}/logs`)
    assert.equal(crossCompany.status, 404)
  })
})
