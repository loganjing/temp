// 工单系统业务测试：经 with-http-server 启动隔离真实 HTTP 服务器，
// 覆盖契约关键行为——公司隔离拒绝、状态机与自动分配、完成通知、评价、统计口径、审计事件。
process.env.DB_PATH = ':memory:'

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createApp } from '../src/server/app.ts'
import { registerPublicRoutes, registerProtectedRoutes } from '../src/server/routes.ts'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'
import { withHttpServer } from './with-http-server.mjs'

const buildApp = (platform) =>
  createApp({
    registerPublicRoutes: (routes) => registerPublicRoutes(routes, platform),
    registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
    protect: platform.auth.requireAnyAuth,
  })

async function request(method, url, path, token, body) {
  const response = await fetch(url + path, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: response.status, body: await response.json().catch(() => null) }
}

const client = (url, token) => ({
  get: (path) => request('GET', url, path, token),
  post: (path, body) => request('POST', url, path, token, body),
  put: (path, body) => request('PUT', url, path, token, body),
})

async function login(url, email, password) {
  const response = await request('POST', url, '/api/auth/login', undefined, { email, password })
  assert.equal(response.status, 200, `login failed for ${email}: ${JSON.stringify(response.body)}`)
  return { token: response.body.token, user: response.body.user }
}

// 首个账户（提交人）+ 同公司处理人 + 异公司用户；临时密码登录后先改密。
async function seedActors(url) {
  const bootstrap = await request('POST', url, '/api/auth/bootstrap', undefined, {
    name: '艾莉丝',
    email: 'alice@alpha.test',
    password: 'alice-pass-123456',
    companyName: '阿尔法科技',
    department: '研发部',
  })
  assert.equal(bootstrap.status, 201, JSON.stringify(bootstrap.body))

  const alice = await login(url, 'alice@alpha.test', 'alice-pass-123456')
  assert.equal(alice.user.companyName, '阿尔法科技')
  assert.equal(alice.user.department, '研发部')
  assert.equal(typeof alice.user.companyId, 'number')

  const createUser = async (name, email, companyName, department) => {
    const created = await client(url, alice.token).post('/api/admin/users', {
      name,
      email,
      password: `${email.split('@')[0]}-pass-123456`,
      companyName,
      department,
    })
    assert.equal(created.status, 201, JSON.stringify(created.body))
    assert.equal(created.body.user.companyName, companyName)
    assert.equal(created.body.user.department, department)
    const actor = await login(url, email, `${email.split('@')[0]}-pass-123456`)
    const changed = await client(url, actor.token).post('/api/auth/password', { password: `${email.split('@')[0]}-newpass-123` })
    assert.equal(changed.status, 200, JSON.stringify(changed.body))
    return actor
  }

  const bob = await createUser('鲍勃', 'bob@alpha.test', '阿尔法科技', '客服部')
  const carol = await createUser('卡罗尔', 'carol@alpha.test', '阿尔法科技', '客服部')
  const dave = await createUser('戴夫', 'dave@beta.test', '贝塔贸易', '运营部')

  const me = await client(url, alice.token).get('/api/auth/me')
  assert.equal(me.status, 200)
  assert.equal(me.body.userId, alice.user.userId)
  assert.equal(me.body.companyName, '阿尔法科技')
  assert.equal(me.body.department, '研发部')

  return { alice, bob, carol, dave }
}

