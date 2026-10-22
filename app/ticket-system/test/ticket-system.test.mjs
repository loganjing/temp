import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { createApp } from '../src/server/app.ts'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'
import { registerProtectedRoutes, registerPublicRoutes } from '../src/server/routes.ts'
import { withHttpServer } from './with-http-server.mjs'

/** 每个用例使用独立的 SQLite 文件与真实 HTTP 监听端口。 */
async function withTicketSystem(verify) {
  const directory = await mkdtemp(path.join(tmpdir(), 'ticket-system-'))
  const previous = {
    DB_PATH: process.env.DB_PATH,
    JWT_SECRET: process.env.JWT_SECRET,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_FROM: process.env.SMTP_FROM,
  }
  process.env.DB_PATH = path.join(directory, 'ticket-system.db')
  process.env.JWT_SECRET = previous.JWT_SECRET ?? 'ticket-system-integration-secret'
  delete process.env.SMTP_HOST
  delete process.env.SMTP_FROM
  try {
    const platform = await initializePlatform()
    const app = createApp({
      registerPublicRoutes: (routes) => registerPublicRoutes(routes, platform),
      registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
      protect: platform.auth.requireAnyAuth,
    })
    try {
      await withHttpServer({ fetch: app.fetch, close: () => platform.close() }, async (url) => {
        await verify({ url, platform })
      })
    } finally {
      if (!platform.db.closed) await platform.close().catch(() => undefined)
    }
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    await rm(directory, { recursive: true, force: true })
  }
}

async function api(url, method, requestPath, { token, body } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${url}${requestPath}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const payload = response.status === 204 ? undefined : await response.json().catch(() => undefined)
  return { status: response.status, body: payload }
}

const log = (response) => {
  assert.ok(response.status >= 400, `expected failure, received ${response.status}: ${JSON.stringify(response.body)}`)
  return response
}

/** 建库：两类公司、三个用户、两个分类、三个部门。 */
async function seedWorkspace(url) {
  assert.equal((await api(url, 'POST', '/api/auth/bootstrap', {
    body: { name: 'Root Admin', email: 'root@example.com', password: 'root-password-1234' },
  })).status, 201)
  const login = await api(url, 'POST', '/api/auth/login', { body: { email: 'root@example.com', password: 'root-password-1234' } })
  assert.equal(login.status, 200)
  const admin = { token: login.body.token, id: login.body.user.id }

  const acme = (await api(url, 'POST', '/api/companies', { token: admin.token, body: { name: 'Acme' } })).body
  const globex = (await api(url, 'POST', '/api/companies', { token: admin.token, body: { name: 'Globex' } })).body
  const network = (await api(url, 'POST', '/api/categories', { token: admin.token, body: { name: '网络' } })).body
  const account = (await api(url, 'POST', '/api/categories', { token: admin.token, body: { name: '账号' } })).body

  // 部门维护限定在所属公司范围内，管理员需先归属该公司。
  await api(url, 'PUT', `/api/users/${admin.id}`, { token: admin.token, body: { companyId: acme.id } })
  const supportDept = (await api(url, 'POST', `/api/companies/${acme.id}/departments`, { token: admin.token, body: { name: '支持部' } })).body
  const financeDept = (await api(url, 'POST', `/api/companies/${acme.id}/departments`, { token: admin.token, body: { name: '财务部' } })).body
  await api(url, 'PUT', `/api/users/${admin.id}`, { token: admin.token, body: { companyId: globex.id } })
  const globexDept = (await api(url, 'POST', `/api/companies/${globex.id}/departments`, { token: admin.token, body: { name: '财务部' } })).body

  const createUser = async (email, displayName, companyId, departmentId) => {
    const response = await api(url, 'POST', '/api/users', { token: admin.token, body: { email, password: 'user-password-1234', displayName, companyId, departmentId } })
    assert.equal(response.status, 201, JSON.stringify(response.body))
    return response.body
  }
  const alice = await createUser('alice@acme.example', 'Alice', acme.id, supportDept.id)
  const carol = await createUser('carol@acme.example', 'Carol', acme.id, financeDept.id)
  const bob = await createUser('bob@globex.example', 'Bob', globex.id, globexDept.id)

  const signIn = async (email) => {
    const response = await api(url, 'POST', '/api/auth/login', { body: { email, password: 'user-password-1234' } })
    assert.equal(response.status, 200, JSON.stringify(response.body))
    return response.body.token
  }
  return {
    admin,
    acme,
    globex,
    network,
    account,
    supportDept,
    financeDept,
    globexDept,
    alice: { id: alice.id, token: await signIn('alice@acme.example') },
    carol: { id: carol.id, token: await signIn('carol@acme.example') },
    bob: { id: bob.id, token: await signIn('bob@globex.example') },
  }
}

