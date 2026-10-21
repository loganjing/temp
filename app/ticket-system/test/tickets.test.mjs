import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { createApp } from '../src/server/app.ts'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'
import { registerProtectedRoutes, registerPublicRoutes } from '../src/server/routes.ts'
import { withHttpServer } from './with-http-server.mjs'

// 工单系统服务端集成验证：真实 HTTP 监听 + 隔离 SQLite 文件库。
// 覆盖技术契约的关键路径与失败边界（状态机非法流转、越权 404、邮件 skipped/failed、统计口径、契约错误码）。

async function startServer({ smtpHost, smtpPort } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'ticket-server-'))
  const env = { DB_PATH: process.env.DB_PATH, SMTP_HOST: process.env.SMTP_HOST, SMTP_PORT: process.env.SMTP_PORT }
  process.env.DB_PATH = path.join(directory, 'application.db')
  if (smtpHost === undefined) delete process.env.SMTP_HOST
  else process.env.SMTP_HOST = smtpHost
  if (smtpPort === undefined) delete process.env.SMTP_PORT
  else process.env.SMTP_PORT = String(smtpPort)
  const platform = await initializePlatform()
  const app = createApp({
    registerPublicRoutes: (routes) => registerPublicRoutes(routes, platform),
    registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
    protect: platform.auth.requireAnyAuth,
  })
  const restoreEnv = () => {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
  return {
    platform,
    app,
    cleanup: async () => {
      await platform.close()
      restoreEnv()
      await rm(directory, { recursive: true, force: true })
    },
  }
}

