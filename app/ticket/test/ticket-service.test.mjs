import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createIdentityService } from '../src/server/services/identity.ts'
import { createNotificationService } from '../src/server/services/notifications.ts'
import { createOrgService } from '../src/server/services/org.ts'
import { createStatsService } from '../src/server/services/stats.ts'
import { createTicketService } from '../src/server/services/tickets.ts'
import { withTicketEnvironment } from './fixtures/ticket-environment.mjs'

const hasCode = (code) => (error) => {
  assert.equal(error.code, code, `expected ${code}, received ${error.code}: ${error.message}`)
  return true
}

function services(platform) {
  const identity = createIdentityService(platform.db, platform.permissions)
  const org = createOrgService(platform.db)
  const tickets = createTicketService(platform.db, identity, org)
  const notifications = createNotificationService(platform.db, identity, tickets)
  const stats = createStatsService(platform.db)
  return { identity, org, tickets, notifications, stats }
}

test('ticket creation validates fields, resolves assignment rules, and enforces company scope', async () => {
  await withTicketEnvironment(async ({ platform, seeded }) => {
    const { identity, tickets } = services(platform)
    const acmeUser = await identity.getById(seeded.accounts.acmeUser.id)
    const acmeStats = await identity.getById(seeded.accounts.acmeStats.id)

    await assert.rejects(
      tickets.createTicket({ subject: '', description: '', categoryId: '', priority: 'P9' }, acmeUser),
      hasCode('VALIDATION_FAILED'),
    )
    await assert.rejects(
      tickets.createTicket({ subject: '跨公司分类', description: '描述', categoryId: seeded.categories['globex:售后服务'], priority: 'P2' }, acmeUser),
      hasCode('FORBIDDEN'),
    )
    await assert.rejects(
      tickets.createTicket({ subject: '统计角色', description: '描述', categoryId: seeded.categories['acme:产品咨询'], priority: 'P2' }, acmeStats),
      hasCode('FORBIDDEN'),
    )

    const unassigned = await tickets.createTicket(
      { subject: '无规则分类工单', description: '用于验证未命中规则', categoryId: seeded.categories['acme:产品咨询'], priority: 'P3' },
      acmeUser,
    )
    assert.equal(unassigned.status, 'pending_assignment')
    assert.equal(unassigned.group, null)
    assert.match(unassigned.code, /^TK-\d{6}$/)
    assert.equal(unassigned.submitter.name, acmeUser.name)
    assert.equal(unassigned.department, '市场部')
    assert.equal(unassigned.companyId, seeded.companies.acme.id)

    const assigned = await tickets.createTicket(
      { subject: '命中规则工单', description: '用于验证自动分配', categoryId: seeded.categories['acme:账务问题'], priority: 'P1' },
      acmeUser,
    )
    assert.equal(assigned.status, 'pending')
    assert.equal(assigned.group.name, '财务支持组')
    assert.ok(Number(assigned.code.slice(3)) > Number(unassigned.code.slice(3)))
  })
})