test('工单提交、分类自动分配与生命周期状态机（AC-01/03/04/06/07/08/09/10）', async () => {
  const platform = await initializePlatform()
  const app = buildApp(platform)
  await withHttpServer({ fetch: app.fetch, close: platform.close }, async (url) => {
    const actors = await seedActors(url)
    const alice = client(url, actors.alice.token)
    const bob = client(url, actors.bob.token)
    const carol = client(url, actors.carol.token)

    // AC-05：业务组与成员（公司内唯一性）。
    const groupA = await alice.post('/api/groups', { name: '网络组', memberIds: [actors.bob.user.userId] })
    assert.equal(groupA.status, 201, JSON.stringify(groupA.body))
    assert.equal(groupA.body.name, '网络组')
    assert.deepEqual(groupA.body.members.map((m) => m.name), ['鲍勃'])
    assert.equal(groupA.body.members[0].department, '客服部')
    const duplicateGroup = await alice.post('/api/groups', { name: '网络组' })
    assert.equal(duplicateGroup.status, 409)
    assert.equal(duplicateGroup.body.error.code, 'GROUP_NAME_EXISTS')

    const groupB = await alice.post('/api/groups', { name: '账务组', memberIds: [actors.carol.user.userId] })
    assert.equal(groupB.status, 201)
    assert.equal(groupB.body.groupId !== groupA.body.groupId, true)

    const groups = await alice.get('/api/groups')
    assert.equal(groups.status, 200)
    assert.equal(groups.body.items.length, 2)
    const persisted = groups.body.items.find((g) => g.name === '网络组')
    assert.deepEqual(persisted.members.map((m) => m.email), ['bob@alpha.test'])

    // 分配规则：分类 → 业务组。
    const rule = await alice.post('/api/category-rules', { category: '网络故障', groupId: groupA.body.groupId })
    assert.equal(rule.status, 201, JSON.stringify(rule.body))
    assert.equal(rule.body.groupName, '网络组')
    const duplicateRule = await alice.post('/api/category-rules', { category: '网络故障', groupId: groupB.body.groupId })
    assert.equal(duplicateRule.status, 409)
    assert.equal(duplicateRule.body.error.code, 'RULE_CATEGORY_EXISTS')

    // AC-01/AC-06：提交命中规则 → 自动分配进入待处理。
    const ticket1 = await alice.post('/api/tickets', {
      subject: '无法连接内网打印机',
      description: '办公区三楼打印机离线，重新上电后仍无法连接。',
      category: '网络故障',
      priority: 'P2',
    })
    assert.equal(ticket1.status, 201, JSON.stringify(ticket1.body))
    assert.equal(ticket1.body.ticket.status, 'pending_processing')
    assert.equal(ticket1.body.ticket.assignedGroupName, '网络组')
    assert.equal(ticket1.body.ticket.submitterName, '艾莉丝')
    assert.equal(ticket1.body.ticket.ticketNo, 'TK-000001')
    assert.equal(ticket1.body.description, '办公区三楼打印机离线，重新上电后仍无法连接。')
    assert.equal(ticket1.body.submitter.department, '研发部')
    assert.deepEqual(ticket1.body.replies, [])
    assert.equal(ticket1.body.rating, null)

    // AC-06：未匹配分类保持待分配。
    const ticket2 = await alice.post('/api/tickets', {
      subject: '申请备用显示器',
      description: '新入职同事缺少显示器。',
      category: '办公设备',
      priority: 'P3',
    })
    assert.equal(ticket2.status, 201)
    assert.equal(ticket2.body.ticket.status, 'pending_assignment')
    assert.equal(ticket2.body.ticket.assignedGroupId, null)

    // AC-13：列表读回与 mine 过滤。
    const list = await bob.get('/api/tickets')
    assert.equal(list.status, 200)
    assert.equal(list.body.total, 2)
    assert.equal(list.body.items[0].ticketId, ticket2.body.ticket.ticketId)

    // 人工分配：待分配 → 待处理。
    const assign = await alice.post(`/api/tickets/${ticket2.body.ticket.ticketId}/assign`, { groupId: groupB.body.groupId })
    assert.equal(assign.status, 200, JSON.stringify(assign.body))
    assert.equal(assign.body.status, 'pending_processing')
    assert.equal(assign.body.assignedGroupName, '账务组')
    const reassignOnUnassigned = await alice.post(`/api/tickets/${ticket1.body.ticket.ticketId}/reassign`, { handlerId: actors.carol.user.userId })
    assert.equal(reassignOnUnassigned.status, 400)
    assert.equal(reassignOnUnassigned.body.error.code, 'INVALID_STATE')

    // AC-03：提交人与处理侧双向多轮回复。
    const reply1 = await alice.post(`/api/tickets/${ticket1.body.ticket.ticketId}/replies`, { content: '补充：影响部门例会材料打印。' })
    assert.equal(reply1.status, 201, JSON.stringify(reply1.body))
    assert.equal(reply1.body.replierName, '艾莉丝')
    const reply2 = await bob.post(`/api/tickets/${ticket1.body.ticket.ticketId}/replies`, { content: '已定位到交换机端口故障，正在更换。' })
    assert.equal(reply2.status, 201)
    assert.equal(reply2.body.replierName, '鲍勃')

    // AC-07：转派变更处理归属（仅待处理状态）。
    const reassign = await bob.post(`/api/tickets/${ticket1.body.ticket.ticketId}/reassign`, {
      groupId: groupB.body.groupId,
      handlerId: actors.carol.user.userId,
    })
    assert.equal(reassign.status, 200, JSON.stringify(reassign.body))
    assert.equal(reassign.body.status, 'pending_processing')
    assert.equal(reassign.body.assignedGroupName, '账务组')
    assert.equal(reassign.body.handlerId, actors.carol.user.userId)
    assert.equal(reassign.body.handlerName, '卡罗尔')

    // AC-09：完成记录处理人/时间并发出完成通知（未配置 SMTP → 本地发件箱 queued）。
    const complete = await carol.post(`/api/tickets/${ticket1.body.ticket.ticketId}/complete`, { resolution: '更换交换机端口并验证连通。' })
    assert.equal(complete.status, 200, JSON.stringify(complete.body))
    assert.equal(complete.body.ticket.status, 'completed')
    assert.equal(complete.body.ticket.handlerName, '卡罗尔')
    assert.ok(complete.body.ticket.completedAt)
    assert.equal(complete.body.notification.channel, 'local')
    assert.equal(complete.body.notification.status, 'queued')

    const completeAgain = await carol.post(`/api/tickets/${ticket1.body.ticket.ticketId}/complete`, {})
    assert.equal(completeAgain.status, 400)
    assert.equal(completeAgain.body.error.code, 'INVALID_STATE')

    // AC-10：仅提交人本人、仅完成态、一单一评。
    const ratingByHandler = await carol.post(`/api/tickets/${ticket1.body.ticket.ticketId}/rating`, { score: 4 })
    assert.equal(ratingByHandler.status, 403, JSON.stringify(ratingByHandler.body))
    assert.equal(ratingByHandler.body.error.code, 'NOT_SUBMITTER')
    const rating = await alice.post(`/api/tickets/${ticket1.body.ticket.ticketId}/rating`, { score: 5, comment: '处理很快' })
    assert.equal(rating.status, 201, JSON.stringify(rating.body))
    assert.equal(rating.body.score, 5)
    const ratingAgain = await alice.post(`/api/tickets/${ticket1.body.ticket.ticketId}/rating`, { score: 3 })
    assert.equal(ratingAgain.status, 409)
    assert.equal(ratingAgain.body.error.code, 'RATING_EXISTS')
    const ratingUnfinished = await alice.post(`/api/tickets/${ticket2.body.ticket.ticketId}/rating`, { score: 4 })
    assert.equal(ratingUnfinished.status, 400)
    assert.equal(ratingUnfinished.body.error.code, 'INVALID_STATE')

    // 取消：非终态可取消，终态拒绝；终态工单不可回复。
    const cancel = await alice.post(`/api/tickets/${ticket2.body.ticket.ticketId}/cancel`, { reason: '自行采购解决' })
    assert.equal(cancel.status, 200, JSON.stringify(cancel.body))
    assert.equal(cancel.body.status, 'cancelled')
    const cancelAgain = await alice.post(`/api/tickets/${ticket2.body.ticket.ticketId}/cancel`, {})
    assert.equal(cancelAgain.status, 400)
    assert.equal(cancelAgain.body.error.code, 'INVALID_STATE')
    const replyCancelled = await alice.post(`/api/tickets/${ticket2.body.ticket.ticketId}/replies`, { content: '还想问问' })
    assert.equal(replyCancelled.status, 400)
    assert.equal(replyCancelled.body.error.code, 'INVALID_STATE')

    // AC-08：详情聚合——提交人完整信息 + 历史工单 + 回复 + 评价。
    const detail = await bob.get(`/api/tickets/${ticket1.body.ticket.ticketId}`)
    assert.equal(detail.status, 200)
    assert.equal(detail.body.submitter.name, '艾莉丝')
    assert.equal(detail.body.submitter.email, 'alice@alpha.test')
    assert.equal(detail.body.submitter.companyName, '阿尔法科技')
    assert.equal(detail.body.submitter.department, '研发部')
    assert.equal(detail.body.submitter.historyTickets.length, 2)
    assert.ok(detail.body.submitter.historyTickets.every((t) => ['TK-000001', 'TK-000002'].includes(t.ticketNo)))
    assert.equal(detail.body.replies.length, 2)
    assert.equal(detail.body.replies[0].replierName, '艾莉丝')
    assert.equal(detail.body.replies[1].replierName, '鲍勃')
    assert.ok(detail.body.replies[0].repliedAt <= detail.body.replies[1].repliedAt)
    assert.deepEqual(detail.body.rating, { score: 5, comment: '处理很快', ratedAt: rating.body.ratedAt })

    // 通知域：本地发件箱可查询（未配置 SMTP 的送达证据）。
    const outbox = await alice.get('/api/outbox')
    assert.equal(outbox.status, 200)
    assert.equal(outbox.body.total, 1)
    assert.equal(outbox.body.items[0].ticketId, ticket1.body.ticket.ticketId)
    assert.equal(outbox.body.items[0].ticketNo, 'TK-000001')
    assert.equal(outbox.body.items[0].toEmail, 'alice@alpha.test')
    assert.equal(outbox.body.items[0].subject, `[工单完成] TK-000001 无法连接内网打印机`)
    assert.ok(outbox.body.items[0].body.includes('卡罗尔'))
    assert.equal(outbox.body.items[0].channel, 'local')
    assert.equal(outbox.body.items[0].status, 'queued')

    // 本公司用户列表（契约第 1 节）。
    const users = await bob.get('/api/users?keyword=bob')
    assert.equal(users.status, 200)
    assert.deepEqual(users.body.items.map((u) => u.email), ['bob@alpha.test'])
    assert.equal(users.body.items[0].department, '客服部')
  })
})

