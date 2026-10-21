// 工单系统服务端集成测试：经 test/with-http-server.mjs 启动隔离 HTTP 服务与独立 DB_PATH，
// 完成通知邮件用本地可捕获的测试 SMTP 服务验证收件内容与失败语义（契约第 7 节）。
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createApp } from '../src/server/app.ts'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'
import { registerProtectedRoutes, registerPublicRoutes } from '../src/server/routes.ts'
import { SEED_PASSWORD } from '../src/server/seed.ts'
import { withHttpServer } from './with-http-server.mjs'
import { startSmtpCaptureServer } from './smtp-server.mjs'

const ADMIN = 'company-a-admin@company-a.test'
const SUBMITTER_1 = 'company-a-submitter-1@company-a.test'
const SUBMITTER_2 = 'company-a-submitter-2@company-a.test'
const HANDLER = 'company-a-handler@company-a.test'
const SUBMITTER_B = 'company-b-submitter@company-b.test'
const NO_ORG_USER = 'no-org@ticket-system.test'
const NO_ORG_PASSWORD = 'NoOrg#Passw0rd123'

const state = {}
let smtp
let platform
let app
const tokenCache = new Map()

async function getAuth(baseUrl, username, password = SEED_PASSWORD) {
  if (tokenCache.has(username)) return tokenCache.get(username)
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  assert.equal(response.status, 200, `login failed for ${username}`)
  const body = await response.json()
  assert.equal(typeof body.token, 'string')
  assert.equal(body.user.email, username.toLowerCase())
  tokenCache.set(username, body.token)
  return body.token
}

async function api(baseUrl, token, method, pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let json = null
  try {
    json = await response.json()
  } catch {
    json = null
  }
  return { status: response.status, body: json }
}

const serve = (verify) => withHttpServer({ fetch: app.fetch, close: undefined }, verify)

before(async () => {
  smtp = await startSmtpCaptureServer()
  const dbDir = await mkdtemp(path.join(tmpdir(), 'ticket-http-'))
  state.dbDir = dbDir
  process.env.DB_PATH = path.join(dbDir, 'application.db')
  process.env.SMTP_HOST = '127.0.0.1'
  process.env.SMTP_PORT = String(smtp.port)
  process.env.SENDER_ADDRESS = 'noreply@ticket-system.test'
  process.env.JWT_SECRET = 'test-secret-for-http-verification'
  platform = await initializePlatform()
  app = createApp({
    registerPublicRoutes: (routes) => registerPublicRoutes(routes, platform),
    registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
    protect: platform.auth.requireAnyAuth,
  })
})

after(async () => {
  await platform.close()
  await smtp.close()
  await rm(state.dbDir, { recursive: true, force: true })
})

test('认证边界：未认证返回 401 统一错误形状，错误凭证返回 401', async () => {
  await serve(async (baseUrl) => {
    const unauthenticated = await api(baseUrl, null, 'GET', '/api/tickets')
    assert.equal(unauthenticated.status, 401)
    assert.equal(unauthenticated.body.error.code, 'UNAUTHENTICATED')
    assert.equal(typeof unauthenticated.body.error.message, 'string')

    const badCredentials = await api(baseUrl, null, 'POST', '/api/auth/login', { username: ADMIN, password: 'wrong-password' })
    assert.equal(badCredentials.status, 401)
    assert.equal(badCredentials.body.error.code, 'INVALID_CREDENTIALS')

    const missingPassword = await api(baseUrl, null, 'POST', '/api/auth/login', { username: ADMIN })
    assert.equal(missingPassword.status, 400)
    assert.equal(missingPassword.body.error.code, 'INVALID_INPUT')
  })
})

test('种子账号可登录并读取组织档案（me 扩展）', async () => {
  await serve(async (baseUrl) => {
    const token = await getAuth(baseUrl, ADMIN)
    const me = await api(baseUrl, token, 'GET', '/api/auth/me')
    assert.equal(me.status, 200)
    assert.equal(me.body.user.email, ADMIN)
    assert.equal(me.body.org.companyName, '公司A')
    assert.equal(me.body.org.department, '管理部')
    assert.equal(me.body.org.isCompanyAdmin, true)
    assert.deepEqual(me.body.groups, [])

    const bToken = await getAuth(baseUrl, SUBMITTER_B)
    const bMe = await api(baseUrl, bToken, 'GET', '/api/auth/me')
    assert.equal(bMe.body.org.companyName, '公司B')
    assert.equal(bMe.body.org.isCompanyAdmin, false)

    const logout = await api(baseUrl, token, 'POST', '/api/auth/logout')
    assert.equal(logout.status, 204)
  })
})