test('迁移启动工单业务表并保留平台入口行为', async () => {
  await withTicketSystem(async ({ url, platform }) => {
    const tables = await platform.db.queryAll({
      text: "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('companies', 'departments', 'categories', 'user_profiles', 'business_groups', 'business_group_members', 'assignment_rules', 'tickets', 'ticket_replies', 'ticket_transfers', 'ticket_ratings') ORDER BY name",
    })
    assert.deepEqual(tables.map((row) => row.name), [
      'assignment_rules', 'business_group_members', 'business_groups', 'categories', 'companies', 'departments',
      'ticket_ratings', 'ticket_replies', 'ticket_transfers', 'tickets', 'user_profiles',
    ])
    assert.equal((await api(url, 'GET', '/api/health')).status, 200)
    assert.equal((await api(url, 'GET', '/api/tickets')).status, 401)
    assert.equal((await api(url, 'GET', '/api/tickets', { token: 'not-a-token' })).status, 401)
    // 未携带凭证时认证先于路由解析：未知 /api 路径同样返回 401
    assert.equal((await api(url, 'GET', '/api/unknown')).status, 401)
  })
})

test('公司隔离：跨公司读写在服务端被拒绝且不返回内容', async () => {
  await withTicketSystem(async ({ url }) => {
    const { acme, globex, network, alice, bob } = await seedWorkspace(url)

    const created = await api(url, 'POST', '/api/tickets', {
      token: alice.token,
      body: { title: '专线中断', description: '办公区专线中断', categoryId: network.id, slaPriority: 'P1' },
    })
    assert.equal(created.status, 201, JSON.stringify(created.body))
    assert.equal(created.body.status, 'pending_assignment')
    assert.equal(created.body.businessGroupId, null)
    const ticketId = created.body.id

    // 本公司范围内可见
    const mine = await api(url, 'GET', '/api/tickets', { token: alice.token })
    assert.equal(mine.status, 200)
    assert.equal(mine.body.total, 1)
    assert.equal(mine.body.items[0].companyName, 'Acme')

    // 他公司列表为空
    const theirs = await api(url, 'GET', '/api/tickets', { token: bob.token })
    assert.equal(theirs.status, 200)
    assert.deepEqual(theirs.body.items, [])
    assert.equal(theirs.body.total, 0)

    // 直接访问、操作他公司工单均被拒绝且不泄露内容
    for (const [method, requestPath, body] of [
      ['GET', `/api/tickets/${ticketId}`],
      ['GET', `/api/tickets/${ticketId}/logs`],
      ['GET', `/api/tickets/${ticketId}/submitter-info`],
      ['POST', `/api/tickets/${ticketId}/replies`, { content: '越权回复' }],
      ['POST', `/api/tickets/${ticketId}/transfer`, { targetGroupId: 1 }],
      ['POST', `/api/tickets/${ticketId}/assign`, { businessGroupId: 1 }],
      ['POST', `/api/tickets/${ticketId}/complete`],
      ['POST', `/api/tickets/${ticketId}/cancel`],
      ['POST', `/api/tickets/${ticketId}/rating`, { score: 5 }],
    ]) {
      const response = log(await api(url, method, requestPath, { token: bob.token, body }))
      assert.equal(response.status, 403, `${method} ${requestPath}`)
      assert.equal(typeof response.body.error.code, 'string')
      assert.ok(!JSON.stringify(response.body).includes('专线中断'), `${method} ${requestPath} leaked ticket content`)
    }

    // 显式请求他公司资源返回 403
    assert.equal(log(await api(url, 'GET', `/api/tickets?companyId=${acme.id}`, { token: bob.token })).status, 403)
    assert.equal(log(await api(url, 'GET', `/api/business-groups?companyId=${acme.id}`, { token: bob.token })).status, 403)
    assert.equal(log(await api(url, 'GET', `/api/assignment-rules?companyId=${acme.id}`, { token: bob.token })).status, 403)
    assert.equal(log(await api(url, 'GET', `/api/companies/${acme.id}/departments`, { token: bob.token })).status, 403)
    // 请求参数不能扩大公司范围：Alice 请求 Globex 的工单被拒绝
    assert.equal(log(await api(url, 'GET', `/api/tickets?companyId=${globex.id}`, { token: alice.token })).status, 403)

    // 统计口径按本公司过滤
    const dashboard = await api(url, 'GET', '/api/statistics/dashboard', { token: bob.token })
    assert.equal(dashboard.status, 200)
    assert.deepEqual(dashboard.body, { totalTickets: 0, avgResponseTimeMinutes: null, satisfactionScore: null, hotCategories: [] })
  })
})