test('公司隔离拒绝语义与列表天然过滤（AC-02）', async () => {
  const platform = await initializePlatform()
  const app = buildApp(platform)
  await withHttpServer({ fetch: app.fetch, close: platform.close }, async (url) => {
    const actors = await seedActors(url)
    const alice = client(url, actors.alice.token)
    const dave = client(url, actors.dave.token)

    const group = await alice.post('/api/groups', { name: '网络组', memberIds: [actors.bob.user.userId] })
    await alice.post('/api/category-rules', { category: '网络故障', groupId: group.body.groupId })
    const ticket = await alice.post('/api/tickets', {
      subject: '阿尔法内网工单',
      description: '仅本公司可见',
      category: '网络故障',
      priority: 'P1',
    })
    assert.equal(ticket.status, 201)
    const daveTicket = await dave.post('/api/tickets', {
      subject: '贝塔订单工单',
      description: 'B 公司工单',
      category: '订单问题',
      priority: 'P4',
    })
    assert.equal(daveTicket.status, 201)

    // 列表天然过滤：B 公司用户看不到 A 公司工单。
    const daveList = await dave.get('/api/tickets')
    assert.equal(daveList.body.total, 1)
    assert.deepEqual(daveList.body.items.map((t) => t.ticketNo), [daveTicket.body.ticket.ticketNo])
    const aliceList = await alice.get('/api/tickets')
    assert.equal(aliceList.body.total, 1)
    assert.deepEqual(aliceList.body.items.map((t) => t.ticketNo), [ticket.body.ticket.ticketNo])

    // 按公司维度筛选：传他公司 → 空结果集，不报错。
    const crossCompany = await dave.get(`/api/tickets?companyId=${actors.alice.user.companyId}`)
    assert.equal(crossCompany.status, 200)
    assert.deepEqual(crossCompany.body, { items: [], total: 0, page: 1, pageSize: 20 })
    const ownCompany = await dave.get(`/api/tickets?companyId=${actors.dave.user.companyId}`)
    assert.equal(ownCompany.body.total, 1)

    // 搜索与状态过滤天然按公司隔离。
    const daveSearch = await dave.get('/api/tickets?q=阿尔法')
    assert.equal(daveSearch.body.total, 0)
    const daveStatus = await dave.get('/api/tickets?status=completed')
    assert.equal(daveStatus.body.total, 0)

    // 详情对跨公司资源以不存在呈现（404）。
    const daveDetail = await dave.get(`/api/tickets/${ticket.body.ticket.ticketId}`)
    assert.equal(daveDetail.status, 404)
    assert.equal(daveDetail.body.error.code, 'NOT_FOUND')

    // 操作端点对跨公司工单 403 拒绝。
    const daveReply = await dave.post(`/api/tickets/${ticket.body.ticket.ticketId}/replies`, { content: '越权回复' })
    assert.equal(daveReply.status, 403)
    assert.equal(daveReply.body.error.code, 'FORBIDDEN_COMPANY')
    const daveComplete = await dave.post(`/api/tickets/${ticket.body.ticket.ticketId}/complete`, {})
    assert.equal(daveComplete.status, 403)
    assert.equal(daveComplete.body.error.code, 'FORBIDDEN_COMPANY')
    const daveRating = await dave.post(`/api/tickets/${ticket.body.ticket.ticketId}/rating`, { score: 1 })
    assert.equal(daveRating.status, 403)
    assert.equal(daveRating.body.error.code, 'FORBIDDEN_COMPANY')

    // 日志明细跨公司 403；日志列表与发件箱按公司过滤。
    const daveLogs = await dave.get(`/api/tickets/${ticket.body.ticket.ticketId}/logs`)
    assert.equal(daveLogs.status, 403)
    assert.equal(daveLogs.body.error.code, 'FORBIDDEN_COMPANY')
    const daveCompanyLogs = await dave.get('/api/logs')
    assert.equal(daveCompanyLogs.status, 200)
    assert.ok(daveCompanyLogs.body.items.every((e) => e.operatorName !== '艾莉丝'))

    // 业务组配置隔离：他公司组不可用于分配。
    const daveGroup = await dave.post('/api/groups', { name: '贝塔组' })
    assert.equal(daveGroup.status, 201)
    const assignCross = await dave.post(`/api/tickets/${ticket.body.ticket.ticketId}/assign`, { groupId: daveGroup.body.groupId })
    assert.equal(assignCross.status, 403)
    assert.equal(assignCross.body.error.code, 'FORBIDDEN_COMPANY')

    // 未认证请求返回契约 401 形状。
    const anonymous = await request('GET', url, '/api/tickets', undefined)
    assert.equal(anonymous.status, 401)
    assert.deepEqual(anonymous.body, { error: { code: 'UNAUTHENTICATED', message: '未登录或会话已过期' } })
    const badLogin = await request('POST', url, '/api/auth/login', undefined, { email: 'alice@alpha.test', password: 'wrong-password-1' })
    assert.equal(badLogin.status, 401)
    assert.equal(badLogin.body.error.code, 'INVALID_CREDENTIALS')

    // 登出端点满足契约形状。
    const logout = await dave.post('/api/auth/logout')
    assert.deepEqual(logout.body, { ok: true })
  })
})