test('组织配置：分类目录、业务组、成员、分配规则与用户目录（契约第 4 节）', async () => {
  await serve(async (baseUrl) => {
    const admin = await getAuth(baseUrl, ADMIN)
    const submitter1 = await getAuth(baseUrl, SUBMITTER_1)

    // 4.1 固定分类集合
    const categories = await api(baseUrl, submitter1, 'GET', '/api/categories')
    assert.equal(categories.status, 200)
    assert.deepEqual(categories.body.map((category) => category.name), ['账号与权限', '功能缺陷', '数据问题', '性能问题', '集成对接', '使用咨询'])
    const categoryByName = new Map(categories.body.map((category) => [category.name, category.id]))

    // 4.8 用户目录（管理员权限）
    const forbiddenUsers = await api(baseUrl, submitter1, 'GET', '/api/users?companyId=1')
    assert.equal(forbiddenUsers.status, 403)
    const companyA = await api(baseUrl, admin, 'GET', '/api/users?companyId=1')
    assert.equal(companyA.status, 200)
    const directory = new Map(companyA.body.map((user) => [user.email, user]))
    assert.equal(companyA.body.length, 5)
    assert.equal(directory.get(SUBMITTER_1).org.companyName, '公司A')
    assert.equal(directory.get(SUBMITTER_1).org.department, '研发部')
    assert.equal(directory.get(SUBMITTER_B).org.companyName, '公司B')
    assert.equal(directory.get(HANDLER).org.isCompanyAdmin, false)

    // 4.2 创建业务组
    const missingCompany = await api(baseUrl, admin, 'POST', '/api/groups', { companyId: 999, name: '不存在的公司' })
    assert.equal(missingCompany.status, 422)
    const forbiddenCreate = await api(baseUrl, submitter1, 'POST', '/api/groups', { companyId: 1, name: '越权组' })
    assert.equal(forbiddenCreate.status, 403)

    const group1 = await api(baseUrl, admin, 'POST', '/api/groups', { companyId: 1, name: '一线支持组' })
    assert.equal(group1.status, 201)
    assert.equal(group1.body.companyId, 1)
    assert.deepEqual(group1.body.members, [])
    const group2 = await api(baseUrl, admin, 'POST', '/api/groups', { companyId: 1, name: '二线支持组' })
    assert.equal(group2.status, 201)
    state.group1 = group1.body
    state.group2 = group2.body

    const duplicateGroup = await api(baseUrl, admin, 'POST', '/api/groups', { companyId: 1, name: '一线支持组' })
    assert.equal(duplicateGroup.status, 409)
    assert.equal(duplicateGroup.body.error.code, 'DUPLICATE')

    // 4.4 设置成员（全量替换，可跨公司）
    const handlerId = directory.get(HANDLER).id
    const submitterBId = directory.get(SUBMITTER_B).id
    const members1 = await api(baseUrl, admin, 'PUT', `/api/groups/${group1.body.id}/members`, { userIds: [handlerId] })
    assert.equal(members1.status, 200)
    assert.deepEqual(members1.body.members, [{ userId: handlerId, name: '王五' }])
    const members2 = await api(baseUrl, admin, 'PUT', `/api/groups/${group2.body.id}/members`, { userIds: [submitterBId] })
    assert.equal(members2.status, 200)
    assert.deepEqual(members2.body.members.map((member) => member.name), ['钱七'])

    const missingMembers = await api(baseUrl, admin, 'PUT', `/api/groups/${group1.body.id}/members`, { userIds: ['not-a-user'] })
    assert.equal(missingMembers.status, 422)
    const missingGroup = await api(baseUrl, admin, 'PUT', '/api/groups/999999/members', { userIds: [handlerId] })
    assert.equal(missingGroup.status, 404)

    // 4.3 组列表含成员
    const groups = await api(baseUrl, admin, 'GET', '/api/groups?companyId=1')
    assert.equal(groups.status, 200)
    assert.equal(groups.body.length, 2)
    assert.ok(groups.body.find((group) => group.name === '一线支持组').members.length === 1)

    // 4.5 分配规则
    const bugCategoryId = categoryByName.get('功能缺陷')
    const rule = await api(baseUrl, admin, 'POST', '/api/assignment-rules', { companyId: 1, categoryId: bugCategoryId, groupId: group1.body.id })
    assert.equal(rule.status, 201)
    assert.equal(rule.body.companyId, 1)
    assert.equal(rule.body.category.name, '功能缺陷')
    assert.equal(rule.body.group.name, '一线支持组')

    const duplicateRule = await api(baseUrl, admin, 'POST', '/api/assignment-rules', { companyId: 1, categoryId: bugCategoryId, groupId: group2.body.id })
    assert.equal(duplicateRule.status, 409)
    const foreignGroupRule = await api(baseUrl, admin, 'POST', '/api/assignment-rules', { companyId: 1, categoryId: bugCategoryId, groupId: 999999 })
    assert.equal(foreignGroupRule.status, 422)
    const missingCategoryRule = await api(baseUrl, admin, 'POST', '/api/assignment-rules', { companyId: 1, categoryId: 999999, groupId: group1.body.id })
    assert.equal(missingCategoryRule.status, 422)

    // 4.6 规则列表
    const rules = await api(baseUrl, admin, 'GET', '/api/assignment-rules?companyId=1')
    assert.equal(rules.status, 200)
    assert.equal(rules.body.length, 1)
    assert.equal(rules.body[0].group.id, group1.body.id)

    // 4.7 设置用户组织档案（缺失分支；正向设置在创建工单流程中执行，以先验证 org 为 null 的行为）
    const noOrgUser = await api(baseUrl, admin, 'POST', '/api/admin/users', {
      name: '孙八',
      email: NO_ORG_USER,
      password: NO_ORG_PASSWORD,
    })
    assert.equal(noOrgUser.status, 201)
    state.noOrgUserId = noOrgUser.body.user.id

    const missingOrgUser = await api(baseUrl, admin, 'PUT', `/api/users/unknown-user-id/org`, { companyId: 1, department: '测试部' })
    assert.equal(missingOrgUser.status, 422)
    const setOrgBadCompany = await api(baseUrl, admin, 'PUT', `/api/users/${state.noOrgUserId}/org`, { companyId: 999, department: '测试部' })
    assert.equal(setOrgBadCompany.status, 422)
  })
})

