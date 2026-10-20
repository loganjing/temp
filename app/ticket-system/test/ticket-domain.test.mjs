import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createApp } from '../src/server/app.ts'
import { registerProtectedRoutes, registerPublicRoutes } from '../src/server/routes.ts'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'
import { seedDemoData } from '../src/server/seed.ts'
import { withHttpServer } from './with-http-server.mjs'

process.env.JWT_SECRET = 'ticket-domain-test-secret'
delete process.env.SMTP_HOST
process.env.DB_PATH = ':memory:'

const platform = await initializePlatform()
await seedDemoData(platform)
const app = createApp({
  registerPublicRoutes: (routes) => registerPublicRoutes(routes, platform),
  registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
  protect: platform.auth.requireAnyAuth,
})
after(() => { platform.email.close(); void platform.db.close() })

const DEMO_PASSWORD = 'Demo#12345'
let base = ''

// 登录会话缓存：登录路由带 60s 限流（同一 IP 路径上限 10 次），复用会话避免触发。
const sessionCache = new Map()

async function login(username, password = DEMO_PASSWORD) {
  if (sessionCache.has(username)) return sessionCache.get(username)
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  assert.equal(response.status, 200, `login failed for ${username}`)
  const data = await response.json()
  sessionCache.set(username, data)
  return data
}

async function api(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  return { status: response.status, data: text ? JSON.parse(text) : null }
}

test('auth contract: login, me and 401 shape', async () => {
  await withHttpServer({ fetch: app.fetch }, async (url) => {
    base = url
    const missing = await api('/api/tickets')
    assert.equal(missing.status, 401)
    assert.deepEqual(missing.data, { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } })

    const bad = await api('/api/auth/login', { method: 'POST', body: { username: 'a-submitter@demo.io', password: 'wrong-password' } })
    assert.equal(bad.status, 401)
    assert.equal(bad.data.error.code, 'UNAUTHORIZED')

    const session = await login('a-submitter@demo.io')
    assert.equal(session.user.displayName, '陈晓')
    assert.equal(session.user.companyId, 1)
    assert.equal(session.user.companyName, '云帆科技')
    assert.equal(session.user.department, '研发部')
    assert.equal(session.user.role, 'submitter')
    assert.equal(session.user.email, 'a-submitter@demo.io')
    assert.equal(session.user.id, session.user.id)

    const me = await api('/api/auth/me', { token: session.token })
    assert.equal(me.status, 200)
    assert.equal(me.data.user.displayName, '陈晓')
    assert.deepEqual(Object.keys(me.data.user).sort(), ['companyId', 'companyName', 'department', 'displayName', 'email', 'id', 'role'])
  })
})