test('自动分配、手动分配与终态约束', async () => {
  await withTicketSystem(async ({ url }) => {
    const { acme, network, account, alice, bob } = await seedWorkspace(url)

    const groupX = (await api(url, 'POST', '/api/business-groups', { token: alice.token, body: { companyId: acme.id, name: '支持组X' } })).body
    const groupY = (await api(url, 'POST', '/api/business-groups', { token: alice.token, body: { companyId: acme.id, name: '支持组Y' } })).body
    assert.equal(groupX.companyId, acme.id)
    assert.equal((await api(url, 'POST', `/api/business-groups/${groupX.id}/members`, { token: alice.token, body: { userId: alice.id } })).status, 201)
    assert.equal(log(await api(url, 'POST', `/api/business-groups/${groupX.id}/members`, { token: alice.token, body: { userId: alice.id } })).status, 409)
    assert.equal(log(await api(url, 'POST', `/api/business-groups/${groupX.id}/members`, { token: alice.token, body: { userId: bob.id } })).status, 403)

    const groups = await api(url, 'GET', `/api/business-groups?companyId=${acme.id}`, { token: alice.token })
    assert.equal(groups.status, 200)
    assert.deepEqual(groups.body.items.map((group) => group.name).sort(), ['支持组X', '支持组Y'])
    assert.deepEqual(groups.body.items.find((group) => group.id === groupX.id).members, [{ userId: alice.id, displayName: 'Alice' }])

    // 分配规则：同公司同分类唯一，重复配置以最新为准
    const first = await api(url, 'POST', '/api/assignment-rules', { token: alice.token, body: { companyId: acme.id, categoryId: network.id, targetGroupId: groupX.id } })
    assert.equal(first.status, 200)
    const second = await api(url, 'POST', '/api/assignment-rules', { token: alice.token, body: { companyId: acme.id, categoryId: network.id, targetGroupId: groupY.id } })
    assert.equal(second.status, 200)
    assert.equal(second.body.id, first.body.id)
    assert.equal(second.body.targetGroupId, groupY.id)
    await api(url, 'POST', '/api/assignment-rules', { token: alice.token, body: { companyId: acme.id, categoryId: network.id, targetGroupId: groupX.id } })

    const rules = await api(url, 'GET', `/api/assignment-rules?companyId=${acme.id}`, { token: alice.token })
    assert.equal(rules.status, 200)
    assert.deepEqual(rules.body.items, [{ id: first.body.id, companyId: acme.id, categoryId: network.id, categoryName: '网络', targetGroupId: groupX.id, targetGroupName: '支持组X' }])

    // 命中规则：创建即自动分配并进入待处理
    const auto = (await api(url, 'POST', '/api/tickets', { token: alice.token, body: { title: '网络故障', description: '交换机异常', categoryId: network.id, slaPriority: 'P0' } })).body
    assert.equal(auto.status, 'pending_processing')
    assert.equal(auto.businessGroupId, groupX.id)

    // 未命中规则：停留待分配，可手动分配
    const manual = (await api(url, 'POST', '/api/tickets', { token: alice.token, body: { title: '账号申请', description: '新员工账号', categoryId: account.id, slaPriority: 'P3' } })).body
    assert.equal(manual.status, 'pending_assignment')
    assert.equal(manual.businessGroupId, null)
    const assigned = await api(url, 'POST', `/api/tickets/${manual.id}/assign`, { token: alice.token, body: { businessGroupId: groupX.id } })
    assert.equal(assigned.status, 200)
    assert.deepEqual(assigned.body, { id: manual.id, businessGroupId: groupX.id, status: 'pending_processing' })
    assert.equal(log(await api(url, 'POST', `/api/tickets/${manual.id}/assign`, { token: alice.token, body: { businessGroupId: groupY.id } })).status, 409)
    assert.equal(log(await api(url, 'POST', `/api/tickets/${auto.id}/assign`, { token: alice.token, body: { businessGroupId: groupY.id } })).status, 409)

    // 日志覆盖创建与自动/手动分配
    const autoLogs = (await api(url, 'GET', `/api/tickets/${auto.id}/logs`, { token: alice.token })).body.items
    assert.deepEqual(autoLogs.map((entry) => entry.action), ['created', 'assigned'])
    assert.equal(autoLogs[0].operatorName, 'Alice')
    assert.equal(autoLogs[1].details.mode, 'auto')
    assert.equal(autoLogs[1].details.businessGroupId, groupX.id)
    const manualLogs = (await api(url, 'GET', `/api/tickets/${manual.id}/logs`, { token: alice.token })).body.items
    assert.deepEqual(manualLogs.map((entry) => entry.action), ['created', 'assigned'])
    assert.equal(manualLogs[1].details.mode, 'manual')

    // 取消为终态，终态上所有状态变更被拒绝
    const cancelled = await api(url, 'POST', `/api/tickets/${manual.id}/cancel`, { token: alice.token })
    assert.equal(cancelled.status, 200)
    assert.equal(cancelled.body.status, 'cancelled')
    assert.equal(typeof cancelled.body.cancelledAt, 'string')
    for (const [requestPath, body] of [
      [`/api/tickets/${manual.id}/cancel`, undefined],
      [`/api/tickets/${manual.id}/complete`, undefined],
      [`/api/tickets/${manual.id}/replies`, { content: '终态回复' }],
      [`/api/tickets/${manual.id}/transfer`, { targetGroupId: groupY.id }],
      [`/api/tickets/${manual.id}/assign`, { businessGroupId: groupX.id }],
      [`/api/tickets/${manual.id}/rating`, { score: 4 }],
    ]) {
      assert.equal(log(await api(url, 'POST', requestPath, { token: alice.token, body })).status, 409, requestPath)
    }
  })
})

