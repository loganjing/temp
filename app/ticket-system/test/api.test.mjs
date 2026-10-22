import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { createApp } from '../src/server/app.ts'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'
import { registerPublicRoutes, registerProtectedRoutes } from '../src/server/routes.ts'
import { withHttpServer } from './with-http-server.mjs'

const COMPANY_A = 'company-a'
const COMPANY_B = 'company-b'

const PEOPLE = [
  { key: 'subA', memberId: 'mem-a-sub', companyId: COMPANY_A, departmentId: 'dept-a-support', name: 'Amy Submitter', email: 'sub-a@example.com', roles: ['submitter'] },
  { key: 'agentA', memberId: 'mem-a-agent', companyId: COMPANY_A, departmentId: 'dept-a-support', name: 'Aaron Agent', email: 'agent-a@example.com', roles: ['agent'] },
  { key: 'agentA2', memberId: 'mem-a-agent2', companyId: COMPANY_A, departmentId: 'dept-a-support', name: 'Abby Agent', email: 'agent-a2@example.com', roles: ['agent'] },
  { key: 'mgrA', memberId: 'mem-a-mgr', companyId: COMPANY_A, departmentId: null, name: 'Mia Manager', email: 'mgr-a@example.com', roles: ['manager'] },
  { key: 'subB', memberId: 'mem-b-sub', companyId: COMPANY_B, departmentId: null, name: 'Bob Submitter', email: 'sub-b@example.com', roles: ['submitter'] },
  { key: 'agentB', memberId: 'mem-b-agent', companyId: COMPANY_B, departmentId: null, name: 'Bea Agent', email: 'agent-b@example.com', roles: ['agent'] },
  { key: 'mgrB', memberId: 'mem-b-mgr', companyId: COMPANY_B, departmentId: null, name: 'Ben Manager', email: 'mgr-b@example.com', roles: ['manager'] },
]

async function seed(platform) {
  const db = platform.db
  const ts = new Date().toISOString()
  await db.run({ text: 'INSERT INTO companies (id, name, code, created_at) VALUES (?, ?, ?, ?)', params: [COMPANY_A, 'Acme 支持', 'ACME', ts] })
  await db.run({ text: 'INSERT INTO companies (id, name, code, created_at) VALUES (?, ?, ?, ?)', params: [COMPANY_B, 'Beta 支持', 'BETA', ts] })
  await db.run({ text: 'INSERT INTO departments (id, company_id, name, created_at) VALUES (?, ?, ?, ?)', params: ['dept-a-support', COMPANY_A, '售后部', ts] })
  const tokens = {}
  for (const person of PEOPLE) {
    const user = await platform.auth.userStore.create(
      { name: person.name, email: person.email, passwordChangeRequired: false },
      platform.auth.hashPassword('correct-horse-battery'),
    )
    await db.run({
      text: 'INSERT INTO company_members (id, company_id, department_id, user_id, display_name, email, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
      params: [person.memberId, person.companyId, person.departmentId, user.id, person.name, person.email, ts],
    })
    for (const role of person.roles) {
      await db.run({ text: 'INSERT INTO company_member_roles (member_id, role_code) VALUES (?, ?)', params: [person.memberId, role] })
    }
    tokens[person.key] = platform.auth.signToken(user.id)
  }
  return tokens
}