test('ticket main journey: create, dispatch, transfer, replies, complete with skipped mail, rating', async () => {
  await withHttpServer({ fetch: app.fetch }, async (url) => {
    base = url
    const submitter = (await login('a-submitter@demo.io')).token
    const agent1 = (await login('a-agent1@demo.io')).token
    const agent2 = (await login('a-agent2@demo.io')).token
    const groups = (await api('/api/groups', { token: agent1 })).data.items
    const support = groups.find((group) => group.name === '技术支持组')
    const billing = groups.find((group) => group.name === '账务问题组')
    assert.ok(support && billing, 'seed groups are visible')

    // AC-01：创建工单，含完整提交人快照。
    const created = await api('/api/tickets', {
      method: 'POST',
      token: submitter,
      body: { subject: '登录页面无法访问', description: '点击登录后页面空白，浏览器控制台报错。', category: '功能咨询', priority: 'P2' },
    })
    assert.equal(created.status, 201)
    const ticket = created.data.ticket
    assert.match(ticket.ticketNo, /^TK-\d{6}$/)
    assert.equal(ticket.status, 'created')
    assert.equal(ticket.submitterName, '陈晓')
    assert.equal(ticket.submitterEmail, 'a-submitter@demo.io')
    assert.equal(ticket.submitterDepartment, '研发部')
    assert.ok(!Number.isNaN(Date.parse(ticket.createdAt)))
    assert.equal(ticket.groupId, null)

    let activity = (await api(`/api/tickets/${ticket.id}/activity`, { token: submitter })).data.items
    assert.deepEqual(activity.map((entry) => entry.action), ['created'])
    assert.equal(activity[0].operatorName, '陈晓')
    assert.ok(!Number.isNaN(Date.parse(activity[0].occurredAt)))

    // 无规则分类：dispatch 后停留 pending_assignment。
    const dispatched = await api(`/api/tickets/${ticket.id}/dispatch`, { method: 'POST', token: submitter })
    assert.equal(dispatched.status, 200)
    assert.equal(dispatched.data.ticket.status, 'pending_assignment')
    assert.ok(dispatched.data.ticket.dispatchedAt)
    const reDispatch = await api(`/api/tickets/${ticket.id}/dispatch`, { method: 'POST', token: submitter })
    assert.equal(reDispatch.status, 409)
    assert.equal(reDispatch.data.error.code, 'STATE_CONFLICT')
    assert.ok(reDispatch.data.error.message.includes('pending_assignment'))

    // AC-06：转派（pending_assignment 转派即人工归属）。
    const transferred = await api(`/api/tickets/${ticket.id}/transfer`, {
      method: 'POST',
      token: agent2,
      body: { targetGroupId: billing.id, reason: '疑似账号权限问题' },
    })
    assert.equal(transferred.status, 200)
    assert.equal(transferred.data.ticket.status, 'processing')
    assert.equal(transferred.data.ticket.groupId, billing.id)
    assert.ok(transferred.data.ticket.assignedAt)
    const transferActivity = (await api(`/api/tickets/${ticket.id}/activity`, { token: agent2 })).data.items
    const transferredEntry = transferActivity.find((entry) => entry.action === 'transferred')
    assert.ok(transferredEntry)
    assert.ok(JSON.parse(transferredEntry.detail).targetGroupName.includes('账务问题组'))

    // AC-02：多轮回复（提交人与处理人）。
    const reply1 = await api(`/api/tickets/${ticket.id}/replies`, { method: 'POST', token: submitter, body: { content: '补充：仅 Chrome 浏览器出现。' } })
    assert.equal(reply1.status, 201)
    assert.equal(reply1.data.reply.authorKind, 'submitter')
    assert.equal(reply1.data.reply.authorName, '陈晓')
    const reply2 = await api(`/api/tickets/${ticket.id}/replies`, { method: 'POST', token: agent2, body: { content: '已收到，正在排查账号配置。' } })
    assert.equal(reply2.status, 201)
    assert.equal(reply2.data.reply.authorKind, 'agent')

    const detail = (await api(`/api/tickets/${ticket.id}`, { token: agent2 })).data
    assert.equal(detail.replies.length, 2)
    assert.equal(detail.replies[0].content, '补充：仅 Chrome 浏览器出现。')
    assert.equal(detail.replies[1].authorKind, 'agent')
    assert.ok(detail.ticket.firstReplyAt)
    // AC-07：处理时查看提交人完整信息与历史工单。
    assert.equal(detail.submitter.displayName, '陈晓')
    assert.equal(detail.submitter.companyName, '云帆科技')
    assert.equal(detail.submitter.department, '研发部')
    assert.ok(Array.isArray(detail.submitter.historyTickets))

    // 提交人角色回复他人工单被拒绝（本测试中仅本人工单可回）由下方跨用户用例覆盖。
    // AC-08（空 SMTP_HOST）：完成 → 通知降级 skipped 并落 notification_log。
    const completed = await api(`/api/tickets/${ticket.id}/complete`, { method: 'POST', token: agent2, body: { resolution: '重置了账号 Cookie 配置并修复登录脚本。' } })
    assert.equal(completed.status, 200)
    assert.equal(completed.data.ticket.status, 'completed')
    assert.equal(completed.data.ticket.handlerName, '周源')
    assert.ok(completed.data.ticket.completedAt)
    assert.equal(completed.data.notification.status, 'skipped')
    assert.equal(completed.data.notification.recipientEmail, 'a-submitter@demo.io')
    assert.ok(completed.data.notification.subject.includes(ticket.ticketNo))

    const completedDetail = (await api(`/api/tickets/${ticket.id}`, { token: submitter })).data
    assert.equal(completedDetail.notifications.length, 1)
    assert.equal(completedDetail.notifications[0].status, 'skipped')

    // AC-09：满意度评价。
    const rating = await api(`/api/tickets/${ticket.id}/rating`, { method: 'POST', token: submitter, body: { score: 5, comment: '处理很快' } })
    assert.equal(rating.status, 201)
    assert.equal(rating.data.rating.score, 5)
    const ratedDetail = (await api(`/api/tickets/${ticket.id}`, { token: submitter })).data
    assert.equal(ratedDetail.rating.score, 5)
    assert.equal(ratedDetail.rating.comment, '处理很快')
    const reRating = await api(`/api/tickets/${ticket.id}/rating`, { method: 'POST', token: submitter, body: { score: 4 } })
    assert.equal(reRating.status, 409)
    assert.equal(reRating.data.error.code, 'STATE_CONFLICT')
    const otherRating = await api(`/api/tickets/${ticket.id}/rating`, { method: 'POST', token: agent1, body: { score: 4 } })
    assert.equal(otherRating.status, 403)

    // 完成后不可取消。
    const cancelCompleted = await api(`/api/tickets/${ticket.id}/cancel`, { method: 'POST', token: agent1, body: { reason: '误操作' } })
    assert.equal(cancelCompleted.status, 409)

    // AC-12：关键操作全部留痕。
    activity = (await api(`/api/tickets/${ticket.id}/activity`, { token: submitter })).data.items
    assert.deepEqual(activity.map((entry) => entry.action), ['created', 'dispatched', 'transferred', 'replied', 'replied', 'completed', 'rated'])
    for (const entry of activity) assert.ok(!Number.isNaN(Date.parse(entry.occurredAt)))
  })
})