test('多轮回复记录首条响应时间，转派保留痕迹且不改变状态', async () => {
  await withTicketSystem(async ({ url }) => {
    const { acme, network, alice, carol } = await seedWorkspace(url)

    const groupX = (await api(url, 'POST', '/api/business-groups', { token: alice.token, body: { companyId: acme.id, name: '支持组X' } })).body
    const groupY = (await api(url, 'POST', '/api/business-groups', { token: alice.token, body: { companyId: acme.id, name: '支持组Y' } })).body
    await api(url, 'POST', `/api/business-groups/${groupX.id}/members`, { token: alice.token, body: { userId: alice.id } })
    await api(url, 'POST', `/api/business-groups/${groupY.id}/members`, { token: alice.token, body: { userId: carol.id } })
    await api(url, 'POST', '/api/assignment-rules', { token: alice.token, body: { companyId: acme.id, categoryId: network.id, targetGroupId: groupX.id } })

    // 提交人 Carol 建单，自动分配到 Alice 所在的业务组
    const ticket = (await api(url, 'POST', '/api/tickets', { token: carol.token, body: { title: 'VPN 不通', description: '无法连接 VPN', categoryId: network.id, slaPriority: 'P2' } })).body
    assert.equal(ticket.status, 'pending_processing')
    assert.equal(ticket.businessGroupId, groupX.id)

    // 提交人回复不写入首条响应时间
    assert.equal((await api(url, 'POST', `/api/tickets/${ticket.id}/replies`, { token: carol.token, body: { content: '补充：公司内网也访问不了' } })).status, 201)
    assert.equal((await api(url, 'GET', '/api/statistics/dashboard', { token: alice.token })).body.avgResponseTimeMinutes, null)

    // 处理方首条回复写入 first_response_at，成为平均响应时间口径
    const handlerReply = await api(url, 'POST', `/api/tickets/${ticket.id}/replies`, { token: alice.token, body: { content: '已重置隧道配置' } })
    assert.equal(handlerReply.status, 201)
    assert.equal(handlerReply.body.replierName, 'Alice')
    assert.equal(typeof handlerReply.body.createdAt, 'string')
    assert.equal(typeof (await api(url, 'GET', '/api/statistics/dashboard', { token: alice.token })).body.avgResponseTimeMinutes, 'number')

    // 转派：变更归属、记录痕迹、状态不变
    const transferred = await api(url, 'POST', `/api/tickets/${ticket.id}/transfer`, { token: alice.token, body: { targetGroupId: groupY.id } })
    assert.equal(transferred.status, 200)
    assert.deepEqual(transferred.body, { id: ticket.id, businessGroupId: groupY.id, handlerUserId: null, status: 'pending_processing' })
    const toUser = await api(url, 'POST', `/api/tickets/${ticket.id}/transfer`, { token: alice.token, body: { targetUserId: carol.id } })
    assert.equal(toUser.status, 200)
    assert.equal(toUser.body.handlerUserId, carol.id)
    assert.equal(toUser.body.status, 'pending_processing')

    const detail = (await api(url, 'GET', `/api/tickets/${ticket.id}`, { token: alice.token })).body
    assert.equal(detail.status, 'pending_processing')
    assert.equal(detail.businessGroupName, '支持组Y')
    assert.equal(detail.handlerName, 'Carol')
    assert.deepEqual(detail.replies.map((reply) => reply.replierName), ['Carol', 'Alice'])
    // 仅转派处理人时目标业务组为空（转派记录保留转派目标处理人）
    assert.deepEqual(detail.transfers.map((entry) => entry.toGroupName), ['支持组Y', null])
    assert.equal(detail.transfers[0].transferredBy, alice.id)
    assert.equal(typeof detail.transfers[0].transferredAt, 'string')
    assert.equal(detail.rating, null)

    const logs = (await api(url, 'GET', `/api/tickets/${ticket.id}/logs`, { token: alice.token })).body.items
    assert.deepEqual(logs.map((entry) => entry.action), ['created', 'assigned', 'replied', 'replied', 'transferred', 'transferred'])
    assert.equal(typeof logs[0].id, 'string')
    assert.equal(typeof logs[0].createdAt, 'string')
  })
})