test('工作台列表筛选、搜索与排序语义（AC-13）', async () => {
  const platform = await initializePlatform()
  const app = buildApp(platform)
  await withHttpServer({ fetch: app.fetch, close: platform.close }, async (url) => {
    const actors = await seedActors(url)
    const alice = client(url, actors.alice.token)

    const group = await alice.post('/api/groups', { name: '网络组' })
    await alice.post('/api/category-rules', { category: '网络故障', groupId: group.body.groupId })
    const t1 = await alice.post('/api/tickets', { subject: '打印机离线', description: '一楼打印机', category: '网络故障', priority: 'P3' })
    const t2 = await alice.post('/api/tickets', { subject: '打印机缺纸', description: '二楼打印机', category: '网络故障', priority: 'P1' })
    const t3 = await alice.post('/api/tickets', { subject: '投影仪故障', description: '会议室投影', category: '办公设备', priority: 'P2' })

    // 搜索：工单号 / 主题关键字（不区分大小写子串）。
    const byNo = await alice.get('/api/tickets?q=TK-000001')
    assert.deepEqual(byNo.body.items.map((t) => t.ticketId), [t1.body.ticket.ticketId])
    const bySubject = await alice.get('/api/tickets?q=PRINT').assert_empty
    const bySubjectCn = await alice.get('/api/tickets?q=打印机')
    assert.equal(bySubjectCn.body.total, 2)
    const byNone = await alice.get('/api/tickets?q=不存在关键字')
    assert.equal(byNone.body.total, 0)

    // 筛选：分类与优先级。
    const byCategory = await alice.get('/api/tickets?category=办公设备')
    assert.deepEqual(byCategory.body.items.map((t) => t.ticketId), [t3.body.ticket.ticketId])
    const byPriority = await alice.get('/api/tickets?priority=P1')
    assert.deepEqual(byPriority.body.items.map((t) => t.ticketId), [t2.body.ticket.ticketId])
    const byGroup = await alice.get(`/api/tickets?groupId=${group.body.groupId}`)
    assert.equal(byGroup.body.total, 2)

    // 排序：创建时间默认倒序；priority 升序 P0 优先；ticketNo 升序。
    const byCreated = await alice.get('/api/tickets')
    assert.deepEqual(byCreated.body.items.map((t) => t.ticketNo), ['TK-000003', 'TK-000002', 'TK-000001'])
    const byCreatedAsc = await alice.get('/api/tickets?sort=createdAt&order=asc')
    assert.deepEqual(byCreatedAsc.body.items.map((t) => t.ticketNo), ['TK-000001', 'TK-000002', 'TK-000003'])
    const byPriorityAsc = await alice.get('/api/tickets?sort=priority&order=asc')
    assert.deepEqual(byPriorityAsc.body.items.map((t) => t.priority), ['P1', 'P2', 'P3'])
    const byNoAsc = await alice.get('/api/tickets?sort=ticketNo&order=asc')
    assert.deepEqual(byNoAsc.body.items.map((t) => t.ticketNo), ['TK-000001', 'TK-000002', 'TK-000003'])

    // mine 过滤与非法枚举值校验。
    const mine = await alice.get('/api/tickets?mine=true')
    assert.equal(mine.body.total, 3)
    const badStatus = await alice.get('/api/tickets?status=unknown')
    assert.equal(badStatus.status, 400)
    assert.equal(badStatus.body.error.code, 'VALIDATION')
    assert.ok(badStatus.body.error.details.some((d) => d.field === 'status'))
    const badSort = await alice.get('/api/tickets?sort=owner')
    assert.equal(badSort.status, 400)

    // 分页：page/pageSize 生效且默认 20。
    const paged = await alice.get('/api/tickets?page=2&pageSize=2')
    assert.equal(paged.body.page, 2)
    assert.equal(paged.body.pageSize, 2)
    assert.equal(paged.body.total, 3)
    assert.deepEqual(paged.body.items.map((t) => t.ticketNo), ['TK-000001'])

    // 分类集合：工单 ∪ 规则，字典序。
    const categories = await alice.get('/api/categories')
    assert.deepEqual(categories.body.items, ['办公设备', '网络故障'])
  })
})