test('创建工单：无组织档案 422、自动分配与校验（契约 3.1）', async () => {
  await serve(async (baseUrl) => {
    const submitter1 = await getAuth(baseUrl, SUBMITTER_1)
    const submitter2 = await getAuth(baseUrl, SUBMITTER_2)
    const submitterB = await getAuth(baseUrl, SUBMITTER_B)

    // 无 org 账户：登录后（先改密）创建工单 → 422
    const noOrgLogin = await api(baseUrl, null, 'POST', '/api/auth/login', { username: NO_ORG_USER, password: NO_ORG_PASSWORD })
    assert.equal(noOrgLogin.status, 200)
    const noOrgToken = noOrgLogin.body.token
    const noOrgMe = await api(baseUrl, noOrgToken, 'GET', '/api/auth/me')
    assert.equal(noOrgMe.body.org, null)
    const changePassword = await api(baseUrl, noOrgToken, 'POST', '/api/auth/password', { password: `${NO_ORG_PASSWORD}9` })
    assert.equal(changePassword.status, 200)
    state.noOrgPassword = `${NO_ORG_PASSWORD}9`
    const categories = await api(baseUrl, noOrgToken, 'GET', '/api/categories')
    const categoryId = categories.body.find((category) => category.name === '账号与权限').id
    const bugCategoryId = categories.body.find((category) => category.name === '功能缺陷').id
    const consultationCategoryId = categories.body.find((category) => category.name === '使用咨询').id
    state.categoryIds = { categoryId, bugCategoryId, consultationCategoryId }

    const noOrgCreate = await api(baseUrl, noOrgToken, 'POST', '/api/tickets', {
      subject: '无组织档案的工单',
      description: '提交人在设置组织档案前提交的工单',
      categoryId,
      priority: 'P3',
    })
    assert.equal(noOrgCreate.status, 422)
    assert.equal(noOrgCreate.body.error.code, 'VALIDATION_FAILED')

    // 4.7 正向：管理员设置组织档案后可创建工单
    const admin = await getAuth(baseUrl, ADMIN)
    const setOrg = await api(baseUrl, admin, 'PUT', `/api/users/${state.noOrgUserId}/org`, { companyId: 1, department: '测试部', isCompanyAdmin: false })
    assert.equal(setOrg.status, 200)
    assert.equal(setOrg.body.companyName, '公司A')
    assert.equal(setOrg.body.department, '测试部')
    assert.equal(setOrg.body.isCompanyAdmin, false)
    const orgSet = await api(baseUrl, noOrgToken, 'GET', '/api/auth/me')
    assert.equal(orgSet.body.org.department, '测试部')

    // 3.1 命中规则：自动分配
    const autoAssigned = await api(baseUrl, submitter1, 'POST', '/api/tickets', {
      subject: 'Login Issue for QA',
      description: '登录页在 QA 环境偶发 500，请排查。',
      categoryId: bugCategoryId,
      priority: 'P1',
    })
    assert.equal(autoAssigned.status, 201)
    state.ticketA1 = autoAssigned.body
    assert.equal(autoAssigned.body.status, 'pending')
    assert.equal(autoAssigned.body.assignedGroup.name, '一线支持组')
    assert.equal(autoAssigned.body.category.name, '功能缺陷')
    assert.equal(autoAssigned.body.company.name, '公司A')
    assert.equal(autoAssigned.body.submitter.name, '张三')
    assert.equal(autoAssigned.body.submitter.email, SUBMITTER_1)
    assert.equal(autoAssigned.body.submitter.department, '研发部')
    assert.equal(autoAssigned.body.handler, null)
    assert.equal(autoAssigned.body.handledAt, null)
    assert.equal(autoAssigned.body.ratingScore, null)
    assert.deepEqual(autoAssigned.body.replies, [])
    assert.equal(autoAssigned.body.rating, null)
    assert.ok(typeof autoAssigned.body.createdAt === 'string' && autoAssigned.body.createdAt.endsWith('Z'))
    assert.ok(autoAssigned.body.id > 0)

    // 3.1 未命中规则：待分配
    const awaiting = await api(baseUrl, submitter1, 'POST', '/api/tickets', {
      subject: '如何导出报表数据',
      description: '请提供导出报表的操作说明。',
      categoryId: consultationCategoryId,
      priority: 'P2',
    })
    assert.equal(awaiting.status, 201)
    state.ticketA2 = awaiting.body
    assert.equal(awaiting.body.status, 'awaiting_assignment')
    assert.equal(awaiting.body.assignedGroup, null)

    // 其他提交人工单（用于排序与统计）
    const secondSubmitterTicket = await api(baseUrl, submitter2, 'POST', '/api/tickets', {
      subject: 'P0 紧急：结算失败',
      description: '结算批次失败，影响客户付款。',
      categoryId: bugCategoryId,
      priority: 'P0',
    })
    assert.equal(secondSubmitterTicket.status, 201)
    state.ticketA3 = secondSubmitterTicket.body

    // 公司B 工单（无规则，待分配）
    const companyBTicket = await api(baseUrl, submitterB, 'POST', '/api/tickets', {
      subject: '采购合同附件无法上传',
      description: '上传合同附件时报错。',
      categoryId: bugCategoryId,
      priority: 'P3',
    })
    assert.equal(companyBTicket.status, 201)
    state.ticketB1 = companyBTicket.body
    assert.equal(companyBTicket.body.company.name, '公司B')
    assert.equal(companyBTicket.body.status, 'awaiting_assignment')

    // 无 org 用户（已设置 org）创建：待分配
    const noOrgTicket = await api(baseUrl, noOrgToken, 'POST', '/api/tickets', {
      subject: '账号锁定咨询',
      description: '账号被锁定，请求解锁。',
      categoryId,
      priority: 'P4',
    })
    assert.equal(noOrgTicket.status, 201)
    state.ticketA4 = noOrgTicket.body

    // 校验错误
    const missingCategory = await api(baseUrl, submitter1, 'POST', '/api/tickets', {
      subject: '分类不存在',
      description: '内容',
      categoryId: 999999,
      priority: 'P1',
    })
    assert.equal(missingCategory.status, 400)
    const badPriority = await api(baseUrl, submitter1, 'POST', '/api/tickets', {
      subject: '优先级非法',
      description: '内容',
      categoryId: bugCategoryId,
      priority: 'P9',
    })
    assert.equal(badPriority.status, 422)
    const missingSubject = await api(baseUrl, submitter1, 'POST', '/api/tickets', {
      description: '缺少主题',
      categoryId: bugCategoryId,
      priority: 'P1',
    })
    assert.equal(missingSubject.status, 422)
    const longSubject = await api(baseUrl, submitter1, 'POST', '/api/tickets', {
      subject: 'x'.repeat(201),
      description: '主题超长',
      categoryId: bugCategoryId,
      priority: 'P1',
    })
    assert.equal(longSubject.status, 422)
  })
})