test('完成工单记录处理信息与邮件结果，评价唯一且不可修改', async () => {
  await withTicketSystem(async ({ url }) => {
    const { acme, network, supportDept, alice, carol } = await seedWorkspace(url)

    const groupX = (await api(url, 'POST', '/api/business-groups', { token: alice.token, body: { companyId: acme.id, name: '支持组X' } })).body
    await api(url, 'POST', `/api/business-groups/${groupX.id}/members`, { token: alice.token, body: { userId: alice.id } })
    await api(url, 'POST', '/api/assignment-rules', { token: alice.token, body: { companyId: acme.id, categoryId: network.id, targetGroupId: groupX.id } })

    const ticket = (await api(url, 'POST', '/api/tickets', { token: carol.token, body: { title: '邮件异常', description: '收不到邮件', categoryId: network.id, slaPriority: 'P1' } })).body
    assert.equal((await api(url, 'POST', `/api/tickets/${ticket.id}/replies`, { token: carol.token, body: { content: '今天开始' } })).status, 201)
    assert.equal((await api(url, 'POST', `/api/tickets/${ticket.id}/replies`, { token: alice.token, body: { content: '已在处理' } })).status, 201)

    const completed = await api(url, 'POST', `/api/tickets/${ticket.id}/complete`, { token: alice.token })
    assert.equal(completed.status, 200)
    assert.equal(completed.body.status, 'completed')
    assert.equal(completed.body.handlerName, 'Alice')
    assert.equal(typeof completed.body.completedAt, 'string')

    const detail = (await api(url, 'GET', `/api/tickets/${ticket.id}`, { token: carol.token })).body
    assert.equal(detail.handlerName, 'Alice')
    assert.equal(detail.completedAt, completed.body.completedAt)

    // 邮件通知走审计日志记录，未配置 SMTP 时降级为 skipped 且不阻塞完成
    const logs = (await api(url, 'GET', `/api/tickets/${ticket.id}/logs`, { token: alice.token })).body.items
    const completion = logs.find((entry) => entry.action === 'completed')
    assert.ok(completion, 'completion log missing')
    assert.equal(completion.details.email.to, 'carol@acme.example')
    assert.equal(completion.details.email.status, 'skipped')
    assert.equal(completion.details.email.reason, 'not_configured')

    // 终态约束：完成后不可再变更状态
    assert.equal(log(await api(url, 'POST', `/api/tickets/${ticket.id}/complete`, { token: alice.token })).status, 409)
    assert.equal(log(await api(url, 'POST', `/api/tickets/${ticket.id}/cancel`, { token: alice.token })).status, 409)
    assert.equal(log(await api(url, 'POST', `/api/tickets/${ticket.id}/replies`, { token: carol.token, body: { content: '再补充' } })).status, 409)
    assert.equal(log(await api(url, 'POST', `/api/tickets/${ticket.id}/transfer`, { token: alice.token, body: { targetGroupId: groupX.id } })).status, 409)

    // 满意度评价：仅完成工单可评价，每工单一条且不可修改
    const rated = await api(url, 'POST', `/api/tickets/${ticket.id}/rating`, { token: carol.token, body: { score: 5, comment: '响应很快' } })
    assert.equal(rated.status, 201)
    assert.equal(rated.body.ticketId, ticket.id)
    assert.equal(rated.body.score, 5)
    assert.equal(rated.body.comment, '响应很快')
    assert.equal(typeof rated.body.ratedAt, 'string')
    assert.equal(log(await api(url, 'POST', `/api/tickets/${ticket.id}/rating`, { token: carol.token, body: { score: 3 } })).status, 409)

    const ratedDetail = (await api(url, 'GET', `/api/tickets/${ticket.id}`, { token: carol.token })).body
    assert.deepEqual(ratedDetail.rating, { score: 5, comment: '响应很快', ratedAt: rated.body.ratedAt })

    // 提交人完整信息
    const submitter = await api(url, 'GET', `/api/tickets/${ticket.id}/submitter-info`, { token: alice.token })
    assert.equal(submitter.status, 200)
    assert.equal(submitter.body.name, 'Carol')
    assert.equal(submitter.body.company, 'Acme')
    assert.equal(submitter.body.department, '财务部')
    assert.deepEqual(submitter.body.historyTickets.map((entry) => entry.id), [ticket.id])
    assert.deepEqual(Object.keys(submitter.body.historyTickets[0]).sort(), ['createdAt', 'id', 'status', 'title'])
  })
})

