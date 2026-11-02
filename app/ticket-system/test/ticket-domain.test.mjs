import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createApp } from '../src/server/app.ts'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'
import { registerProtectedRoutes, registerPublicRoutes } from '../src/server/routes.ts'
import { withHttpServer } from './with-http-server.mjs'
import { withQaEnvironment } from './fixtures/qa-environment.mjs'

const DEMO_PASSWORD = 'Ticket@123456'

async function login(url, email) {
  const response = await fetch(`${url}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: DEMO_PASSWORD }),
  })
  const body = await response.json()
  assert.equal(response.status, 200, `login ${email} failed: ${JSON.stringify(body)}`)
  return body.token
}

async function call(url, token, method, path, body) {
  const response = await fetch(`${url}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await response.json().catch(() => null)
  return { status: response.status, body: data }
}

function appFor(platform) {
  return createApp({
    registerPublicRoutes: (routes) => registerPublicRoutes(routes, platform),
    registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
    protect: platform.auth.requireAnyAuth,
  })
}

test('demo seed creates tickets with a global TK sequence and category auto-assignment', async () => {
  await withQaEnvironment(async () => {
    const platform = await initializePlatform()
    try {
      await withHttpServer(appFor(platform), async (url) => {
        const submitter = await login(url, 'submitter@acme.test')

        const invalid = await call(url, submitter, 'POST', '/api/tickets', {
          title: '',
          description: '',
          categoryId: 'cat-software',
          priority: 'P9',
        })
        assert.equal(invalid.status, 400)
        assert.equal(invalid.body.error.code, 'validation_error')
        assert.deepEqual(Object.keys(invalid.body.error.fields).sort(), ['description', 'priority', 'title'])

        const autoAssigned = await call(url, submitter, 'POST', '/api/tickets', {
          title: '客户端无法启动',
          description: '双击图标后没有任何响应，已尝试重启。',
          categoryId: 'cat-software',
          priority: 'P1',
        })
        assert.equal(autoAssigned.status, 201)
        assert.match(autoAssigned.body.id, /^TK-\d{6,}$/)
        assert.equal(autoAssigned.body.status, 'in_progress')
        assert.equal(autoAssigned.body.groupId, 'group-acme-tech')
        assert.equal(autoAssigned.body.companyId, 'company-acme')
        assert.equal(autoAssigned.body.companyName, 'Acme 科技')
        assert.equal(autoAssigned.body.departmentName, '信息技术部')
        assert.equal(autoAssigned.body.submitterName, '李提交')
        assert.equal(autoAssigned.body.submitterEmail, 'submitter@acme.test')
        assert.ok(autoAssigned.body.createdAt)
        assert.equal(autoAssigned.body.canReply, true)
        assert.equal(autoAssigned.body.canRate, false)

        const unassigned = await call(url, submitter, 'POST', '/api/tickets', {
          title: '无法重置密码',
          description: '账号被锁定，需要协助重置。',
          categoryId: 'cat-account',
          priority: 'P3',
        })
        assert.equal(unassigned.status, 201)
        assert.equal(unassigned.body.status, 'unassigned')
        assert.equal(unassigned.body.groupId, null)
        assert.equal(unassigned.body.canAssign, false)

        const list = await call(url, submitter, 'GET', '/api/tickets')
        assert.equal(list.status, 200)
        assert.equal(list.body.total, 2)
        assert.deepEqual(list.body.items.map((ticket) => ticket.id).sort(), [autoAssigned.body.id, unassigned.body.id].sort())
        assert.equal(list.body.items.find((ticket) => ticket.id === autoAssigned.body.id).groupName, '技术支持组')

        const detail = await call(url, submitter, 'GET', `/api/tickets/${unassigned.body.id.toLowerCase()}`)
        assert.equal(detail.status, 200)
        assert.equal(detail.body.title, '无法重置密码')
        assert.equal(detail.body.priority, 'P3')
        assert.equal(detail.body.categoryName, '账号与权限')

        const events = await call(url, submitter, 'GET', `/api/tickets/${autoAssigned.body.id}/events`)
        assert.equal(events.status, 200)
        assert.deepEqual(events.body.map((event) => event.action), ['created', 'auto_assigned'])
        assert.equal(events.body[1].actorId, 'system')
        assert.equal(events.body[1].detail.groupId, 'group-acme-tech')
      })
    } finally {
      await platform.close()
    }
  })
})

test('company isolation and role visibility are enforced on every read entry', async () => {
  await withQaEnvironment(async () => {
    const platform = await initializePlatform()
    try {
      await withHttpServer(appFor(platform), async (url) => {
        const acmeSubmitter = await login(url, 'submitter@acme.test')
        const acmeHandler = await login(url, 'handler@acme.test')
        const globexSubmitter = await login(url, 'submitter@globex.test')
        const globexHandler = await login(url, 'handler@globex.test')
        const ops = await login(url, 'ops@ticket.test')

        const acmeTicket = await call(url, acmeSubmitter, 'POST', '/api/tickets', {
          title: 'Acme 权限问题',
          description: '需要开通报表权限。',
          categoryId: 'cat-account',
          priority: 'P2',
        })
        const globexTicket = await call(url, globexSubmitter, 'POST', '/api/tickets', {
          title: 'Globex 咨询',
          description: '希望了解账单周期。',
          categoryId: 'cat-consult',
          priority: 'P4',
        })
        assert.equal(acmeTicket.status, 201)
        assert.equal(globexTicket.status, 201)

        const forbiddenDetail = await call(url, globexHandler, 'GET', `/api/tickets/${acmeTicket.body.id}`)
        assert.equal(forbiddenDetail.status, 403)
        assert.equal(forbiddenDetail.body.error.code, 'forbidden')
        assert.equal('id' in forbiddenDetail.body, false)
        assert.equal('title' in forbiddenDetail.body, false)

        const globexList = await call(url, globexHandler, 'GET', '/api/tickets')
        assert.equal(globexList.body.total, 1)
        assert.equal(globexList.body.items[0].id, globexTicket.body.id)

        const acmeHandlerList = await call(url, acmeHandler, 'GET', '/api/tickets')
        assert.equal(acmeHandlerList.body.total, 1)
        assert.equal(acmeHandlerList.body.items[0].id, acmeTicket.body.id)

        const opsList = await call(url, ops, 'GET', '/api/tickets')
        assert.equal(opsList.body.total, 2)

        const opsDetail = await call(url, ops, 'GET', `/api/tickets/${acmeTicket.body.id}`)
        assert.equal(opsDetail.status, 200)
        for (const capability of ['canReply', 'canAssign', 'canTransfer', 'canComplete', 'canCancel', 'canRate', 'canChangePriority']) {
          assert.equal(opsDetail.body[capability], false, `ops must not be able to ${capability}`)
        }
        assert.equal((await call(url, ops, 'GET', `/api/tickets/${globexTicket.body.id}`)).status, 200)
        assert.equal((await call(url, ops, 'POST', `/api/tickets/${acmeTicket.body.id}/replies`, { body: '只读账号不应回复' })).body.error.code, 'forbidden')
        assert.equal((await call(url, ops, 'POST', `/api/tickets/${acmeTicket.body.id}/assign`, { groupId: 'group-acme-tech' })).body.error.code, 'forbidden')
        assert.equal((await call(url, acmeHandler, 'GET', '/api/tickets?companyId=company-globex')).body.error.code, 'forbidden')

        assert.equal((await call(url, acmeSubmitter, 'GET', `/api/tickets/${globexTicket.body.id}`)).status, 403)
        assert.equal((await call(url, acmeSubmitter, 'GET', `/api/tickets/${acmeTicket.body.id}/submitter`)).status, 403)
        assert.equal((await call(url, acmeSubmitter, 'GET', `/api/tickets/${acmeTicket.body.id}/notifications`)).status, 403)
        assert.equal((await call(url, acmeSubmitter, 'GET', '/api/groups')).status, 403)

        const submitterContext = await call(url, acmeHandler, 'GET', `/api/tickets/${acmeTicket.body.id}/submitter`)
        assert.equal(submitterContext.status, 200)
        assert.equal(submitterContext.body.submitter.name, '李提交')
        assert.equal(submitterContext.body.submitter.email, 'submitter@acme.test')
        assert.equal(submitterContext.body.submitter.companyName, 'Acme 科技')
        assert.deepEqual(submitterContext.body.history.map((ticket) => ticket.id), [acmeTicket.body.id])

        const opsCompanies = await call(url, ops, 'GET', '/api/meta/companies')
        assert.equal(opsCompanies.body.length, 2)
        const acmeCompanies = await call(url, acmeSubmitter, 'GET', '/api/meta/companies')
        assert.deepEqual(acmeCompanies.body.map((company) => company.id), ['company-acme'])

        const forcedDepartments = await call(url, acmeSubmitter, 'GET', '/api/meta/departments?companyId=company-globex')
        assert.ok(forcedDepartments.body.length > 0)
        assert.ok(forcedDepartments.body.every((department) => department.companyId === 'company-acme'))

        assert.equal((await call(url, globexSubmitter, 'GET', '/api/stats/distribution?dimension=company')).body.total, 1)
        assert.equal((await call(url, ops, 'GET', '/api/stats/distribution?dimension=company')).body.total, 2)
      })
    } finally {
      await platform.close()
    }
  })
})

test('ticket lifecycle records assignee, first response, transfer, completion notification and rating once', async () => {
  await withQaEnvironment(async () => {
    const platform = await initializePlatform()
    try {
      await withHttpServer(appFor(platform), async (url) => {
        const submitter = await login(url, 'submitter@acme.test')
        const handler = await login(url, 'handler@acme.test')
        const secondHandler = await login(url, 'handler2@acme.test')

        const created = await call(url, submitter, 'POST', '/api/tickets', {
          title: '导出报表失败',
          description: '导出的文件为空。',
          categoryId: 'cat-account',
          priority: 'P2',
        })
        const ticketId = created.body.id

        const assigned = await call(url, handler, 'POST', `/api/tickets/${ticketId}/assign`, { groupId: 'group-acme-tech' })
        assert.equal(assigned.status, 200)
        assert.equal(assigned.body.status, 'in_progress')
        assert.equal(assigned.body.groupId, 'group-acme-tech')
        assert.equal((await call(url, handler, 'POST', `/api/tickets/${ticketId}/assign`, { groupId: 'group-acme-tech' })).status, 409)

        const firstReply = await call(url, handler, 'POST', `/api/tickets/${ticketId}/replies`, { body: '已收到，正在排查。' })
        assert.equal(firstReply.status, 201)
        assert.equal(firstReply.body.authorName, '王处理')
        assert.equal(firstReply.body.authorRole, 'handler')

        const afterReply = await call(url, handler, 'GET', `/api/tickets/${ticketId}`)
        assert.ok(afterReply.body.firstResponseAt)
        assert.equal(afterReply.body.assigneeId, 'user-acme-handler')
        assert.equal(afterReply.body.assigneeName, '王处理')

        const transferred = await call(url, handler, 'POST', `/api/tickets/${ticketId}/transfer`, { toGroupId: 'group-acme-success' })
        assert.equal(transferred.status, 200)
        assert.equal(transferred.body.status, 'in_progress')
        assert.equal(transferred.body.groupId, 'group-acme-success')
        assert.equal(transferred.body.assigneeId, null)
        assert.equal(transferred.body.companyId, 'company-acme')
        assert.equal(transferred.body.submitterId, 'user-acme-submitter')
        assert.equal((await call(url, handler, 'GET', `/api/tickets/${ticketId}`)).status, 403)

        const secondReply = await call(url, secondHandler, 'POST', `/api/tickets/${ticketId}/replies`, { body: '问题已定位，稍后修复。' })
        assert.equal(secondReply.status, 201)

        const completed = await call(url, secondHandler, 'POST', `/api/tickets/${ticketId}/complete`)
        assert.equal(completed.status, 200)
        assert.equal(completed.body.status, 'completed')
        assert.ok(completed.body.completedAt)
        assert.equal(completed.body.assigneeName, '陈支持')
        assert.equal(completed.body.notification.status, 'skipped')

        assert.equal((await call(url, secondHandler, 'POST', `/api/tickets/${ticketId}/replies`, { body: '补充' })).body.error.code, 'ticket_closed')
        assert.equal((await call(url, secondHandler, 'POST', `/api/tickets/${ticketId}/complete`)).body.error.code, 'invalid_transition')
        assert.equal((await call(url, secondHandler, 'POST', `/api/tickets/${ticketId}/transfer`, { toGroupId: 'group-acme-tech' })).body.error.code, 'invalid_transition')
        assert.equal((await call(url, secondHandler, 'PATCH', `/api/tickets/${ticketId}/priority`, { priority: 'P0' })).body.error.code, 'invalid_transition')

        const notifications = await call(url, secondHandler, 'GET', `/api/tickets/${ticketId}/notifications`)
        assert.equal(notifications.status, 200)
        assert.equal(notifications.body.length, 1)
        assert.equal(notifications.body[0].status, 'skipped')
        assert.equal(notifications.body[0].recipientEmail, 'submitter@acme.test')
        assert.equal(notifications.body[0].attempt, 1)

        const resent = await call(url, secondHandler, 'POST', `/api/tickets/${ticketId}/notifications/${notifications.body[0].id}/resend`)
        assert.equal(resent.status, 200)
        assert.equal(resent.body.status, 'skipped')
        assert.equal(resent.body.notification.attempt, 2)
        assert.equal((await call(url, secondHandler, 'GET', `/api/tickets/${ticketId}/notifications`)).body.length, 2)
        const sentLike = await call(url, secondHandler, 'POST', `/api/tickets/${ticketId}/notifications/${notifications.body[0].id}/resend`)
        assert.equal(sentLike.status, 200)
        assert.equal(sentLike.body.notification.attempt, 2)

        const rating = await call(url, submitter, 'POST', `/api/tickets/${ticketId}/rating`, { score: 5, comment: '处理及时' })
        assert.equal(rating.status, 200)
        assert.equal(rating.body.satisfactionScore, 5)
        assert.equal(rating.body.satisfactionComment, '处理及时')
        assert.equal((await call(url, submitter, 'POST', `/api/tickets/${ticketId}/rating`, { score: 4 })).body.error.code, 'already_rated')

        const events = await call(url, submitter, 'GET', `/api/tickets/${ticketId}/events`)
        assert.deepEqual(
          events.body.map((event) => event.action),
          ['created', 'assigned', 'replied', 'transferred', 'replied', 'completed', 'email_skipped', 'email_skipped', 'email_skipped', 'rated'],
        )
        assert.equal(events.body[3].detail.fromGroupId, 'group-acme-tech')
        assert.equal(events.body[3].detail.toGroupId, 'group-acme-success')

        const cancellable = await call(url, submitter, 'POST', '/api/tickets', {
          title: '误提交的工单',
          description: '不需要处理了。',
          categoryId: 'cat-consult',
          priority: 'P4',
        })
        const cancelled = await call(url, submitter, 'POST', `/api/tickets/${cancellable.body.id}/cancel`)
        assert.equal(cancelled.status, 200)
        assert.equal(cancelled.body.status, 'cancelled')
        assert.ok(cancelled.body.cancelledAt)
        assert.equal((await call(url, submitter, 'POST', `/api/tickets/${cancellable.body.id}/replies`, { body: '再补充' })).body.error.code, 'ticket_closed')
        assert.equal((await call(url, submitter, 'POST', `/api/tickets/${cancellable.body.id}/cancel`)).body.error.code, 'invalid_transition')
      })
    } finally {
      await platform.close()
    }
  })
})

test('group and rule configuration is company-scoped and dashboard metrics follow the contract', async () => {
  await withQaEnvironment(async () => {
    const platform = await initializePlatform()
    try {
      await withHttpServer(appFor(platform), async (url) => {
        const acmeAdmin = await login(url, 'admin@acme.test')
        const acmeSubmitter = await login(url, 'submitter@acme.test')
        const acmeHandler = await login(url, 'handler@acme.test')
        const globexSubmitter = await login(url, 'submitter@globex.test')
        const globexHandler = await login(url, 'handler@globex.test')
        const ops = await login(url, 'ops@ticket.test')

        const groups = await call(url, acmeAdmin, 'GET', '/api/groups')
        assert.equal(groups.status, 200)
        assert.equal(groups.body.length, 2)
        assert.deepEqual(groups.body.map((group) => group.name).sort(), ['客户成功组', '技术支持组'])
        assert.equal(groups.body.find((group) => group.id === 'group-acme-tech').memberCount, 1)
        assert.equal((await call(url, acmeHandler, 'GET', '/api/groups')).body.length, 2)

        assert.equal((await call(url, acmeAdmin, 'POST', '/api/groups', { name: '技术支持组' })).body.error.code, 'duplicate_group')
        const newGroup = await call(url, acmeAdmin, 'POST', '/api/groups', { name: '数据平台组' })
        assert.equal(newGroup.status, 201)
        const member = await call(url, acmeAdmin, 'POST', `/api/groups/${newGroup.body.id}/members`, { userId: 'user-acme-handler2' })
        assert.equal(member.status, 201)
        assert.equal(member.body.member.userId, 'user-acme-handler2')
        assert.equal((await call(url, acmeAdmin, 'POST', `/api/groups/${newGroup.body.id}/members`, { userId: 'user-acme-handler2' })).status, 200)
        assert.equal(
          (await call(url, acmeAdmin, 'POST', `/api/groups/${newGroup.body.id}/members`, { userId: 'user-globex-handler' })).body.error.code,
          'validation_error',
        )
        assert.equal((await call(url, acmeAdmin, 'GET', '/api/groups')).body.find((group) => group.id === newGroup.body.id).memberCount, 1)

        const rules = await call(url, acmeAdmin, 'GET', '/api/assignment-rules')
        assert.equal(rules.body.length, 1)
        const rule = await call(url, acmeAdmin, 'POST', '/api/assignment-rules', { categoryId: 'cat-billing', groupId: newGroup.body.id })
        assert.equal(rule.status, 201)
        assert.equal((await call(url, acmeAdmin, 'POST', '/api/assignment-rules', { categoryId: 'cat-billing', groupId: newGroup.body.id })).body.error.code, 'rule_exists')
        assert.equal((await call(url, acmeAdmin, 'DELETE', `/api/groups/${newGroup.body.id}`)).body.error.code, 'group_in_use')
        assert.equal((await call(url, acmeAdmin, 'DELETE', `/api/assignment-rules/${rule.body.id}`)).status, 200)
        assert.equal((await call(url, acmeAdmin, 'DELETE', `/api/groups/${newGroup.body.id}`)).status, 200)
        assert.equal((await call(url, acmeSubmitter, 'GET', '/api/categories')).body.length, 4)
        assert.equal((await call(url, acmeHandler, 'GET', '/api/assignment-rules')).status, 403)

        const acmeAuto = await call(url, acmeSubmitter, 'POST', '/api/tickets', {
          title: '报表数据不一致',
          description: '日报与月报数字不一致。',
          categoryId: 'cat-software',
          priority: 'P1',
        })
        const acmeUnassigned = await call(url, acmeSubmitter, 'POST', '/api/tickets', {
          title: '申请新账号',
          description: '需要为实习生开通账号。',
          categoryId: 'cat-account',
          priority: 'P3',
        })
        const globexTicket = await call(url, globexSubmitter, 'POST', '/api/tickets', {
          title: '账单疑问',
          description: '请解释本月账单。',
          categoryId: 'cat-consult',
          priority: 'P4',
        })
        assert.equal(acmeAuto.status, 201)
        assert.equal(acmeUnassigned.status, 201)
        assert.equal(globexTicket.status, 201)

        const today = new Date().toISOString().slice(0, 10)
        const backdatedMs = Math.max(Date.now() - 5 * 60_000, Date.parse(`${today}T00:01:00.000Z`))
        const backdated = new Date(backdatedMs).toISOString()
        await platform.db.run({
          text: 'UPDATE tickets SET created_at = ?, updated_at = ? WHERE id = ?',
          params: [backdated, backdated, acmeAuto.body.id],
        })
        await call(url, acmeHandler, 'POST', `/api/tickets/${acmeAuto.body.id}/replies`, { body: '正在核对数据源。' })
        await call(url, acmeHandler, 'POST', `/api/tickets/${acmeAuto.body.id}/complete`)
        await call(url, acmeSubmitter, 'POST', `/api/tickets/${acmeAuto.body.id}/rating`, { score: 4 })

        const acmeDetail = await call(url, acmeAdmin, 'GET', `/api/tickets/${acmeAuto.body.id}`)
        const expectedResponse = Math.round(((Date.parse(acmeDetail.body.firstResponseAt) - Date.parse(acmeDetail.body.createdAt)) / 60000) * 100) / 100

        const opsDashboard = await call(url, ops, 'GET', '/api/stats/dashboard')
        assert.deepEqual(opsDashboard.body.range, { from: new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10), to: today })
        assert.equal(opsDashboard.body.ticketCount, 3)
        assert.equal(opsDashboard.body.avgFirstResponseMinutes, expectedResponse)
        assert.deepEqual(opsDashboard.body.satisfaction, { average: 4, ratedCount: 1 })
        assert.ok(opsDashboard.body.hotCategories.some((category) => category.categoryId === 'cat-software' && category.count === 1))
        assert.equal(opsDashboard.body.statusBreakdown.find((entry) => entry.status === 'completed').count, 1)
        assert.equal(opsDashboard.body.statusBreakdown.find((entry) => entry.status === 'unassigned').count, 2)
        assert.equal(opsDashboard.body.priorityBreakdown.find((entry) => entry.priority === 'P1').count, 1)

        const acmeDashboard = await call(url, acmeAdmin, 'GET', '/api/stats/dashboard')
        assert.equal(acmeDashboard.body.ticketCount, 2)
        assert.deepEqual(acmeDashboard.body.satisfaction, { average: 4, ratedCount: 1 })
        const globexDashboard = await call(url, globexHandler, 'GET', '/api/stats/dashboard')
        assert.equal(globexDashboard.body.ticketCount, 1)

        const companyDistribution = await call(url, ops, 'GET', '/api/stats/distribution?dimension=company')
        assert.equal(companyDistribution.body.dimension, 'company')
        assert.equal(companyDistribution.body.total, 3)
        assert.equal(companyDistribution.body.items.find((item) => item.key === 'company-acme').count, 2)
        assert.equal(
          Math.round(companyDistribution.body.items.reduce((sum, item) => sum + item.ratio, 0) * 10000) / 10000,
          1,
        )

        const departmentDistribution = await call(url, ops, 'GET', '/api/stats/distribution?dimension=department&companyId=company-acme')
        assert.equal(departmentDistribution.body.total, 2)
        assert.ok(departmentDistribution.body.items.every((item) => item.label === '信息技术部'))

        const submitterDistribution = await call(url, acmeSubmitter, 'GET', '/api/stats/distribution?dimension=company')
        assert.equal(submitterDistribution.body.total, 2)
        assert.equal((await call(url, acmeSubmitter, 'GET', '/api/stats/distribution?dimension=company&companyId=company-globex')).status, 403)
      })
    } finally {
      await platform.close()
    }
  })
})