test('公司隔离：列表、搜索与详情对跨公司工单不可见（AC-03）', async () => {
  await serve(async (baseUrl) => {
    const submitter1 = await getAuth(baseUrl, SUBMITTER_1)
    const submitterB = await getAuth(baseUrl, SUBMITTER_B)

    const list = await api(baseUrl, submitter1, 'GET', '/api/tickets')
    assert.equal(list.status, 200)
    assert.ok(list.body.tickets.length >= 4)
    for (const ticket of list.body.tickets) {
      assert.equal(ticket.company.name, '公司A')
    }
    const companyBIds = list.body.tickets.map((ticket) => ticket.id)
    assert.ok(!companyBIds.includes(state.ticketB1.id))

    const search = await api(baseUrl, submitter1, 'GET', `/api/tickets?q=${encodeURIComponent('采购合同附件无法上传')}`)
    assert.equal(search.status, 200)
    assert.ok(!search.body.tickets.some((ticket) => ticket.id === state.ticketB1.id))

    const direct = await api(baseUrl, submitter1, 'GET', `/api/tickets/${state.ticketB1.id}`)
    assert.equal(direct.status, 404)
    assert.equal(direct.body.error.code, 'NOT_FOUND')

    const history = await api(baseUrl, submitter1, 'GET', `/api/tickets/${state.ticketB1.id}/submitter-history`)
    assert.equal(history.status, 404)

    // 公司B 提交人看不到公司A 工单（G1 归属，非其成员组）
    const reverse = await api(baseUrl, submitterB, 'GET', `/api/tickets/${state.ticketA3.id}`)
    assert.equal(reverse.status, 404)
  })
})

test('列表：状态过滤（工作台）、搜索与排序（AC-10）', async () => {
  await serve(async (baseUrl) => {
    const handler = await getAuth(baseUrl, HANDLER)
    const submitter1 = await getAuth(baseUrl, SUBMITTER_1)

    const workbench = await api(baseUrl, handler, 'GET', '/api/tickets?status=pending')
    assert.equal(workbench.status, 200)
    const workbenchIds = workbench.body.tickets.map((ticket) => ticket.id)
    assert.ok(workbenchIds.includes(state.ticketA1.id))
    assert.ok(workbenchIds.includes(state.ticketA3.id))
    assert.ok(!workbenchIds.includes(state.ticketA2.id))
    assert.ok(!workbenchIds.includes(state.ticketB1.id))
    for (const ticket of workbench.body.tickets) {
      assert.equal(ticket.status, 'pending')
    }

    const invalidStatus = await api(baseUrl, handler, 'GET', '/api/tickets?status=unknown')
    assert.equal(invalidStatus.status, 400)

    // 搜索：工单 id 精确
    const byId = await api(baseUrl, submitter1, 'GET', `/api/tickets?q=${state.ticketA1.id}`)
    assert.deepEqual(byId.body.tickets.map((ticket) => ticket.id), [state.ticketA1.id])

    // 搜索：subject 不区分大小写子串
    const bySubject = await api(baseUrl, submitter1, 'GET', `/api/tickets?q=${encodeURIComponent('login issue')}`)
    assert.deepEqual(bySubject.body.tickets.map((ticket) => ticket.id), [state.ticketA1.id])

    // 搜索：提交人姓名子串
    const bySubmitter = await api(baseUrl, submitter1, 'GET', `/api/tickets?q=${encodeURIComponent('李四')}`)
    assert.deepEqual(bySubmitter.body.tickets.map((ticket) => ticket.id), [state.ticketA3.id])

    // 排序：priority_asc → P0 最前
    const priorityAsc = await api(baseUrl, submitter1, 'GET', '/api/tickets?sort=priority_asc')
    assert.equal(priorityAsc.body.tickets[0].priority, 'P0')
    assert.equal(priorityAsc.body.tickets[0].id, state.ticketA3.id)

    const priorityDesc = await api(baseUrl, submitter1, 'GET', '/api/tickets?sort=priority_desc')
    assert.equal(priorityDesc.body.tickets[0].priority, 'P4')

    // 排序：created_at_asc vs 默认 desc
    const createdAtAsc = await api(baseUrl, submitter1, 'GET', '/api/tickets?sort=created_at_asc')
    assert.equal(createdAtAsc.body.tickets[0].id, state.ticketA1.id)
    const defaultSort = await api(baseUrl, submitter1, 'GET', '/api/tickets')
    assert.equal(defaultSort.body.tickets[0].id, state.ticketA4.id)

    // 公司筛选在可见范围内生效
    const handlerList = await api(baseUrl, handler, 'GET', '/api/tickets?companyId=1')
    assert.ok(handlerList.body.tickets.every((ticket) => ticket.company.id === 1))
  })
})

test('详情与提交人完整信息、历史工单（AC-07 前半）', async () => {
  await serve(async (baseUrl) => {
    const submitter1 = await getAuth(baseUrl, SUBMITTER_1)
    const handler = await getAuth(baseUrl, HANDLER)

    const detail = await api(baseUrl, submitter1, 'GET', `/api/tickets/${state.ticketA1.id}`)
    assert.equal(detail.status, 200)
    assert.equal(detail.body.id, state.ticketA1.id)
    assert.equal(detail.body.description, '登录页在 QA 环境偶发 500，请排查。')
    assert.deepEqual(detail.body.replies, [])

    const handlerDetail = await api(baseUrl, handler, 'GET', `/api/tickets/${state.ticketA1.id}`)
    assert.equal(handlerDetail.status, 200)

    const history = await api(baseUrl, handler, 'GET', `/api/tickets/${state.ticketA1.id}/submitter-history`)
    assert.equal(history.status, 200)
    assert.equal(history.body.submitter.name, '张三')
    assert.equal(history.body.submitter.email, SUBMITTER_1)
    assert.equal(history.body.submitter.company.name, '公司A')
    assert.equal(history.body.submitter.department, '研发部')
    const historyIds = history.body.tickets.map((ticket) => ticket.id)
    assert.ok(historyIds.includes(state.ticketA1.id))
    assert.ok(historyIds.includes(state.ticketA2.id))
    // 按创建时间降序：A2 后创建
    assert.ok(historyIds.indexOf(state.ticketA2.id) < historyIds.indexOf(state.ticketA1.id))
    for (const ticket of history.body.tickets) {
      assert.ok(['subject', 'status', 'priority', 'createdAt'].every((field) => field in ticket))
    }
  })
})

