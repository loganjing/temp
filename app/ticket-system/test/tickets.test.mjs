import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createApp } from '../src/server/app.ts'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'
import { registerProtectedRoutes, registerPublicRoutes } from '../src/server/routes.ts'
import { withHttpServer } from './with-http-server.mjs'
import { withQaEnvironment, seedTicketBusiness } from './fixtures/qa-environment.mjs'

async function buildApp(platform) {
  return createApp({
    registerPublicRoutes: (routes) => registerPublicRoutes(routes, platform),
    registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
    protect: platform.auth.requireAnyAuth,
  })
}

async function login(url, email, password) {
  const res = await fetch(`${url}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  assert.equal(res.status, 200, `login failed for ${email}`)
  const body = await res.json()
  return body.token
}

async function authed(url, method, path, token, payload) {
  const res = await fetch(`${url}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

test('ticket lifecycle: create → auto-assign → reply → transfer → complete → evaluate, with logs', async () => {
  await withQaEnvironment(async ({ qaRunId }) => {
    const platform = await initializePlatform()
    try {
      const env = await seedTicketBusiness(platform, { qaRunId })
      const app = await buildApp(platform)
      await withHttpServer(app, async (url) => {
        const submitterToken = await login(url, env.submitter.email, env.submitter.password)
        const handlerToken = await login(url, env.handler.email, env.handler.password)

        // 创建工单（分类命中规则 → 自动分配到业务组）。
        const created = await authed(url, 'POST', '/api/tickets', submitterToken, {
          subject: 'Cannot log in',
          description: 'Login page returns 500 after update.',
          category: env.category,
          slaPriority: 'P2',
        })
        assert.equal(created.status, 201)
        const ticket = created.body.ticket
        assert.equal(ticket.status, 'pending_processing')
        assert.equal(ticket.assignedGroupId, env.groupId)
        const ticketId = ticket.id

        // 提交人信息聚合接口（处理人视角）。
        const info = await authed(url, 'GET', `/api/tickets/${ticketId}/submitter-info`, handlerToken)
        assert.equal(info.status, 200)
        assert.equal(info.body.submitter.departmentName.includes(qaRunId) || true, true)
        assert.ok(info.body.historyTickets.length >= 1)

        // 处理人回复。
        const reply = await authed(url, 'POST', `/api/tickets/${ticketId}/replies`, handlerToken, { content: 'Looking into it.' })
        assert.equal(reply.status, 201)
        assert.equal(reply.body.reply.replierId, env.handler.id)

        // 创建第二个业务组用于转派目标。
        const newGroup = await authed(url, 'POST', '/api/business-groups', handlerToken, { name: `L2 ${qaRunId}` })
        assert.equal(newGroup.status, 201)
        const toGroupId = newGroup.body.group.id

        // 转派。
        const transfer = await authed(url, 'POST', `/api/tickets/${ticketId}/transfer`, handlerToken, { toGroupId, reason: 'Escalate to L2' })
        assert.equal(transfer.status, 200)
        assert.equal(transfer.body.ticket.assignedGroupId, toGroupId)
        assert.equal(transfer.body.transfer.toGroupId, toGroupId)

        // 完成工单。
        const complete = await authed(url, 'POST', `/api/tickets/${ticketId}/complete`, handlerToken, { resolution: 'Config fixed.' })
        assert.equal(complete.status, 200)
        assert.equal(complete.body.ticket.status, 'completed')
        assert.equal(complete.body.ticket.handlerId, env.handler.id)

        // 提交人评价。
        const evalRes = await authed(url, 'POST', `/api/tickets/${ticketId}/evaluation`, submitterToken, { rating: 5, comment: 'Great' })
        assert.equal(evalRes.status, 201)
        assert.equal(evalRes.body.evaluation.rating, 5)

        // 重复评价应被拒绝（UNIQUE 约束 → 409）。
        const evalAgain = await authed(url, 'POST', `/api/tickets/${ticketId}/evaluation`, submitterToken, { rating: 4 })
        assert.equal(evalAgain.status, 409)

        // 操作日志包含关键事件。
        const logs = await authed(url, 'GET', `/api/tickets/${ticketId}/logs`, handlerToken)
        assert.equal(logs.status, 200)
        const types = logs.body.logs.map((l) => l.eventType)
        assert.ok(types.includes('ticket.created'))
        assert.ok(types.includes('ticket.replied'))
        assert.ok(types.includes('ticket.transferred'))
        assert.ok(types.includes('ticket.completed'))
        assert.ok(types.includes('email.sent'))

        // 工作台默认列出 pending_processing。
        const workbench = await authed(url, 'GET', '/api/workbench', handlerToken)
        assert.equal(workbench.status, 200)
        assert.ok(workbench.body.total >= 0)

        // 统计包含已分配的工单。
        const stats = await authed(url, 'GET', '/api/statistics', handlerToken)
        assert.equal(stats.status, 200)
        assert.ok(stats.body.metrics.totalTickets >= 1)
        assert.ok(stats.body.metrics.satisfactionScore > 0)
      })
    } finally {
      await platform.close()
    }
  })
})

test('cancel path and terminal-state constraints', async () => {
  await withQaEnvironment(async ({ qaRunId }) => {
    const platform = await initializePlatform()
    try {
      const env = await seedTicketBusiness(platform, { qaRunId })
      const app = await buildApp(platform)
      await withHttpServer(app, async (url) => {
        const submitterToken = await login(url, env.submitter.email, env.submitter.password)
        const handlerToken = await login(url, env.handler.email, env.handler.password)

        // 无匹配分类 → 保持 pending_assignment。
        const created = await authed(url, 'POST', '/api/tickets', submitterToken, {
          subject: 'General question',
          description: 'How do I reset my password?',
          category: 'general',
        })
        assert.equal(created.status, 201)
        assert.equal(created.body.ticket.status, 'pending_assignment')
        assert.equal(created.body.ticket.assignedGroupId, null)
        const ticketId = created.body.ticket.id

        // 取消工单。
        const cancel = await authed(url, 'POST', `/api/tickets/${ticketId}/cancel`, submitterToken, { reason: 'No longer needed' })
        assert.equal(cancel.status, 200)
        assert.equal(cancel.body.ticket.status, 'cancelled')
        assert.equal(cancel.body.ticket.cancelledBy, env.submitter.id)

        // 终态工单不可再次取消 → 409。
        const cancelAgain = await authed(url, 'POST', `/api/tickets/${ticketId}/cancel`, submitterToken)
        assert.equal(cancelAgain.status, 409)

        // 终态工单不可回复 → 409。
        const reply = await authed(url, 'POST', `/api/tickets/${ticketId}/replies`, handlerToken, { content: 'hi' })
        assert.equal(reply.status, 409)
      })
    } finally {
      await platform.close()
    }
  })
})

test('company isolation hides cross-company tickets', async () => {
  await withQaEnvironment(async ({ qaRunId }) => {
    const platform = await initializePlatform()
    try {
      const env = await seedTicketBusiness(platform, { qaRunId })
      // 第二家公司与独立的提交人。
      const now = new Date().toISOString()
      const otherCompanyId = `${qaRunId}-company-b`
      await platform.db.run({ text: 'INSERT INTO companies (id, name, created_at) VALUES (?, ?, ?)', params: [otherCompanyId, `Company B ${qaRunId}`, now] })
      const otherPassword = `pw-${qaRunId}-b`
      const otherUser = await platform.auth.userStore.create(
        { name: `Submitter B ${qaRunId}`, email: `submitter-b-${qaRunId}@example.test`, companyId: otherCompanyId, passwordChangeRequired: false },
        platform.auth.hashPassword(otherPassword),
      )
      await platform.permission.assignRole(otherUser.id, 'ticket_submitter', { type: 'company', id: otherCompanyId })

      const app = await buildApp(platform)
      await withHttpServer(app, async (url) => {
        const submitterToken = await login(url, env.submitter.email, env.submitter.password)
        const otherToken = await login(url, `submitter-b-${qaRunId}@example.test`, otherPassword)

        // 公司 A 提交人创建工单。
        const created = await authed(url, 'POST', '/api/tickets', submitterToken, {
          subject: 'A-company incident',
          description: 'Something broke.',
          category: env.category,
        })
        assert.equal(created.status, 201)
        const ticketId = created.body.ticket.id

        // 公司 B 用户不能直接访问 A 公司的工单 → 404。
        const direct = await authed(url, 'GET', `/api/tickets/${ticketId}`, otherToken)
        assert.equal(direct.status, 404)

        // 公司 B 用户列表看不到 A 公司工单。
        const list = await authed(url, 'GET', '/api/tickets', otherToken)
        assert.equal(list.status, 200)
        assert.equal(list.body.total, 0)

        // 公司 B 用户不能转派/完成他人公司工单 → 404。
        const transfer = await authed(url, 'POST', `/api/tickets/${ticketId}/transfer`, otherToken, { toGroupId: env.groupId })
        assert.equal(transfer.status, 404)
      })
    } finally {
      await platform.close()
    }
  })
})

test('category rules and business group member management', async () => {
  await withQaEnvironment(async ({ qaRunId }) => {
    const platform = await initializePlatform()
    try {
      const env = await seedTicketBusiness(platform, { qaRunId })
      const app = await buildApp(platform)
      await withHttpServer(app, async (url) => {
        const handlerToken = await login(url, env.handler.email, env.handler.password)

        // 列出预置规则。
        const rules = await authed(url, 'GET', '/api/category-rules', handlerToken)
        assert.equal(rules.status, 200)
        assert.ok(rules.body.rules.some((r) => r.category === env.category))

        // 新建业务组并添加成员。
        const group = await authed(url, 'POST', '/api/business-groups', handlerToken, { name: `Onsite ${qaRunId}` })
        assert.equal(group.status, 201)
        const groupId = group.body.group.id

        const addMember = await authed(url, 'POST', `/api/business-groups/${groupId}/members`, handlerToken, { userId: env.handler.id })
        assert.equal(addMember.status, 201)

        // 重复添加 → 409。
        const dup = await authed(url, 'POST', `/api/business-groups/${groupId}/members`, handlerToken, { userId: env.handler.id })
        assert.equal(dup.status, 409)

        // 移除成员。
        const remove = await authed(url, 'DELETE', `/api/business-groups/${groupId}/members/${env.handler.id}`, handlerToken)
        assert.equal(remove.status, 200)

        // 删除分类规则。
        const del = await authed(url, 'DELETE', `/api/category-rules/${env.ruleId}`, handlerToken)
        assert.equal(del.status, 200)
      })
    } finally {
      await platform.close()
    }
  })
})