test('统计口径：公司/部门分布与仪表盘指标可追溯到工单数据', async () => {
  await withTicketSystem(async ({ url, platform }) => {
    const { acme, network, account, alice, carol } = await seedWorkspace(url)

    const groupX = (await api(url, 'POST', '/api/business-groups', { token: alice.token, body: { companyId: acme.id, name: '支持组X' } })).body
    await api(url, 'POST', `/api/business-groups/${groupX.id}/members`, { token: alice.token, body: { userId: alice.id } })
    await api(url, 'POST', '/api/assignment-rules', { token: alice.token, body: { companyId: acme.id, categoryId: network.id, targetGroupId: groupX.id } })

    const first = (await api(url, 'POST', '/api/tickets', { token: carol.token, body: { title: '网络抖动', description: '间歇性丢包', categoryId: network.id, slaPriority: 'P2' } })).body
    await api(url, 'POST', '/api/tickets', { token: carol.token, body: { title: '权限申请', description: '申请账号权限', categoryId: account.id, slaPriority: 'P3' } })

    // 构造 90 分钟的首条响应时间，用于核对平均响应时间口径
    await platform.db.run({
      text: 'UPDATE tickets SET created_at = ? WHERE id = ?',
      params: [new Date(Date.now() - 90 * 60 * 1000).toISOString(), first.id],
    })
    await api(url, 'POST', `/api/tickets/${first.id}/replies`, { token: alice.token, body: { content: '已定位为链路抖动' } })
    await api(url, 'POST', `/api/tickets/${first.id}/complete`, { token: alice.token })
    await api(url, 'POST', `/api/tickets/${first.id}/rating`, { token: carol.token, body: { score: 4 } })

    const dashboard = await api(url, 'GET', '/api/statistics/dashboard', { token: alice.token })
    assert.equal(dashboard.status, 200)
    assert.equal(dashboard.body.totalTickets, 2)
    assert.ok(dashboard.body.avgResponseTimeMinutes > 89 && dashboard.body.avgResponseTimeMinutes < 91, `unexpected average: ${dashboard.body.avgResponseTimeMinutes}`)
    assert.equal(dashboard.body.satisfactionScore, 4)
    assert.deepEqual(dashboard.body.hotCategories, [
      { categoryId: network.id, categoryName: '网络', count: 1 },
      { categoryId: account.id, categoryName: '账号', count: 1 },
    ])

    const byCompany = await api(url, 'GET', '/api/statistics/distribution?dimension=company', { token: alice.token })
    assert.deepEqual(byCompany.body, { dimension: 'company', items: [{ label: 'Acme', count: 2 }] })
    const byDepartment = await api(url, 'GET', '/api/statistics/distribution?dimension=department', { token: alice.token })
    assert.deepEqual(byDepartment.body, { dimension: 'department', items: [{ label: '财务部', count: 2 }] })

    // 工作台筛选、搜索、排序与分页
    const filtered = await api(url, 'GET', `/api/tickets?status=pending_assignment&companyId=${acme.id}&q=权限`, { token: alice.token })
    assert.equal(filtered.status, 200)
    assert.equal(filtered.body.total, 1)
    assert.equal(filtered.body.items[0].title, '权限申请')
    assert.equal(filtered.body.items[0].categoryName, '账号')
    assert.equal(filtered.body.page, 1)
    assert.equal(filtered.body.size, 20)
    const prioritySorted = await api(url, 'GET', `/api/tickets?sort=slaPriority&order=asc&companyId=${acme.id}`, { token: alice.token })
    assert.deepEqual(prioritySorted.body.items.map((ticket) => ticket.slaPriority), ['P2', 'P3'])
    const priorityFiltered = await api(url, 'GET', `/api/tickets?priority=P2&companyId=${acme.id}`, { token: alice.token })
    assert.equal(priorityFiltered.body.total, 1)
  })
})