test('多轮回复：角色判定、first_reply_at 维护与参与权限（AC-02）', async () => {
  await serve(async (baseUrl) => {
    const submitter1 = await getAuth(baseUrl, SUBMITTER_1)
    const submitter2 = await getAuth(baseUrl, SUBMITTER_2)
    const handler = await getAuth(baseUrl, HANDLER)
    const submitterB = await getAuth(baseUrl, SUBMITTER_B)

    const submitterReply = await api(baseUrl, submitter1, 'POST', `/api/tickets/${state.ticketA1.id}/replies`, {
      content: '补充说明：QA 环境登录页 500 出现在每天凌晨。',
    })
    assert.equal(submitterReply.status, 201)
    assert.equal(submitterReply.body.side, 'submitter')
    assert.equal(submitterReply.body.author.name, '张三')
    assert.ok(submitterReply.body.id > 0)

    const handlerReply = await api(baseUrl, handler, 'POST', `/api/tickets/${state.ticketA1.id}/replies`, {
      content: '已复现，正在定位根因。',
    })
    assert.equal(handlerReply.status, 201)
    assert.equal(handlerReply.body.side, 'handler')

    // 同公司非参与者：可见但无权回复 → 403
    const nonParticipant = await api(baseUrl, submitter2, 'POST', `/api/tickets/${state.ticketA1.id}/replies`, { content: '路过' })
    assert.equal(nonParticipant.status, 403)

    // 跨公司不可见 → 404（公司B 提交人此时不是 G1/G2 成员组的该工单归属成员）
    const crossCompany = await api(baseUrl, submitterB, 'POST', `/api/tickets/${state.ticketA1.id}/replies`, { content: '越权回复' })
    assert.equal(crossCompany.status, 404)

    // 详情回复按时间升序
    const detail = await api(baseUrl, submitter1, 'GET', `/api/tickets/${state.ticketA1.id}`)
    assert.equal(detail.body.replies.length, 2)
    assert.ok(detail.body.replies[0].id < detail.body.replies[1].id)
    assert.equal(detail.body.replies[0].side, 'submitter')

    // 校验：缺失 400、超长 422
    const missingContent = await api(baseUrl, submitter1, 'POST', `/api/tickets/${state.ticketA1.id}/replies`, {})
    assert.equal(missingContent.status, 400)
    const longContent = await api(baseUrl, submitter1, 'POST', `/api/tickets/${state.ticketA1.id}/replies`, { content: 'x'.repeat(10001) })
    assert.equal(longContent.status, 422)
  })
})

test('手工分配：状态前置、公司组校验与权限（契约 3.6）', async () => {
  await serve(async (baseUrl) => {
    const admin = await getAuth(baseUrl, ADMIN)
    const submitter1 = await getAuth(baseUrl, SUBMITTER_1)

    const assigned = await api(baseUrl, admin, 'POST', `/api/tickets/${state.ticketA2.id}/assign`, { groupId: state.group2.id })
    assert.equal(assigned.status, 200)
    assert.equal(assigned.body.status, 'pending')
    assert.equal(assigned.body.assignedGroup.id, state.group2.id)

    // 已分配状态再次分配 → 409
    const alreadyAssigned = await api(baseUrl, admin, 'POST', `/api/tickets/${state.ticketA2.id}/assign`, { groupId: state.group1.id })
    assert.equal(alreadyAssigned.status, 409)
    assert.equal(alreadyAssigned.body.error.code, 'INVALID_STATE')

    // 非管理员 → 403（可见但无权）
    const forbiddenAssign = await api(baseUrl, submitter1, 'POST', `/api/tickets/${state.ticketA2.id}/assign`, { groupId: state.group1.id })
    assert.equal(forbiddenAssign.status, 403)

    // 组不属于该公司 → 422
    const foreignGroup = await api(baseUrl, admin, 'POST', `/api/tickets/${state.ticketA4.id}/assign`, { groupId: 999999 })
    assert.equal(foreignGroup.status, 422)
  })
})

test('转派：目标组校验、跨公司组员可见与日志（AC-06）', async () => {
  await serve(async (baseUrl) => {
    const handler = await getAuth(baseUrl, HANDLER)
    const submitter2 = await getAuth(baseUrl, SUBMITTER_2)
    const submitterB = await getAuth(baseUrl, SUBMITTER_B)

    const transferred = await api(baseUrl, handler, 'POST', `/api/tickets/${state.ticketA1.id}/transfer`, { targetGroupId: state.group2.id })
    assert.equal(transferred.status, 200)
    assert.equal(transferred.body.status, 'pending')
    assert.equal(transferred.body.assignedGroup.id, state.group2.id)

    // 工单已归属 G2：转派权在"当前归属组成员或该公司管理员"手中（handler 已非当前组成员，见下方 403 用例）
    // G2 成员（钱七）转派到相同组 → 409
    const sameGroup = await api(baseUrl, submitterB, 'POST', `/api/tickets/${state.ticketA1.id}/transfer`, { targetGroupId: state.group2.id })
    assert.equal(sameGroup.status, 409)

    // 目标组不存在 → 422
    const missingTarget = await api(baseUrl, submitterB, 'POST', `/api/tickets/${state.ticketA1.id}/transfer`, { targetGroupId: 999999 })
    assert.equal(missingTarget.status, 422)

    // 可见但非当前组成员非管理员 → 403
    const forbiddenTransfer = await api(baseUrl, submitter2, 'POST', `/api/tickets/${state.ticketA1.id}/transfer`, { targetGroupId: state.group1.id })
    assert.equal(forbiddenTransfer.status, 403)

    // 转派后原组成员（王五）不再持有该工单的转派权 → 403
    const handlerAfterTransfer = await api(baseUrl, handler, 'POST', `/api/tickets/${state.ticketA1.id}/transfer`, { targetGroupId: state.group1.id })
    assert.equal(handlerAfterTransfer.status, 403)

    // G2 成员（公司B 提交人）转派后可见
    const memberVisible = await api(baseUrl, submitterB, 'GET', `/api/tickets/${state.ticketA1.id}`)
    assert.equal(memberVisible.status, 200)
  })
})