test('auto assignment rule matches category to company group', async () => {
  await withHttpServer({ fetch: app.fetch }, async (url) => {
    base = url
    const submitter = (await login('a-submitter@demo.io')).token
    const created = await api('/api/tickets', {
      method: 'POST',
      token: submitter,
      body: { subject: '办公网打印服务故障', description: '打印机无响应。', category: '故障报修', priority: 'P1' },
    })
    assert.equal(created.status, 201)
    const dispatched = await api(`/api/tickets/${created.data.ticket.id}/dispatch`, { method: 'POST', token: submitter })
    assert.equal(dispatched.data.ticket.status, 'processing')
    assert.equal(dispatched.data.ticket.groupName, '技术支持组')
    assert.ok(dispatched.data.ticket.assignedAt)
    const activity = (await api(`/api/tickets/${created.data.ticket.id}/activity`, { token: submitter })).data.items
    assert.deepEqual(activity.map((entry) => entry.action), ['created', 'dispatched', 'assigned'])
  })
})

test('cancel path and state conflicts', async () => {
  await withHttpServer({ fetch: app.fetch }, async (url) => {
    base = url
    const submitter = (await login('a-submitter@demo.io')).token
    const agent = (await login('a-agent1@demo.io')).token
    const created = await api('/api/tickets', {
      method: 'POST',
      token: submitter,
      body: { subject: '无法导出月度报表', description: '导出按钮无反应。', category: '功能咨询', priority: 'P3' },
    })
    const ticketId = created.data.ticket.id
    await api(`/api/tickets/${ticketId}/dispatch`, { method: 'POST', token: submitter })

    // 提交人不能完成工单。
    const submitterComplete = await api(`/api/tickets/${ticketId}/complete`, { method: 'POST', token: submitter, body: {} })
    assert.equal(submitterComplete.status, 403)
    // 非 processing 态不能完成。
    const agentComplete = await api(`/api/tickets/${ticketId}/complete`, { method: 'POST', token: agent, body: {} })
    assert.equal(agentComplete.status, 409)
    assert.equal(agentComplete.data.error.code, 'STATE_CONFLICT')

    // 提交人本人取消自己的工单。
    const cancelled = await api(`/api/tickets/${ticketId}/cancel`, { method: 'POST', token: submitter, body: { reason: '重复提交' } })
    assert.equal(cancelled.status, 200)
    assert.equal(cancelled.data.ticket.status, 'cancelled')
    assert.ok(cancelled.data.ticket.cancelledAt)
    const activity = (await api(`/api/tickets/${ticketId}/activity`, { token: submitter })).data.items
    assert.ok(activity.some((entry) => entry.action === 'cancelled'))
    assert.ok(JSON.parse(activity.find((entry) => entry.action === 'cancelled').detail).reason.includes('重复提交'))

    // 取消后不能再次推进。
    const reCancel = await api(`/api/tickets/${ticketId}/cancel`, { method: 'POST', token: submitter, body: {} })
    assert.equal(reCancel.status, 409)
    const transferCancelled = await api(`/api/tickets/${ticketId}/transfer`, { method: 'POST', token: agent, body: { targetGroupId: 1 } })
    assert.equal(transferCancelled.status, 409)

    // created 态不能直接转派（未进入分配流程）。
    const fresh = await api('/api/tickets', {
      method: 'POST',
      token: submitter,
      body: { subject: '邮箱签名配置咨询', description: '如何设置统一签名。', category: '账号问题', priority: 'P4' },
    })
    const transferCreated = await api(`/api/tickets/${fresh.data.ticket.id}/transfer`, { method: 'POST', token: agent, body: { targetGroupId: 1 } })
    assert.equal(transferCreated.status, 409)
  })
})