test('lifecycle transitions, terminal guards, replies, ratings, and append-only logs stay consistent', async () => {
  await withTicketEnvironment(async ({ platform, seeded }) => {
    const { identity, tickets } = services(platform)
    const admin = await identity.getById(seeded.accounts.acmeAdmin.id)
    const finance = await identity.getById(seeded.accounts.acmeFinance.id)
    const tech = await identity.getById(seeded.accounts.acmeTech.id)
    const submitter = await identity.getById(seeded.accounts.acmeUser.id)
    const globexAdmin = await identity.getById(seeded.accounts.globexAdmin.id)
    const ticketId = 'seed-ticket-acme-3'

    const before = await tickets.getTicketDetail(ticketId, submitter)
    assert.equal(before.status, 'pending_assignment')
    assert.deepEqual([...before.allowedActions].sort(), ['cancel', 'reply'])

    const assigned = await tickets.assignTicket(ticketId, { groupId: seeded.groups['acme:财务支持组'] }, finance)
    assert.equal(assigned.status, 'pending')
    assert.equal(assigned.group.name, '财务支持组')
    await assert.rejects(tickets.assignTicket(ticketId, { groupId: seeded.groups['acme:技术支持组'] }, admin), hasCode('INVALID_STATE'))

    const transferred = await tickets.transferTicket(
      ticketId,
      { groupId: seeded.groups['acme:技术支持组'], assigneeId: seeded.accounts.acmeTech.id, note: '转交技术同事处理' },
      finance,
    )
    assert.equal(transferred.group.name, '技术支持组')
    assert.equal(transferred.assignee.name, '王芳')
    await assert.rejects(tickets.getTicketDetail(ticketId, finance), hasCode('FORBIDDEN'))

    const reply = await tickets.addReply(ticketId, '已收到，正在排查。', tech)
    assert.equal(reply.author.id, tech.id)
    const completed = await tickets.completeTicket(ticketId, '问题已解决', tech)
    assert.equal(completed.status, 'completed')
    await assert.rejects(tickets.addReply(ticketId, '终态回复', tech), hasCode('INVALID_STATE'))
    await assert.rejects(tickets.cancelTicket(ticketId, '终态取消', submitter), hasCode('INVALID_STATE'))
    await assert.rejects(tickets.assignTicket(ticketId, { groupId: seeded.groups['acme:技术支持组'] }, admin), hasCode('INVALID_STATE'))
    await assert.rejects(tickets.transferTicket(ticketId, { groupId: seeded.groups['acme:技术支持组'] }, tech), hasCode('INVALID_STATE'))

    const detail = await tickets.getTicketDetail(ticketId, submitter)
    assert.equal(detail.completedBy.name, '王芳')
    assert.ok(detail.completedAt)
    assert.equal(detail.firstReplyAt, reply.createdAt)
    assert.deepEqual(detail.allowedActions, ['rate'])
    assert.equal(detail.replies.length, 1)

    await assert.rejects(tickets.rateTicket(ticketId, { score: 5, comment: '非提交人' }, tech), hasCode('FORBIDDEN'))
    const rating = await tickets.rateTicket(ticketId, { score: 5, comment: '处理及时' }, submitter)
    assert.equal(rating.score, 5)
    await assert.rejects(tickets.rateTicket(ticketId, { score: 4 }, submitter), hasCode('DUPLICATE_RATING'))

    const logs = await tickets.getTicketLogs(ticketId, submitter)
    const actions = logs.items.map((entry) => entry.action)
    for (const action of ['created', 'assigned', 'transferred', 'replied', 'completed', 'rated']) {
      assert.ok(actions.includes(action), `missing log action ${action}`)
    }
    assert.ok(actions.indexOf('created') < actions.indexOf('completed'))
    const transferredLog = logs.items.find((entry) => entry.action === 'transferred')
    assert.equal(transferredLog.detail.fromGroupId, seeded.groups['acme:财务支持组'])
    assert.equal(transferredLog.detail.toGroupId, seeded.groups['acme:技术支持组'])
    assert.equal(transferredLog.actor.id, finance.id)

    await assert.rejects(tickets.getTicketDetail('seed-ticket-globex-1', submitter), hasCode('FORBIDDEN'))
    await assert.rejects(tickets.getTicketDetail('missing-ticket', submitter), hasCode('NOT_FOUND'))
    await assert.rejects(tickets.getTicketDetail('seed-ticket-acme-1', globexAdmin), hasCode('FORBIDDEN'))
  })
})