test('完成处理：处理人记录、事务后邮件通知与失败不回滚（AC-07）', async () => {
  await serve(async (baseUrl) => {
    const handler = await getAuth(baseUrl, HANDLER)
    const submitter2 = await getAuth(baseUrl, SUBMITTER_2)
    const submitterB = await getAuth(baseUrl, SUBMITTER_B)

    // 可见但非当前归属组成员（handler 不在 G2）→ 403
    const forbiddenComplete = await api(baseUrl, handler, 'POST', `/api/tickets/${state.ticketA1.id}/complete`)
    assert.equal(forbiddenComplete.status, 403)

    // G2 成员（钱七）完成，邮件发提交人张三
    const completed = await api(baseUrl, submitterB, 'POST', `/api/tickets/${state.ticketA1.id}/complete`)
    assert.equal(completed.status, 200)
    assert.equal(completed.body.ticket.status, 'completed')
    assert.equal(completed.body.ticket.handler.name, '钱七')
    assert.ok(completed.body.ticket.handledAt.endsWith('Z'))
    assert.deepEqual(completed.body.notification, { emailSent: true, error: null })

    // 重复完成 → 409
    const alreadyCompleted = await api(baseUrl, submitterB, 'POST', `/api/tickets/${state.ticketA1.id}/complete`)
    assert.equal(alreadyCompleted.status, 409)

    // handler 完成 G1 归属的 A3，邮件发提交人李四
    const completedA3 = await api(baseUrl, handler, 'POST', `/api/tickets/${state.ticketA3.id}/complete`)
    assert.equal(completedA3.status, 200)
    assert.equal(completedA3.body.ticket.handler.name, '王五')
    assert.equal(completedA3.body.notification.emailSent, true)

    // 可见但无权（公司A 普通提交人）→ 403
    const forbiddenBySubmitter = await api(baseUrl, submitter2, 'POST', `/api/tickets/${state.ticketA2.id}/complete`)
    assert.equal(forbiddenBySubmitter.status, 403)

    // 邮件内容断言：收件人、主题、正文（工单ID、主题、完成时间）
    const messages = smtp.messages
    assert.equal(messages.length, 2)
    const first = messages.find((message) => message.to.includes(SUBMITTER_1))
    assert.ok(first, 'completion email to company-a-submitter-1')
    assert.equal(first.from, 'noreply@ticket-system.test')
    assert.equal(first.subject, `【工单完成】工单 #${state.ticketA1.id} Login Issue for QA`)
    assert.ok(first.text.includes(`#${state.ticketA1.id}`), 'mail text contains ticket id')
    assert.ok(first.text.includes('Login Issue for QA'), 'mail text contains subject')
    assert.ok(first.text.includes(completed.body.ticket.handledAt), 'mail text contains handledAt')
    const second = messages.find((message) => message.to.includes(SUBMITTER_2))
    assert.ok(second.text.includes(`#${state.ticketA3.id}`))
  })
})

test('满意度评价：每工单一次、范围与状态校验（AC-08）', async () => {
  await serve(async (baseUrl) => {
    const submitter1 = await getAuth(baseUrl, SUBMITTER_1)
    const submitter2 = await getAuth(baseUrl, SUBMITTER_2)
    const submitterB = await getAuth(baseUrl, SUBMITTER_B)

    const rated = await api(baseUrl, submitter1, 'POST', `/api/tickets/${state.ticketA1.id}/rating`, { score: 5 })
    assert.equal(rated.status, 201)
    assert.equal(rated.body.score, 5)
    assert.ok(rated.body.createdAt.endsWith('Z'))

    const duplicateRating = await api(baseUrl, submitter1, 'POST', `/api/tickets/${state.ticketA1.id}/rating`, { score: 4 })
    assert.equal(duplicateRating.status, 409)
    assert.equal(duplicateRating.body.error.code, 'DUPLICATE')

    // 可见但非提交人 → 403（钱七是 G2 成员）
    const forbiddenRating = await api(baseUrl, submitterB, 'POST', `/api/tickets/${state.ticketA1.id}/rating`, { score: 3 })
    assert.equal(forbiddenRating.status, 403)

    // 不可见工单 → 404（钱七不是 G1 成员）
    const invisibleRating = await api(baseUrl, submitterB, 'POST', `/api/tickets/${state.ticketA3.id}/rating`, { score: 3 })
    assert.equal(invisibleRating.status, 404)

    const ratedA3 = await api(baseUrl, submitter2, 'POST', `/api/tickets/${state.ticketA3.id}/rating`, { score: 4 })
    assert.equal(ratedA3.status, 201)

    const badScore = await api(baseUrl, submitter2, 'POST', `/api/tickets/${state.ticketA2.id}/rating`, { score: 6 })
    assert.equal(badScore.status, 422)
    const notCompleted = await api(baseUrl, submitter1, 'POST', `/api/tickets/${state.ticketA2.id}/rating`, { score: 5 })
    assert.equal(notCompleted.status, 409)

    const detail = await api(baseUrl, submitter1, 'GET', `/api/tickets/${state.ticketA1.id}`)
    assert.deepEqual(detail.body.rating, { score: 5, createdAt: rated.body.createdAt })
    assert.equal(detail.body.ratingScore, 5)
  })
})