async function call(url, token, method, route, body) {
  const response = await fetch(`${url}${route}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  return { status: response.status, body: text === '' ? null : JSON.parse(text) }
}

const login = (url, username, password) => call(url, null, 'POST', '/api/auth/login', { username, password })

test('ticket system end-to-end server behaviour (AC-01..AC-13 server side)', async (t) => {
  const { app, cleanup } = await startServer()
  try {
    await withHttpServer({ fetch: app.fetch, close: cleanup }, async (url) => {
      const state = {}

      await t.test('unauthenticated access is rejected with contract error shape', async () => {
        const denied = await call(url, null, 'GET', '/api/tickets')
        assert.equal(denied.status, 401)
        assert.equal(denied.body.error.code, 'UNAUTHORIZED')
        assert.equal(typeof denied.body.error.message, 'string')
      })

      await t.test('cold-start bootstrap creates the initial admin (AC-05 config side)', async () => {
        const status = await call(url, null, 'GET', '/api/auth/bootstrap-status')
        assert.equal(status.status, 200)
        assert.equal(status.body.required, true)

        const bad = await call(url, null, 'POST', '/api/auth/bootstrap', { username: 'a', password: 'short' })
        assert.equal(bad.status, 400)
        assert.equal(bad.body.error.code, 'VALIDATION')

        const created = await call(url, null, 'POST', '/api/auth/bootstrap', {
          username: 'admin1',
          password: 'admin-pass-123',
          displayName: '管理员甲',
        })
        assert.equal(created.status, 201)
        assert.equal(created.body.ok, true)

        const reopened = await call(url, null, 'POST', '/api/auth/bootstrap', { username: 'other', password: 'other-pass-123' })
        assert.equal(reopened.status, 409)
      })

      await t.test('admin login returns the contract user shape (AC-01 auth basis)', async () => {
        const wrong = await login(url, 'admin1', 'wrong-password')
        assert.equal(wrong.status, 401)
        assert.equal(wrong.body.error.code, 'INVALID_CREDENTIALS')

        const ok = await login(url, 'admin1', 'admin-pass-123')
        assert.equal(ok.status, 200)
        assert.equal(ok.body.user.username, 'admin1')
        assert.equal(ok.body.user.role, 'admin')
        assert.equal(ok.body.user.displayName, '管理员甲')
        assert.equal(typeof ok.body.token, 'string')
        state.admin = ok.body.token

        const me = await call(url, state.admin, 'GET', '/api/me')
        assert.equal(me.status, 200)
        assert.equal(me.body.role, 'admin')
        assert.equal(me.body.username, 'admin1')
      })

      await t.test('admin provisions companies, groups, members and routing rules (AC-05)', async () => {
        const companyA = await call(url, state.admin, 'POST', '/api/companies', { name: '甲公司' })
        assert.equal(companyA.status, 201)
        state.companyA = companyA.body.id

        const companyB = await call(url, state.admin, 'POST', '/api/companies', { name: '乙公司' })
        state.companyB = companyB.body.id

        const duplicateCompany = await call(url, state.admin, 'POST', '/api/companies', { name: '甲公司' })
        assert.equal(duplicateCompany.status, 409)
        assert.equal(duplicateCompany.body.error.code, 'DUPLICATE_COMPANY')

        const categories = await call(url, state.admin, 'GET', '/api/categories')
        assert.equal(categories.status, 200)
        assert.equal(categories.body.items.length, 6)
        state.categoryLogin = categories.body.items.find((c) => c.name === '登录故障').id
        state.categoryOther = categories.body.items.find((c) => c.name === '其他').id

        const users = [
          { username: 'submitter-a1', password: 'submitter-pass-1', displayName: '提交人甲一', email: 'a1@example.com', companyId: state.companyA, department: '研发部', role: 'submitter' },
          { username: 'submitter-b1', password: 'submitter-pass-2', displayName: '提交人乙一', email: 'b1@example.com', companyId: state.companyB, department: '市场部', role: 'submitter' },
          { username: 'agent-g1', password: 'agent-pass-0001', displayName: '处理人组一', email: 'g1@example.com', companyId: state.companyA, department: '运营部', role: 'agent' },
          { username: 'agent-g2', password: 'agent-pass-0002', displayName: '处理人组二', email: 'g2@example.com', companyId: state.companyA, department: '运营部', role: 'agent' },
          { username: 'viewer-1', password: 'viewer-pass-01', displayName: '统计查看', email: 'viewer@example.com', companyId: state.companyA, department: '运营部', role: 'viewer' },
        ]
        for (const user of users) {
          const created = await call(url, state.admin, 'POST', '/api/users', user)
          assert.equal(created.status, 201, JSON.stringify(created.body))
          assert.equal(created.body.username, user.username)
          assert.equal(created.body.companyName, user.companyId === state.companyA ? '甲公司' : '乙公司')
        }

        const taken = await call(url, state.admin, 'POST', '/api/users', users[0])
        assert.equal(taken.status, 409)
        assert.equal(taken.body.error.code, 'USERNAME_TAKEN')

        const group1 = await call(url, state.admin, 'POST', `/api/companies/${state.companyA}/groups`, { name: '一线支持组' })
        assert.equal(group1.status, 201)
        assert.equal(group1.body.memberCount, 0)
        state.group1 = group1.body.id

        const duplicateGroup = await call(url, state.admin, 'POST', `/api/companies/${state.companyA}/groups`, { name: '一线支持组' })
        assert.equal(duplicateGroup.status, 409)
        assert.equal(duplicateGroup.body.error.code, 'DUPLICATE_GROUP')

        const group2 = await call(url, state.admin, 'POST', `/api/companies/${state.companyA}/groups`, { name: '二线支持组' })
        state.group2 = group2.body.id
        const groupB = await call(url, state.admin, 'POST', `/api/companies/${state.companyB}/groups`, { name: '乙公司支持组' })
        state.groupB = groupB.body.id

        const accounts = await call(url, state.admin, 'GET', '/api/users')
        state.userId = {}
        for (const item of accounts.body.items) state.userId[item.username] = item.userId

        const member1 = await call(url, state.admin, 'POST', `/api/groups/${state.group1}/members`, { userId: state.userId['agent-g1'] })
        assert.equal(member1.status, 201)
        assert.equal(member1.body.displayName, '处理人组一')
        const member2 = await call(url, state.admin, 'POST', `/api/groups/${state.group2}/members`, { userId: state.userId['agent-g2'] })
        assert.equal(member2.status, 201)
        const duplicateMember = await call(url, state.admin, 'POST', `/api/groups/${state.group1}/members`, { userId: state.userId['agent-g1'] })
        assert.equal(duplicateMember.status, 409)
        assert.equal(duplicateMember.body.error.code, 'DUPLICATE_MEMBER')

        const rule = await call(url, state.admin, 'POST', `/api/companies/${state.companyA}/routing-rules`, {
          categoryId: state.categoryLogin,
          groupId: state.group1,
        })
        assert.equal(rule.status, 201)
        assert.equal(rule.body.categoryName, '登录故障')
        assert.equal(rule.body.groupName, '一线支持组')

        const mismatch = await call(url, state.admin, 'POST', `/api/companies/${state.companyA}/routing-rules`, {
          categoryId: state.categoryOther,
          groupId: state.groupB,
        })
        assert.equal(mismatch.status, 400)
        assert.equal(mismatch.body.error.code, 'RULE_GROUP_MISMATCH')

        const duplicateRule = await call(url, state.admin, 'POST', `/api/companies/${state.companyA}/routing-rules`, {
          categoryId: state.categoryLogin,
          groupId: state.group1,
        })
        assert.equal(duplicateRule.status, 409)
        assert.equal(duplicateRule.body.error.code, 'DUPLICATE_RULE')

        state.submitterA = (await login(url, 'submitter-a1', 'submitter-pass-1')).body.token
        state.submitterB = (await login(url, 'submitter-b1', 'submitter-pass-2')).body.token
        state.agent1 = (await login(url, 'agent-g1', 'agent-pass-0001')).body.token
        state.agent2 = (await login(url, 'agent-g2', 'agent-pass-0002')).body.token
        state.viewer = (await login(url, 'viewer-1', 'viewer-pass-01')).body.token
      })

      await t.test('role gate: user management and ticket creation enforce the contract matrix', async () => {
        const notAdmin = await call(url, state.submitterA, 'GET', '/api/users')
        assert.equal(notAdmin.status, 403)
        assert.equal(notAdmin.body.error.code, 'FORBIDDEN')

        const viewerCreates = await call(url, state.viewer, 'POST', '/api/tickets', {
          subject: '越权提交', description: 'viewer 不应能建工单', categoryId: state.categoryLogin, priority: 'P1',
        })
        assert.equal(viewerCreates.status, 403)

        const agentCreates = await call(url, state.agent1, 'POST', '/api/tickets', {
          subject: '越权提交', description: 'agent 不应能建工单', categoryId: state.categoryLogin, priority: 'P1',
        })
        assert.equal(agentCreates.status, 403)

        const adminLists = await call(url, state.admin, 'GET', '/api/tickets')
        assert.equal(adminLists.status, 403)
      })

      await t.test('submitter creates tickets with auto-assignment and queue fallback (AC-01, AC-04, AC-05)', async () => {
        const invalid = await call(url, state.submitterA, 'POST', '/api/tickets', { subject: '', description: 'x', categoryId: state.categoryLogin, priority: 'P9' })
        assert.equal(invalid.status, 400)
        assert.equal(invalid.body.error.code, 'VALIDATION')

        const unknownCategory = await call(url, state.submitterA, 'POST', '/api/tickets', {
          subject: '分类不存在', description: '描述', categoryId: 9999, priority: 'P2',
        })
        assert.equal(unknownCategory.status, 400)

        const assigned = await call(url, state.submitterA, 'POST', '/api/tickets', {
          subject: '无法登录邮箱', description: '提交后自动分配到一线支持组', categoryId: state.categoryLogin, priority: 'P2',
        })
        assert.equal(assigned.status, 201)
        assert.equal(assigned.body.ticket.status, 'in_progress')
        assert.equal(assigned.body.ticket.assignedGroupId, state.group1)
        assert.equal(assigned.body.ticket.assignedGroupName, '一线支持组')
        assert.equal(assigned.body.ticket.ticketNo, 'TK-000001')
        assert.equal(assigned.body.ticket.companyName, '甲公司')
        assert.equal(assigned.body.ticket.submitterName, '提交人甲一')
        assert.equal(assigned.body.ticket.priority, 'P2')
        assert.equal(assigned.body.ticket.categoryName, '登录故障')
        assert.equal(typeof assigned.body.ticket.createdAt, 'string')
        state.ticket1 = assigned.body.ticket.id

        const queued = await call(url, state.submitterA, 'POST', '/api/tickets', {
          subject: '其他问题待分配', description: '没有匹配的分类规则', categoryId: state.categoryOther, priority: 'P1',
        })
        assert.equal(queued.status, 201)
        assert.equal(queued.body.ticket.status, 'pending_assignment')
        assert.equal(queued.body.ticket.assignedGroupId, null)
        state.ticket2 = queued.body.ticket.id
      })

      await t.test('company isolation hides other companies (AC-03)', async () => {
        const bTicket = await call(url, state.submitterB, 'POST', '/api/tickets', {
          subject: '乙公司工单', description: '乙公司无规则', categoryId: state.categoryLogin, priority: 'P3',
        })
        assert.equal(bTicket.status, 201)
        assert.equal(bTicket.body.ticket.status, 'pending_assignment')
        state.ticket3 = bTicket.body.ticket.id

        const bList = await call(url, state.submitterB, 'GET', '/api/tickets')
        assert.equal(bList.status, 200)
        assert.deepEqual(bList.body.items.map((i) => i.id), [state.ticket3])

        const aList = await call(url, state.submitterA, 'GET', '/api/tickets')
        assert.deepEqual(aList.body.items.map((i) => i.id).sort(), [state.ticket1, state.ticket2].sort())
        // 公司筛选参数对 submitter 无效（本人视图强制）。
        const aFiltered = await call(url, state.submitterA, 'GET', `/api/tickets?companyId=${state.companyB}`)
        assert.equal(aFiltered.body.items.length, 2)

        const crossDetail = await call(url, state.submitterB, 'GET', `/api/tickets/${state.ticket1}`)
        assert.equal(crossDetail.status, 404)
        assert.equal(crossDetail.body.error.code, 'NOT_FOUND')

        const crossLogs = await call(url, state.submitterB, 'GET', `/api/tickets/${state.ticket1}/logs`)
        assert.equal(crossLogs.status, 404)

        const crossReply = await call(url, state.submitterB, 'POST', `/api/tickets/${state.ticket1}/replies`, { content: '越权回复' })
        assert.equal(crossReply.status, 404)
      })

      await t.test('multi-round replies from both sides in order (AC-02)', async () => {
        const replies = [
          [state.submitterA, '补充：登录页提示密码错误'],
          [state.agent1, '已收到，正在排查账号状态'],
          [state.submitterA, '今天早上还好好的'],
          [state.agent1, '已定位为密码过期，稍后重置'],
        ]
        for (const [token, content] of replies) {
          const reply = await call(url, token, 'POST', `/api/tickets/${state.ticket1}/replies`, { content })
          assert.equal(reply.status, 201)
        }

        const detail = await call(url, state.submitterA, 'GET', `/api/tickets/${state.ticket1}`)
        assert.equal(detail.body.replies.length, 4)
        assert.deepEqual(detail.body.replies.map((r) => r.authorSide), ['submitter', 'agent', 'submitter', 'agent'])
        assert.deepEqual(detail.body.replies.map((r) => r.content), replies.map(([, content]) => content))
        assert.equal(detail.body.replies[1].authorName, '处理人组一')
        assert.equal(typeof detail.body.replies[0].createdAt, 'string')
      })

      await t.test('agent workbench filters, searches and sorts (AC-12)', async () => {
        const workbench = await call(url, state.agent1, 'GET', '/api/tickets?status=in_progress')
        assert.equal(workbench.status, 200)
        assert.deepEqual(workbench.body.items.map((i) => i.id), [state.ticket1])
        assert.equal(workbench.body.total, 1)

        const byCompany = await call(url, state.agent1, 'GET', `/api/tickets?status=in_progress&companyId=${state.companyB}`)
        assert.equal(byCompany.body.items.length, 0)

        const bySearch = await call(url, state.agent1, 'GET', '/api/tickets?search=TK-000001')
        assert.deepEqual(bySearch.body.items.map((i) => i.id), [state.ticket1])
        const bySubject = await call(url, state.agent1, 'GET', '/api/tickets?search=邮箱')
        assert.deepEqual(bySubject.body.items.map((i) => i.id), [state.ticket1])
        const byNoMatch = await call(url, state.agent1, 'GET', '/api/tickets?search=不存在的内容')
        assert.equal(byNoMatch.body.items.length, 0)

        // 多工单下按优先级与创建时间排序（T1 P2、T2 P1 由 submitter 建立；agent 只见已分配的 T1，此处验证排序契约参数本身）。
        await call(url, state.submitterA, 'POST', '/api/tickets', {
          subject: '再次无法登录', description: '第二张命中规则的工单', categoryId: state.categoryLogin, priority: 'P0',
        })
        const prioritySorted = await call(url, state.agent1, 'GET', '/api/tickets?sort=priority&order=asc')
        const priorities = prioritySorted.body.items.map((i) => i.priority)
        assert.deepEqual(priorities, [...priorities].sort())
        const createdSorted = await call(url, state.agent1, 'GET', '/api/tickets?sort=createdAt&order=desc')
        assert.equal(createdSorted.body.items[0].priority, 'P0')

        const badSort = await call(url, state.agent1, 'GET', '/api/tickets?sort=owner')
        assert.equal(badSort.status, 400)
      })

      await t.test('agent sees the full submitter profile and history (AC-07)', async () => {
        const detail = await call(url, state.agent1, 'GET', `/api/tickets/${state.ticket1}`)
        assert.equal(detail.body.submitter.displayName, '提交人甲一')
        assert.equal(detail.body.submitter.email, 'a1@example.com')
        assert.equal(detail.body.submitter.companyName, '甲公司')
        assert.equal(detail.body.submitter.department, '研发部')
        assert.equal(detail.body.submitter.historyTotal, 3)
        assert.equal(detail.body.submitterHistory.length, 3)
        assert.equal(detail.body.submitterHistory[0].ticketNo, 'TK-000004')
        assert.equal(detail.body.description, '提交后自动分配到一线支持组')
        // emailLog 仅 agent/admin 视角返回。
        assert.equal(detail.body.emailLog, null)
      })

      await t.test('transfer to another group of the same company (AC-06) with failure boundaries', async () => {
        const transferred = await call(url, state.agent1, 'POST', `/api/tickets/${state.ticket1}/transfer`, { targetGroupId: state.group2 })
        assert.equal(transferred.status, 200)
        assert.equal(transferred.body.status, 'in_progress')
        assert.equal(transferred.body.assignedGroupName, '二线支持组')

        const sameGroup = await call(url, state.agent2, 'POST', `/api/tickets/${state.ticket1}/transfer`, { targetGroupId: state.group2 })
        assert.equal(sameGroup.status, 409)
        assert.equal(sameGroup.body.error.code, 'SAME_GROUP')

        const crossCompany = await call(url, state.agent2, 'POST', `/api/tickets/${state.ticket1}/transfer`, { targetGroupId: state.groupB })
        assert.equal(crossCompany.status, 400)
        assert.equal(crossCompany.body.error.code, 'TARGET_COMPANY_MISMATCH')

        const submitterTransfers = await call(url, state.submitterA, 'POST', `/api/tickets/${state.ticket1}/transfer`, { targetGroupId: state.group1 })
        assert.equal(submitterTransfers.status, 403)

        const notVisible = await call(url, state.agent1, 'POST', `/api/tickets/${state.ticket2}/transfer`, { targetGroupId: state.group2 })
        assert.equal(notVisible.status, 404)

        const targetVisibleToGroup2 = await call(url, state.agent2, 'GET', '/api/tickets?status=in_progress')
        assert.ok(targetVisibleToGroup2.body.items.some((i) => i.id === state.ticket1))
      })

      await t.test('complete records handler and sends notification log (AC-08, AC-04 terminal state)', async () => {
        const completed = await call(url, state.agent2, 'POST', `/api/tickets/${state.ticket1}/complete`)
        assert.equal(completed.status, 200)
        assert.equal(completed.body.ticket.status, 'completed')
        assert.equal(completed.body.ticket.completedByName, '处理人组二')
        assert.equal(typeof completed.body.ticket.completedAt, 'string')
        assert.equal(completed.body.emailLog.toEmail, 'a1@example.com')
        assert.equal(completed.body.emailLog.status, 'skipped')
        assert.equal(completed.body.emailLog.error, 'SMTP is not configured')

        const repeat = await call(url, state.agent2, 'POST', `/api/tickets/${state.ticket1}/complete`)
        assert.equal(repeat.status, 409)
        assert.equal(repeat.body.error.code, 'INVALID_STATE')

        const transferAfterComplete = await call(url, state.agent2, 'POST', `/api/tickets/${state.ticket1}/transfer`, { targetGroupId: state.group1 })
        assert.equal(transferAfterComplete.status, 409)
        assert.equal(transferAfterComplete.body.error.code, 'INVALID_STATE')

        const cancelAfterComplete = await call(url, state.submitterA, 'POST', `/api/tickets/${state.ticket1}/cancel`)
        assert.equal(cancelAfterComplete.status, 409)
        assert.equal(cancelAfterComplete.body.error.code, 'INVALID_STATE')

        // submitter 视角看不到 emailLog；agent 视角可见发送记录。
        const asSubmitter = await call(url, state.submitterA, 'GET', `/api/tickets/${state.ticket1}`)
        assert.equal(asSubmitter.body.emailLog, null)
        const asAgent = await call(url, state.agent2, 'GET', `/api/tickets/${state.ticket1}`)
        assert.equal(asAgent.body.emailLog.status, 'skipped')
        assert.equal(typeof asAgent.body.emailLog.sentAt, 'string')
      })

      await t.test('satisfaction rating by the submitter only (AC-09)', async () => {
        const rated = await call(url, state.submitterA, 'POST', `/api/tickets/${state.ticket1}/satisfaction`, { rating: 5, comment: '处理很快' })
        assert.equal(rated.status, 201)
        assert.equal(rated.body.rating, 5)
        assert.equal(rated.body.comment, '处理很快')

        const again = await call(url, state.submitterA, 'POST', `/api/tickets/${state.ticket1}/satisfaction`, { rating: 4 })
        assert.equal(again.status, 409)
        assert.equal(again.body.error.code, 'ALREADY_RATED')

        const notCompleted = await call(url, state.submitterA, 'POST', `/api/tickets/${state.ticket2}/satisfaction`, { rating: 4 })
        assert.equal(notCompleted.status, 409)
        assert.equal(notCompleted.body.error.code, 'INVALID_STATE')

        const byAgent = await call(url, state.agent2, 'POST', `/api/tickets/${state.ticket1}/satisfaction`, { rating: 3 })
        assert.equal(byAgent.status, 403)

        const invalidRating = await call(url, state.submitterA, 'POST', `/api/tickets/${state.ticket2}/satisfaction`, { rating: 6 })
        assert.equal(invalidRating.status, 400)

        const detail = await call(url, state.submitterA, 'GET', `/api/tickets/${state.ticket1}`)
        assert.equal(detail.body.satisfaction.rating, 5)
        assert.equal(detail.body.satisfaction.ratedAt, rated.body.ratedAt)
      })

      await t.test('cancel before terminal state by submitter or admin (AC-04)', async () => {
        const byAgent = await call(url, state.agent1, 'POST', `/api/tickets/${state.ticket2}/cancel`)
        assert.equal(byAgent.status, 404)

        const cancelled = await call(url, state.submitterA, 'POST', `/api/tickets/${state.ticket2}/cancel`)
        assert.equal(cancelled.status, 200)
        assert.equal(cancelled.body.status, 'cancelled')
        assert.equal(cancelled.body.cancelledByName, '提交人甲一')
        assert.equal(typeof cancelled.body.cancelledAt, 'string')

        const adminCancels = await call(url, state.admin, 'POST', `/api/tickets/${state.ticket3}/cancel`)
        assert.equal(adminCancels.status, 200)
        assert.equal(adminCancels.body.status, 'cancelled')
      })

      await t.test('distribution and dashboard statistics (AC-10, AC-11)', async () => {
        const byCompany = await call(url, state.viewer, 'GET', '/api/stats/distribution?dimension=company')
        assert.equal(byCompany.status, 200)
        assert.deepEqual(
          byCompany.body.items,
          [
            { key: String(state.companyA), name: '甲公司', count: 3 },
            { key: String(state.companyB), name: '乙公司', count: 1 },
          ],
        )

        const byDepartment = await call(url, state.viewer, 'GET', '/api/stats/distribution?dimension=department')
        assert.deepEqual(
          byDepartment.body.items.sort((a, b) => a.key.localeCompare(b.key)),
          [
            { key: '市场部', name: '市场部', count: 1 },
            { key: '研发部', name: '研发部', count: 3 },
          ],
        )

        const dashboard = await call(url, state.viewer, 'GET', '/api/stats/dashboard')
        assert.equal(dashboard.status, 200)
        assert.equal(dashboard.body.ticketVolume.total, 4)
        assert.deepEqual(dashboard.body.ticketVolume.byStatus, {
          created: 0,
          pending_assignment: 0,
          in_progress: 1,
          completed: 1,
          cancelled: 2,
        })
        // T1 创建到首条 agent 回复的平均间隔（分钟）：agent 在 T1 上回复过 → 样本存在。
        assert.equal(typeof dashboard.body.avgResponseMinutes, 'number')
        assert.ok(dashboard.body.avgResponseMinutes >= 0)
        assert.deepEqual(dashboard.body.satisfaction, { average: 5, ratedCount: 1 })
        assert.deepEqual(dashboard.body.hotCategories, [
          { categoryId: state.categoryLogin, name: '登录故障', count: 3 },
          { categoryId: state.categoryOther, name: '其他', count: 1 },
        ])

        const badDimension = await call(url, state.viewer, 'GET', '/api/stats/distribution?dimension=team')
        assert.equal(badDimension.status, 400)

        const denied = await call(url, state.submitterA, 'GET', '/api/stats/dashboard')
        assert.equal(denied.status, 403)
      })

      await t.test('ticket logs cover the full lifecycle (AC-13)', async () => {
        const logs = await call(url, state.submitterA, 'GET', `/api/tickets/${state.ticket1}/logs`)
        assert.equal(logs.status, 200)
        assert.deepEqual(
          logs.body.items.map((l) => l.action),
          ['created', 'queued', 'auto_assigned', 'replied', 'replied', 'replied', 'replied', 'transferred', 'completed', 'rated'],
        )
        const queued = logs.body.items.find((l) => l.action === 'queued')
        assert.equal(queued.operatorName, '系统')
        assert.equal(queued.operatorName, '系统')
        const auto = logs.body.items.find((l) => l.action === 'auto_assigned')
        assert.equal(auto.detail, '一线支持组')
        const transferred = logs.body.items.find((l) => l.action === 'transferred')
        assert.equal(transferred.detail, '一线支持组 → 二线支持组')
        const created = logs.body.items.find((l) => l.action === 'created')
        assert.equal(created.operatorName, '提交人甲一')
        assert.equal(typeof created.createdAt, 'string')
        assert.equal(logs.body.total, 10)
      })

      await t.test('profile update is idempotent and scoped to admin (contract §2)', async () => {
        const updated = await call(url, state.admin, 'PUT', `/api/users/${state.userId['submitter-a1']}/profile`, { department: '客服部' })
        assert.equal(updated.status, 200)
        assert.equal(updated.body.department, '客服部')
        assert.equal(updated.body.role, 'submitter')

        const again = await call(url, state.admin, 'PUT', `/api/users/${state.userId['submitter-a1']}/profile`, { department: '客服部' })
        assert.equal(again.status, 200)
        assert.equal(again.body.department, '客服部')

        const missing = await call(url, state.admin, 'PUT', '/api/users/00000000-0000-0000-0000-000000000000/profile', { department: 'x' })
        assert.equal(missing.status, 404)

        const forbidden = await call(url, state.agent1, 'PUT', `/api/users/${state.userId['submitter-a1']}/profile`, { department: 'x' })
        assert.equal(forbidden.status, 403)
      })

      await t.test('logout revokes the token (contract §1)', async () => {
        const token = state.submitterB
        const logout = await call(url, token, 'POST', '/api/auth/logout')
        assert.equal(logout.status, 204)
        const secondLogout = await call(url, token, 'POST', '/api/auth/logout')
        assert.equal(secondLogout.status, 204)
        const denied = await call(url, token, 'GET', '/api/me')
        assert.equal(denied.status, 401)
      })
    })
  } finally {
    await cleanup()
  }
})

test('email delivery failure is logged and never rolls back completion (AC-08 failure boundary)', async () => {
  const { app, cleanup } = await startServer({ smtpHost: '127.0.0.1', smtpPort: 9 })
  try {
    await withHttpServer({ fetch: app.fetch, close: cleanup }, async (url) => {
      await call(url, null, 'POST', '/api/auth/bootstrap', { username: 'admin1', password: 'admin-pass-123' })
      const admin = (await login(url, 'admin1', 'admin-pass-123')).body.token
      const company = (await call(url, admin, 'POST', '/api/companies', { name: '丙公司' })).body.id
      const categories = (await call(url, admin, 'GET', '/api/categories')).body.items
      const categoryLogin = categories.find((c) => c.name === '登录故障').id

      await call(url, admin, 'POST', '/api/users', {
        username: 'submitter-c1', password: 'submitter-pass-1', displayName: '提交人丙一',
        email: 'c1@example.com', companyId: company, department: '运维部', role: 'submitter',
      })
      await call(url, admin, 'POST', '/api/users', {
        username: 'agent-c1', password: 'agent-pass-0001', displayName: '处理人丙一',
        email: 'c1agent@example.com', companyId: company, department: '运营部', role: 'agent',
      })
      const group = (await call(url, admin, 'POST', `/api/companies/${company}/groups`, { name: '丙公司支持组' })).body.id
      const accounts = (await call(url, admin, 'GET', '/api/users')).body.items
      const agentId = accounts.find((u) => u.username === 'agent-c1').userId
      await call(url, admin, 'POST', `/api/groups/${group}/members`, { userId: agentId })
      await call(url, admin, 'POST', `/api/companies/${company}/routing-rules`, { categoryId: categoryLogin, groupId: group })

      const submitter = (await login(url, 'submitter-c1', 'submitter-pass-1')).body.token
      const agent = (await login(url, 'agent-c1', 'agent-pass-0001')).body.token
      const ticket = (await call(url, submitter, 'POST', '/api/tickets', {
        subject: '登录失败', description: '邮件发送失败的边界场景', categoryId: categoryLogin, priority: 'P1',
      })).body.ticket

      const completed = await call(url, agent, 'POST', `/api/tickets/${ticket.id}/complete`)
      assert.equal(completed.status, 200)
      assert.equal(completed.body.ticket.status, 'completed')
      assert.equal(completed.body.emailLog.status, 'failed')
      assert.equal(completed.body.emailLog.toEmail, 'c1@example.com')
      assert.ok(completed.body.emailLog.error && completed.body.emailLog.error.length > 0)

      const detail = await call(url, agent, 'GET', `/api/tickets/${ticket.id}`)
      assert.equal(detail.body.ticket.status, 'completed')
      assert.equal(detail.body.emailLog.status, 'failed')
    })
  } finally {
    await cleanup()
  }
})