test('用户业务属性、业务组成员与分配规则维护接口', async () => {
  await withTicketSystem(async ({ url }) => {
    const { acme, globex, network, financeDept, supportDept, globexDept, alice, bob } = await seedWorkspace(url)

    const users = await api(url, 'GET', '/api/users', { token: alice.token })
    assert.equal(users.status, 200)
    const carol = users.body.items.find((user) => user.email === 'carol@acme.example')
    assert.equal(carol.profile.displayName, 'Carol')
    assert.equal(carol.profile.companyId, acme.id)
    assert.equal(carol.profile.departmentId, financeDept.id)
    assert.equal(users.body.items.find((user) => user.email === 'bob@globex.example').profile.companyId, globex.id)

    assert.equal(log(await api(url, 'POST', '/api/users', {
      token: alice.token,
      body: { email: 'carol@acme.example', password: 'user-password-1234', displayName: 'Carol 2', companyId: acme.id, departmentId: null },
    })).status, 409)
    assert.equal(log(await api(url, 'POST', '/api/users', {
      token: alice.token,
      body: { email: 'dave@acme.example', password: 'user-password-1234', displayName: 'Dave', companyId: acme.id, departmentId: globexDept.id },
    })).status, 400)
    assert.equal(log(await api(url, 'POST', '/api/users', {
      token: alice.token,
      body: { email: 'not-an-email', password: 'user-password-1234', displayName: 'Dave', companyId: acme.id, departmentId: null },
    })).status, 400)

    // 部门与业务组按公司过滤
    const departments = await api(url, 'GET', `/api/companies/${acme.id}/departments`, { token: alice.token })
    assert.equal(departments.status, 200)
    assert.deepEqual(departments.body.items.map((department) => department.name).sort(), ['支持部', '财务部'])
    assert.equal(log(await api(url, 'GET', `/api/companies/${globex.id}/departments`, { token: alice.token })).status, 403)

    const group = (await api(url, 'POST', '/api/business-groups', { token: alice.token, body: { companyId: acme.id, name: '临时组' } })).body
    assert.equal((await api(url, 'POST', `/api/business-groups/${group.id}/members`, { token: alice.token, body: { userId: bob.id } })).status, 403)
    await api(url, 'POST', `/api/business-groups/${group.id}/members`, { token: alice.token, body: { userId: alice.id } })
    assert.deepEqual((await api(url, 'DELETE', `/api/business-groups/${group.id}/members/${alice.id}`, { token: alice.token })).body, { success: true })
    assert.deepEqual((await api(url, 'DELETE', `/api/business-groups/${group.id}/members/${alice.id}`, { token: alice.token })).body, { success: true })

    // 用户业务属性是服务端权威的公司范围来源：改属性后可见范围随之变化
    const aliceTicket = (await api(url, 'POST', '/api/tickets', { token: alice.token, body: { title: '公司内工单', description: '由 Alice 提交', categoryId: network.id, slaPriority: 'P4' } })).body
    assert.equal((await api(url, 'GET', '/api/tickets', { token: bob.token })).body.total, 0)
    const updated = await api(url, 'PUT', `/api/users/${bob.id}`, { token: alice.token, body: { companyId: acme.id, departmentId: globexDept.id } })
    assert.equal(updated.status, 400)
    const moved = await api(url, 'PUT', `/api/users/${bob.id}`, { token: alice.token, body: { companyId: acme.id, departmentId: supportDept.id } })
    assert.equal(moved.status, 200)
    assert.equal(moved.body.profile.companyId, acme.id)
    assert.equal(moved.body.profile.departmentId, supportDept.id)
    const bobTickets = await api(url, 'GET', '/api/tickets', { token: bob.token })
    assert.equal(bobTickets.body.total, 1)
    assert.equal(bobTickets.body.items[0].id, aliceTicket.id)
    assert.equal(log(await api(url, 'GET', `/api/tickets?companyId=${globex.id}`, { token: bob.token })).status, 403)

    const me = await api(url, 'GET', '/api/auth/me', { token: bob.token })
    assert.equal(me.body.user.id, bob.id)
    assert.equal(me.body.profile.companyId, acme.id)
    assert.equal(me.body.profile.displayName, 'Bob')
  })
})