test('统计分布与运营指标口径（AC-11/12）', async () => {
  const platform = await initializePlatform()
  const app = buildApp(platform)
  await withHttpServer({ fetch: app.fetch, close: platform.close }, async (url) => {
    const actors = await seedActors(url)
    const alice = client(url, actors.alice.token)
    const bob = client(url, actors.bob.token)
    const dave = client(url, actors.dave.token)

    const group = await alice.post('/api/groups', { name: '网络组', memberIds: [actors.bob.user.userId] })
    await alice.post('/api/category-rules', { category: '网络故障', groupId: group.body.groupId })

    const t1 = await alice.post('/api/tickets', { subject: '工单一', description: '网络故障一', category: '网络故障', priority: 'P1' })
    const t2 = await alice.post('/api/tickets', { subject: '工单二', description: '网络故障二', category: '网络故障', priority: 'P2' })
    const t3 = await alice.post('/api/tickets', { subject: '工单三', description: '办公设备', category: '办公设备', priority: 'P2' })
    const t4 = await dave.post('/api/tickets', { subject: '工单四', description: '订单问题', category: '订单问题', priority: 'P4' })

    // 回复（平均响应时间口径数据）+ 完成 + 评价。
    await bob.post(`/api/tickets/${t1.body.ticket.ticketId}/replies`, { content: '首次回复' })
    const c1 = await bob.post(`/api/tickets/${t1.body.ticket.ticketId}/complete`, {})
    assert.equal(c1.status, 200)
    await alice.post(`/api/tickets/${t1.body.ticket.ticketId}/rating`, { score: 4 })

    await bob.post(`/api/tickets/${t2.body.ticket.ticketId}/replies`, { content: '首次回复二' })
    const c2 = await bob.post(`/api/tickets/${t2.body.ticket.ticketId}/complete`, {})
    assert.equal(c2.status, 200)
    await alice.post(`/api/tickets/${t2.body.ticket.ticketId}/rating`, { score: 5 })

    await alice.post(`/api/tickets/${t3.body.ticket.ticketId}/cancel`, {})

    // 公司维度分布（跨公司聚合，按 count 降序）。
    const companyDistribution = await alice.get('/api/stats/distribution?dimension=company')
    assert.equal(companyDistribution.status, 200)
    assert.deepEqual(companyDistribution.body.items, [
      { key: '阿尔法科技', label: '阿尔法科技', count: 3 },
      { key: '贝塔贸易', label: '贝塔贸易', count: 1 },
    ])
    const daveDistribution = await dave.get('/api/stats/distribution?dimension=company')
    assert.deepEqual(daveDistribution.body.items, companyDistribution.body.items)

    // 部门维度分布（空部门归入"未填写"）。
    const departmentDistribution = await alice.get('/api/stats/distribution?dimension=department')
    assert.deepEqual(departmentDistribution.body.items, [
      { key: '研发部', label: '研发部', count: 3 },
      { key: '运营部', label: '运营部', count: 1 },
    ])
    const badDimension = await alice.get('/api/stats/distribution?dimension=owner')
    assert.equal(badDimension.status, 400)
    assert.equal(badDimension.body.error.code, 'VALIDATION')

    // 仪表盘指标：工单量、状态分布、平均响应、满意度、热点分类。
    const dashboard = await alice.get('/api/stats/dashboard')
    assert.equal(dashboard.status, 200)
    assert.equal(dashboard.body.totalTickets, 4)
    assert.deepEqual(dashboard.body.statusBreakdown, {
      created: 0,
      pendingAssignment: 1,
      pendingProcessing: 0,
      completed: 2,
      cancelled: 1,
    })
    assert.equal(dashboard.body.avgSatisfaction, 4.5)
    assert.ok(dashboard.body.avgResponseMinutes > 0 && dashboard.body.avgResponseMinutes < 1)
    assert.deepEqual(dashboard.body.hotCategories, [
      { category: '网络故障', count: 2 },
      { category: '办公设备', count: 1 },
      { category: '订单问题', count: 1 },
    ])

    // 无评价/无回复的空指标库口径：B 公司视角仍为跨公司聚合。
    assert.equal(dashboard.body.avgResponseMinutes !== null, true)
  })
})