function makeRequest(baseUrl) {
  return async (token, method, urlPath, body) => {
    const headers = {}
    if (token) headers.authorization = `Bearer ${token}`
    if (body !== undefined) headers['content-type'] = 'application/json'
    const response = await fetch(`${baseUrl}${urlPath}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const text = await response.text()
    return { status: response.status, body: text ? JSON.parse(text) : null }
  }
}

async function withApi(run) {
  const directory = await mkdtemp(path.join(tmpdir(), 'ticket-api-'))
  const previousDbPath = process.env.DB_PATH
  const previousSmtp = process.env.SMTP_HOST
  process.env.DB_PATH = path.join(directory, 'application.db')
  delete process.env.SMTP_HOST
  try {
    const platform = await initializePlatform()
    const app = createApp({
      registerPublicRoutes: (routes) => registerPublicRoutes(routes, platform),
      registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
      protect: platform.auth.requireAnyAuth,
    })
    const tokens = await seed(platform)
    await withHttpServer({ fetch: app.fetch, close: () => platform.close() }, (baseUrl) =>
      run({ baseUrl, platform, tokens, request: makeRequest(baseUrl) }))
  } finally {
    if (previousDbPath === undefined) delete process.env.DB_PATH
    else process.env.DB_PATH = previousDbPath
    if (previousSmtp === undefined) delete process.env.SMTP_HOST
    else process.env.SMTP_HOST = previousSmtp
    await rm(directory, { recursive: true, force: true })
  }
}

test('GET /api/me/context 返回成员上下文，并按权限/校验返回 403 与 400', async () => {
  await withApi(async ({ request, tokens }) => {
    const context = await request(tokens.mgrA, 'GET', '/api/me/context')
    assert.equal(context.status, 200)
    assert.equal(context.body.memberId, 'mem-a-mgr')
    assert.equal(context.body.companyId, COMPANY_A)
    assert.equal(context.body.companyName, 'Acme 支持')
    assert.equal(context.body.departmentId, null)
    assert.ok(context.body.roles.includes('manager'))
    assert.ok(context.body.permissions.includes('analytics:read'))
    assert.ok(context.body.permissions.includes('org:configure'))

    const anonymous = await request(null, 'GET', '/api/me/context')
    assert.equal(anonymous.status, 401)

    const forbidden = await request(tokens.subA, 'POST', '/api/org/groups', { name: '无权限组' })
    assert.equal(forbidden.status, 403)
    assert.equal(forbidden.body.error.code, 'forbidden')

    const invalid = await request(tokens.subA, 'POST', '/api/tickets', { subject: '', description: 'd', category: 'c', priority: 'P9' })
    assert.equal(invalid.status, 400)
    assert.equal(invalid.body.error.code, 'invalid_request')
    assert.ok(invalid.body.error.details.fields.subject)
    assert.ok(invalid.body.error.details.fields.priority)
  })
})

test('创建工单：公司内编号、分类自动分配与详情读回（含业务组成员读回）', async () => {
  await withApi(async ({ request, tokens }) => {
    const group = await request(tokens.mgrA, 'POST', '/api/org/groups', { name: '硬件支持组', memberIds: ['mem-a-agent'] })
    assert.equal(group.status, 201)
    const groupId = group.body.group.id
    assert.deepEqual(group.body.group.members.map((member) => member.memberId), ['mem-a-agent'])

    const rule = await request(tokens.mgrA, 'POST', '/api/org/assignment-rules', { category: 'Hardware', groupId })
    assert.equal(rule.status, 201)
    assert.equal(rule.body.rule.groupId, groupId)
    assert.equal(rule.body.rule.groupName, '硬件支持组')

    const created = await request(tokens.subA, 'POST', '/api/tickets', { subject: '打印机无法打印', description: '办公室打印机离线', category: 'Hardware', priority: 'P1' })
    assert.equal(created.status, 201)
    const ticket = created.body.ticket
    assert.equal(ticket.ticketNo, 'TKT-000001')
    assert.equal(ticket.status, 'pending_assignment')
    assert.equal(ticket.groupId, groupId)
    assert.equal(ticket.groupName, '硬件支持组')
    assert.equal(ticket.priority, 'P1')
    assert.equal(ticket.submitter.memberId, 'mem-a-sub')
    assert.equal(ticket.submitter.departmentName, '售后部')
    assert.equal(ticket.submitter.email, 'sub-a@example.com')
    assert.equal(ticket.assignments.length, 1)
    assert.equal(ticket.assignments[0].kind, 'auto')

    const detail = await request(tokens.subA, 'GET', `/api/tickets/${ticket.id}`)
    assert.equal(detail.status, 200)
    assert.equal(detail.body.ticket.subject, '打印机无法打印')
    assert.equal(detail.body.ticket.description, '办公室打印机离线')
    assert.deepEqual(detail.body.ticket.replies, [])

    const manual = await request(tokens.subA, 'POST', '/api/tickets', { subject: '其他问题', description: '需要协助', category: 'Other', priority: 'P3' })
    assert.equal(manual.status, 201)
    assert.equal(manual.body.ticket.status, 'created')
    assert.equal(manual.body.ticket.groupId, null)
    assert.equal(manual.body.ticket.ticketNo, 'TKT-000002')

    const groups = await request(tokens.mgrA, 'GET', '/api/org/groups')
    assert.equal(groups.status, 200)
    const listed = groups.body.items.find((item) => item.id === groupId)
    assert.equal(listed.memberCount, 1)
    assert.deepEqual(listed.memberIds, ['mem-a-agent'])
    assert.deepEqual(listed.members.map((member) => member.memberId), ['mem-a-agent'])

    const members = await request(tokens.mgrA, 'GET', '/api/org/members?q=Amy')
    assert.equal(members.status, 200)
    assert.equal(members.body.items.length, 1)
    assert.equal(members.body.items[0].memberId, 'mem-a-sub')
    assert.equal(members.body.items[0].departmentName, '售后部')
  })
})

test('多轮回复按时间顺序读回，提交人只能看到自己的工单', async () => {
  await withApi(async ({ request, tokens }) => {
    const created = await request(tokens.subA, 'POST', '/api/tickets', { subject: '登录问题', description: '无法登录', category: 'Software', priority: 'P2' })
    const ticketId = created.body.ticket.id

    const first = await request(tokens.agentA, 'POST', `/api/tickets/${ticketId}/replies`, { content: '请提供账号信息' })
    assert.equal(first.status, 201)
    assert.equal(first.body.reply.authorRole, 'agent')
    const second = await request(tokens.subA, 'POST', `/api/tickets/${ticketId}/replies`, { content: '账号是 sub-a' })
    assert.equal(second.status, 201)
    assert.equal(second.body.reply.authorRole, 'submitter')

    const detail = await request(tokens.agentA, 'GET', `/api/tickets/${ticketId}`)
    assert.equal(detail.body.ticket.replies.length, 2)
    assert.deepEqual(detail.body.ticket.replies.map((reply) => reply.content), ['请提供账号信息', '账号是 sub-a'])

    const other = await request(tokens.agentA, 'POST', '/api/tickets', { subject: '处理人自建工单', description: 'x', category: 'Software', priority: 'P4' })
    assert.equal(other.status, 201)
    const list = await request(tokens.subA, 'GET', '/api/tickets')
    assert.equal(list.status, 200)
    assert.equal(list.body.items.some((item) => item.id === other.body.ticket.id), false)
    assert.equal(list.body.items.some((item) => item.id === ticketId), true)

    const denied = await request(tokens.subA, 'GET', `/api/tickets/${other.body.ticket.id}`)
    assert.equal(denied.status, 404)
  })
})

test('分配与转派切换处理方，跨公司对象一律 404', async () => {
  await withApi(async ({ request, tokens }) => {
    const group = await request(tokens.mgrA, 'POST', '/api/org/groups', { name: '支持一组', memberIds: ['mem-a-agent', 'mem-a-agent2'] })
    const groupId = group.body.group.id
    const created = await request(tokens.subA, 'POST', '/api/tickets', { subject: '网络故障', description: '断网', category: 'Network', priority: 'P0' })
    const ticketId = created.body.ticket.id

    const assigned = await request(tokens.agentA, 'POST', `/api/tickets/${ticketId}/assign`, { groupId, assigneeMemberId: 'mem-a-agent' })
    assert.equal(assigned.status, 200)
    assert.equal(assigned.body.ticket.status, 'pending_processing')
    assert.equal(assigned.body.ticket.assigneeMemberId, 'mem-a-agent')
    assert.equal(assigned.body.ticket.assignments.at(-1).kind, 'assign')

    const transferred = await request(tokens.agentA, 'POST', `/api/tickets/${ticketId}/transfer`, { toMemberId: 'mem-a-agent2', reason: '换班' })
    assert.equal(transferred.status, 200)
    assert.equal(transferred.body.ticket.assigneeMemberId, 'mem-a-agent2')
    assert.equal(transferred.body.ticket.assignments.at(-1).kind, 'transfer')
    assert.equal(transferred.body.ticket.assignments.at(-1).fromMemberName, 'Aaron Agent')
    assert.equal(transferred.body.ticket.assignments.at(-1).toMemberName, 'Abby Agent')

    const crossDetail = await request(tokens.agentB, 'GET', `/api/tickets/${ticketId}`)
    assert.equal(crossDetail.status, 404)
    const crossReply = await request(tokens.agentB, 'POST', `/api/tickets/${ticketId}/replies`, { content: '越权回复' })
    assert.equal(crossReply.status, 404)
    const crossAssign = await request(tokens.agentB, 'POST', `/api/tickets/${ticketId}/assign`, { groupId })
    assert.equal(crossAssign.status, 404)
    const bList = await request(tokens.agentB, 'GET', '/api/tickets')
    assert.equal(bList.body.items.length, 0)
  })
})

test('完成记录处理人与时间、通知结果可读回、已完成不可取消、重复评价 409', async () => {
  await withApi(async ({ request, tokens }) => {
    const group = await request(tokens.mgrA, 'POST', '/api/org/groups', { name: '支持组', memberIds: ['mem-a-agent'] })
    const groupId = group.body.group.id
    const created = await request(tokens.subA, 'POST', '/api/tickets', { subject: '设备报修', description: '键盘损坏', category: 'Hardware', priority: 'P2' })
    const ticketId = created.body.ticket.id
    await request(tokens.agentA, 'POST', `/api/tickets/${ticketId}/assign`, { groupId, assigneeMemberId: 'mem-a-agent' })

    const completed = await request(tokens.agentA, 'POST', `/api/tickets/${ticketId}/complete`, { resolution: '已更换键盘' })
    assert.equal(completed.status, 200)
    assert.equal(completed.body.ticket.status, 'completed')
    assert.ok(completed.body.ticket.completedAt)
    assert.equal(completed.body.ticket.completedByName, 'Aaron Agent')
    assert.equal(completed.body.notification.status, 'failed')
    assert.equal(completed.body.notification.error, 'smtp_not_configured')

    const notifications = await request(tokens.subA, 'GET', `/api/tickets/${ticketId}/notifications`)
    assert.equal(notifications.status, 200)
    assert.equal(notifications.body.items.length, 1)
    assert.equal(notifications.body.items[0].status, 'failed')
    assert.equal(notifications.body.items[0].recipientEmail, 'sub-a@example.com')

    const replyAfterComplete = await request(tokens.subA, 'POST', `/api/tickets/${ticketId}/replies`, { content: '还能回复吗' })
    assert.equal(replyAfterComplete.status, 422)
    assert.equal(replyAfterComplete.body.error.code, 'state_violation')

    const cancelCompleted = await request(tokens.subA, 'POST', `/api/tickets/${ticketId}/cancel`, { reason: '不想要了' })
    assert.equal(cancelCompleted.status, 422)
    assert.equal(cancelCompleted.body.error.code, 'state_violation')

    const rated = await request(tokens.subA, 'POST', `/api/tickets/${ticketId}/rating`, { score: 5, comment: '处理很快' })
    assert.equal(rated.status, 201)
    assert.equal(rated.body.rating.score, 5)
    assert.equal(rated.body.rating.comment, '处理很快')

    const duplicate = await request(tokens.subA, 'POST', `/api/tickets/${ticketId}/rating`, { score: 3 })
    assert.equal(duplicate.status, 409)
    assert.equal(duplicate.body.error.code, 'conflict')

    const detail = await request(tokens.subA, 'GET', `/api/tickets/${ticketId}`)
    assert.equal(detail.body.ticket.rating.score, 5)
    assert.equal(detail.body.ticket.rating.comment, '处理很快')
    assert.ok(detail.body.ticket.rating.createdAt)
  })
})

test('取消未完成工单生效，状态流转与评价前置校验', async () => {
  await withApi(async ({ request, tokens }) => {
    const created = await request(tokens.subA, 'POST', '/api/tickets', { subject: '误报工单', description: '重复提交', category: 'Other', priority: 'P4' })
    const ticketId = created.body.ticket.id

    const earlyRating = await request(tokens.subA, 'POST', `/api/tickets/${ticketId}/rating`, { score: 4 })
    assert.equal(earlyRating.status, 422)
    assert.equal(earlyRating.body.error.code, 'state_violation')

    const cancelled = await request(tokens.subA, 'POST', `/api/tickets/${ticketId}/cancel`, { reason: '重复' })
    assert.equal(cancelled.status, 200)
    assert.equal(cancelled.body.ticket.status, 'cancelled')
    assert.ok(cancelled.body.ticket.cancelledAt)

    const list = await request(tokens.subA, 'GET', '/api/tickets?status=cancelled')
    assert.equal(list.status, 200)
    assert.equal(list.body.items.some((item) => item.id === ticketId), true)
    assert.equal(list.body.page, 1)
    assert.equal(list.body.pageSize, 20)
  })
})

test('统计分布与运营指标按公司范围实时聚合', async () => {
  await withApi(async ({ request, tokens }) => {
    const first = await request(tokens.subA, 'POST', '/api/tickets', { subject: 'A-1', description: 'd', category: 'Hardware', priority: 'P1' })
    const second = await request(tokens.subA, 'POST', '/api/tickets', { subject: 'A-2', description: 'd', category: 'Software', priority: 'P2' })
    await request(tokens.agentA, 'POST', `/api/tickets/${first.body.ticket.id}/replies`, { content: '正在处理' })

    const group = await request(tokens.mgrA, 'POST', '/api/org/groups', { name: '统计组', memberIds: ['mem-a-agent'] })
    await request(tokens.agentA, 'POST', `/api/tickets/${second.body.ticket.id}/assign`, { groupId: group.body.group.id, assigneeMemberId: 'mem-a-agent' })
    await request(tokens.agentA, 'POST', `/api/tickets/${second.body.ticket.id}/complete`, {})
    await request(tokens.subA, 'POST', `/api/tickets/${second.body.ticket.id}/rating`, { score: 4 })

    await request(tokens.subB, 'POST', '/api/tickets', { subject: 'B-1', description: 'd', category: 'Hardware', priority: 'P1' })

    const company = await request(tokens.mgrA, 'GET', '/api/analytics/distribution?by=company')
    assert.equal(company.status, 200)
    assert.equal(company.body.by, 'company')
    assert.equal(company.body.total, 2)
    assert.equal(company.body.items.length, 1)
    assert.equal(company.body.items[0].key, COMPANY_A)
    assert.equal(company.body.items[0].name, 'Acme 支持')
    assert.equal(company.body.items[0].count, 2)

    const department = await request(tokens.mgrA, 'GET', '/api/analytics/distribution?by=department')
    assert.equal(department.status, 200)
    assert.equal(department.body.by, 'department')
    assert.equal(department.body.total, 2)
    assert.equal(department.body.items.reduce((sum, item) => sum + item.count, 0), 2)
    assert.deepEqual(department.body.items.map((item) => item.name), ['售后部'])

    const overview = await request(tokens.mgrA, 'GET', '/api/analytics/overview')
    assert.equal(overview.status, 200)
    assert.equal(overview.body.ticketCount, 2)
    assert.equal(overview.body.statusBreakdown.completed, 1)
    assert.equal(overview.body.statusBreakdown.created, 1)
    assert.equal(overview.body.statusBreakdown.cancelled, 0)
    assert.equal(overview.body.statusBreakdown.pending_assignment, 0)
    assert.equal(overview.body.statusBreakdown.pending_processing, 0)
    assert.notEqual(overview.body.avgFirstResponseSeconds, null)
    assert.equal(overview.body.satisfaction.count, 1)
    assert.equal(overview.body.satisfaction.average, 4)
    assert.equal(overview.body.satisfaction.distribution['4'], 1)
    assert.equal(overview.body.satisfaction.distribution['5'], 0)
    assert.ok(overview.body.hotCategories.some((item) => item.category === 'Hardware'))
    assert.ok(overview.body.hotCategories.some((item) => item.category === 'Software'))

    const badBoundary = await request(tokens.mgrA, 'GET', '/api/analytics/distribution?by=team')
    assert.equal(badBoundary.status, 400)
    assert.equal(badBoundary.body.error.code, 'invalid_request')

    const bCompany = await request(tokens.mgrB, 'GET', '/api/analytics/distribution?by=company')
    assert.equal(bCompany.body.total, 1)
    assert.equal(bCompany.body.items[0].key, COMPANY_B)
  })
})

test('操作日志覆盖创建、自动分配、转派、完成通知（系统触发）与配置变更，且按公司隔离', async () => {
  await withApi(async ({ request, tokens }) => {
    const group = await request(tokens.mgrA, 'POST', '/api/org/groups', { name: '日志组', memberIds: ['mem-a-agent'] })
    const groupId = group.body.group.id
    await request(tokens.mgrA, 'POST', '/api/org/assignment-rules', { category: 'Hardware', groupId })

    const created = await request(tokens.subA, 'POST', '/api/tickets', { subject: '日志工单', description: 'd', category: 'Hardware', priority: 'P1' })
    const ticketId = created.body.ticket.id
    await request(tokens.agentA, 'POST', `/api/tickets/${ticketId}/transfer`, { toMemberId: 'mem-a-agent2' })
    await request(tokens.agentA2, 'POST', `/api/tickets/${ticketId}/complete`, {})
    await request(tokens.subA, 'POST', `/api/tickets/${ticketId}/rating`, { score: 2 })

    const events = await request(tokens.mgrA, 'GET', '/api/audit-events?pageSize=100')
    assert.equal(events.status, 200)
    const actions = events.body.items.map((item) => item.action)
    for (const action of ['ticket.created', 'ticket.auto_assigned', 'ticket.transferred', 'ticket.completed', 'ticket.completion_notified', 'ticket.rated', 'org.group_created', 'org.assignment_rule_created']) {
      assert.ok(actions.includes(action), `missing audit action ${action}`)
    }

    const createdEvent = events.body.items.find((item) => item.action === 'ticket.created')
    assert.equal(createdEvent.objectType, 'ticket')
    assert.equal(createdEvent.objectId, ticketId)
    assert.equal(createdEvent.actorMemberId, 'mem-a-sub')
    assert.equal(createdEvent.actorName, 'Amy Submitter')
    assert.ok(createdEvent.occurredAt)

    const systemEvents = await request(tokens.mgrA, 'GET', '/api/audit-events?actorMemberId=system&pageSize=100')
    assert.equal(systemEvents.status, 200)
    const systemActions = systemEvents.body.items.map((item) => item.action)
    assert.ok(systemActions.includes('ticket.auto_assigned'))
    assert.ok(systemActions.includes('ticket.completion_notified'))
    assert.ok(systemEvents.body.items.every((item) => item.actorMemberId === 'system'))

    const filtered = await request(tokens.mgrA, 'GET', `/api/audit-events?objectType=ticket&objectId=${ticketId}&pageSize=100`)
    assert.ok(filtered.body.items.length >= 5)
    assert.ok(filtered.body.items.every((item) => item.objectType === 'ticket' && item.objectId === ticketId))

    const bEvents = await request(tokens.mgrB, 'GET', '/api/audit-events?pageSize=100')
    assert.equal(bEvents.status, 200)
    assert.equal(bEvents.body.total, 0)
  })
})
