import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { createApp } from '../src/server/app.ts'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'
import { createAuthBoundary } from '../src/server/platform/auth.ts'
import { registerPublicRoutes, registerProtectedRoutes } from '../src/server/routes.ts'

const directory = await mkdtemp(path.join(tmpdir(), 'ticket-domain-'))
process.env.DB_PATH = path.join(directory, 'application.db')
const platform = await initializePlatform()
const app = createApp({
  registerPublicRoutes: (routes) => registerPublicRoutes(routes, platform),
  registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
  protect: createAuthBoundary(platform.db),
})

after(async () => {
  await platform.close()
  await rm(directory, { recursive: true, force: true })
})

async function login(username) {
  const response = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: 'Demo@1234' }),
  })
  const { token } = await response.json()
  return token
}

const alice = await login('alice')
const bob = await login('bob')
const carol = await login('carol')

function authed(token) {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

async function call(token, method, pathname, body) {
  return app.request(pathname, {
    method,
    headers: authed(token),
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function createTicket(token, input) {
  const response = await call(token, 'POST', '/api/tickets', input)
  const data = await response.json()
  return { status: response.status, data }
}

let t1, t2, t3, t4, t5, t6, t7
let g1, g2

test('AC-01 ticket creation records full information and is readable back', async () => {
  const { status, data } = await createTicket(alice, {
    subject: '登录页面报错',
    description: '点击登录按钮无响应',
    categoryId: 3,
    priority: 'P1',
  })
  assert.equal(status, 200)
  t1 = data.ticket.id
  assert.equal(data.ticket.ticketNo, 'TKT-000001')
  assert.equal(data.ticket.subject, '登录页面报错')
  assert.equal(data.ticket.description, '点击登录按钮无响应')
  assert.equal(data.ticket.categoryId, 3)
  assert.equal(data.ticket.categoryName, '功能缺陷')
  assert.equal(data.ticket.priority, 'P1')
  assert.equal(data.ticket.status, 'pending_assignment')
  assert.equal(data.ticket.companyName, '示例科技有限公司')
  assert.equal(data.ticket.assignedGroupId, null)
  assert.equal(data.ticket.assignedGroupName, null)
  assert.ok(data.ticket.createdAt)
  assert.equal(data.ticket.firstReplyAt, null)
  assert.deepEqual(data.ticket.submitter, {
    id: 1,
    username: 'alice',
    fullName: '张丽',
    email: 'alice@example-tech.cn',
    companyId: 1,
    companyName: '示例科技有限公司',
    department: '产品部',
  })
  assert.deepEqual(data.replies, [])
  assert.equal(data.rating, null)
  assert.equal(data.submitterHistory.length, 1)
  const types = data.timeline.map((item) => item.type)
  assert.deepEqual(types, ['TICKET_CREATED', 'TICKET_ASSIGNMENT_ENTERED'])
  assert.deepEqual(data.timeline[0].operator, { id: 1, fullName: '张丽' })
  assert.equal(data.timeline[1].operator, 'system')
  assert.equal(data.timeline[0].payload.ticketNo, 'TKT-000001')

  const detail = await call(alice, 'GET', `/api/tickets/${t1}`)
  assert.equal(detail.status, 200)
  const detailData = await detail.json()
  assert.equal(detailData.ticket.id, t1)
  assert.equal(detailData.ticket.ticketNo, 'TKT-000001')

  for (const invalid of [
    { description: 'missing subject', body: { categoryId: 3, priority: 'P1' } },
    { description: 'bad priority', body: { subject: 'x', categoryId: 3, priority: 'PX' } },
    { description: 'unknown category', body: { subject: 'x', categoryId: 99, priority: 'P1' } },
  ]) {
    const response = await createTicket(alice, invalid.body)
    assert.equal(response.status, 422, invalid.description)
    assert.equal(response.data.error.code, 'VALIDATION_ERROR', invalid.description)
  }
})

test('AC-02 tickets are isolated per company', async () => {
  const detail = await call(carol, 'GET', `/api/tickets/${t1}`)
  assert.equal(detail.status, 404)
  assert.deepEqual(await detail.json(), { error: { code: 'NOT_FOUND', message: '工单不存在或无权限' } })

  const search = await call(carol, 'GET', '/api/tickets?q=登录页面')
  assert.equal(search.status, 200)
  const searchData = await search.json()
  assert.equal(searchData.total, 0)
  assert.deepEqual(searchData.items, [])

  const list = await call(carol, 'GET', '/api/tickets')
  assert.equal(list.status, 200)
  assert.equal((await list.json()).total, 0)

  const reply = await call(carol, 'POST', `/api/tickets/${t1}/replies`, { content: '跨公司回复' })
  assert.equal(reply.status, 404)

  const cancel = await call(carol, 'POST', `/api/tickets/${t1}/cancel`, {})
  assert.equal(cancel.status, 404)
})

test('AC-05 category rules auto-assign new tickets to the matching group', async () => {
  const g1Response = await call(alice, 'POST', '/api/groups', { name: '一线受理组', description: '首问负责' })
  g1 = (await g1Response.json()).group
  const g2Response = await call(alice, 'POST', '/api/groups', { name: '二线处理组' })
  g2 = (await g2Response.json()).group
  await call(alice, 'POST', `/api/groups/${g1.id}/members`, { userIds: [2] })
  await call(alice, 'POST', `/api/groups/${g2.id}/members`, { userIds: [1] })

  const rule = await call(alice, 'PUT', '/api/assignment-rules', { categoryId: 3, groupId: g1.id })
  assert.equal(rule.status, 200)

  const auto = await createTicket(alice, { subject: '导出报表失败', categoryId: 3, priority: 'P1', description: 'CSV 导出为空' })
  assert.equal(auto.status, 200)
  t2 = auto.data.ticket.id
  assert.equal(auto.data.ticket.status, 'pending_process')
  assert.equal(auto.data.ticket.assignedGroupId, g1.id)
  assert.equal(auto.data.ticket.assignedGroupName, '一线受理组')

  const unmatched = await createTicket(alice, { subject: '功能咨询：批量导入', categoryId: 4, priority: 'P2' })
  assert.equal(unmatched.status, 200)
  t3 = unmatched.data.ticket.id
  assert.equal(unmatched.data.ticket.status, 'pending_assignment')
  assert.equal(unmatched.data.ticket.assignedGroupId, null)

  const bobTicket = await createTicket(bob, { subject: '紧急：支付报错', categoryId: 3, priority: 'P0' })
  t4 = bobTicket.data.ticket.id
  assert.equal(bobTicket.data.ticket.status, 'pending_process')

  const carolBug = await createTicket(carol, { subject: '星辰：权限异常', categoryId: 3, priority: 'P3' })
  t5 = carolBug.data.ticket.id
  assert.equal(carolBug.data.ticket.status, 'pending_assignment')

  const carolData = await createTicket(carol, { subject: '星辰：数据缺失', categoryId: 7, priority: 'P3' })
  t6 = carolData.data.ticket.id
  assert.equal(carolData.data.ticket.status, 'pending_assignment')
})

test('manual assignment moves pending_assignment tickets into pending_process', async () => {
  const assigned = await call(alice, 'POST', `/api/tickets/${t3}/assign`, { groupId: g2.id })
  assert.equal(assigned.status, 200)
  const data = await assigned.json()
  assert.equal(data.ticket.status, 'pending_process')
  assert.equal(data.ticket.assignedGroupId, g2.id)

  const detail = await call(alice, 'GET', `/api/tickets/${t3}`)
  const detailData = await detail.json()
  const assignedEvent = detailData.timeline.find((item) => item.type === 'TICKET_ASSIGNED')
  assert.ok(assignedEvent)
  assert.deepEqual(assignedEvent.operator, { id: 1, fullName: '张丽' })
  assert.equal(assignedEvent.payload.groupId, g2.id)

  const wrongState = await call(alice, 'POST', `/api/tickets/${t2}/assign`, { groupId: g2.id })
  assert.equal(wrongState.status, 409)

  const missingGroup = await call(carol, 'POST', `/api/tickets/${t5}/assign`, { groupId: 999 })
  assert.equal(missingGroup.status, 404)

  const crossCompanyGroup = await call(carol, 'POST', `/api/tickets/${t5}/assign`, { groupId: g1.id })
  assert.equal(crossCompanyGroup.status, 404)
})

test('AC-03 multi-round replies are recorded in order with first reply timestamp', async () => {
  const first = await call(bob, 'POST', `/api/tickets/${t2}/replies`, { content: '已收到，正在排查' })
  assert.equal(first.status, 200)
  const firstData = await first.json()
  assert.deepEqual(firstData.reply.author, { id: 2, fullName: '王强' })
  assert.equal(firstData.reply.content, '已收到，正在排查')

  await call(alice, 'POST', `/api/tickets/${t2}/replies`, { content: '补充：导出按钮位于报表页' })
  await call(bob, 'POST', `/api/tickets/${t2}/replies`, { content: '复现成功，定位到空数据源' })

  const detail = await call(alice, 'GET', `/api/tickets/${t2}`)
  const detailData = await detail.json()
  assert.equal(detailData.replies.length, 3)
  assert.deepEqual(detailData.replies.map((r) => r.author.fullName), ['王强', '张丽', '王强'])
  assert.ok(detailData.ticket.firstReplyAt)
  assert.equal(detailData.ticket.firstReplyAt, detailData.replies[0].createdAt)

  const empty = await call(alice, 'POST', `/api/tickets/${t2}/replies`, { content: '   ' })
  assert.equal(empty.status, 422)
})

test('AC-06 transfer re-points the group while staying pending_process', async () => {
  const transferred = await call(bob, 'POST', `/api/tickets/${t2}/transfer`, { toGroupId: g2.id })
  assert.equal(transferred.status, 200)
  const data = await transferred.json()
  assert.equal(data.ticket.status, 'pending_process')
  assert.equal(data.ticket.assignedGroupId, g2.id)

  const transferredBack = await call(bob, 'POST', `/api/tickets/${t2}/transfer`, { toGroupId: g1.id })
  assert.equal(transferredBack.status, 200)
  assert.equal((await transferredBack.json()).ticket.assignedGroupId, g1.id)

  const sameGroup = await call(bob, 'POST', `/api/tickets/${t2}/transfer`, { toGroupId: g1.id })
  assert.equal(sameGroup.status, 422)

  const missingGroup = await call(bob, 'POST', `/api/tickets/${t2}/transfer`, { toGroupId: 999 })
  assert.equal(missingGroup.status, 404)

  const notAssigned = await call(alice, 'POST', `/api/tickets/${t5}/transfer`, { toGroupId: g1.id })
  assert.equal(notAssigned.status, 404)
})

test('AC-07/AC-08 completing a ticket records handler and enqueues the notice', async () => {
  const completed = await call(bob, 'POST', `/api/tickets/${t2}/complete`, {})
  assert.equal(completed.status, 200)
  const data = await completed.json()
  assert.equal(data.ticket.status, 'completed')
  assert.deepEqual(data.ticket.completedBy, { id: 2, fullName: '王强' })
  assert.ok(data.ticket.completedAt)

  const outbox = await call(alice, 'GET', '/api/mail-outbox')
  assert.equal(outbox.status, 200)
  const outboxData = await outbox.json()
  assert.equal(outboxData.total, 1)
  const notice = outboxData.items[0]
  assert.equal(notice.ticketId, t2)
  assert.equal(notice.ticketNo, data.ticket.ticketNo)
  assert.equal(notice.kind, 'ticket_completed_notice')
  assert.equal(notice.toEmail, 'alice@example-tech.cn')
  assert.equal(notice.status, 'recorded')
  assert.ok(notice.subject.includes(data.ticket.ticketNo))
  assert.ok(notice.subject.includes('导出报表失败'))
  assert.ok(notice.body.includes(data.ticket.ticketNo))

  const filtered = await call(alice, 'GET', `/api/mail-outbox?ticketId=${t2}`)
  assert.equal((await filtered.json()).total, 1)

  const carolOutbox = await call(carol, 'GET', '/api/mail-outbox')
  assert.equal((await carolOutbox.json()).total, 0)
})

test('AC-04 terminal states reject further transitions', async () => {
  const completeAgain = await call(bob, 'POST', `/api/tickets/${t2}/complete`, {})
  assert.equal(completeAgain.status, 409)
  assert.equal((await completeAgain.json()).error.code, 'STATE_CONFLICT')

  const transfer = await call(bob, 'POST', `/api/tickets/${t2}/transfer`, { toGroupId: g1.id })
  assert.equal(transfer.status, 409)

  const cancel = await call(alice, 'POST', `/api/tickets/${t2}/cancel`, {})
  assert.equal(cancel.status, 409)

  const reply = await call(bob, 'POST', `/api/tickets/${t2}/replies`, { content: '终态回复' })
  assert.equal(reply.status, 409)

  const assign = await call(alice, 'POST', `/api/tickets/${t2}/assign`, { groupId: g1.id })
  assert.equal(assign.status, 409)
})

test('AC-04 an open ticket can be cancelled once', async () => {
  const created = await createTicket(alice, { subject: '临时咨询', categoryId: 8, priority: 'P4' })
  t7 = created.data.ticket.id
  assert.equal(created.data.ticket.status, 'pending_assignment')

  const cancelled = await call(alice, 'POST', `/api/tickets/${t7}/cancel`, {})
  assert.equal(cancelled.status, 200)
  assert.equal((await cancelled.json()).ticket.status, 'cancelled')

  const cancelledAgain = await call(alice, 'POST', `/api/tickets/${t7}/cancel`, {})
  assert.equal(cancelledAgain.status, 409)

  const outbox = await call(alice, 'GET', '/api/mail-outbox')
  assert.equal((await outbox.json()).total, 1, 'cancelled tickets must not produce completion notices')
})

test('AC-09 rating is submitter-only, unique and only for completed tickets', async () => {
  const notSubmitter = await call(bob, 'POST', `/api/tickets/${t2}/rating`, { rating: 5 })
  assert.equal(notSubmitter.status, 403)
  assert.equal((await notSubmitter.json()).error.code, 'FORBIDDEN')

  const invalid = await call(alice, 'POST', `/api/tickets/${t2}/rating`, { rating: 6 })
  assert.equal(invalid.status, 422)

  const notCompleted = await call(alice, 'POST', `/api/tickets/${t3}/rating`, { rating: 5 })
  assert.equal(notCompleted.status, 409)

  const rated = await call(alice, 'POST', `/api/tickets/${t2}/rating`, { rating: 5 })
  assert.equal(rated.status, 200)
  const ratingData = await rated.json()
  assert.equal(ratingData.rating.rating, 5)
  assert.deepEqual(ratingData.rating.ratedBy, { id: 1, fullName: '张丽' })

  const duplicate = await call(alice, 'POST', `/api/tickets/${t2}/rating`, { rating: 4 })
  assert.equal(duplicate.status, 409)

  const detail = await call(alice, 'GET', `/api/tickets/${t2}`)
  const detailData = await detail.json()
  assert.equal(detailData.rating.rating, 5)
  assert.deepEqual(detailData.rating.ratedBy, { id: 1, fullName: '张丽' })
})

test('AC-10 dashboard aggregates volume, response time, satisfaction and hot categories', async () => {
  const completed = await call(bob, 'POST', `/api/tickets/${t3}/complete`, {})
  assert.equal(completed.status, 200)
  const rated = await call(alice, 'POST', `/api/tickets/${t3}/rating`, { rating: 4 })
  assert.equal(rated.status, 200)

  const dashboard = await call(alice, 'GET', '/api/stats/dashboard')
  assert.equal(dashboard.status, 200)
  const data = await dashboard.json()
  assert.equal(data.volume, 7)
  assert.equal(typeof data.avgResponseMinutes, 'number')
  assert.ok(data.avgResponseMinutes >= 0)
  assert.deepEqual(data.satisfaction, { average: 4.5, ratedCount: 2 })
  assert.deepEqual(data.hotCategories, [
    { categoryId: 3, categoryName: '功能缺陷', count: 4 },
    { categoryId: 8, categoryName: '其他', count: 1 },
    { categoryId: 4, categoryName: '功能咨询', count: 1 },
    { categoryId: 7, categoryName: '数据问题', count: 1 },
  ])
  assert.deepEqual(data.byCompany, [
    { companyId: 1, companyName: '示例科技有限公司', count: 5 },
    { companyId: 2, companyName: '星辰控股集团', count: 2 },
  ])
  assert.deepEqual(data.byDepartment, [
    { companyId: 1, companyName: '示例科技有限公司', department: '产品部', count: 4 },
    { companyId: 2, companyName: '星辰控股集团', department: '运营部', count: 2 },
    { companyId: 1, companyName: '示例科技有限公司', department: '客服部', count: 1 },
  ])

  const companyFilter = await call(alice, 'GET', '/api/stats/dashboard?companyId=2')
  const companyData = await companyFilter.json()
  assert.equal(companyData.volume, 2)
  assert.deepEqual(companyData.byCompany, [{ companyId: 2, companyName: '星辰控股集团', count: 2 }])
  assert.deepEqual(companyData.satisfaction, { average: null, ratedCount: 0 })

  const departmentFilter = await call(alice, 'GET', '/api/stats/dashboard?department=产品部')
  assert.equal((await departmentFilter.json()).volume, 4)

  const combined = await call(alice, 'GET', '/api/stats/dashboard?companyId=2&department=产品部')
  const combinedData = await combined.json()
  assert.equal(combinedData.volume, 0)
  assert.deepEqual(combinedData.satisfaction, { average: null, ratedCount: 0 })
})

test('AC-11 workbench list supports combined filters, search, sort and company scope', async () => {
  const workbench = await call(alice, 'GET', '/api/tickets')
  const workbenchData = await workbench.json()
  assert.equal(workbenchData.total, 1)
  assert.equal(workbenchData.items[0].id, t4)

  const pendingAssignment = await call(carol, 'GET', '/api/tickets?status=pending_assignment')
  const pendingData = await pendingAssignment.json()
  assert.equal(pendingData.total, 2)
  assert.deepEqual(pendingData.items.map((i) => i.id).sort(), [t5, t6])

  const mine = await call(alice, 'GET', '/api/tickets?scope=mine')
  const mineData = await mine.json()
  assert.equal(mineData.total, 4)
  assert.deepEqual(mineData.items.map((i) => i.id).sort(), [t1, t2, t3, t7])

  const combined = await call(alice, 'GET', `/api/tickets?categoryId=3&priority=P0`)
  const combinedData = await combined.json()
  assert.equal(combinedData.total, 1)
  assert.equal(combinedData.items[0].id, t4)

  const bySubject = await call(alice, 'GET', '/api/tickets?scope=mine&q=导出')
  const bySubjectData = await bySubject.json()
  assert.equal(bySubjectData.total, 1)
  assert.equal(bySubjectData.items[0].id, t2)

  const byTicketNo = await call(alice, 'GET', '/api/tickets?scope=mine&q=tkt-000001')
  const byTicketNoData = await byTicketNo.json()
  assert.equal(byTicketNoData.total, 1)
  assert.equal(byTicketNoData.items[0].id, t1)

  const noMatch = await call(alice, 'GET', '/api/tickets?scope=mine&q=不存在的主题xyz')
  assert.equal((await noMatch.json()).total, 0)

  const otherCompany = await call(alice, 'GET', '/api/tickets?companyId=2')
  const otherCompanyData = await otherCompany.json()
  assert.equal(otherCompanyData.total, 0)
  assert.deepEqual(otherCompanyData.items, [])

  const priorityAsc = await call(alice, 'GET', '/api/tickets?scope=mine&sort=priority&order=asc')
  const priorityAscData = await priorityAsc.json()
  assert.deepEqual(priorityAscData.items.map((i) => i.id), [t2, t1, t3, t7])

  const priorityDesc = await call(alice, 'GET', '/api/tickets?scope=mine&sort=priority&order=desc')
  assert.deepEqual((await priorityDesc.json()).items.map((i) => i.id), [t7, t3, t2, t1])

  const paged = await call(alice, 'GET', '/api/tickets?scope=mine&pageSize=1&page=2')
  const pagedData = await paged.json()
  assert.equal(pagedData.total, 4)
  assert.equal(pagedData.items.length, 1)
  assert.equal(pagedData.page, 2)
  assert.equal(pagedData.pageSize, 1)

  for (const query of ['scope=wrong', 'priority=PX', 'page=0', 'status=completed', 'sort=name', 'pageSize=101']) {
    const response = await call(alice, 'GET', `/api/tickets?${query}`)
    assert.equal(response.status, 422, query)
  }
})

test('AC-12 the timeline lists key operations in order without reply events', async () => {
  const detail = await call(alice, 'GET', `/api/tickets/${t1}`)
  const data = await detail.json()
  assert.equal(data.timeline.length, 2)

  const flow = await call(alice, 'POST', `/api/tickets/${t1}/assign`, { groupId: g1.id })
  assert.equal(flow.status, 200)
  await call(bob, 'POST', `/api/tickets/${t1}/replies`, { content: '开始处理登录问题' })
  await call(bob, 'POST', `/api/tickets/${t1}/transfer`, { toGroupId: g2.id })
  await call(bob, 'POST', `/api/tickets/${t1}/transfer`, { toGroupId: g1.id })
  await call(bob, 'POST', `/api/tickets/${t1}/complete`, {})
  await call(alice, 'POST', `/api/tickets/${t1}/rating`, { rating: 5 })

  const after = await call(alice, 'GET', `/api/tickets/${t1}`)
  const afterData = await after.json()
  const timeline = afterData.timeline
  assert.deepEqual(timeline.map((item) => item.type), [
    'TICKET_CREATED',
    'TICKET_ASSIGNMENT_ENTERED',
    'TICKET_ASSIGNED',
    'TICKET_TRANSFERRED',
    'TICKET_TRANSFERRED',
    'TICKET_COMPLETED',
    'TICKET_RATED',
  ])
  assert.deepEqual(timeline[2].operator, { id: 1, fullName: '张丽' })
  assert.equal(timeline[2].payload.groupId, g1.id)
  assert.equal(timeline[3].payload.fromGroupId, g1.id)
  assert.equal(timeline[3].payload.toGroupId, g2.id)
  assert.equal(timeline[4].payload.fromGroupId, g2.id)
  assert.equal(timeline[4].payload.toGroupId, g1.id)
  assert.deepEqual(timeline[5].operator, { id: 2, fullName: '王强' })
  assert.deepEqual(timeline[6].operator, { id: 1, fullName: '张丽' })
  assert.equal(timeline[6].payload.rating, 5)
  for (let index = 1; index < timeline.length; index += 1) {
    assert.ok(timeline[index - 1].occurredAt <= timeline[index].occurredAt)
  }
  assert.equal(afterData.replies.length, 1, 'replies stay separate from the timeline')

  const rows = await platform.db.queryAll({ text: 'SELECT event_type, actor_user_id, occurred_at, metadata_json FROM audit_events ORDER BY rowid' })
  const t1Events = rows.filter((row) => JSON.parse(row.metadata_json).ticketId === t1)
  assert.equal(t1Events.length, 8)
  assert.equal(t1Events.filter((row) => row.event_type === 'TICKET_REPLIED').length, 1)
  assert.equal(t1Events.find((row) => row.event_type === 'TICKET_ASSIGNMENT_ENTERED').actor_user_id, null)
})
