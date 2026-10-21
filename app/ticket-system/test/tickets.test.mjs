// 工单系统服务端业务验证：迁移 + 种子 + 关键事务（创建自动分配、完成与通知同事务、
// 评价唯一）+ 公司隔离/角色权限，基于隔离 DB_PATH 与真实 HTTP 服务。
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createApp } from '../src/server/app.ts'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'
import { registerProtectedRoutes, registerPublicRoutes } from '../src/server/routes.ts'
import { withHttpServer } from './with-http-server.mjs'

const directory = await mkdtemp(path.join(tmpdir(), 'ticket-business-'))
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

test('ticket system business flows', async (t) => {
  const { platform, app } = await startApp()

  await withHttpServer({ fetch: app.fetch, close: () => platform.close() }, async (url) => {
    const login = async (username) => {
      const response = await fetch(`${url}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password: 'demo-131' }),
      })
      assert.equal(response.status, 200, `login failed for ${username}`)
      const data = await response.json()
      assert.equal(typeof data.token, 'string')
      return data.token
    }

    const tokens = {}
    for (const username of ['a-admin', 'a-sub1', 'a-sub2', 'a-agent1', 'a-agent2', 'b-admin', 'b-sub1', 'b-agent1', 'ops1']) {
      tokens[username] = await login(username)
    }

    const request = async (token, apiPath, options = {}) => {
      const headers = { ...(options.headers ?? {}) }
      if (options.body !== undefined) headers['content-type'] = 'application/json'
      if (token) headers.authorization = `Bearer ${token}`
      const response = await fetch(`${url}${apiPath}`, { ...options, headers })
      const text = response.status === 204 ? '' : await response.text()
      return { status: response.status, body: text === '' ? undefined : JSON.parse(text) }
    }

    await t.test('auth: username login, me profile, contract error shape', async () => {
      const me = await request(tokens['a-sub1'], '/api/auth/me')
      assert.equal(me.status, 200)
      assert.deepEqual(me.body, {
        user: {
          id: me.body.user.id,
          displayName: 'a-sub1',
          email: 'a-sub1@example.com',
          department: '研发部',
          companyName: '华东科技',
          role: 'submitter',
        },
      })
      assert.ok(Number.isInteger(me.body.user.id) && me.body.user.id > 0)

      const ops = await request(tokens.ops1, '/api/auth/me')
      assert.equal(ops.status, 200)
      assert.equal(ops.body.user.role, 'platform_ops')
      assert.equal(ops.body.user.companyName, '华东科技')

      // 登录失败路径使用独立来源地址，避免占用演示账号的登录限流预算。
      const bad = await fetch(`${url}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
        body: JSON.stringify({ username: 'a-sub1', password: 'wrong' }),
      })
      assert.equal(bad.status, 401)
      assert.equal((await bad.json()).error.code, 'UNAUTHENTICATED')

      const missing = await fetch(`${url}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
        body: JSON.stringify({ username: 'a-sub1' }),
      })
      assert.equal(missing.status, 400)
      assert.equal((await missing.json()).error.code, 'INVALID_INPUT')

      const anonymous = await request(null, '/api/tickets')
      assert.equal(anonymous.status, 401)
      assert.equal(anonymous.body.error.code, 'UNAUTHENTICATED')
      assert.equal(typeof anonymous.body.error.message, 'string')

      const logout = await request(tokens['a-sub1'], '/api/auth/logout', { method: 'POST' })
      assert.equal(logout.status, 204)
    })

    const aCategories = (await request(tokens['a-sub1'], '/api/categories')).body.items
    const bCategories = (await request(tokens['b-sub1'], '/api/categories')).body.items
    const categoryByName = (items, name) => {
      const found = items.find((item) => item.name === name)
      assert.ok(found, `category ${name} should exist`)
      return found.id
    }
    const aGroups = (await request(tokens['a-agent1'], '/api/groups?members=1')).body.items
    const groupByName = (items, name) => {
      const found = items.find((item) => item.name === name)
      assert.ok(found, `group ${name} should exist`)
      return found.id
    }

    await t.test('seed: companies, users, groups, categories, assignment rules', async () => {
      assert.deepEqual(aCategories.map((item) => item.name).sort(), ['其他', '功能故障', '数据问题', '账号权限'])
      assert.equal(aCategories[0].companyId, 1)
      assert.deepEqual(bCategories.map((item) => item.name).sort(), ['其他', '功能故障', '数据问题', '账号权限'])
      assert.equal(bCategories[0].companyId, 2)

      assert.equal(aGroups.length, 2)
      const firstLine = aGroups.find((item) => item.name === '一线支持组')
      const secondLine = aGroups.find((item) => item.name === '二线专家组')
      assert.equal(firstLine.memberCount, 1)
      assert.deepEqual(firstLine.members.map((member) => member.displayName), ['a-agent1'])
      assert.equal(firstLine.members[0].role, 'agent')
      assert.equal(firstLine.members[0].companyName, '华东科技')
      assert.deepEqual(secondLine.members.map((member) => member.displayName), ['a-agent2'])

      const bGroups = (await request(tokens['b-agent1'], '/api/groups?members=1')).body.items
      assert.deepEqual(bGroups.map((item) => item.name), ['综合支持组'])
      assert.deepEqual(bGroups[0].members.map((member) => member.displayName), ['b-agent1'])

      const companies = await request(tokens.ops1, '/api/companies')
      assert.deepEqual(companies.body.items, [{ id: 1, name: '华东科技' }, { id: 2, name: '南方制造' }])
      assert.equal((await request(tokens['a-admin'], '/api/companies')).status, 403)
      assert.equal((await request(tokens.ops1, '/api/groups')).status, 403)

      const rules = await request(tokens['a-admin'], '/api/assignment-rules')
      assert.deepEqual(
        rules.body.items.map((item) => `${item.categoryName}→${item.groupName}`).sort(),
        ['功能故障→一线支持组', '数据问题→二线专家组'],
      )
      assert.equal((await request(tokens['a-sub1'], '/api/assignment-rules')).status, 403)
    })

    // 工单库存跟踪（统计断言使用）。
    const ticketIds = {}
    const createTicket = async (token, payload) => {
      const response = await request(token, '/api/tickets', { method: 'POST', body: JSON.stringify(payload) })
      return response
    }

    await t.test('create: auto assignment by category rule in one transaction', async () => {
      const created = await createTicket(tokens['a-sub1'], {
        subject: '登录后无法访问项目配置',
        description: '使用账号登录后，项目配置页面持续报错，无法进入。',
        categoryId: categoryByName(aCategories, '功能故障'),
        priority: 'P1',
      })
      assert.equal(created.status, 201)
      const ticket = created.body
      ticketIds.t1 = ticket.id
      assert.equal(ticket.ticketNo, 'TKT-000001')
      assert.equal(ticket.status, 'processing')
      assert.equal(ticket.groupName, '一线支持组')
      assert.equal(ticket.groupId, groupByName(aGroups, '一线支持组'))
      assert.equal(ticket.categoryName, '功能故障')
      assert.equal(ticket.priority, 'P1')
      assert.equal(ticket.companyName, '华东科技')
      assert.deepEqual(ticket.submitter, {
        id: ticket.submitter.id,
        displayName: 'a-sub1',
        email: 'a-sub1@example.com',
        department: '研发部',
        companyName: '华东科技',
        role: 'submitter',
      })
      assert.equal(ticket.firstReplyAt, null)
      assert.equal(ticket.completedAt, null)
      assert.equal(ticket.handlerId, null)
      assert.equal(ticket.rating, null)
      assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/.test(ticket.createdAt))

      const logs = await request(tokens['a-sub1'], `/api/tickets/${ticket.id}/logs`)
      assert.equal(logs.status, 200)
      assert.deepEqual(logs.body.items.map((item) => ({ action: item.action, actor: item.actor })), [
        { action: 'auto_assigned', actor: null },
      ])
      assert.equal(logs.body.items[0].detail, '按分类规则自动分配至「一线支持组」')

      // 未命中规则的分类：保持待分配，写 created 日志。
      const pending = await createTicket(tokens['a-sub1'], {
        subject: '申请开通导出权限',
        description: '需要按月导出报表数据，请开通导出权限。',
        categoryId: categoryByName(aCategories, '其他'),
        priority: 'P0',
      })
      assert.equal(pending.status, 201)
      ticketIds.t2 = pending.body.id
      assert.equal(pending.body.ticketNo, 'TKT-000002')
      assert.equal(pending.body.status, 'pending_assign')
      assert.equal(pending.body.groupId, null)
      const pendingLogs = await request(tokens['a-sub1'], `/api/tickets/${ticketIds.t2}/logs`)
      assert.deepEqual(pendingLogs.body.items.map((item) => ({ action: item.action, actor: item.actor.id })), [
        { action: 'created', actor: pendingLogs.body.items[0].actor.id },
      ])
      assert.equal(pendingLogs.body.items[0].action, 'created')
      assert.equal(pendingLogs.body.items[0].actor.displayName, 'a-sub1')

      // B 公司规则同样生效（账号权限 → 综合支持组）。
      const bCreated = await createTicket(tokens['b-sub1'], {
        subject: 'B 公司账号被锁定',
        description: '尝试多次登录后账号被锁定，请协助恢复。',
        categoryId: categoryByName(bCategories, '账号权限'),
        priority: 'P2',
      })
      assert.equal(bCreated.status, 201)
      ticketIds.t3 = bCreated.body.id
      assert.equal(bCreated.body.status, 'processing')
      assert.equal(bCreated.body.groupName, '综合支持组')
    })

    await t.test('create: validation and role guards', async () => {
      const base = { subject: '校验用工单', description: '校验用描述', categoryId: categoryByName(aCategories, '其他'), priority: 'P2' }
      assert.equal((await createTicket(tokens['a-sub1'], { ...base, subject: '' })).status, 400)
      assert.equal((await createTicket(tokens['a-sub1'], { ...base, subject: 'x'.repeat(201) })).status, 400)
      assert.equal((await createTicket(tokens['a-sub1'], { ...base, description: '' })).status, 400)
      assert.equal((await createTicket(tokens['a-sub1'], { ...base, priority: 'P9' })).body.error.code, 'INVALID_INPUT')
      assert.equal((await createTicket(tokens['a-sub1'], { ...base, categoryId: categoryByName(bCategories, '其他') })).status, 404)
      assert.equal((await createTicket(tokens['a-sub1'], { ...base, categoryId: 999999 })).status, 404)
      assert.equal((await createTicket(tokens.ops1, base)).status, 403)
    })

    await t.test('list: role visibility, scope, filters, search, sort', async () => {
      const sub1 = await request(tokens['a-sub1'], '/api/tickets')
      assert.equal(sub1.body.total, 2)
      assert.deepEqual(sub1.body.items.map((item) => item.ticketNo), ['TKT-000001', 'TKT-000002'])

      const agentGroupScope = await request(tokens['a-agent1'], '/api/tickets')
      assert.deepEqual(agentGroupScope.body.items.map((item) => item.ticketNo), ['TKT-000001'])

      const agent2GroupScope = await request(tokens['a-agent2'], '/api/tickets')
      assert.equal(agent2GroupScope.body.total, 0)

      const agentCompanyScope = await request(tokens['a-agent1'], '/api/tickets?scope=company')
      assert.equal(agentCompanyScope.body.total, 2)

      const admin = await request(tokens['a-admin'], '/api/tickets')
      assert.equal(admin.body.total, 2)

      const ops = await request(tokens.ops1, '/api/tickets')
      assert.equal(ops.body.total, 3)

      const opsCompany = await request(tokens.ops1, '/api/tickets?companyId=2')
      assert.deepEqual(opsCompany.body.items.map((item) => item.ticketNo), ['TKT-000003'])

      assert.equal((await request(tokens.ops1, '/api/tickets?companyId=999')).status, 404)

      // 非运营角色传入 companyId 被忽略并强制本公司；agent 默认组范围（一线）仍只有 t1。
      const forced = await request(tokens['a-agent1'], '/api/tickets?companyId=2')
      assert.equal(forced.body.total, 1)

      assert.equal((await request(tokens['a-admin'], '/api/tickets?status=pending_assign')).body.total, 1)
      assert.equal((await request(tokens['a-admin'], '/api/tickets?status=processing')).body.total, 1)
      assert.equal((await request(tokens['a-admin'], '/api/tickets?priority=P0')).body.total, 1)
      assert.equal(
        (await request(tokens['a-admin'], `/api/tickets?categoryId=${categoryByName(aCategories, '功能故障')}`)).body.total,
        1,
      )
      assert.equal((await request(tokens['a-admin'], `/api/tickets?groupId=${groupByName(aGroups, '一线支持组')}`)).body.total, 1)
      assert.equal((await request(tokens['a-admin'], '/api/tickets?q=%E6%97%A0%E6%B3%95%E8%AE%BF%E9%97%AE')).body.total, 1)
      assert.equal((await request(tokens['a-admin'], '/api/tickets?q=TKT-000002')).body.total, 1)
      assert.equal((await request(tokens['a-admin'], '/api/tickets?q=TKT-0000')).body.total, 0)
      assert.equal((await request(tokens['a-agent1'], '/api/tickets?mine=1')).body.total, 0)

      const prioritySorted = await request(tokens['a-admin'], '/api/tickets?sort=priority')
      assert.deepEqual(prioritySorted.body.items.map((item) => item.priority), ['P0', 'P1'])
      const priorityDesc = await request(tokens['a-admin'], '/api/tickets?sort=priority&order=desc')
      assert.deepEqual(priorityDesc.body.items.map((item) => item.priority), ['P1', 'P0'])
      const createdDesc = await request(tokens['a-admin'], '/api/tickets?order=desc')
      assert.deepEqual(createdDesc.body.items.map((item) => item.ticketNo), ['TKT-000002', 'TKT-000001'])

      assert.equal((await request(tokens['a-admin'], '/api/tickets?status=bad')).status, 400)
      assert.equal((await request(tokens['a-admin'], '/api/tickets?scope=team')).status, 400)
      assert.equal((await request(tokens['a-admin'], '/api/tickets?mine=2')).status, 400)
      assert.equal((await request(tokens['a-admin'], '/api/tickets?categoryId=x')).status, 400)
    })

    await t.test('detail: company isolation and submitter ownership', async () => {
      const detail = await request(tokens['a-agent1'], `/api/tickets/${ticketIds.t1}`)
      assert.equal(detail.status, 200)
      assert.equal(detail.body.replies.length, 0)
      assert.equal(detail.body.ticketNo, 'TKT-000001')

      assert.equal((await request(tokens['b-sub1'], `/api/tickets/${ticketIds.t1}`)).status, 404)
      assert.equal((await request(tokens['b-agent1'], `/api/tickets/${ticketIds.t1}`)).status, 404)
      assert.equal((await request(tokens['a-sub2'], `/api/tickets/${ticketIds.t1}`)).status, 404)
      assert.equal((await request(tokens.ops1, `/api/tickets/${ticketIds.t1}`)).status, 200)
      assert.equal((await request(tokens['a-sub1'], '/api/tickets/999999')).status, 404)
      assert.equal((await request(tokens['a-sub1'], '/api/tickets/abc')).status, 400)
    })

    await t.test('replies: multi round, author attribution, first reply time', async () => {
      const reply = async (token, content) =>
        request(token, `/api/tickets/${ticketIds.t1}/replies`, { method: 'POST', body: JSON.stringify({ content }) })

      const first = await reply(tokens['a-agent1'], '已定位到配置服务的权限问题，正在修复。')
      assert.equal(first.status, 201)
      assert.equal(first.body.ticketId, ticketIds.t1)
      assert.equal(first.body.author.displayName, 'a-agent1')
      assert.equal(first.body.author.role, 'agent')
      assert.equal(first.body.author.companyName, '华东科技')
      const firstReplyAt = first.body.createdAt

      assert.equal((await reply(tokens['a-sub1'], '感谢，请尽快恢复。')).status, 201)
      assert.equal((await reply(tokens['a-agent1'], '修复已提交，请验证。')).status, 201)
      assert.equal((await reply(tokens['a-sub1'], '已验证通过。')).status, 201)

      const detail = await request(tokens['a-sub1'], `/api/tickets/${ticketIds.t1}`)
      assert.equal(detail.body.replies.length, 4)
      assert.deepEqual(
        detail.body.replies.map((item) => item.author.displayName),
        ['a-agent1', 'a-sub1', 'a-agent1', 'a-sub1'],
      )
      assert.ok(detail.body.replies.every((item) => item.content.length > 0 && typeof item.createdAt === 'string'))
      // first_reply_at 只记录首次回复时间。
      assert.equal(detail.body.firstReplyAt, firstReplyAt)

      assert.equal((await request(tokens['b-agent1'], `/api/tickets/${ticketIds.t1}/replies`, { method: 'POST', body: JSON.stringify({ content: '越权回复' }) })).status, 404)
      assert.equal((await request(tokens.ops1, `/api/tickets/${ticketIds.t1}/replies`, { method: 'POST', body: JSON.stringify({ content: '只读角色' }) })).status, 403)
      assert.equal((await reply(tokens['a-sub1'], '')).status, 400)
      assert.equal((await reply(tokens['a-sub1'], 'x'.repeat(5001))).status, 400)
    })

    await t.test('assign and transfer: state machine and group scope', async () => {
      const assign = await request(tokens['a-agent1'], `/api/tickets/${ticketIds.t2}/assign`, {
        method: 'POST',
        body: JSON.stringify({ groupId: groupByName(aGroups, '二线专家组') }),
      })
      assert.equal(assign.status, 200)
      assert.equal(assign.body.status, 'processing')
      assert.equal(assign.body.groupName, '二线专家组')
      const assignLogs = await request(tokens['a-sub1'], `/api/tickets/${ticketIds.t2}/logs`)
      const assignedLog = assignLogs.body.items.find((item) => item.action === 'assigned')
      assert.equal(assignedLog.detail, '人工分配至「二线专家组」')
      assert.equal(assignedLog.actor.displayName, 'a-agent1')

      assert.equal(
        (await request(tokens['a-agent1'], `/api/tickets/${ticketIds.t2}/assign`, {
          method: 'POST',
          body: JSON.stringify({ groupId: groupByName(aGroups, '二线专家组') }),
        })).status,
        409,
      )

      const transfer = await request(tokens['a-agent1'], `/api/tickets/${ticketIds.t1}/transfer`, {
        method: 'POST',
        body: JSON.stringify({ groupId: groupByName(aGroups, '二线专家组'), reason: '需要资深专家处理' }),
      })
      assert.equal(transfer.status, 200)
      assert.equal(transfer.body.status, 'processing')
      assert.equal(transfer.body.groupName, '二线专家组')
      const transferLogs = await request(tokens['a-sub1'], `/api/tickets/${ticketIds.t1}/logs`)
      const transferredLog = transferLogs.body.items.find((item) => item.action === 'transferred')
      assert.equal(transferredLog.detail, '转派至「二线专家组」：需要资深专家处理')

      // 转派后组可见性切换：a-agent2（二线）可见 t1（转派）与 t2（人工分配），a-agent1（一线）组范围不可见。
      assert.deepEqual((await request(tokens['a-agent2'], '/api/tickets')).body.items.map((item) => item.ticketNo), ['TKT-000001', 'TKT-000002'])
      assert.equal((await request(tokens['a-agent1'], '/api/tickets')).body.total, 0)

      const pendingTicket = await createTicket(tokens['a-sub2'], {
        subject: '待分配工单无法转派校验',
        description: '该工单用于校验待分配状态不允许转派。',
        categoryId: categoryByName(aCategories, '其他'),
        priority: 'P2',
      })
      ticketIds.t4 = pendingTicket.body.id
      assert.equal(
        (await request(tokens['a-agent1'], `/api/tickets/${ticketIds.t4}/transfer`, {
          method: 'POST',
          body: JSON.stringify({ groupId: groupByName(aGroups, '一线支持组') }),
        })).status,
        409,
      )
      const bGroups = (await request(tokens['b-agent1'], '/api/groups')).body.items
      assert.equal(
        (await request(tokens['a-agent1'], `/api/tickets/${ticketIds.t2}/assign`, {
          method: 'POST',
          body: JSON.stringify({ groupId: bGroups[0].id }),
        })).status,
        404,
      )
      assert.equal((await request(tokens['a-sub1'], `/api/tickets/${ticketIds.t4}/assign`, { method: 'POST', body: JSON.stringify({ groupId: groupByName(aGroups, '一线支持组') }) })).status, 403)
    })

    await t.test('complete: notification written in the same transaction', async () => {
      const complete = await request(tokens['a-agent2'], `/api/tickets/${ticketIds.t1}/complete`, {
        method: 'POST',
        body: JSON.stringify({ resolution: '已修复配置服务的权限配置' }),
      })
      assert.equal(complete.status, 200)
      assert.equal(complete.body.status, 'completed')
      assert.equal(complete.body.handlerName, 'a-agent2')
      assert.ok(complete.body.completedAt)

      const notifications = await request(tokens['a-sub1'], '/api/notifications')
      assert.equal(notifications.body.items.length, 1)
      const notification = notifications.body.items[0]
      assert.equal(notification.ticketId, ticketIds.t1)
      assert.equal(notification.ticketNo, 'TKT-000001')
      assert.equal(notification.subject, '[工单完成] TKT-000001 登录后无法访问项目配置')
      assert.ok(notification.body.includes('TKT-000001'))
      assert.ok(notification.body.includes('登录后无法访问项目配置'))
      assert.ok(notification.body.includes('a-agent2'))
      assert.ok(notification.body.includes(complete.body.completedAt))
      assert.ok(notification.body.includes('满意度评价'))

      assert.equal((await request(tokens['a-sub2'], '/api/notifications')).body.items.length, 0)
      assert.equal((await request(tokens.ops1, '/api/notifications')).body.items.length, 0)
      assert.equal(
        (await request(tokens['a-agent2'], `/api/tickets/${ticketIds.t1}/complete`, { method: 'POST', body: JSON.stringify({}) })).status,
        409,
      )
      assert.equal((await request(tokens['a-sub1'], `/api/tickets/${ticketIds.t1}/complete`, { method: 'POST', body: JSON.stringify({}) })).status, 403)

      // 事务原子性：强制发件箱写入失败，完成状态必须整体回滚。
      const txTicket = await createTicket(tokens['a-sub2'], {
        subject: '事务原子性校验工单',
        description: '用于校验完成与通知写入位于同一事务。',
        categoryId: categoryByName(aCategories, '功能故障'),
        priority: 'P2',
      })
      ticketIds.t5 = txTicket.body.id
      assert.equal(txTicket.body.status, 'processing')

      await platform.db.exec(
        "CREATE TRIGGER block_notification_writes BEFORE INSERT ON email_notifications BEGIN SELECT RAISE(ABORT, 'notification write blocked'); END",
      )
      try {
        const blocked = await request(tokens['a-agent1'], `/api/tickets/${ticketIds.t5}/complete`, {
          method: 'POST',
          body: JSON.stringify({ resolution: '应当回滚' }),
        })
        assert.equal(blocked.status, 500)
        assert.equal(blocked.body.error.code, 'INTERNAL_ERROR')
        const afterBlock = await request(tokens['a-sub2'], `/api/tickets/${ticketIds.t5}`)
        assert.equal(afterBlock.body.status, 'processing')
        assert.equal(afterBlock.body.completedAt, null)
        assert.equal((await request(tokens['a-sub2'], '/api/notifications')).body.items.length, 0)
      } finally {
        await platform.db.exec('DROP TRIGGER block_notification_writes')
      }

      const retry = await request(tokens['a-agent1'], `/api/tickets/${ticketIds.t5}/complete`, {
        method: 'POST',
        body: JSON.stringify({ resolution: '已恢复写入' }),
      })
      assert.equal(retry.status, 200)
      assert.equal(retry.body.status, 'completed')
      assert.equal((await request(tokens['a-sub2'], '/api/notifications')).body.items.length, 1)
    })

    await t.test('rating: submitter-only, unique, reflected on ticket and logs', async () => {
      const rating = await request(tokens['a-sub1'], `/api/tickets/${ticketIds.t1}/rating`, {
        method: 'POST',
        body: JSON.stringify({ score: 5, comment: '处理非常及时' }),
      })
      assert.equal(rating.status, 200)
      assert.equal(rating.body.rating.score, 5)
      assert.equal(rating.body.rating.comment, '处理非常及时')
      assert.equal(rating.body.rating.raterId, (await request(tokens['a-sub1'], '/api/auth/me')).body.user.id)

      const detail = await request(tokens['a-sub1'], `/api/tickets/${ticketIds.t1}`)
      assert.equal(detail.body.rating.score, 5)

      assert.equal(
        (await request(tokens['a-sub1'], `/api/tickets/${ticketIds.t1}/rating`, {
          method: 'POST',
          body: JSON.stringify({ score: 4 }),
        })).status,
        409,
      )
      assert.equal(
        (await request(tokens['a-sub1'], `/api/tickets/${ticketIds.t2}/rating`, { method: 'POST', body: JSON.stringify({ score: 4 }) })).status,
        409,
      )
      assert.equal(
        (await request(tokens['a-sub2'], `/api/tickets/${ticketIds.t1}/rating`, { method: 'POST', body: JSON.stringify({ score: 4 }) })).status,
        404,
      )
      assert.equal(
        (await request(tokens['a-agent1'], `/api/tickets/${ticketIds.t1}/rating`, { method: 'POST', body: JSON.stringify({ score: 4 }) })).status,
        403,
      )
      assert.equal(
        (await request(tokens['a-sub1'], `/api/tickets/${ticketIds.t1}/rating`, { method: 'POST', body: JSON.stringify({ score: 0 }) })).status,
        400,
      )
      assert.equal(
        (await request(tokens['a-sub1'], `/api/tickets/${ticketIds.t1}/rating`, { method: 'POST', body: JSON.stringify({ score: '5' }) })).status,
        400,
      )
      const ratedLog = (await request(tokens['a-sub1'], `/api/tickets/${ticketIds.t1}/logs`)).body.items.find((item) => item.action === 'rated')
      assert.equal(ratedLog.detail, '满意度评价 5/5')
    })

    await t.test('cancel: terminal state and role rules', async () => {
      const cancel = await request(tokens['a-sub1'], `/api/tickets/${ticketIds.t2}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: '不再需要' }),
      })
      assert.equal(cancel.status, 200)
      assert.equal(cancel.body.status, 'cancelled')
      assert.ok(cancel.body.cancelledAt)
      const cancelLogs = await request(tokens['a-sub1'], `/api/tickets/${ticketIds.t2}/logs`)
      const cancelledLog = cancelLogs.body.items.find((item) => item.action === 'cancelled')
      assert.equal(cancelledLog.detail, '取消工单：不再需要')

      assert.equal(
        (await request(tokens['a-sub1'], `/api/tickets/${ticketIds.t2}/cancel`, { method: 'POST', body: JSON.stringify({}) })).status,
        409,
      )
      assert.equal(
        (await request(tokens['a-sub1'], `/api/tickets/${ticketIds.t2}/replies`, { method: 'POST', body: JSON.stringify({ content: '终态不可回复' }) })).status,
        409,
      )
      assert.equal(
        (await request(tokens['a-agent1'], `/api/tickets/${ticketIds.t4}/cancel`, { method: 'POST', body: JSON.stringify({}) })).status,
        403,
      )
      assert.equal(
        (await request(tokens['a-sub1'], `/api/tickets/${ticketIds.t1}/cancel`, { method: 'POST', body: JSON.stringify({}) })).status,
        409,
      )

      // company_admin 可取消本公司工单；submitter 可取消本人工单。
      assert.equal(
        (await request(tokens['b-admin'], `/api/tickets/${ticketIds.t3}/cancel`, { method: 'POST', body: JSON.stringify({ reason: '重复提交' }) })).status,
        200,
      )
      const bPending = await createTicket(tokens['b-sub1'], {
        subject: 'B 公司待分配取消校验',
        description: '用于校验提交人取消待分配工单。',
        categoryId: categoryByName(bCategories, '其他'),
        priority: 'P3',
      })
      ticketIds.t6 = bPending.body.id
      assert.equal(
        (await request(tokens['b-sub1'], `/api/tickets/${ticketIds.t6}/cancel`, { method: 'POST', body: JSON.stringify({}) })).status,
        200,
      )
    })

    await t.test('submitter profile with ticket history', async () => {
      const submitter = await request(tokens['a-agent1'], `/api/tickets/${ticketIds.t1}/submitter`)
      assert.equal(submitter.status, 200)
      assert.equal(submitter.body.displayName, 'a-sub1')
      assert.equal(submitter.body.companyName, '华东科技')
      assert.equal(submitter.body.department, '研发部')
      assert.equal(submitter.body.role, 'submitter')
      assert.deepEqual(
        submitter.body.historyTickets.map((item) => item.ticketNo),
        ['TKT-000002', 'TKT-000001'],
      )
      assert.deepEqual(
        submitter.body.historyTickets.map((item) => item.status),
        ['cancelled', 'completed'],
      )
      assert.equal((await request(tokens['a-sub1'], `/api/tickets/${ticketIds.t1}/submitter`)).status, 403)
      assert.equal((await request(tokens['b-agent1'], `/api/tickets/${ticketIds.t1}/submitter`)).status, 404)
    })

    const createdGroups = {}
    const createdCategories = {}
    const createdRules = {}
    await t.test('organization: groups, members, categories, assignment rules', async () => {
      assert.equal((await request(tokens['a-sub1'], '/api/groups', { method: 'POST', body: JSON.stringify({ name: '三线组' }) })).status, 403)

      const newGroup = await request(tokens['a-admin'], '/api/groups', { method: 'POST', body: JSON.stringify({ name: '三线组' }) })
      assert.equal(newGroup.status, 201)
      assert.equal(newGroup.body.name, '三线组')
      assert.equal(newGroup.body.companyId, 1)
      assert.equal(newGroup.body.memberCount, 0)
      createdGroups.third = newGroup.body.id

      assert.equal((await request(tokens['a-admin'], '/api/groups', { method: 'POST', body: JSON.stringify({ name: '三线组' }) })).status, 409)
      assert.equal((await request(tokens['a-admin'], '/api/groups', { method: 'POST', body: JSON.stringify({ name: '' }) })).status, 400)
      assert.equal((await request(tokens['b-admin'], '/api/groups', { method: 'POST', body: JSON.stringify({ name: '综合支持组' }) })).status, 409)

      const agent2Id = (await request(tokens['a-admin'], '/api/groups?members=1')).body.items
        .find((item) => item.name === '二线专家组').members[0].id
      assert.equal(
        (await request(tokens['a-admin'], `/api/groups/${createdGroups.third}/members`, { method: 'POST', body: JSON.stringify({ userProfileId: agent2Id }) })).status,
        201,
      )
      assert.equal(
        (await request(tokens['a-admin'], `/api/groups/${createdGroups.third}/members`, { method: 'POST', body: JSON.stringify({ userProfileId: agent2Id }) })).status,
        409,
      )
      const bAgentId = (await request(tokens['b-admin'], '/api/groups?members=1')).body.items[0].members[0].id
      assert.equal(
        (await request(tokens['a-admin'], `/api/groups/${createdGroups.third}/members`, { method: 'POST', body: JSON.stringify({ userProfileId: bAgentId }) })).status,
        404,
      )
      assert.equal(
        (await request(tokens['b-admin'], `/api/groups/${createdGroups.third}/members`, { method: 'POST', body: JSON.stringify({ userProfileId: bAgentId }) })).status,
        404,
      )
      const membersNow = (await request(tokens['a-agent1'], '/api/groups?members=1')).body.items
        .find((item) => item.name === '三线组')
      assert.deepEqual(membersNow.members.map((member) => member.displayName), ['a-agent2'])

      assert.equal(
        (await request(tokens['a-admin'], `/api/groups/${createdGroups.third}/members/${agent2Id}`, { method: 'DELETE' })).status,
        204,
      )
      assert.equal(
        (await request(tokens['a-admin'], `/api/groups/${createdGroups.third}/members/${agent2Id}`, { method: 'DELETE' })).status,
        404,
      )

      const newCategory = await request(tokens['a-admin'], '/api/categories', { method: 'POST', body: JSON.stringify({ name: '性能问题' }) })
      assert.equal(newCategory.status, 201)
      createdCategories.performance = newCategory.body.id
      assert.equal((await request(tokens['a-admin'], '/api/categories', { method: 'POST', body: JSON.stringify({ name: '性能问题' }) })).status, 409)
      assert.equal((await request(tokens['a-sub1'], '/api/categories', { method: 'POST', body: JSON.stringify({ name: '越权分类' }) })).status, 403)

      const rule = await request(tokens['a-admin'], '/api/assignment-rules', {
        method: 'POST',
        body: JSON.stringify({ categoryId: createdCategories.performance, groupId: createdGroups.third }),
      })
      assert.equal(rule.status, 201)
      assert.equal(rule.body.categoryName, '性能问题')
      assert.equal(rule.body.groupName, '三线组')
      createdRules.id = rule.body.id
      assert.equal(
        (await request(tokens['a-admin'], '/api/assignment-rules', {
          method: 'POST',
          body: JSON.stringify({ categoryId: createdCategories.performance, groupId: createdGroups.third }),
        })).status,
        409,
      )
      assert.equal(
        (await request(tokens['a-admin'], '/api/assignment-rules', {
          method: 'POST',
          body: JSON.stringify({ categoryId: categoryByName(bCategories, '其他'), groupId: createdGroups.third }),
        })).status,
        404,
      )
      assert.equal(
        (await request(tokens['a-admin'], '/api/assignment-rules', {
          method: 'POST',
          body: JSON.stringify({ categoryId: createdCategories.performance, groupId: (await request(tokens['b-agent1'], '/api/groups')).body.items[0].id }),
        })).status,
        404,
      )

      // 新规则即时生效：新工单按分类自动进入三线组。
      const routed = await createTicket(tokens['a-sub1'], {
        subject: '新分类自动分配校验',
        description: '配置新规则后创建，应自动分配到三线组。',
        categoryId: createdCategories.performance,
        priority: 'P3',
      })
      ticketIds.t7 = routed.body.id
      assert.equal(routed.body.status, 'processing')
      assert.equal(routed.body.groupName, '三线组')

      assert.equal((await request(tokens['a-admin'], `/api/assignment-rules/${createdRules.id}`, { method: 'DELETE' })).status, 204)
      assert.equal((await request(tokens['a-admin'], `/api/assignment-rules/${createdRules.id}`, { method: 'DELETE' })).status, 404)
    })

    await t.test('stats: distribution and dashboard with company isolation', async () => {
      const aDistribution = await request(tokens['a-sub1'], '/api/stats/distribution?dimension=company')
      assert.equal(aDistribution.status, 200)
      assert.deepEqual(aDistribution.body, { dimension: 'company', items: [{ key: '1', label: '华东科技', count: 5 }] })

      const bDistribution = await request(tokens['b-sub1'], '/api/stats/distribution?dimension=company')
      assert.deepEqual(bDistribution.body, { dimension: 'company', items: [{ key: '2', label: '南方制造', count: 2 }] })

      const forcedCompany = await request(tokens['a-sub1'], '/api/stats/distribution?dimension=company&companyId=2')
      assert.deepEqual(forcedCompany.body.items, [{ key: '1', label: '华东科技', count: 5 }])

      const opsDistribution = await request(tokens.ops1, '/api/stats/distribution?dimension=company')
      assert.deepEqual(opsDistribution.body.items, [
        { key: '1', label: '华东科技', count: 5 },
        { key: '2', label: '南方制造', count: 2 },
      ])
      const opsFocused = await request(tokens.ops1, '/api/stats/distribution?dimension=company&companyId=2')
      assert.deepEqual(opsFocused.body.items, [{ key: '2', label: '南方制造', count: 2 }])
      assert.equal((await request(tokens.ops1, '/api/stats/distribution?dimension=department')).status, 400)
      assert.equal((await request(tokens.ops1, '/api/stats/distribution?dimension=company&companyId=999')).status, 404)

      const aDepartments = await request(tokens['a-sub1'], '/api/stats/distribution?dimension=department')
      assert.deepEqual(aDepartments.body, {
        dimension: 'department',
        items: [
          { key: '研发部', label: '研发部', count: 3 },
          { key: '运维部', label: '运维部', count: 2 },
        ],
      })
      const opsDepartments = await request(tokens.ops1, '/api/stats/distribution?dimension=department&companyId=1')
      assert.deepEqual(opsDepartments.body.items, [
        { key: '研发部', label: '研发部', count: 3 },
        { key: '运维部', label: '运维部', count: 2 },
      ])

      const dashboard = await request(tokens['a-sub1'], '/api/stats/dashboard')
      assert.equal(dashboard.status, 200)
      assert.equal(dashboard.body.totalTickets, 5)
      assert.deepEqual(dashboard.body.byStatus, { pending_assign: 1, processing: 1, completed: 2, cancelled: 1 })
      assert.equal(dashboard.body.respondedTickets, 1)
      assert.ok(dashboard.body.avgResponseSeconds !== null && dashboard.body.avgResponseSeconds >= 0)
      assert.ok(dashboard.body.avgResponseSeconds < 3600)
      assert.equal(dashboard.body.ratedTickets, 1)
      assert.equal(dashboard.body.avgRating, 5)
      assert.deepEqual(
        dashboard.body.topCategories.map((item) => `${item.name}:${item.count}`),
        ['功能故障:2', '其他:2', '性能问题:1'],
      )

      const bDashboard = await request(tokens['b-sub1'], '/api/stats/dashboard')
      assert.equal(bDashboard.body.totalTickets, 2)
      assert.deepEqual(bDashboard.body.byStatus, { pending_assign: 0, processing: 0, completed: 0, cancelled: 2 })
      assert.equal(bDashboard.body.respondedTickets, 0)
      assert.equal(bDashboard.body.avgResponseSeconds, null)
      assert.equal(bDashboard.body.ratedTickets, 0)
      assert.equal(bDashboard.body.avgRating, null)
      assert.deepEqual(
        bDashboard.body.topCategories.map((item) => `${item.name}:${item.count}`),
        ['账号权限:1', '其他:1'],
      )

      const opsDashboard = await request(tokens.ops1, '/api/stats/dashboard')
      assert.equal(opsDashboard.body.totalTickets, 7)
      assert.equal((await request(tokens.ops1, '/api/stats/dashboard?companyId=2')).body.totalTickets, 2)
      assert.equal((await request(tokens.ops1, '/api/stats/dashboard?companyId=999')).status, 404)
      assert.equal((await request(tokens['a-sub1'], '/api/stats/dashboard?dimension=bad')).status, 200)
    })
  })
})