test('取消工单：状态前置与权限（契约 3.9）', async () => {
  await serve(async (baseUrl) => {
    const submitter1 = await getAuth(baseUrl, SUBMITTER_1)
    const noOrgToken = await api(baseUrl, null, 'POST', '/api/auth/login', { username: NO_ORG_USER, password: state.noOrgPassword })
    assert.equal(noOrgToken.status, 200)

    // 提交人取消 pending 工单
    const cancelled = await api(baseUrl, submitter1, 'POST', `/api/tickets/${state.ticketA2.id}/cancel`)
    assert.equal(cancelled.status, 200)
    assert.equal(cancelled.body.status, 'cancelled')

    // 已取消再取消 → 409
    const alreadyCancelled = await api(baseUrl, submitter1, 'POST', `/api/tickets/${state.ticketA2.id}/cancel`)
    assert.equal(alreadyCancelled.status, 409)

    // 已完成工单取消 → 409
    const completedCancel = await api(baseUrl, submitter1, 'POST', `/api/tickets/${state.ticketA1.id}/cancel`)
    assert.equal(completedCancel.status, 409)

    // 非提交人非管理员 → 403
    const forbiddenCancel = await api(baseUrl, await getAuth(baseUrl, SUBMITTER_2), 'POST', `/api/tickets/${state.ticketA4.id}/cancel`)
    assert.equal(forbiddenCancel.status, 403)

    // awaiting_assignment 可被提交人取消
    const cancelledAwaiting = await api(baseUrl, noOrgToken.body.token, 'POST', `/api/tickets/${state.ticketA4.id}/cancel`)
    assert.equal(cancelledAwaiting.status, 200)
    assert.equal(cancelledAwaiting.body.status, 'cancelled')
  })
})

test('操作日志：全链路事件、操作人与脱敏（AC-11）', async () => {
  await serve(async (baseUrl) => {
    const submitterB = await getAuth(baseUrl, SUBMITTER_B)
    const submitter2 = await getAuth(baseUrl, SUBMITTER_2)

    const logs = await api(baseUrl, submitterB, 'GET', `/api/tickets/${state.ticketA1.id}/logs`)
    assert.equal(logs.status, 200)
    const events = logs.body.events
    const expectedTypes = [
      'ticket_created',
      'ticket_auto_assigned',
      'ticket_replied',
      'ticket_replied',
      'ticket_transferred',
      'ticket_completed',
      'ticket_email_sent',
      'ticket_rated',
    ]
    assert.deepEqual(events.map((event) => event.type), expectedTypes)
    for (const event of events) {
      assert.equal(event.ticketId, state.ticketA1.id)
      assert.ok(event.actor && event.actor.name.length > 0)
      assert.ok(event.createdAt.endsWith('Z'))
      assert.ok(event.id > 0)
    }

    const transferredEvent = events.find((event) => event.type === 'ticket_transferred')
    assert.equal(transferredEvent.detail.fromGroupId, state.group1.id)
    assert.equal(transferredEvent.detail.toGroupId, state.group2.id)

    const ratedEvent = events.find((event) => event.type === 'ticket_rated')
    assert.equal(ratedEvent.detail.score, 5)

    const emailEvent = events.find((event) => event.type === 'ticket_email_sent')
    assert.ok(emailEvent.detail.recipient.includes('***'))
    assert.ok(!emailEvent.detail.recipient.includes(SUBMITTER_1))

    const createdEvent = events.find((event) => event.type === 'ticket_created')
    assert.equal(createdEvent.actor.name, '张三')

    // 同公司用户可读日志；不可见工单日志 → 404
    const peerLogs = await api(baseUrl, submitter2, 'GET', `/api/tickets/${state.ticketA1.id}/logs`)
    assert.equal(peerLogs.status, 200)
    const invisibleLogs = await api(baseUrl, submitterB, 'GET', `/api/tickets/${state.ticketA3.id}/logs`)
    assert.equal(invisibleLogs.status, 404)
  })
})

test('统计：公司/部门分布与运营仪表盘（AC-09）', async () => {
  await serve(async (baseUrl) => {
    const handler = await getAuth(baseUrl, HANDLER)
    const submitter1 = await getAuth(baseUrl, SUBMITTER_1)
    const submitterB = await getAuth(baseUrl, SUBMITTER_B)

    // 普通提交人（非组员非管理员）→ 403
    const forbiddenStats = await api(baseUrl, submitter1, 'GET', '/api/stats/dashboard')
    assert.equal(forbiddenStats.status, 403)

    // handler：公司A 全部 ∪ G1 所辖
    const companyDistribution = await api(baseUrl, handler, 'GET', '/api/stats/distribution?dimension=company')
    assert.equal(companyDistribution.status, 200)
    assert.deepEqual(companyDistribution.body.items, [{ key: '公司A', count: 4 }])

    const departmentDistribution = await api(baseUrl, handler, 'GET', '/api/stats/distribution?dimension=department')
    const departmentMap = new Map(departmentDistribution.body.items.map((item) => [item.key, item.count]))
    assert.equal(departmentMap.get('研发部'), 2)
    assert.equal(departmentMap.get('市场部'), 1)
    assert.equal(departmentMap.get('测试部'), 1)

    // 钱七：公司B ∪ G2 所辖（跨公司）
    const bDistribution = await api(baseUrl, submitterB, 'GET', '/api/stats/distribution?dimension=company')
    assert.deepEqual(bDistribution.body.items, [
      { key: '公司A', count: 2 },
      { key: '公司B', count: 1 },
    ])
    const bFiltered = await api(baseUrl, submitterB, 'GET', '/api/stats/distribution?dimension=company&companyId=1')
    assert.deepEqual(bFiltered.body.items, [{ key: '公司A', count: 2 }])

    const handlerDashboard = await api(baseUrl, handler, 'GET', '/api/stats/dashboard')
    assert.equal(handlerDashboard.status, 200)
    assert.equal(handlerDashboard.body.volume, 4)
    assert.ok(handlerDashboard.body.avgResponseSeconds !== null && handlerDashboard.body.avgResponseSeconds >= 0)
    assert.equal(handlerDashboard.body.satisfactionAvg, 4.5)
    assert.equal(handlerDashboard.body.ratedCount, 2)
    assert.deepEqual(handlerDashboard.body.hotCategories, [
      { category: '功能缺陷', count: 2 },
      { category: '使用咨询', count: 1 },
      { category: '账号与权限', count: 1 },
    ])

    // 钱七范围内已评价工单只有 A1（5 分）
    const bDashboard = await api(baseUrl, submitterB, 'GET', '/api/stats/dashboard')
    assert.equal(bDashboard.body.volume, 3)
    assert.equal(bDashboard.body.satisfactionAvg, 5)
    assert.equal(bDashboard.body.ratedCount, 1)

    const invalidDimension = await api(baseUrl, handler, 'GET', '/api/stats/distribution?dimension=region')
    assert.equal(invalidDimension.status, 400)
  })
})