test('workbench and my-ticket queries apply scope, filters, sorting, pagination, and company isolation', async () => {
  await withTicketEnvironment(async ({ platform, seeded }) => {
    const { identity, tickets } = services(platform)
    const admin = await identity.getById(seeded.accounts.acmeAdmin.id)
    const finance = await identity.getById(seeded.accounts.acmeFinance.id)
    const submitter = await identity.getById(seeded.accounts.acmeUser.id)
    const globexAdmin = await identity.getById(seeded.accounts.globexAdmin.id)
    const platformStats = await identity.getById(seeded.accounts.acmeStats.id)

    const adminWorkbench = await tickets.listTickets({ scope: 'workbench' }, admin)
    assert.equal(adminWorkbench.total, 1)
    assert.equal(adminWorkbench.items[0].id, 'seed-ticket-acme-1')

    const financeWorkbench = await tickets.listTickets({ scope: 'workbench' }, finance)
    assert.equal(financeWorkbench.total, 1)
    assert.equal(financeWorkbench.items[0].group.name, '财务支持组')

    const mine = await tickets.listTickets({ scope: 'mine', status: ['all'] }, submitter)
    assert.equal(mine.total, 4)
    assert.ok(mine.items.every((ticket) => ticket.submitter.id === submitter.id))

    const globex = await tickets.listTickets({ scope: 'workbench' }, globexAdmin)
    assert.equal(globex.total, 1)
    assert.ok(globex.items.every((ticket) => ticket.companyId === seeded.companies.globex.id))

    const byPriority = await tickets.listTickets({ scope: 'mine', status: ['all'], priority: ['P1'] }, submitter)
    assert.deepEqual(byPriority.items.map((ticket) => ticket.id), ['seed-ticket-acme-2'])
    const byCode = await tickets.listTickets({ scope: 'mine', status: ['all'], q: 'tk-900004' }, submitter)
    assert.deepEqual(byCode.items.map((ticket) => ticket.id), ['seed-ticket-acme-4'])
    const sorted = await tickets.listTickets({ scope: 'mine', status: ['all'], sort: 'priority', order: 'asc' }, submitter)
    assert.deepEqual(sorted.items.map((ticket) => ticket.priority), ['P1', 'P2', 'P2', 'P3'])
    const page = await tickets.listTickets({ scope: 'mine', status: ['all'], page: 2, pageSize: 2 }, submitter)
    assert.equal(page.page, 2)
    assert.equal(page.pageSize, 2)
    assert.equal(page.items.length, 2)
    assert.equal(page.total, 4)

    await assert.rejects(tickets.listTickets({ scope: 'mine', companyId: seeded.companies.globex.id }, submitter), hasCode('FORBIDDEN'))
    await assert.rejects(tickets.listTickets({ scope: 'workbench' }, platformStats), hasCode('FORBIDDEN'))
    await assert.rejects(tickets.listTickets({ scope: 'other' }, admin), hasCode('VALIDATION_FAILED'))
  })
})

test('organization configuration enforces unique names, same-company members, and agent role synchronisation', async () => {
  await withTicketEnvironment(async ({ platform, seeded }) => {
    const { identity, org } = services(platform)
    const acmeUser = await identity.getById(seeded.accounts.acmeUser.id)

    await assert.rejects(org.createGroup(seeded.companies.acme.id, { name: '财务支持组' }), hasCode('DUPLICATE_NAME'))
    await assert.rejects(org.createCategory(seeded.companies.acme.id, { name: '账务问题' }), hasCode('DUPLICATE_NAME'))
    await assert.rejects(
      org.addGroupMember(seeded.companies.acme.id, seeded.groups['acme:技术支持组'], seeded.accounts.globexUser.id),
      hasCode('VALIDATION_FAILED'),
    )

    const created = await org.createGroup(seeded.companies.acme.id, { name: '临时支持组', description: '仅用于测试' })
    const member = await org.addGroupMember(seeded.companies.acme.id, created.id, acmeUser.id)
    assert.equal(member.email, acmeUser.email)
    let updated = await identity.getById(acmeUser.id)
    assert.ok(updated.isAgent)
    assert.deepEqual(updated.groups.map((group) => group.name), ['临时支持组'])
    await assert.rejects(org.addGroupMember(seeded.companies.acme.id, created.id, acmeUser.id), hasCode('DUPLICATE_MEMBER'))
    await org.removeGroupMember(seeded.companies.acme.id, created.id, acmeUser.id)
    updated = await identity.getById(acmeUser.id)
    assert.equal(updated.isAgent, false)
    assert.deepEqual(updated.groups, [])

    const firstRule = await org.upsertRule(seeded.companies.acme.id, {
      categoryId: seeded.categories['acme:产品咨询'],
      groupId: seeded.groups['acme:财务支持组'],
      enabled: true,
    })
    const secondRule = await org.upsertRule(seeded.companies.acme.id, {
      categoryId: seeded.categories['acme:产品咨询'],
      groupId: seeded.groups['acme:技术支持组'],
      enabled: false,
    })
    assert.equal(firstRule.id, secondRule.id)
    const rules = await org.listRules(seeded.companies.acme.id)
    assert.equal(rules.filter((rule) => rule.categoryId === seeded.categories['acme:产品咨询']).length, 1)
  })
})