test('seed is idempotent when the application restarts on the same database', async () => {
  const { platform, app } = await startApp()
  try {
    const counts = {}
    for (const table of ['companies', 'user_profiles', 'business_groups', 'categories', 'assignment_rules', 'tickets', 'email_notifications']) {
      const row = await platform.db.queryOne({ text: `SELECT COUNT(*) AS total FROM ${table}` })
      counts[table] = Number(row?.total ?? 0)
    }
    assert.deepEqual(counts, {
      companies: 2,
      user_profiles: 9,
      business_groups: 4,
      categories: 9,
      // 种子 3 条 + 组织子测试创建 1 条后已删除，重启后仍为 3。
      assignment_rules: 3,
      tickets: 7,
      email_notifications: 2,
    })

    await withHttpServer({ fetch: app.fetch, close: () => platform.close() }, async (url) => {
      const response = await fetch(`${url}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'a-sub1', password: 'demo-131' }),
      })
      assert.equal(response.status, 200)
      const { token } = await response.json()
      const me = await fetch(`${url}/api/auth/me`, { headers: { authorization: `Bearer ${token}` } })
      assert.equal(me.status, 200)
      assert.equal((await me.json()).user.displayName, 'a-sub1')
      const tickets = await fetch(`${url}/api/tickets`, { headers: { authorization: `Bearer ${token}` } })
      // a-sub1 共 3 张工单（t1/t2/t7）。
      assert.equal((await tickets.json()).total, 3)
    })
  } finally {
    await platform.close()
  }
})