test('company isolation: cross-company access is 404 everywhere', async () => {
  await withHttpServer({ fetch: app.fetch }, async (url) => {
    base = url
    const aSubmitter = (await login('a-submitter@demo.io')).token
    const bSubmitter = (await login('b-submitter@demo.io')).token
    const bAgent = (await login('b-agent1@demo.io')).token

    const aTicket = await api('/api/tickets', {
      method: 'POST',
      token: aSubmitter,
      body: { subject: 'A 公司内部工单', description: '隔离验证用。', category: '功能咨询', priority: 'P2' },
    })
    const aTicketId = aTicket.data.ticket.id
    await api(`/api/tickets/${aTicketId}/dispatch`, { method: 'POST', token: aSubmitter })

    const bTicket = await api('/api/tickets', {
      method: 'POST',
      token: bSubmitter,
      body: { subject: 'B 公司生产设备报修', description: '产线设备异常。', category: '故障报修', priority: 'P1' },
    })
    assert.equal(bTicket.status, 201)

    // 跨公司详情/日志/操作统一 404，不确认存在性。
    assert.equal((await api(`/api/tickets/${aTicketId}`, { token: bSubmitter })).status, 404)
    assert.equal((await api(`/api/tickets/${aTicketId}/activity`, { token: bSubmitter })).status, 404)
    assert.equal((await api(`/api/tickets/${aTicketId}/replies`, { method: 'POST', token: bSubmitter, body: { content: '跨公司回复' } })).status, 404)
    assert.equal((await api(`/api/tickets/${aTicketId}/cancel`, { method: 'POST', token: bSubmitter, body: {} })).status, 404)
    assert.equal((await api(`/api/tickets/${aTicketId}/transfer`, { method: 'POST', token: bAgent, body: { targetGroupId: 1 } })).status, 404)
    assert.equal((await api(`/api/tickets/${aTicketId}/rating`, { method: 'POST', token: bSubmitter, body: { score: 5 } })).status, 404)

    // B 公司列表与统计仅含 B 数据。
    const bList = await api('/api/tickets?view=company', { token: bSubmitter })
    assert.equal(bList.status, 200)
    assert.ok(bList.data.items.every((item) => item.ticketNo !== aTicket.data.ticket.ticketNo))
    const aList = await api('/api/tickets?view=company', { token: aSubmitter })
    assert.ok(aList.data.items.some((item) => item.ticketNo === aTicket.data.ticket.ticketNo))
    assert.ok(aList.data.items.every((item) => item.ticketNo !== bTicket.data.ticket.ticketNo))

    // B 公司分类规则独立：账务问题 → 账务问题组。
    const bBilling = await api('/api/tickets', {
      method: 'POST',
      token: bSubmitter,
      body: { subject: 'B 公司发票抬头修改', description: '需要修改发票抬头。', category: '账务问题', priority: 'P2' },
    })
    const bDispatched = await api(`/api/tickets/${bBilling.data.ticket.id}/dispatch`, { method: 'POST', token: bSubmitter })
    assert.equal(bDispatched.data.ticket.status, 'processing')
    assert.equal(bDispatched.data.ticket.groupName, '账务问题组')

    const bStats = await api('/api/stats/dashboard', { token: bSubmitter })
    const aStats = await api('/api/stats/dashboard', { token: aSubmitter })
    assert.equal(bStats.status, 200)
    assert.ok(bStats.data.totalTickets < aStats.data.totalTickets, 'B company stats stay within its own scope')
    const bDistribution = await api('/api/stats/distribution?dimension=company', { token: bSubmitter })
    assert.equal(bDistribution.data.items.length, 1)
    assert.equal(bDistribution.data.items[0].label, '远山制造')
  })
})

