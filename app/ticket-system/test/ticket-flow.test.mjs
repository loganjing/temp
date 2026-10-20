// 工单系统核心业务流验证：真实 HTTP 服务 + 隔离 SQLite 库。
// 覆盖：创建+自动分配、公司隔离 404、状态机终态 409、回复、转派、
// 完成+邮件审计（SMTP 未配置如实记失败）、评价、统计口径、审计检索。
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { createApp } from '../src/server/app.ts'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'
import { registerProtectedRoutes, registerPublicRoutes } from '../src/server/routes.ts'
import { withHttpServer } from './with-http-server.mjs'

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const USER_PASSWORD = 'user-pass-123456'
const BOOTSTRAP_PASSWORD = 'bootstrap-pass-123'

const request = async (base, method, pathname, { token, body } = {}) => {
  const response = await fetch(`${base}${pathname}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  return { status: response.status, body: text === '' ? null : JSON.parse(text) }
}

// 每个用例独立的临时库与独立限流实例（authkit 登录限流为进程内存）。
const withTicketSystem = async (verify) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ticket-flow-'))
  const previousDbPath = process.env.DB_PATH
  const previousSmtpHost = process.env.SMTP_HOST
  process.env.DB_PATH = path.join(directory, 'application.db')
  delete process.env.SMTP_HOST
  const platform = await initializePlatform()
  const app = createApp({
    registerPublicRoutes: (routes) => registerPublicRoutes(routes, platform),
    registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
    protect: platform.auth.requireAnyAuth,
  })
  try {
    return await withHttpServer({ fetch: app.fetch, close: () => platform.close() }, verify)
  } finally {
    if (previousDbPath === undefined) delete process.env.DB_PATH
    else process.env.DB_PATH = previousDbPath
    if (previousSmtpHost === undefined) delete process.env.SMTP_HOST
    else process.env.SMTP_HOST = previousSmtpHost
    await rm(directory, { recursive: true, force: true })
  }
}

// 基线 fixture：bootstrap ops → 甲/乙公司 → 用户 → 业务组 → 甲公司规则“功能使用→G1”。
const buildFixture = async (base) => {
  const bootstrap = await request(base, 'POST', '/api/auth/bootstrap', {
    body: { name: '系统管理员', email: 'ops@init.test', password: BOOTSTRAP_PASSWORD },
  })
  assert.equal(bootstrap.status, 201, `bootstrap failed: ${JSON.stringify(bootstrap.body)}`)
  const opsLogin = await request(base, 'POST', '/api/auth/login', {
    body: { email: 'ops@init.test', password: BOOTSTRAP_PASSWORD },
  })
  assert.equal(opsLogin.status, 200)
  assert.equal(opsLogin.body.user.role, 'ops')
  const opsToken = opsLogin.body.token

  const companyA = (await request(base, 'POST', '/api/admin/companies', { token: opsToken, body: { name: '甲公司' } })).body
  const companyB = (await request(base, 'POST', '/api/admin/companies', { token: opsToken, body: { name: '乙公司' } })).body

  const createUser = async (email, displayName, companyId, department, role) => {
    const response = await request(base, 'POST', '/api/admin/users', {
      token: opsToken,
      body: { email, password: USER_PASSWORD, display_name: displayName, company_id: companyId, department, role },
    })
    assert.equal(response.status, 201, `create user ${email} failed: ${JSON.stringify(response.body)}`)
    return response.body
  }
  const aSubmitterUser = await createUser('alice@corp-a.test', 'Alice', companyA.id, '研发部', 'submitter')
  const aHandlerUser = await createUser('bob@corp-a.test', 'Bob', companyA.id, '研发部', 'handler')
  const bSubmitterUser = await createUser('carol@corp-b.test', 'Carol', companyB.id, '市场部', 'submitter')

  const login = async (email) => {
    const response = await request(base, 'POST', '/api/auth/login', { body: { email, password: USER_PASSWORD } })
    assert.equal(response.status, 200, `login ${email} failed`)
    return response.body.token
  }
  const aSubmitter = { token: await login('alice@corp-a.test'), id: aSubmitterUser.user_id }
  const aHandler = { token: await login('bob@corp-a.test'), id: aHandlerUser.user_id }
  const bSubmitter = { token: await login('carol@corp-b.test'), id: bSubmitterUser.user_id }

  const g1 = (await request(base, 'POST', '/api/business-groups', { token: opsToken, body: { company_id: companyA.id, name: '甲一组' } })).body
  const g2 = (await request(base, 'POST', '/api/business-groups', { token: opsToken, body: { company_id: companyA.id, name: '甲二组' } })).body
  const gb = (await request(base, 'POST', '/api/business-groups', { token: opsToken, body: { company_id: companyB.id, name: '乙一组' } })).body

  const rule = await request(base, 'PUT', '/api/assignment-rules', {
    token: opsToken,
    body: { company_id: companyA.id, category: '功能使用', group_id: g1.id },
  })
  assert.equal(rule.status, 201, `put rule failed: ${JSON.stringify(rule.body)}`)
  assert.equal(rule.body.group_name, '甲一组')

  return { opsToken, aSubmitter, aHandler, bSubmitter, companyA, companyB, g1, g2, gb }
}

const createTicket = (base, token, overrides = {}) =>
  request(base, 'POST', '/api/tickets', {
    token,
    body: { subject: '无法登录', description: '登录页面持续报错', category: '功能使用', priority: 'P2', ...overrides },
  })

test('创建、自动分配、手动分配、公司隔离与工作台列表', async () => {
  await withTicketSystem(async (base) => {
    const { opsToken, aSubmitter, aHandler, bSubmitter, companyA, companyB, g1, g2, gb } = await buildFixture(base)

    // 认证边界：未认证与坏 Token → 401 UNAUTHENTICATED；错误密码 → 401 INVALID_CREDENTIALS。
    assert.deepEqual((await request(base, 'GET', '/api/tickets')).body, { error: { code: 'UNAUTHENTICATED', message: '未认证或凭证已失效' } })
    assert.equal((await request(base, 'GET', '/api/tickets', { token: 'bogus-token' })).status, 401)
    const badLogin = await request(base, 'POST', '/api/auth/login', { body: { email: 'alice@corp-a.test', password: 'wrong-password' } })
    assert.equal(badLogin.status, 401)
    assert.equal(badLogin.body.error.code, 'INVALID_CREDENTIALS')

    // 当前用户读取契约形状。
    const me = await request(base, 'GET', '/api/auth/me', { token: aSubmitter.token })
    assert.equal(me.status, 200)
    assert.deepEqual(me.body, {
      id: aSubmitter.id,
      email: 'alice@corp-a.test',
      display_name: 'Alice',
      company_id: companyA.id,
      department: '研发部',
      role: 'submitter',
    })

    // 创建即自动分配（规则命中 → in_progress + 归属组）。
    const t1 = await createTicket(base, aSubmitter.token)
    assert.equal(t1.status, 201, JSON.stringify(t1.body))
    assert.match(t1.body.ticket_no, /^TKT-\d{6}$/)
    assert.equal(t1.body.ticket_no, 'TKT-000001')
    assert.equal(t1.body.status, 'in_progress')
    assert.equal(t1.body.assigned_group_id, g1.id)
    assert.equal(t1.body.assigned_group_name, '甲一组')
    assert.equal(t1.body.company_id, companyA.id)
    assert.equal(t1.body.company_name, '甲公司')
    assert.equal(t1.body.submitter_name, 'Alice')
    assert.equal(t1.body.submitter_user_id, aSubmitter.id)
    assert.equal(t1.body.submitter_department, '研发部')
    assert.equal(t1.body.submitter_email, 'alice@corp-a.test')
    assert.equal(t1.body.subject, '无法登录')
    assert.equal(t1.body.description, '登录页面持续报错')
    assert.equal(t1.body.priority, 'P2')
    assert.equal(t1.body.category, '功能使用')
    assert.match(t1.body.created_at, ISO_TIME)
    assert.equal(t1.body.rating, null)
    assert.deepEqual(t1.body.replies, [])

    // 无规则分类 → 待分配。
    const t2 = await createTicket(base, aSubmitter.token, { subject: '页面缓慢', category: '性能问题', priority: 'P3' })
    assert.equal(t2.status, 201)
    assert.equal(t2.body.status, 'pending_assignment')
    assert.equal(t2.body.assigned_group_id, null)
    assert.equal(t2.body.ticket_no, 'TKT-000002')

    // 我的工单：本人全部状态。
    const mine = await request(base, 'GET', '/api/tickets', { token: aSubmitter.token })
    assert.equal(mine.status, 200)
    assert.equal(mine.body.total, 2)
    assert.deepEqual(mine.body.items.map((item) => item.id).sort(), [t1.body.id, t2.body.id].sort())

    // 提交人无工作台权限；非 ops 传 company_id → 403。
    assert.equal((await request(base, 'GET', '/api/tickets?scope=workbench', { token: aSubmitter.token })).status, 403)
    const scoped = await request(base, 'GET', '/api/tickets?scope=workbench&company_id=' + companyA.id, { token: aSubmitter.token })
    assert.equal(scoped.status, 403)
    assert.equal(scoped.body.error.code, 'FORBIDDEN')

    // 公司隔离：乙公司用户对甲公司工单的读取与操作一律 404（不泄露存在性）。
    for (const [method, pathname] of [
      ['GET', `/api/tickets/${t1.body.id}`],
      ['POST', `/api/tickets/${t1.body.id}/replies`],
      ['POST', `/api/tickets/${t1.body.id}/assign`],
      ['GET', `/api/tickets/${t1.body.id}/submitter`],
    ]) {
      const response = await request(base, method, pathname, { token: bSubmitter.token, body: method === 'POST' ? { content: 'x' } : undefined })
      assert.equal(response.status, 404, `${method} ${pathname}`)
      assert.equal(response.body.error.code, 'NOT_FOUND')
    }

    // 乙公司自己的工单只出现在自己的列表中。
    const t3 = await createTicket(base, bSubmitter.token, { subject: '乙公司问题', category: '其他', priority: 'P4' })
    assert.equal(t3.status, 201)
    assert.equal(t3.body.status, 'pending_assignment')
    const bMine = await request(base, 'GET', '/api/tickets', { token: bSubmitter.token })
    assert.equal(bMine.body.total, 1)
    assert.equal(bMine.body.items[0].id, t3.body.id)
    assert.equal(bMine.body.items[0].company_id, companyB.id)

    // 手动分配：域内 submitter → 403；本公司 handler → 200（含处理人）。
    const selfAssign = await request(base, 'POST', `/api/tickets/${t2.body.id}/assign`, { token: aSubmitter.token, body: { group_id: g2.id } })
    assert.equal(selfAssign.status, 403)
    const assigned = await request(base, 'POST', `/api/tickets/${t2.body.id}/assign`, {
      token: aHandler.token,
      body: { group_id: g2.id, handler_id: aHandler.id },
    })
    assert.equal(assigned.status, 200)
    assert.equal(assigned.body.status, 'in_progress')
    assert.equal(assigned.body.assigned_group_id, g2.id)
    assert.equal(assigned.body.assigned_handler_id, aHandler.id)
    assert.equal((await request(base, 'POST', `/api/tickets/${t2.body.id}/assign`, { token: aHandler.token, body: { group_id: g1.id } })).status, 409)

    // ops 可跨公司分配；组与处理人越域 → 400。
    const opsAssigned = await request(base, 'POST', `/api/tickets/${t3.body.id}/assign`, { token: opsToken, body: { group_id: gb.id } })
    assert.equal(opsAssigned.status, 200)
    assert.equal(opsAssigned.body.assigned_group_id, gb.id)
    const t4 = await createTicket(base, aSubmitter.token, { subject: '数据异常', category: '数据问题', priority: 'P1' })
    const crossGroup = await request(base, 'POST', `/api/tickets/${t4.body.id}/assign`, { token: opsToken, body: { group_id: gb.id } })
    assert.equal(crossGroup.status, 400)
    assert.equal(crossGroup.body.error.code, 'GROUP_COMPANY_MISMATCH')
    const crossHandler = await request(base, 'POST', `/api/tickets/${t4.body.id}/assign`, { token: opsToken, body: { group_id: g1.id, handler_id: bSubmitter.id } })
    assert.equal(crossHandler.status, 400)
    assert.equal(crossHandler.body.error.code, 'VALIDATION_FAILED')

    // 工作台：handler 本公司 in_progress；ops 全量与公司过滤。
    const bench = await request(base, 'GET', '/api/tickets?scope=workbench', { token: aHandler.token })
    assert.equal(bench.body.total, 2)
    assert.ok(bench.body.items.every((item) => item.company_id === companyA.id && item.status === 'in_progress'))
    const opsBench = await request(base, 'GET', '/api/tickets?scope=workbench', { token: opsToken })
    assert.equal(opsBench.body.total, 3)
    const opsBenchB = await request(base, 'GET', '/api/tickets?scope=workbench&company_id=' + companyB.id, { token: opsToken })
    assert.deepEqual(opsBenchB.body.items.map((item) => item.id), [t3.body.id])

    // 搜索：工单号前缀 / 主题包含 / 提交人姓名包含。
    const byNo = await request(base, 'GET', `/api/tickets?scope=workbench&q=${t1.body.ticket_no}`, { token: opsToken })
    assert.deepEqual(byNo.body.items.map((item) => item.id), [t1.body.id])
    const bySubject = await request(base, 'GET', '/api/tickets?scope=workbench&q=缓慢', { token: opsToken })
    assert.deepEqual(bySubject.body.items.map((item) => item.id), [t2.body.id])
    const byName = await request(base, 'GET', '/api/tickets?scope=workbench&q=Alice', { token: aHandler.token })
    assert.equal(byName.body.total, 2)

    // 优先级排序（P0 最前）与分页。
    const t5 = await createTicket(base, aSubmitter.token, { subject: '紧急故障', priority: 'P0' })
    assert.equal(t5.body.status, 'in_progress')
    const byPriority = await request(base, 'GET', '/api/tickets?scope=workbench&sort=priority&order=asc', { token: aHandler.token })
    assert.equal(byPriority.body.items[0].priority, 'P0')
    const paged = await request(base, 'GET', '/api/tickets?scope=workbench&page_size=1&page=2', { token: aHandler.token })
    assert.equal(paged.body.page, 2)
    assert.equal(paged.body.page_size, 1)
    assert.equal(paged.body.total, 3)
    assert.equal(paged.body.items.length, 1)

    // 状态筛选与非法参数。
    const pending = await request(base, 'GET', '/api/tickets?scope=workbench&status=pending_assignment', { token: opsToken })
    assert.ok(pending.body.items.every((item) => item.status === 'pending_assignment'))
    for (const query of ['scope=bogus', 'sort=bogus', 'order=bogus', 'status=bogus', 'priority=P9']) {
      const response = await request(base, 'GET', `/api/tickets?${query}`, { token: opsToken })
      assert.equal(response.status, 400, query)
      assert.equal(response.body.error.code, 'VALIDATION_FAILED')
    }

    // 业务组读取域、成员管理与组删除约束。
    const groupsRead = await request(base, 'GET', '/api/business-groups?company_id=' + companyA.id, { token: aHandler.token })
    assert.equal(groupsRead.status, 200)
    assert.deepEqual(groupsRead.body.items.map((item) => item.name), ['甲一组', '甲二组'])
    assert.equal((await request(base, 'GET', '/api/business-groups?company_id=' + companyB.id, { token: aHandler.token })).status, 403)
    assert.equal((await request(base, 'GET', '/api/business-groups?company_id=' + companyA.id, { token: aSubmitter.token })).status, 403)
    const member = await request(base, 'POST', `/api/business-groups/${g1.id}/members`, { token: opsToken, body: { user_id: aHandler.id } })
    assert.equal(member.status, 201)
    assert.deepEqual(member.body, { user_id: aHandler.id, display_name: 'Bob', department: '研发部' })
    assert.equal((await request(base, 'POST', `/api/business-groups/${g1.id}/members`, { token: opsToken, body: { user_id: aHandler.id } })).body.error.code, 'DUPLICATE_MEMBER')
    const crossMember = await request(base, 'POST', `/api/business-groups/${g1.id}/members`, { token: opsToken, body: { user_id: bSubmitter.id } })
    assert.equal(crossMember.status, 400)
    assert.equal(crossMember.body.error.code, 'USER_COMPANY_MISMATCH')
    const groupsWithMembers = await request(base, 'GET', '/api/business-groups?company_id=' + companyA.id, { token: opsToken })
    assert.deepEqual(groupsWithMembers.body.items.find((item) => item.id === g1.id).members, [member.body])
    const inUse = await request(base, 'DELETE', `/api/business-groups/${g1.id}`, { token: opsToken })
    assert.equal(inUse.status, 409)
    assert.equal(inUse.body.error.code, 'GROUP_IN_USE')
    const g3 = (await request(base, 'POST', '/api/business-groups', { token: opsToken, body: { company_id: companyA.id, name: '甲三组' } })).body
    assert.equal((await request(base, 'DELETE', `/api/business-groups/${g3.id}`, { token: opsToken })).status, 204)

    // 规则 upsert：更新 → 200。
    const updatedRule = await request(base, 'PUT', '/api/assignment-rules', {
      token: opsToken,
      body: { company_id: companyA.id, category: '功能使用', group_id: g2.id },
    })
    assert.equal(updatedRule.status, 200)
    assert.equal(updatedRule.body.group_id, g2.id)
    const rulesRead = await request(base, 'GET', '/api/assignment-rules?company_id=' + companyA.id, { token: aHandler.token })
    assert.deepEqual(rulesRead.body.items.map((item) => item.category), ['功能使用'])

    // 管理端权限与冲突。
    assert.equal((await request(base, 'POST', '/api/admin/companies', { token: aSubmitter.token, body: { name: '丙公司' } })).status, 403)
    const dupCompany = await request(base, 'POST', '/api/admin/companies', { token: opsToken, body: { name: '甲公司' } })
    assert.equal(dupCompany.status, 409)
    assert.equal(dupCompany.body.error.code, 'DUPLICATE_NAME')
    const dupEmail = await request(base, 'POST', '/api/admin/users', {
      token: opsToken,
      body: { email: 'alice@corp-a.test', password: USER_PASSWORD, display_name: 'Alice2', company_id: companyA.id, role: 'submitter' },
    })
    assert.equal(dupEmail.status, 409)
    assert.equal(dupEmail.body.error.code, 'DUPLICATE_EMAIL')
    const shortPassword = await request(base, 'POST', '/api/admin/users', {
      token: opsToken,
      body: { email: 'dave@corp-a.test', password: 'short', display_name: 'Dave', company_id: companyA.id, role: 'submitter' },
    })
    assert.equal(shortPassword.status, 400)
  })
})

test('回复、转派、完成、取消与状态机终态', async () => {
  await withTicketSystem(async (base) => {
    const { opsToken, aSubmitter, aHandler, bSubmitter, companyA, g1, g2, gb } = await buildFixture(base)

    const t1 = await createTicket(base, aSubmitter.token)
    assert.equal(t1.body.status, 'in_progress')

    // 多轮回复：两轮不同人员，顺序与作者可追溯。
    const r1 = await request(base, 'POST', `/api/tickets/${t1.body.id}/replies`, { token: aSubmitter.token, body: { content: '补充：Chrome 浏览器复现' } })
    assert.equal(r1.status, 201)
    assert.equal(r1.body.author_user_id, aSubmitter.id)
    assert.equal(r1.body.author_name, 'Alice')
    assert.equal(r1.body.content, '补充：Chrome 浏览器复现')
    assert.match(r1.body.created_at, ISO_TIME)
    const r2 = await request(base, 'POST', `/api/tickets/${t1.body.id}/replies`, { token: aHandler.token, body: { content: '已收到，正在排查' } })
    assert.equal(r2.status, 201)
    assert.equal(r2.body.author_user_id, aHandler.id)
    const detail = await request(base, 'GET', `/api/tickets/${t1.body.id}`, { token: aHandler.token })
    assert.equal(detail.body.replies.length, 2)
    assert.ok(detail.body.replies[0].id < detail.body.replies[1].id)
    assert.equal(detail.body.replies[0].author_name, 'Alice')
    assert.equal(detail.body.replies[1].author_name, 'Bob')
    assert.equal((await request(base, 'POST', `/api/tickets/${t1.body.id}/replies`, { token: bSubmitter.token, body: { content: 'x' } })).status, 404)

    // 转派：状态保持待处理、归属变更；越公司组 → 400；submitter → 403。
    const transferred = await request(base, 'POST', `/api/tickets/${t1.body.id}/transfer`, {
      token: aHandler.token,
      body: { to_group_id: g2.id, to_handler_id: aHandler.id, reason: '系统组更合适' },
    })
    assert.equal(transferred.status, 200)
    assert.equal(transferred.body.status, 'in_progress')
    assert.equal(transferred.body.assigned_group_id, g2.id)
    assert.equal(transferred.body.assigned_group_name, '甲二组')
    assert.equal(transferred.body.assigned_handler_id, aHandler.id)
    const crossTransfer = await request(base, 'POST', `/api/tickets/${t1.body.id}/transfer`, { token: aHandler.token, body: { to_group_id: gb.id } })
    assert.equal(crossTransfer.status, 400)
    assert.equal(crossTransfer.body.error.code, 'GROUP_COMPANY_MISMATCH')
    assert.equal((await request(base, 'POST', `/api/tickets/${t1.body.id}/transfer`, { token: aSubmitter.token, body: { to_group_id: g1.id } })).status, 403)
    assert.equal((await request(base, 'POST', `/api/tickets/${t1.body.id}/transfer`, { token: bSubmitter.token, body: { to_group_id: g1.id } })).status, 404)

    // 取消权限：域内 handler → 403（仅提交人或 ops）；跨公司 → 404。
    assert.equal((await request(base, 'POST', `/api/tickets/${t1.body.id}/cancel`, { token: aHandler.token, body: { reason: 'x' } })).status, 403)
    assert.equal((await request(base, 'POST', `/api/tickets/${t1.body.id}/cancel`, { token: bSubmitter.token, body: { reason: 'x' } })).status, 404)

    // 完成：记录处理人/处理时间，resolution 追加回复。
    const completed = await request(base, 'POST', `/api/tickets/${t1.body.id}/complete`, { token: aHandler.token, body: { resolution: '已修复登录校验问题' } })
    assert.equal(completed.status, 200, JSON.stringify(completed.body))
    assert.equal(completed.body.status, 'completed')
    assert.equal(completed.body.handled_by, aHandler.id)
    assert.equal(completed.body.handled_by_name, 'Bob')
    assert.match(completed.body.handled_at, ISO_TIME)
    assert.match(completed.body.completed_at, ISO_TIME)
    assert.equal(completed.body.replies.length, 3)
    assert.equal(completed.body.replies[2].content, '已修复登录校验问题')
    assert.equal(completed.body.replies[2].author_name, 'Bob')

    // 终态：所有状态变更动作 → 409 INVALID_STATE。
    // cancel 权限为提交人或 ops，此处用提交人身份使权限通过，验证状态机拒绝。
    for (const [pathname, body] of [
      [`/api/tickets/${t1.body.id}/replies`, { content: 'x' }],
      [`/api/tickets/${t1.body.id}/complete`, {}],
      [`/api/tickets/${t1.body.id}/transfer`, { to_group_id: g1.id }],
      [`/api/tickets/${t1.body.id}/assign`, { group_id: g1.id }],
      [`/api/tickets/${t1.body.id}/cancel`, { reason: 'x' }],
    ]) {
      const token = pathname.endsWith('/cancel') ? aSubmitter.token : aHandler.token
      const response = await request(base, 'POST', pathname, { token, body })
      assert.equal(response.status, 409, pathname)
      assert.equal(response.body.error.code, 'INVALID_STATE', pathname)
    }

    // 待分配工单不能直接完成；提交人取消记录原因与时间；取消后为终态。
    const t2 = await createTicket(base, aSubmitter.token, { subject: '页面缓慢', category: '性能问题', priority: 'P3' })
    assert.equal((await request(base, 'POST', `/api/tickets/${t2.body.id}/complete`, { token: aHandler.token, body: {} })).status, 409)
    const cancelled = await request(base, 'POST', `/api/tickets/${t2.body.id}/cancel`, { token: aSubmitter.token, body: { reason: '重复提交' } })
    assert.equal(cancelled.status, 200)
    assert.equal(cancelled.body.status, 'cancelled')
    assert.match(cancelled.body.cancelled_at, ISO_TIME)
    assert.equal(cancelled.body.cancel_reason, '重复提交')
    assert.equal((await request(base, 'POST', `/api/tickets/${t2.body.id}/replies`, { token: aSubmitter.token, body: { content: 'x' } })).status, 409)

    // ops 可取消任意非终态工单。
    const t3 = await createTicket(base, aSubmitter.token, { subject: '数据异常', category: '数据问题', priority: 'P1' })
    const opsCancel = await request(base, 'POST', `/api/tickets/${t3.body.id}/cancel`, { token: opsToken, body: { reason: '无效工单' } })
    assert.equal(opsCancel.status, 200)
    assert.equal(opsCancel.body.status, 'cancelled')

    // 邮件通知：SMTP 未配置 → complete 仍成功，失败如实写审计。
    const failedEmail = await request(base, 'GET', `/api/audit-events?ticket_id=${t1.body.id}&action=email.notification_failed`, { token: opsToken })
    assert.equal(failedEmail.status, 200)
    assert.equal(failedEmail.body.total, 1)
    assert.equal(failedEmail.body.items[0].ticket_id, t1.body.id)
    assert.equal(failedEmail.body.items[0].company_id, companyA.id)
    assert.equal(failedEmail.body.items[0].details.reason, 'SMTP 未配置')

    // 审计按工单检索：完整动作序列可追溯。
    const events = await request(base, 'GET', `/api/audit-events?ticket_id=${t1.body.id}`, { token: opsToken })
    const actions = events.body.items.map((item) => item.action).sort()
    assert.deepEqual(actions, ['email.notification_failed', 'ticket.auto_assigned', 'ticket.completed', 'ticket.created', 'ticket.replied', 'ticket.replied', 'ticket.transferred'])
    for (const item of events.body.items) {
      assert.ok(item.id)
      assert.ok(item.actor_user_id)
      assert.equal(typeof item.actor_name, 'string')
      assert.match(item.occurred_at, ISO_TIME)
      assert.ok(item.details && typeof item.details === 'object')
    }
  })
})

test('满意度评价、提交人视图、统计口径与审计检索', async () => {
  await withTicketSystem(async (base) => {
    const { opsToken, aSubmitter, aHandler, bSubmitter, companyA, companyB } = await buildFixture(base)

    const t1 = await createTicket(base, aSubmitter.token)
    // 无回复样本 → 平均响应时间为 null（口径：创建 → 首条回复）。
    const before = await request(base, 'GET', '/api/statistics/dashboard', { token: aHandler.token })
    assert.equal(before.status, 200)
    assert.equal(before.body.ticket_volume.total, 1)
    assert.equal(before.body.ticket_volume.by_status.in_progress, 1)
    assert.equal(before.body.avg_response_time_minutes, null)
    assert.equal(before.body.satisfaction.average, null)
    assert.equal(before.body.satisfaction.rated_count, 0)
    assert.equal(before.body.satisfaction.completed_count, 0)

    assert.equal((await request(base, 'POST', `/api/tickets/${t1.body.id}/replies`, { token: aSubmitter.token, body: { content: '请尽快处理' } })).status, 201)
    assert.equal((await request(base, 'POST', `/api/tickets/${t1.body.id}/complete`, { token: aHandler.token, body: { resolution: 'done' } })).status, 200)

    // 满意度评价：仅提交人、完成后一次。
    const rating = await request(base, 'POST', `/api/tickets/${t1.body.id}/rating`, { token: aSubmitter.token, body: { score: 5, comment: '处理很快' } })
    assert.equal(rating.status, 201)
    assert.equal(rating.body.ticket_id, t1.body.id)
    assert.equal(rating.body.score, 5)
    assert.equal(rating.body.comment, '处理很快')
    assert.match(rating.body.created_at, ISO_TIME)
    assert.equal((await request(base, 'POST', `/api/tickets/${t1.body.id}/rating`, { token: aSubmitter.token, body: { score: 4 } })).body.error.code, 'ALREADY_RATED')
    assert.equal((await request(base, 'POST', `/api/tickets/${t1.body.id}/rating`, { token: aHandler.token, body: { score: 4 } })).status, 403)
    assert.equal((await request(base, 'POST', `/api/tickets/${t1.body.id}/rating`, { token: bSubmitter.token, body: { score: 4 } })).status, 404)
    const detail = await request(base, 'GET', `/api/tickets/${t1.body.id}`, { token: aSubmitter.token })
    assert.deepEqual(detail.body.rating, { score: 5, comment: '处理很快', created_at: rating.body.created_at })

    // 未完成工单不可评价。
    const t2 = await createTicket(base, aSubmitter.token, { subject: '页面缓慢', category: '性能问题', priority: 'P3' })
    assert.equal((await request(base, 'POST', `/api/tickets/${t2.body.id}/rating`, { token: aSubmitter.token, body: { score: 3 } })).body.error.code, 'INVALID_STATE')

    // 提交人完整视图：处理视角含公司、部门与历史工单（倒序）。
    const t3 = await createTicket(base, bSubmitter.token, { subject: '乙公司问题', category: '其他', priority: 'P4' })
    const view = await request(base, 'GET', `/api/tickets/${t1.body.id}/submitter`, { token: aHandler.token })
    assert.equal(view.status, 200)
    assert.equal(view.body.user_id, aSubmitter.id)
    assert.equal(view.body.display_name, 'Alice')
    assert.equal(view.body.email, 'alice@corp-a.test')
    assert.deepEqual(view.body.company, { id: companyA.id, name: '甲公司' })
    assert.equal(view.body.department, '研发部')
    const history = view.body.history
    assert.equal(history.length, 2)
    assert.ok(history[0].created_at >= history[1].created_at)
    assert.ok(history.every((item) => item.ticket_no && item.subject && item.status && item.priority && item.created_at))
    assert.equal((await request(base, 'GET', `/api/tickets/${t1.body.id}/submitter`, { token: bSubmitter.token })).status, 404)
    assert.equal((await request(base, 'GET', `/api/tickets/${t1.body.id}/submitter`, { token: aSubmitter.token })).status, 200)

    // 分布统计：公司维度与部门维度（NULL → 未填写由部门非空用户覆盖）。
    const companyDist = await request(base, 'GET', '/api/statistics/distribution?dimension=company', { token: opsToken })
    assert.equal(companyDist.status, 200)
    assert.deepEqual(
      companyDist.body.items.map((item) => ({ key: item.key, label: item.label, count: item.count })),
      [
        { key: companyA.id, label: '甲公司', count: 2 },
        { key: companyB.id, label: '乙公司', count: 1 },
      ],
    )
    const deptDist = await request(base, 'GET', '/api/statistics/distribution?dimension=department', { token: opsToken })
    assert.deepEqual(
      deptDist.body.items.map((item) => ({ label: item.label, count: item.count })),
      [
        { label: '研发部', count: 2 },
        { label: '市场部', count: 1 },
      ],
    )
    assert.equal((await request(base, 'GET', '/api/statistics/distribution?dimension=company', { token: aSubmitter.token })).status, 403)
    assert.equal((await request(base, 'GET', '/api/statistics/distribution?dimension=company&company_id=' + companyB.id, { token: aHandler.token })).status, 403)
    const handlerCompanyDist = await request(base, 'GET', '/api/statistics/distribution?dimension=company&company_id=' + companyA.id, { token: aHandler.token })
    assert.deepEqual(handlerCompanyDist.body.items, [{ key: companyA.id, label: '甲公司', count: 2 }])

    // 仪表盘：工单量/状态、平均响应时间（存在回复样本 → 非 null）、满意度、热点分类。
    const dashboard = await request(base, 'GET', '/api/statistics/dashboard', { token: aHandler.token })
    assert.deepEqual(dashboard.body.ticket_volume, { total: 2, by_status: { created: 0, pending_assignment: 1, in_progress: 0, completed: 1, cancelled: 0 } })
    assert.equal(typeof dashboard.body.avg_response_time_minutes, 'number')
    assert.ok(dashboard.body.avg_response_time_minutes >= 0)
    assert.deepEqual(dashboard.body.satisfaction, { average: 5, rated_count: 1, completed_count: 1 })
    assert.deepEqual(dashboard.body.hot_categories, [
      { category: '功能使用', count: 1 },
      { category: '性能问题', count: 1 },
    ])
    const opsDashboard = await request(base, 'GET', '/api/statistics/dashboard', { token: opsToken })
    assert.equal(opsDashboard.body.ticket_volume.total, 3)
    const opsDashboardB = await request(base, 'GET', '/api/statistics/dashboard?company_id=' + companyB.id, { token: opsToken })
    assert.deepEqual(opsDashboardB.body.ticket_volume, { total: 1, by_status: { created: 0, pending_assignment: 1, in_progress: 0, completed: 0, cancelled: 0 } })
    assert.equal((await request(base, 'GET', '/api/statistics/dashboard?company_id=' + companyB.id, { token: aHandler.token })).status, 403)
    assert.equal((await request(base, 'GET', '/api/statistics/dashboard', { token: aSubmitter.token })).status, 403)

    // 审计检索：动作过滤、公司过滤、分页；handler 强制本公司；submitter 403。
    const t1Events = await request(base, 'GET', `/api/audit-events?ticket_id=${t1.body.id}`, { token: opsToken })
    assert.deepEqual(
      t1Events.body.items.map((item) => item.action).sort(),
      ['email.notification_failed', 'ticket.auto_assigned', 'ticket.completed', 'ticket.created', 'ticket.rated', 'ticket.replied'],
    )
    const createdEvents = await request(base, 'GET', '/api/audit-events?action=ticket.created', { token: opsToken })
    assert.equal(createdEvents.body.total, 3)
    const bEvents = await request(base, 'GET', '/api/audit-events?company_id=' + companyB.id, { token: opsToken })
    assert.equal(bEvents.body.total, 1)
    assert.equal(bEvents.body.items[0].action, 'ticket.created')
    const pagedEvents = await request(base, 'GET', '/api/audit-events?page_size=2&page=1', { token: opsToken })
    assert.equal(pagedEvents.body.items.length, 2)
    assert.equal(pagedEvents.body.page, 1)
    assert.equal(pagedEvents.body.page_size, 2)
    assert.ok(pagedEvents.body.total > 2)
    const handlerEvents = await request(base, 'GET', '/api/audit-events', { token: aHandler.token })
    assert.ok(handlerEvents.body.items.length > 0)
    assert.ok(handlerEvents.body.items.every((item) => item.company_id === companyA.id))
    assert.equal((await request(base, 'GET', '/api/audit-events?company_id=' + companyB.id, { token: aHandler.token })).status, 403)
    assert.equal((await request(base, 'GET', '/api/audit-events', { token: aSubmitter.token })).status, 403)

    // PATCH 用户档案：display_name/department/role 可更新，company_id 不可变更。
    const patched = await request(base, 'PATCH', `/api/admin/users/${aSubmitter.id}`, {
      token: opsToken,
      body: { display_name: 'Alice Lee', department: '产品部', role: 'handler' },
    })
    assert.equal(patched.status, 200)
    assert.deepEqual(patched.body, { user_id: aSubmitter.id, email: 'alice@corp-a.test', display_name: 'Alice Lee', company_id: companyA.id, department: '产品部', role: 'handler' })
    const meAfter = await request(base, 'GET', '/api/auth/me', { token: aSubmitter.token })
    assert.equal(meAfter.body.display_name, 'Alice Lee')
    assert.equal(meAfter.body.role, 'handler')
    assert.equal((await request(base, 'PATCH', `/api/admin/users/${aSubmitter.id}`, { token: opsToken, body: { company_id: companyB.id } })).status, 400)
    assert.equal((await request(base, 'PATCH', '/api/admin/users/not-exists', { token: opsToken, body: { role: 'ops' } })).status, 404)
    assert.equal((await request(base, 'PATCH', `/api/admin/users/${aSubmitter.id}`, { token: aHandler.token, body: { role: 'ops' } })).status, 403)
  })
})