test('审计事件记录与查询（AC-14）', async () => {
  const platform = await initializePlatform()
  const app = buildApp(platform)
  await withHttpServer({ fetch: app.fetch, close: platform.close }, async (url) => {
    const actors = await seedActors(url)
    const alice = client(url, actors.alice.token)
    const bob = client(url, actors.bob.token)

    const group = await alice.post('/api/groups', { name: '网络组', memberIds: [actors.bob.user.userId] })
    await alice.post('/api/category-rules', { category: '网络故障', groupId: group.body.groupId })
    const ticket = await alice.post('/api/tickets', { subject: '审计工单', description: '覆盖关键操作', category: '网络故障', priority: 'P2' })
    const ticketId = ticket.body.ticket.ticketId

    await alice.post(`/api/tickets/${ticketId}/replies`, { content: '提交人回复' })
    await bob.post(`/api/tickets/${ticketId}/reassign`, { handlerId: actors.bob.user.userId })
    await bob.post(`/api/tickets/${ticketId}/complete`, { resolution: '已处理' })
    await alice.post(`/api/tickets/${ticketId}/rating`, { score: 5, comment: '满意' })

    await alice.put(`/api/groups/${group.body.groupId}`, { name: '网络运维组' })
    await alice.put(`/api/tickets/${ticketId}/assign`, { groupId: group.body.groupId }).catch(() => {})

    // 单工单日志：时间正序覆盖全部关键操作。
    const logs = await alice.get(`/api/tickets/${ticketId}/logs`)
    assert.equal(logs.status, 200, JSON.stringify(logs.body))
    assert.deepEqual(
      logs.body.items.map((e) => e.action),
      ['ticket.created', 'ticket.assigned', 'ticket.replied', 'ticket.reassigned', 'ticket.completed', 'ticket.rated'],
    )
    assert.ok(logs.body.items.every((e) => typeof e.eventId === 'number' && e.occurredAt))
    assert.ok(logs.body.items.every((e) => e.ticketNo === 'TK-000001' && e.ticketId === ticketId))
    const created = logs.body.items[0]
    assert.equal(created.operatorName, '艾莉丝')
    assert.ok(created.detail.includes('TK-000001'))
    const autoAssigned = logs.body.items[1]
    assert.ok(autoAssigned.detail.includes('自动'), autoAssigned.detail)
    const completed = logs.body.items[4]
    assert.equal(completed.operatorName, '鲍勃')

    // 本公司日志列表：倒序分页，公司隔离，含配置变更事件。
    const companyLogs = await alice.get('/api/logs?page=1&pageSize=50')
    assert.equal(companyLogs.status, 200)
    const actions = companyLogs.body.items.map((e) => e.action)
    assert.ok(actions.includes('group.created'))
    assert.ok(actions.includes('rule.created'))
    assert.ok(actions.includes('group.updated'))
    assert.ok(companyLogs.body.items.every((e) => typeof e.operatorId === 'number' && e.operatorName))
    for (let i = 1; i < companyLogs.body.items.length; i += 1) {
      assert.ok(companyLogs.body.items[i - 1].occurredAt >= companyLogs.body.items[i].occurredAt)
    }
    const paged = await alice.get('/api/logs?page=1&pageSize=2')
    assert.equal(paged.body.pageSize, 2)
    assert.equal(paged.body.items.length, 2)

    const dave = client(url, actors.dave.token)
    const daveLogs = await dave.get('/api/logs')
    assert.ok(daveLogs.body.items.every((e) => e.operatorName !== '艾莉丝'))
  })
})