test('workbench list: filters, search, sort and pagination', async () => {
  await withHttpServer({ fetch: app.fetch }, async (url) => {
    base = url
    const submitter = (await login('a-submitter@demo.io')).token
    const agent = (await login('a-agent1@demo.io')).token
    const printer = await api('/api/tickets', {
      method: 'POST',
      token: submitter,
      body: { subject: '打印机碳粉耗尽', description: '更换碳粉。', category: '故障报修', priority: 'P3' },
    })
    await api(`/api/tickets/${printer.data.ticket.id}/dispatch`, { method: 'POST', token: submitter })
    const vpn = await api('/api/tickets', {
      method: 'POST',
      token: submitter,
      body: { subject: 'VPN 连接异常', description: '远程办公无法连接。', category: '账号问题', priority: 'P0' },
    })
    await api(`/api/tickets/${vpn.data.ticket.id}/dispatch`, { method: 'POST', token: submitter })
    const draft = await api('/api/tickets', {
      method: 'POST',
      token: submitter,
      body: { subject: '报销流程咨询', description: '差旅报销流程。', category: '功能咨询', priority: 'P4' },
    })
    const groups = (await api('/api/groups', { token: agent })).data.items
    const support = groups.find((group) => group.name === '技术支持组')

    // view=mine 仅看自己提交的。
    const mine = await api('/api/tickets', { token: submitter })
    assert.ok(mine.data.items.every((item) => item.submitterName === '陈晓'))
    // view=workbench 看本公司全部（含分配到组的）。
    const workbench = await api('/api/tickets?view=workbench', { token: agent })
    assert.ok(workbench.data.items.some((item) => item.ticketNo === printer.data.ticket.ticketNo))
    assert.ok(workbench.data.items.some((item) => item.ticketNo === vpn.data.ticket.ticketNo))

    // status 多值筛选。
    const processing = await api('/api/tickets?view=workbench&status=processing', { token: agent })
    assert.ok(processing.data.items.every((item) => item.status === 'processing'))
    assert.ok(processing.data.items.some((item) => item.ticketNo === printer.data.ticket.ticketNo))
    assert.ok(!processing.data.items.some((item) => item.ticketNo === draft.data.ticket.ticketNo))
    // category / priority 筛选。
    const fault = await api('/api/tickets?view=workbench&category=故障报修', { token: agent })
    assert.ok(fault.data.items.every((item) => item.category === '故障报修'))
    const p0 = await api('/api/tickets?view=workbench&priority=P0', { token: agent })
    assert.ok(p0.data.items.every((item) => item.priority === 'P0'))
    // group 筛选。
    const grouped = await api(`/api/tickets?view=workbench&group=${support.id}`, { token: agent })
    assert.ok(grouped.data.items.every((item) => item.groupName === '技术支持组'))

    // 搜索：工单编号前缀与主题模糊。
    const byNo = await api(`/api/tickets?view=workbench&q=${printer.data.ticket.ticketNo.slice(0, 5)}`, { token: agent })
    assert.ok(byNo.data.items.some((item) => item.ticketNo === printer.data.ticket.ticketNo))
    const bySubject = await api('/api/tickets?view=workbench&q=VPN', { token: agent })
    assert.ok(bySubject.data.items.some((item) => item.ticketNo === vpn.data.ticket.ticketNo))
    const bySubjectLower = await api('/api/tickets?view=workbench&q=vpn 连接', { token: agent })
    assert.ok(bySubjectLower.data.items.some((item) => item.ticketNo === vpn.data.ticket.ticketNo))
    const none = await api('/api/tickets?view=workbench&q=不存在的关键字', { token: agent })
    assert.equal(none.data.total, 0)

    // 排序：priority 升序时 P0 在最前。
    const byPriority = await api('/api/tickets?view=workbench&sort=priority&order=asc', { token: agent })
    assert.equal(byPriority.data.items[0].priority, 'P0')
    const byPriorityDesc = await api('/api/tickets?view=workbench&sort=priority&order=desc', { token: agent })
    assert.equal(byPriorityDesc.data.items[0].priority, 'P4')
    // 排序：created_at 升序时最早创建的工单在最前。
    const byCreatedAsc = await api('/api/tickets?view=workbench&sort=created_at&order=asc', { token: agent })
    assert.equal(byCreatedAsc.data.items[0].ticketNo, 'TK-000001')

    // 分页。
    const page1 = await api('/api/tickets?view=workbench&pageSize=2&page=1', { token: agent })
    const page2 = await api('/api/tickets?view=workbench&pageSize=2&page=2', { token: agent })
    assert.equal(page1.data.items.length, 2)
    assert.ok(page1.data.total > 2)
    assert.notDeepEqual(page1.data.items.map((item) => item.id), page2.data.items.map((item) => item.id))

    // 非法查询参数。
    assert.equal((await api('/api/tickets?view=all', { token: agent })).status, 400)
    assert.equal((await api('/api/tickets?status=archived', { token: agent })).status, 400)
    assert.equal((await api('/api/tickets?priority=P9', { token: agent })).status, 400)
    assert.equal((await api('/api/tickets?sort=owner', { token: agent })).status, 400)
    assert.equal((await api('/api/tickets?order=up', { token: agent })).status, 400)
    assert.equal((await api('/api/tickets?pageSize=200', { token: agent })).status, 400)
    assert.equal((await api('/api/tickets?page=0', { token: agent })).status, 400)
  })
})

