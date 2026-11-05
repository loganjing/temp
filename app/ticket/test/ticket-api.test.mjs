import assert from 'node:assert/strict'
import { test } from 'node:test'
import { withHttpServer } from './with-http-server.mjs'
import { createTicketApp, loginTicketAccount, withTicketEnvironment } from './fixtures/ticket-environment.mjs'

const request = async (url, path, { token, method = 'GET', body } = {}) => {
  const headers = {}
  if (token) headers.authorization = `Bearer ${token}`
  if (body !== undefined) headers['content-type'] = 'application/json'
  const response = await fetch(`${url}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const payload = response.status === 204 ? undefined : await response.json().catch(() => undefined)
  return { status: response.status, body: payload }
}

test('ticket API enforces the contract for isolation, lifecycle, collaboration, configuration, and statistics', async () => {
  await withTicketEnvironment(async ({ platform, seeded }) => {
    const app = createTicketApp(platform)
    await withHttpServer(app, async (url) => {
      const anonymous = await request(url, '/api/tickets')
      assert.equal(anonymous.status, 401)
      assert.equal(anonymous.body.error.code, 'UNAUTHENTICATED')

      const wrongPassword = await request(url, '/api/auth/login', {
        method: 'POST',
        body: { email: seeded.accounts.acmeAdmin.email, password: 'wrong-password' },
      })
      assert.equal(wrongPassword.status, 401)
      assert.equal(wrongPassword.body.error.code, 'UNAUTHENTICATED')

      const admin = await loginTicketAccount(url, seeded.accounts.acmeAdmin.email)
      const submitter = await loginTicketAccount(url, seeded.accounts.acmeUser.email)
      const finance = await loginTicketAccount(url, seeded.accounts.acmeFinance.email)
      const tech = await loginTicketAccount(url, seeded.accounts.acmeTech.email)
      const globex = await loginTicketAccount(url, seeded.accounts.globexAdmin.email)
      const platformStats = await loginTicketAccount(url, seeded.accounts.acmeStats.email)

      const me = await request(url, '/api/me', { token: admin.token })
      assert.equal(me.status, 200)
      assert.equal(me.body.companyId, seeded.companies.acme.id)
      assert.deepEqual(me.body.roles, ['company_admin'])
      assert.deepEqual(me.body.groups, [])

      const reference = await request(url, '/api/reference', { token: submitter.token })
      assert.deepEqual(reference.body.categories.map((category) => category.name), ['账务问题', '技术故障', '产品咨询'])
      assert.deepEqual(reference.body.groups.map((group) => group.name), ['技术支持组', '财务支持组'])

      const now = new Date()
      const range = `from=${encodeURIComponent(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString())}&to=${encodeURIComponent(now.toISOString())}`
      const overview = await request(url, `/api/stats/overview?${range}`, { token: admin.token })
      assert.equal(overview.status, 200)
      assert.equal(overview.body.volume, 5)
      assert.equal(overview.body.cancelledCount, 1)
      assert.equal(overview.body.avgFirstResponseMinutes, 40)
      assert.deepEqual(overview.body.satisfaction, { average: 4.5, count: 2 })
      const platformOverview = await request(url, `/api/stats/overview?${range}`, { token: platformStats.token })
      assert.equal(platformOverview.body.volume, 8)
      const companyDistribution = await request(url, `/api/stats/distribution?dimension=company&${range}`, { token: platformStats.token })
      assert.equal(companyDistribution.body.total, 8)
      assert.deepEqual(companyDistribution.body.groups.map((group) => group.count).sort(), [3, 5])
      const departmentDistribution = await request(url, `/api/stats/distribution?dimension=department&${range}`, { token: admin.token })
      assert.equal(departmentDistribution.body.total, 5)
      assert.deepEqual(departmentDistribution.body.groups, [{ key: '市场部', label: '市场部', count: 5 }])
      assert.equal((await request(url, `/api/stats/overview?${range}`, { token: submitter.token })).status, 403)

      const workbench = await request(url, '/api/tickets', { token: admin.token })
      assert.equal(workbench.status, 200)
      assert.equal(workbench.body.total, 1)
      assert.equal(workbench.body.items[0].status, 'pending')
      const financeWorkbench = await request(url, '/api/tickets', { token: finance.token })
      assert.equal(financeWorkbench.body.total, 1)
      assert.equal(financeWorkbench.body.items[0].group.name, '财务支持组')
      assert.equal((await request(url, '/api/tickets', { token: platformStats.token })).status, 403)

      const mine = await request(url, '/api/tickets?scope=mine&status=all', { token: submitter.token })
      assert.equal(mine.body.total, 4)
      const sorted = await request(url, '/api/tickets?scope=mine&status=all&sort=priority&order=asc', { token: submitter.token })
      assert.deepEqual(sorted.body.items.map((ticket) => ticket.priority), ['P1', 'P2', 'P2', 'P3'])
      const searched = await request(url, '/api/tickets?scope=mine&status=all&q=tk-900004', { token: submitter.token })
      assert.deepEqual(searched.body.items.map((ticket) => ticket.id), ['seed-ticket-acme-4'])
      const paged = await request(url, '/api/tickets?scope=mine&status=all&pageSize=1000', { token: submitter.token })
      assert.equal(paged.body.pageSize, 100)

      assert.equal((await request(url, `/api/tickets?companyId=${seeded.companies.globex.id}`, { token: admin.token })).status, 403)
      const crossCompanyDetail = await request(url, '/api/tickets/seed-ticket-globex-1', { token: submitter.token })
      assert.equal(crossCompanyDetail.status, 403)
      assert.equal(crossCompanyDetail.body.error.code, 'FORBIDDEN')
      assert.equal((await request(url, '/api/tickets/missing-ticket', { token: submitter.token })).status, 404)
      assert.equal((await request(url, '/api/tickets/seed-ticket-acme-1', { token: globex.token })).status, 403)
      assert.equal((await request(url, '/api/tickets/seed-ticket-acme-1', { token: platformStats.token })).status, 403)

      const invalid = await request(url, '/api/tickets', { method: 'POST', token: submitter.token, body: { subject: '', description: '', categoryId: '', priority: 'P0' } })
      assert.equal(invalid.status, 422)
      assert.equal(invalid.body.error.code, 'VALIDATION_FAILED')
      for (const field of ['subject', 'description', 'categoryId']) assert.ok(invalid.body.error.fields[field], `missing field error ${field}`)

      const created = await request(url, '/api/tickets', {
        method: 'POST',
        token: submitter.token,
        body: { subject: '接口提交工单', description: '通过真实接口提交的工单', categoryId: seeded.categories['acme:产品咨询'], priority: 'P3' },
      })
      assert.equal(created.status, 201)
      assert.equal(created.body.ticket.status, 'pending_assignment')
      assert.match(created.body.ticket.code, /^TK-\d{6}$/)
      assert.equal(created.body.ticket.department, '市场部')
      assert.equal(created.body.ticket.submitter.name, '陈晨')
      const ticketId = created.body.ticket.id

      const assigned = await request(url, `/api/tickets/${ticketId}/assign`, {
        method: 'POST',
        token: admin.token,
        body: { groupId: seeded.groups['acme:财务支持组'], assigneeId: seeded.accounts.acmeFinance.id },
      })
      assert.equal(assigned.status, 200)
      assert.equal(assigned.body.ticket.status, 'pending')
      assert.equal(assigned.body.ticket.group.name, '财务支持组')
      assert.equal(assigned.body.ticket.assignee.name, '李强')

      const transferred = await request(url, `/api/tickets/${ticketId}/transfer`, {
        method: 'POST',
        token: finance.token,
        body: { groupId: seeded.groups['acme:技术支持组'], note: '转技术处理' },
      })
      assert.equal(transferred.status, 200)
      assert.equal(transferred.body.ticket.group.name, '技术支持组')
      assert.equal(transferred.body.ticket.status, 'pending')
      assert.equal((await request(url, `/api/tickets/${ticketId}/transfer`, { method: 'POST', token: finance.token, body: { groupId: seeded.groups['acme:技术支持组'] } })).status, 403)

      const reply = await request(url, `/api/tickets/${ticketId}/replies`, { method: 'POST', token: tech.token, body: { content: '已定位原因，正在处理。' } })
      assert.equal(reply.status, 201)
      assert.equal(reply.body.reply.author.name, '王芳')

      const completed = await request(url, `/api/tickets/${ticketId}/complete`, { method: 'POST', token: tech.token, body: { note: '处理完成' } })
      assert.equal(completed.status, 200)
      assert.equal(completed.body.ticket.status, 'completed')
      assert.equal(completed.body.notification.status, 'skipped')
      assert.equal((await request(url, `/api/tickets/${ticketId}/replies`, { method: 'POST', token: tech.token, body: { content: '终态回复' } })).status, 409)
      assert.equal((await request(url, `/api/tickets/${ticketId}/cancel`, { method: 'POST', token: submitter.token, body: {} })).status, 409)
      assert.equal((await request(url, `/api/tickets/${ticketId}/assign`, { method: 'POST', token: admin.token, body: { groupId: seeded.groups['acme:技术支持组'] } })).status, 409)

      const detail = await request(url, `/api/tickets/${ticketId}`, { token: submitter.token })
      assert.equal(detail.status, 200)
      assert.equal(detail.body.submitter.email, seeded.accounts.acmeUser.email)
      assert.equal(detail.body.submitter.department, '市场部')
      assert.equal(detail.body.completedBy.name, '王芳')
      assert.equal(detail.body.replies.length, 1)
      assert.deepEqual(detail.body.allowedActions, ['rate'])
      assert.ok(detail.body.history.some((item) => item.id === 'seed-ticket-acme-1'))
      assert.ok(detail.body.notifications[0].attempt === 1)

      const rating = await request(url, `/api/tickets/${ticketId}/rating`, { method: 'POST', token: submitter.token, body: { score: 5, comment: '处理及时' } })
      assert.equal(rating.status, 201)
      assert.equal(rating.body.rating.score, 5)
      assert.equal((await request(url, `/api/tickets/${ticketId}/rating`, { method: 'POST', token: submitter.token, body: { score: 4 } })).status, 409)
      assert.equal((await request(url, `/api/tickets/${ticketId}/rating`, { method: 'POST', token: tech.token, body: { score: 4 } })).status, 403)

      const logs = await request(url, `/api/tickets/${ticketId}/logs`, { token: submitter.token })
      assert.equal(logs.status, 200)
      const actions = logs.body.items.map((entry) => entry.action)
      for (const action of ['created', 'assigned', 'transferred', 'replied', 'completed', 'notified', 'rated']) {
        assert.ok(actions.includes(action), `missing log ${action}`)
      }
      assert.ok(logs.body.items.every((entry) => entry.actor.name && entry.createdAt && entry.actionLabel))

      const retried = await request(url, '/api/tickets/seed-ticket-acme-5/notifications/seed-notification-acme-5/retry', { method: 'POST', token: finance.token })
      assert.equal(retried.status, 200)
      assert.equal(retried.body.notification.attempt, 2)
      assert.equal(retried.body.notification.status, 'skipped')
      assert.equal((await request(url, '/api/tickets/seed-ticket-acme-5/notifications/missing/retry', { method: 'POST', token: finance.token })).status, 404)
      assert.equal((await request(url, '/api/tickets/seed-ticket-acme-5/notifications/seed-notification-acme-5/retry', { method: 'POST', token: globex.token })).status, 403)

      const correctedEmail = 'liuyang.acme@example.test'
      const emailFixed = await request(url, `/api/admin/users/${seeded.accounts.acmeFailUser.id}`, {
        method: 'PATCH',
        token: admin.token,
        body: { name: seeded.accounts.acmeFailUser.name, email: correctedEmail },
      })
      assert.equal(emailFixed.status, 200)
      const retriedAfterFix = await request(url, '/api/tickets/seed-ticket-acme-5/notifications/seed-notification-acme-5/retry', { method: 'POST', token: finance.token })
      assert.equal(retriedAfterFix.status, 200)
      assert.equal(retriedAfterFix.body.notification.attempt, 3)
      assert.equal(retriedAfterFix.body.notification.recipientEmail, correctedEmail)

      const companyUsers = await request(url, '/api/company-users', { token: admin.token })
      assert.equal(companyUsers.status, 200)
      assert.ok(companyUsers.body.items.every((user) => !user.email.endsWith('globex.example.test')))
      const financeUser = companyUsers.body.items.find((user) => user.id === seeded.accounts.acmeFinance.id)
      assert.deepEqual(financeUser.roles, ['agent'])
      assert.deepEqual(financeUser.groups, [{ id: seeded.groups['acme:财务支持组'], name: '财务支持组' }])
      assert.equal((await request(url, '/api/company-users', { token: submitter.token })).status, 403)
      assert.equal((await request(url, `/api/company-users/${seeded.accounts.globexUser.id}`, { method: 'PATCH', token: admin.token, body: { department: '销售部' } })).status, 403)

      assert.equal((await request(url, '/api/admin/users', { token: finance.token })).status, 403)
      const adminUsers = await request(url, '/api/admin/users', { token: admin.token })
      assert.equal(adminUsers.status, 200)
      assert.ok(adminUsers.body.users.every((user) => !user.email.endsWith('globex.example.test')))

      const duplicateGroup = await request(url, '/api/business-groups', { method: 'POST', token: admin.token, body: { name: '财务支持组' } })
      assert.equal(duplicateGroup.status, 409)
      assert.equal(duplicateGroup.body.error.code, 'DUPLICATE_NAME')
      const duplicateCategory = await request(url, '/api/ticket-categories', { method: 'POST', token: admin.token, body: { name: '账务问题' } })
      assert.equal(duplicateCategory.status, 409)
      const newGroup = await request(url, '/api/business-groups', { method: 'POST', token: admin.token, body: { name: '接口测试组', description: '测试' } })
      assert.equal(newGroup.status, 201)
      const addedMember = await request(url, `/api/business-groups/${newGroup.body.group.id}/members`, { method: 'POST', token: admin.token, body: { userId: seeded.accounts.acmeUser.id } })
      assert.equal(addedMember.status, 201)
      assert.equal(addedMember.body.member.email, seeded.accounts.acmeUser.email)
      assert.equal((await request(url, `/api/business-groups/${newGroup.body.group.id}/members`, { method: 'POST', token: admin.token, body: { userId: seeded.accounts.globexUser.id } })).status, 422)
      assert.equal((await request(url, `/api/business-groups/${newGroup.body.group.id}/members/${seeded.accounts.acmeUser.id}`, { method: 'DELETE', token: admin.token })).status, 204)
      const rule = await request(url, '/api/assignment-rules', {
        method: 'PUT',
        token: admin.token,
        body: { categoryId: seeded.categories['acme:产品咨询'], groupId: seeded.groups['acme:技术支持组'], enabled: false },
      })
      assert.equal(rule.status, 200)
      assert.equal(rule.body.rule.enabled, false)
      const rules = await request(url, '/api/assignment-rules', { token: admin.token })
      assert.ok(rules.body.items.some((item) => item.categoryId === seeded.categories['acme:产品咨询'] && item.enabled === false))
      assert.equal((await request(url, '/api/business-groups', { token: finance.token })).status, 403)

      const disabled = await request(url, `/api/company-users/${seeded.accounts.globexUser.id}`, { method: 'PATCH', token: globex.token, body: { enabled: false } })
      assert.equal(disabled.status, 200)
      const disabledLogin = await request(url, '/api/auth/login', {
        method: 'POST',
        body: { email: seeded.accounts.globexUser.email, password: 'TicketDemo#2026' },
      })
      assert.equal(disabledLogin.status, 403)
      assert.equal(disabledLogin.body.error.code, 'ACCOUNT_DISABLED')
    })
  })
})