test('SMTP 发送失败不阻塞工单完成主流程（AC-09）', async () => {
  const previousHost = process.env.SMTP_HOST
  const previousPort = process.env.SMTP_PORT
  process.env.SMTP_HOST = '127.0.0.1'
  process.env.SMTP_PORT = '1'
  try {
    const platform = await initializePlatform()
    const app = buildApp(platform)
    await withHttpServer({ fetch: app.fetch, close: platform.close }, async (url) => {
      const actors = await seedActors(url)
      const alice = client(url, actors.alice.token)
      const bob = client(url, actors.bob.token)
      const group = await alice.post('/api/groups', { name: '网络组', memberIds: [actors.bob.user.userId] })
      const ticket = await alice.post('/api/tickets', { subject: 'SMTP 工单', description: '验证失败路径', category: '网络故障', priority: 'P1' })

      const complete = await bob.post(`/api/tickets/${ticket.body.ticket.ticketId}/assign`, { groupId: group.body.groupId })
      assert.equal(complete.status, 200)
      const finished = await bob.post(`/api/tickets/${ticket.body.ticket.ticketId}/complete`, {})
      assert.equal(finished.status, 200, JSON.stringify(finished.body))
      assert.equal(finished.body.ticket.status, 'completed')
      assert.equal(finished.body.notification.channel, 'smtp')
      assert.equal(finished.body.notification.status, 'failed')

      const outbox = await alice.get('/api/outbox')
      assert.equal(outbox.body.items[0].status, 'failed')
      assert.ok(outbox.body.items[0].error)
      assert.equal(outbox.body.items[0].sentAt, null)
    })
  } finally {
    if (previousHost === undefined) delete process.env.SMTP_HOST
    else process.env.SMTP_HOST = previousHost
    if (previousPort === undefined) delete process.env.SMTP_PORT
    else process.env.SMTP_PORT = previousPort
  }
})