test('邮件失败语义：发送失败不回滚完成状态并记录失败审计（契约第 7 节）', async () => {
  const dbDir = await mkdtemp(path.join(tmpdir(), 'ticket-fail-'))
  const previous = { ...process.env }
  process.env.DB_PATH = path.join(dbDir, 'application.db')
  process.env.SMTP_HOST = '127.0.0.1'
  process.env.SMTP_PORT = '1'
  try {
    const failingPlatform = await initializePlatform()
    const failingApp = createApp({
      registerPublicRoutes: (routes) => registerPublicRoutes(routes, failingPlatform),
      registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, failingPlatform),
      protect: failingPlatform.auth.requireAnyAuth,
    })
    await withHttpServer({ fetch: failingApp.fetch, close: failingPlatform.close }, async (baseUrl) => {
      // 独立实例的用户 id 不同，直接登录而不复用实例一的 token 缓存。
      const login = async (username) => {
        const response = await fetch(`${baseUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username, password: SEED_PASSWORD }),
        })
        assert.equal(response.status, 200)
        return (await response.json()).token
      }
      const submitter1 = await login(SUBMITTER_1)
      const admin = await login(ADMIN)
      const handler = await login(HANDLER)

      const categories = await api(baseUrl, submitter1, 'GET', '/api/categories')
      const bugCategoryId = categories.body.find((category) => category.name === '功能缺陷').id
      const ticket = await api(baseUrl, submitter1, 'POST', '/api/tickets', {
        subject: '无法访问控制台',
        description: '控制台打不开。',
        categoryId: bugCategoryId,
        priority: 'P1',
      })
      assert.equal(ticket.status, 201)
      // 独立库无分配规则：工单待分配，由公司配置管理员手工分配后进入待处理。
      assert.equal(ticket.body.status, 'awaiting_assignment')

      const group = await api(baseUrl, admin, 'POST', '/api/groups', { companyId: 1, name: '失败实例支持组' })
      assert.equal(group.status, 201)
      const handlerProfile = await api(baseUrl, handler, 'GET', '/api/auth/me')
      const members = await api(baseUrl, admin, 'PUT', `/api/groups/${group.body.id}/members`, { userIds: [handlerProfile.body.user.id] })
      assert.equal(members.status, 200)
      const assigned = await api(baseUrl, admin, 'POST', `/api/tickets/${ticket.body.id}/assign`, { groupId: group.body.id })
      assert.equal(assigned.status, 200)
      assert.equal(assigned.body.status, 'pending')

      const completed = await api(baseUrl, handler, 'POST', `/api/tickets/${ticket.body.id}/complete`)
      assert.equal(completed.status, 200)
      assert.equal(completed.body.ticket.status, 'completed')
      assert.equal(completed.body.notification.emailSent, false)
      assert.ok(typeof completed.body.notification.error === 'string' && completed.body.notification.error.length > 0)

      const logs = await api(baseUrl, handler, 'GET', `/api/tickets/${ticket.body.id}/logs`)
      assert.equal(logs.status, 200)
      const failedEvent = logs.body.events.find((event) => event.type === 'ticket_email_failed')
      assert.ok(failedEvent, 'ticket_email_failed audit event recorded')
      assert.ok(failedEvent.detail.recipient.includes('***'))
      assert.ok(typeof failedEvent.detail.error === 'string')
      const detail = await api(baseUrl, handler, 'GET', `/api/tickets/${ticket.body.id}`)
      assert.equal(detail.body.status, 'completed')
    })
  } finally {
    for (const [key, value] of Object.entries(previous)) process.env[key] = value
    await rm(dbDir, { recursive: true, force: true })
  }
})

test('启动种子幂等：同一数据库二次初始化不重复创建账号（契约 6.2）', async () => {
  const dbDir = await mkdtemp(path.join(tmpdir(), 'ticket-seed-'))
  const previous = { ...process.env }
  process.env.DB_PATH = path.join(dbDir, 'application.db')
  process.env.SMTP_HOST = ''
  try {
    const first = await initializePlatform()
    const countAfterFirst = Number((await first.db.queryOne({ text: 'SELECT COUNT(*) AS total FROM users' }))?.total ?? 0)
    await first.close()
    const second = await initializePlatform()
    const countAfterSecond = Number((await second.db.queryOne({ text: 'SELECT COUNT(*) AS total FROM users' }))?.total ?? 0)
    const companies = (await second.db.queryAll({ text: 'SELECT name FROM companies ORDER BY id ASC' })).map((row) => row.name)
    await second.close()
    assert.equal(countAfterFirst, 5)
    assert.equal(countAfterSecond, 5)
    assert.deepEqual(companies, ['公司A', '公司B'])
  } finally {
    for (const [key, value] of Object.entries(previous)) process.env[key] = value
    await rm(dbDir, { recursive: true, force: true })
  }
})