test('stats dashboard and distribution aggregates stay company-scoped', async () => {
  await withHttpServer({ fetch: app.fetch }, async (url) => {
    base = url
    const submitter = (await login('a-submitter@demo.io')).token
    const admin = (await login('a-admin@demo.io')).token
    const dashboard = await api('/api/stats/dashboard', { token: submitter })
    assert.equal(dashboard.status, 200)
    const data = dashboard.data
    assert.ok(data.totalTickets >= 7)
    assert.deepEqual(Object.keys(data.statusBreakdown).sort(), ['cancelled', 'completed', 'created', 'pending_assignment', 'processing'])
    const statusSum = Object.values(data.statusBreakdown).reduce((sum, value) => sum + value, 0)
    assert.equal(statusSum, data.totalTickets)
    assert.equal(data.statusBreakdown.completed, 1)
    assert.equal(data.statusBreakdown.cancelled, 1)
    assert.ok(data.avgResponseMinutes === null || (typeof data.avgResponseMinutes === 'number' && data.avgResponseMinutes >= 0))
    assert.equal(data.ratedCount, 1)
    assert.equal(data.avgRating, 5)
    assert.ok(data.hotCategories.length >= 1)
    const hotCounts = data.hotCategories.map((item) => item.count)
    assert.deepEqual(hotCounts, [...hotCounts].sort((a, b) => b - a))
    assert.ok(data.hotCategories.some((item) => item.category === '功能咨询'))

    const department = await api('/api/stats/distribution?dimension=department', { token: admin })
    assert.equal(department.status, 200)
    assert.equal(department.data.dimension, 'department')
    const departmentSum = department.data.items.reduce((sum, item) => sum + item.count, 0)
    assert.equal(departmentSum, data.totalTickets)
    assert.ok(department.data.items.some((item) => item.label === '研发部'))

    const company = await api('/api/stats/distribution?dimension=company', { token: admin })
    assert.equal(company.data.items.length, 1)
    assert.equal(company.data.items[0].label, '云帆科技')
    assert.equal(company.data.items[0].count, data.totalTickets)

    assert.equal((await api('/api/stats/distribution?dimension=region', { token: admin })).status, 400)
  })
})