test('statistics use the documented metric definitions and honour read scope', async () => {
  await withTicketEnvironment(async ({ platform, seeded }) => {
    const { identity, stats } = services(platform)
    const admin = await identity.getById(seeded.accounts.acmeAdmin.id)
    const submitter = await identity.getById(seeded.accounts.acmeUser.id)
    const platformStats = await identity.getById(seeded.accounts.acmeStats.id)
    const now = new Date()
    const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const to = now.toISOString()

    const overview = await stats.overview(admin, { from, to })
    assert.equal(overview.volume, 5)
    assert.equal(overview.cancelledCount, 1)
    assert.equal(overview.avgFirstResponseMinutes, 40)
    assert.deepEqual(overview.satisfaction, { average: 4.5, count: 2 })
    assert.deepEqual(overview.hotCategories.map((entry) => [entry.name, entry.count]), [['技术故障', 2], ['账务问题', 2], ['产品咨询', 1]])

    const lastDay = await stats.overview(admin, { from: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(), to })
    assert.equal(lastDay.volume, 3)
    assert.equal(lastDay.cancelledCount, 1)
    assert.equal(lastDay.avgFirstResponseMinutes, 30)
    assert.deepEqual(lastDay.satisfaction, { average: null, count: 0 })

    const companyDistribution = await stats.distribution(admin, { dimension: 'company', from, to })
    assert.equal(companyDistribution.total, 5)
    assert.deepEqual(companyDistribution.groups.map((group) => [group.label, group.count]), [['云启科技有限公司', 5]])
    const departmentDistribution = await stats.distribution(admin, { dimension: 'department', from, to })
    assert.equal(departmentDistribution.total, 5)
    assert.deepEqual(departmentDistribution.groups.map((group) => [group.label, group.count]), [['市场部', 5]])

    const platformOverview = await stats.overview(platformStats, { from, to })
    assert.equal(platformOverview.volume, 8)
    assert.equal(platformOverview.avgFirstResponseMinutes, 45)
    assert.deepEqual(platformOverview.satisfaction, { average: 4.7, count: 3 })
    const platformDistribution = await stats.distribution(platformStats, { dimension: 'company', from, to })
    assert.equal(platformDistribution.total, 8)
    assert.deepEqual(
      platformDistribution.groups.map((group) => [group.label, group.count]).sort(),
      [['云启科技有限公司', 5], ['环宇贸易有限公司', 3]].sort(),
    )
    const filtered = await stats.overview(platformStats, { from, to, companyId: seeded.companies.globex.id })
    assert.equal(filtered.volume, 3)

    await assert.rejects(stats.overview(submitter, { from, to }), hasCode('FORBIDDEN'))
    await assert.rejects(stats.distribution(admin, { dimension: 'priority', from, to }), hasCode('VALIDATION_FAILED'))
  })
})