test('入参校验与未找到资源返回契约错误码', async () => {
  await withTicketSystem(async ({ url }) => {
    const { acme, network, alice, carol } = await seedWorkspace(url)

    for (const body of [
      { description: '缺少标题', categoryId: network.id, slaPriority: 'P1' },
      { title: '非法优先级', description: 'x', categoryId: network.id, slaPriority: 'P5' },
      { title: '非法分类', description: 'x', categoryId: 99999, slaPriority: 'P1' },
      { title: '缺少描述', description: '   ', categoryId: network.id, slaPriority: 'P1' },
    ]) {
      const response = log(await api(url, 'POST', '/api/tickets', { token: alice.token, body }))
      assert.equal(response.status, 400, JSON.stringify(response.body))
      assert.equal(typeof response.body.error.code, 'string')
      assert.equal(typeof response.body.error.message, 'string')
    }

    const ticket = (await api(url, 'POST', '/api/tickets', { token: carol.token, body: { title: '校验用', description: '校验用', categoryId: network.id, slaPriority: 'P2' } })).body
    assert.equal(log(await api(url, 'POST', `/api/tickets/${ticket.id}/replies`, { token: carol.token, body: { content: '  ' } })).status, 400)
    assert.equal(log(await api(url, 'POST', `/api/tickets/${ticket.id}/rating`, { token: carol.token, body: { score: 9 } })).status, 400)
    assert.equal(log(await api(url, 'POST', `/api/tickets/${ticket.id}/rating`, { token: carol.token, body: { score: 'a' } })).status, 400)
    assert.equal(log(await api(url, 'POST', `/api/tickets/${ticket.id}/rating`, { token: carol.token, body: { score: 5 } })).status, 409)
    assert.equal(log(await api(url, 'POST', `/api/tickets/${ticket.id}/transfer`, { token: alice.token, body: {} })).status, 400)
    assert.equal(log(await api(url, 'GET', '/api/tickets/99999', { token: alice.token })).status, 404)
    assert.equal(log(await api(url, 'POST', '/api/tickets/99999/complete', { token: alice.token })).status, 404)
    assert.equal(log(await api(url, 'GET', '/api/statistics/distribution?dimension=bogus', { token: alice.token })).status, 400)
    assert.equal(log(await api(url, 'POST', `/api/companies/${acme.id}/departments`, { token: alice.token, body: { name: '' } })).status, 400)
    assert.equal(log(await api(url, 'POST', '/api/business-groups', { token: alice.token, body: { companyId: acme.id, name: '   ' } })).status, 400)
  })
})