test('role guards and user management with profile sync', async () => {
  await withHttpServer({ fetch: app.fetch }, async (url) => {
    base = url
    const submitter = (await login('a-submitter@demo.io')).token
    const agent = (await login('a-agent1@demo.io')).token
    const admin = (await login('a-admin@demo.io')).token
    const bAdmin = (await login('b-admin@demo.io')).token

    // §4.5 固定约束：用户管理路由叠加 company_admin 守卫。
    assert.equal((await api('/api/admin/users', { token: submitter })).status, 403)
    assert.equal((await api('/api/admin/users', { token: agent })).status, 403)
    const listed = await api('/api/admin/users', { token: admin })
    assert.equal(listed.status, 200)
    assert.ok(listed.data.users.every((user) => user.companyName === '云帆科技'))
    assert.ok(listed.data.users.every((user) => ['submitter', 'agent', 'company_admin'].includes(user.role)))
    assert.ok(listed.data.users.some((user) => user.email === 'a-agent1@demo.io' && user.displayName === '林岚'))

    // 创建用户：users 表与 user_profiles 同步。
    const created = await api('/api/admin/users', {
      method: 'POST',
      token: admin,
      body: { name: '新用户', email: 'a-new@demo.io', password: 'Start#123456', role: 'agent', department: '测试部' },
    })
    assert.equal(created.status, 201)
    assert.equal(created.data.user.displayName, '新用户')
    assert.equal(created.data.user.role, 'agent')
    assert.equal(created.data.user.department, '测试部')
    assert.equal(created.data.user.companyId, 1)
    const duplicate = await api('/api/admin/users', {
      method: 'POST',
      token: admin,
      body: { name: '重复用户', email: 'a-new@demo.io', password: 'Start#123456' },
    })
    assert.equal(duplicate.status, 409)

    // 新用户首次登录受临时密码约束，改密后可访问业务 API。
    const newToken = (await login('a-new@demo.io', 'Start#123456')).token
    assert.ok(newToken)
    assert.equal((await api('/api/tickets', { token: newToken })).status, 403)
    assert.equal((await api('/api/auth/password', { method: 'POST', token: newToken, body: { password: 'Changed#12345' } })).status, 200)
    assert.equal((await api('/api/tickets', { token: newToken })).status, 200)

    // 编辑用户：profile 同步更新。
    const updated = await api(`/api/admin/users/${created.data.user.id}`, {
      method: 'PATCH',
      token: admin,
      body: { name: '新用户改名', email: 'a-new@demo.io', role: 'submitter', department: '质量部' },
    })
    assert.equal(updated.status, 200)
    assert.equal(updated.data.user.displayName, '新用户改名')
    assert.equal(updated.data.user.role, 'submitter')
    const afterList = await api('/api/admin/users?search=a-new', { token: admin })
    assert.equal(afterList.data.users.length, 1)
    assert.equal(afterList.data.users[0].department, '质量部')

    // 跨公司用户管理不可见、不可改（404 不确认存在性）。
    const bListed = await api('/api/admin/users', { token: bAdmin })
    assert.ok(bListed.data.users.every((user) => user.companyName === '远山制造'))
    assert.ok(!bListed.data.users.some((user) => user.email === 'a-new@demo.io'))
    assert.equal((await api(`/api/admin/users/${created.data.user.id}`, { method: 'PATCH', token: bAdmin, body: { name: '越权改名', email: 'a-new@demo.io' } })).status, 404)

    // 业务组、分类与规则管理（company_admin）。
    assert.equal((await api('/api/groups', { method: 'POST', token: agent, body: { name: '值班组' } })).status, 403)
    const newGroup = await api('/api/groups', { method: 'POST', token: admin, body: { name: '值班组' } })
    assert.equal(newGroup.status, 201)
    assert.equal((await api('/api/groups', { method: 'POST', token: admin, body: { name: '值班组' } })).status, 409)
    const memberSet = await api(`/api/groups/${newGroup.data.group.id}/members`, {
      method: 'PUT',
      token: admin,
      body: { userIds: [created.data.user.id] },
    })
    assert.equal(memberSet.status, 200)
    assert.equal(memberSet.data.group.memberCount, 1)
    assert.equal(memberSet.data.group.members[0].displayName, '新用户改名')
    const foreignMembers = await api(`/api/groups/${newGroup.data.group.id}/members`, {
      method: 'PUT',
      token: admin,
      body: { userIds: [(await api('/api/admin/users?search=b-submitter', { token: bAdmin })).data.users[0].id] },
    })
    assert.equal(foreignMembers.status, 400)
    assert.equal((await api(`/api/groups/${newGroup.data.group.id}`, { method: 'DELETE', token: admin })).status, 204)

    const newCategory = await api('/api/categories', { method: 'POST', token: admin, body: { category: '数据导出' } })
    assert.equal(newCategory.status, 201)
    assert.equal((await api('/api/categories', { method: 'POST', token: admin, body: { category: '数据导出' } })).status, 409)
    const categories = await api('/api/categories', { token: admin })
    assert.ok(categories.data.items.includes('数据导出'))

    const support = (await api('/api/groups', { token: admin })).data.items.find((group) => group.name === '技术支持组')
    const rule = await api('/api/category-rules/数据导出', { method: 'PUT', token: admin, body: { groupId: support.id } })
    assert.equal(rule.status, 200)
    assert.equal(rule.data.rule.groupName, '技术支持组')
    const rules = await api('/api/category-rules', { token: admin })
    assert.ok(rules.data.items.some((item) => item.category === '数据导出'))
    assert.equal((await api('/api/category-rules/数据导出', { method: 'DELETE', token: admin })).status, 204)
    assert.equal((await api('/api/category-rules/不存在分类', { method: 'PUT', token: admin, body: { groupId: support.id } })).status, 400)
    assert.equal((await api('/api/categories/数据导出', { method: 'DELETE', token: admin })).status, 204)

    // 提交人不能回复他人工单（author_kind 无法判定为 submitter/agent 之外的第三种）。
    const otherTicket = await api('/api/tickets', {
      method: 'POST',
      token: admin,
      body: { subject: '管理员提出的工单', description: '验证回复身份边界。', category: '账号问题', priority: 'P3' },
    })
    const strangerReply = await api(`/api/tickets/${otherTicket.data.ticket.id}/replies`, { method: 'POST', token: submitter, body: { content: '提交人回复他人工单' } })
    assert.equal(strangerReply.status, 403)
  })
})

test('seed is idempotent: rerun does not duplicate data', async () => {
  const counts = async () => {
    const [companies, profiles, groups, members, categories, rules] = await Promise.all([
      platform.db.queryOne({ text: 'SELECT COUNT(*) AS total FROM companies' }),
      platform.db.queryOne({ text: 'SELECT COUNT(*) AS total FROM user_profiles' }),
      platform.db.queryOne({ text: 'SELECT COUNT(*) AS total FROM groups' }),
      platform.db.queryOne({ text: 'SELECT COUNT(*) AS total FROM group_members' }),
      platform.db.queryOne({ text: 'SELECT COUNT(*) AS total FROM company_categories' }),
      platform.db.queryOne({ text: 'SELECT COUNT(*) AS total FROM category_rules' }),
    ])
    return [companies, profiles, groups, members, categories, rules].map((row) => Number(row?.total ?? 0))
  }
  const before = await counts()
  await seedDemoData(platform)
  const after = await counts()
  assert.deepEqual(after, before)
  assert.ok(after[0] >= 2, 'two demo companies exist')
  assert.ok(after[1] >= 9, 'seed users plus admin-created user exist')
  assert.ok(after[5] >= 2, 'seed rules exist')
})
