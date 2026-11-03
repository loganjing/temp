import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { createApp } from '../src/server/app.ts'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'
import { registerPublicRoutes, registerProtectedRoutes } from '../src/server/routes.ts'
import { withHttpServer } from './with-http-server.mjs'
import { withQaEnvironment } from './fixtures/qa-environment.mjs'

const PASSWORD = 'TestPassword123!'
const ts = () => new Date().toISOString()

async function setupTestData(platform, qaRunId) {
  const companyId = `${qaRunId}-co`
  const deptId = `${qaRunId}-dept`
  await platform.db.run({ text: 'INSERT INTO companies (id, name, created_at) VALUES (?, ?, ?)', params: [companyId, `Company-${qaRunId}`, ts()] })
  await platform.db.run({ text: 'INSERT INTO departments (id, company_id, name, created_at) VALUES (?, ?, ?, ?)', params: [deptId, companyId, `Dept-${qaRunId}`, ts()] })

  async function makeUser(name, email, role, dept) {
    const user = await platform.auth.userStore.create(
      { name, email, companyId, passwordChangeRequired: false },
      platform.auth.hashPassword(PASSWORD),
    )
    const profileId = randomUUID()
    await platform.db.run({
      text: 'INSERT INTO user_profiles (id, user_id, company_id, department_id, name, email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      params: [profileId, user.id, companyId, dept ?? null, name, email, ts()],
    })
    await platform.permissionKit.assignRole(user.id, role)
    return { userId: user.id, profileId, email }
  }

  const submitter = await makeUser('Submitter', `sub-${qaRunId}@test.com`, 'submitter', deptId)
  const handler = await makeUser('Handler', `hnd-${qaRunId}@test.com`, 'handler', null)
  const admin = await makeUser('Admin', `adm-${qaRunId}@test.com`, 'admin', null)

  // Create business group via domain function
  const groupId = randomUUID()
  await platform.db.run({ text: 'INSERT INTO business_groups (id, company_id, name, created_at) VALUES (?, ?, ?, ?)', params: [groupId, companyId, 'Tech Support', ts()] })
  await platform.db.run({ text: 'INSERT INTO business_group_members (id, group_id, user_id, created_at) VALUES (?, ?, ?, ?)', params: [randomUUID(), groupId, handler.profileId, ts()] })

  // Create assignment rule
  const ruleId = randomUUID()
  await platform.db.run({ text: 'INSERT INTO assignment_rules (id, company_id, category, target_group_id, created_at) VALUES (?, ?, ?, ?, ?)', params: [ruleId, companyId, '技术问题', groupId, ts()] })

  return { companyId, deptId, groupId, ruleId, submitter, handler, admin }
}

async function login(url, email) {
  const res = await fetch(`${url}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: email, password: PASSWORD }),
  })
  assert.equal(res.status, 200)
  const body = await res.json()
  return body.token
}

function authHeaders(token) {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

test('ticket system: full lifecycle — auth, CRUD, auto-assignment, transfer, complete, evaluation, statistics', async () => {
  await withQaEnvironment(async ({ qaRunId }) => {
    const platform = await initializePlatform()
    try {
      const data = await setupTestData(platform, qaRunId)
      const app = createApp({
        registerPublicRoutes: (routes) => registerPublicRoutes(routes, platform),
        registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
        protect: platform.auth.requireAnyAuth,
        enrichContext: platform.enrichContext,
      })

      await withHttpServer(app, async (url) => {
        // ─── Authentication ───
        const subToken = await login(url, data.submitter.email)
        const hndToken = await login(url, data.handler.email)
        const admToken = await login(url, data.admin.email)

        // GET /api/auth/me
        const me = await fetch(`${url}/api/auth/me`, { headers: authHeaders(subToken) })
        assert.equal(me.status, 200)
        const meBody = await me.json()
        assert.equal(meBody.role, 'submitter')
        assert.equal(meBody.companyId, data.companyId)
        assert.equal(meBody.departmentId, data.deptId)

        // POST /api/auth/logout
        const logout = await fetch(`${url}/api/auth/logout`, { method: 'POST', headers: authHeaders(subToken) })
        assert.equal(logout.status, 200)
        assert.deepEqual(await logout.json(), { ok: true })

        // ─── Ticket creation with auto-assignment ───
        const createRes = await fetch(`${url}/api/tickets`, {
          method: 'POST',
          headers: authHeaders(subToken),
          body: JSON.stringify({ subject: '无法登录', description: '系统提示密码错误', category: '技术问题', priority: 'P1' }),
        })
        assert.equal(createRes.status, 201)
        const ticket = await createRes.json()
        assert.equal(ticket.subject, '无法登录')
        assert.equal(ticket.status, 'pending_processing') // auto-assigned
        assert.equal(ticket.assignedGroupId, data.groupId)
        assert.equal(ticket.companyId, data.companyId)
        assert.equal(ticket.priority, 'P1')

        // ─── Ticket without matching rule stays pending_assignment ───
        const createRes2 = await fetch(`${url}/api/tickets`, {
          method: 'POST',
          headers: authHeaders(subToken),
          body: JSON.stringify({ subject: '报销流程咨询', description: '请问报销怎么提交', category: '财务问题', priority: 'P3' }),
        })
        assert.equal(createRes2.status, 201)
        const ticket2 = await createRes2.json()
        assert.equal(ticket2.status, 'pending_assignment')
        assert.equal(ticket2.assignedGroupId, null)

        // ─── Ticket list with filtering ───
        const listRes = await fetch(`${url}/api/tickets?status=pending_processing`, { headers: authHeaders(hndToken) })
        assert.equal(listRes.status, 200)
        const listBody = await listRes.json()
        assert.ok(listBody.total >= 1)
        assert.ok(listBody.items.every(t => t.status === 'pending_processing'))

        // ─── Ticket detail ───
        const detailRes = await fetch(`${url}/api/tickets/${ticket.id}`, { headers: authHeaders(subToken) })
        assert.equal(detailRes.status, 200)
        const detail = await detailRes.json()
        assert.equal(detail.id, ticket.id)
        assert.deepEqual(detail.replies, [])
        assert.equal(detail.evaluation, null)

        // ─── Reply ───
        const replyRes = await fetch(`${url}/api/tickets/${ticket.id}/replies`, {
          method: 'POST',
          headers: authHeaders(hndToken),
          body: JSON.stringify({ content: '请提供截图' }),
        })
        assert.equal(replyRes.status, 201)
        const reply = await replyRes.json()
        assert.equal(reply.content, '请提供截图')
        assert.equal(reply.replierName, 'Handler')

        // Submitter can also reply
        const reply2Res = await fetch(`${url}/api/tickets/${ticket.id}/replies`, {
          method: 'POST',
          headers: authHeaders(subToken),
          body: JSON.stringify({ content: '截图已上传' }),
        })
        assert.equal(reply2Res.status, 201)

        // ─── Transfer ───
        // Create a second group for transfer target
        const group2Id = randomUUID()
        await platform.db.run({ text: 'INSERT INTO business_groups (id, company_id, name, created_at) VALUES (?, ?, ?, ?)', params: [group2Id, data.companyId, 'Second Line', ts()] })

        const transferRes = await fetch(`${url}/api/tickets/${ticket.id}/transfer`, {
          method: 'POST',
          headers: authHeaders(hndToken),
          body: JSON.stringify({ targetGroupId: group2Id }),
        })
        assert.equal(transferRes.status, 200)
        const transferred = await transferRes.json()
        assert.equal(transferred.assignedGroupId, group2Id)
        assert.equal(transferred.status, 'pending_processing')

        // ─── Complete ───
        const completeRes = await fetch(`${url}/api/tickets/${ticket.id}/complete`, {
          method: 'POST',
          headers: authHeaders(hndToken),
          body: JSON.stringify({ summary: '问题已解决' }),
        })
        assert.equal(completeRes.status, 200)
        const completed = await completeRes.json()
        assert.equal(completed.status, 'completed')
        assert.ok(completed.handlerId)
        assert.ok(completed.completedAt)

        // ─── Evaluation ───
        const evalRes = await fetch(`${url}/api/tickets/${ticket.id}/evaluation`, {
          method: 'POST',
          headers: authHeaders(subToken),
          body: JSON.stringify({ rating: 5, comment: '处理很快' }),
        })
        assert.equal(evalRes.status, 201)
        const evaluation = await evalRes.json()
        assert.equal(evaluation.rating, 5)
        assert.equal(evaluation.comment, '处理很快')

        // Can't evaluate twice
        const eval2Res = await fetch(`${url}/api/tickets/${ticket.id}/evaluation`, {
          method: 'POST',
          headers: authHeaders(subToken),
          body: JSON.stringify({ rating: 3 }),
        })
        assert.equal(eval2Res.status, 400)
        const eval2Body = await eval2Res.json()
        assert.equal(eval2Body.error.code, 'already_evaluated')

        // GET evaluation
        const getEvalRes = await fetch(`${url}/api/tickets/${ticket.id}/evaluation`, { headers: authHeaders(subToken) })
        assert.equal(getEvalRes.status, 200)
        const getEval = await getEvalRes.json()
        assert.equal(getEval.rating, 5)

        // ─── Statistics ───
        const statsRes = await fetch(`${url}/api/statistics/overview`, { headers: authHeaders(admToken) })
        assert.equal(statsRes.status, 200)
        const stats = await statsRes.json()
        assert.ok(stats.totalTickets >= 2)
        assert.ok(stats.completedTickets >= 1)
        assert.ok(stats.hotCategories.length > 0)

        const distRes = await fetch(`${url}/api/statistics/distribution?dimension=company`, { headers: authHeaders(admToken) })
        assert.equal(distRes.status, 200)
        const dist = await distRes.json()
        assert.equal(dist.dimension, 'company')
        assert.ok(dist.items.length > 0)

        const distDeptRes = await fetch(`${url}/api/statistics/distribution?dimension=department`, { headers: authHeaders(admToken) })
        assert.equal(distDeptRes.status, 200)
        const distDept = await distDeptRes.json()
        assert.equal(distDept.dimension, 'department')

        // ─── Operation logs ───
        const logsRes = await fetch(`${url}/api/tickets/${ticket.id}/logs`, { headers: authHeaders(subToken) })
        assert.equal(logsRes.status, 200)
        const logs = await logsRes.json()
        assert.ok(logs.items.length >= 3) // created, assigned, transferred, completed
        const actions = logs.items.map(l => l.action)
        assert.ok(actions.includes('ticket_created'))
        assert.ok(actions.includes('ticket_completed'))

        // ─── Submitter profile ───
        const profileRes = await fetch(`${url}/api/users/${data.submitter.userId}/profile`, { headers: authHeaders(hndToken) })
        assert.equal(profileRes.status, 200)
        const profile = await profileRes.json()
        assert.equal(profile.name, 'Submitter')
        assert.ok(profile.companyName)
        assert.ok(profile.ticketHistory.length >= 2)

        // ─── Business groups management ───
        const bgRes = await fetch(`${url}/api/business-groups`, { headers: authHeaders(admToken) })
        assert.equal(bgRes.status, 200)
        const bgBody = await bgRes.json()
        assert.ok(bgBody.items.length >= 2)

        const createBgRes = await fetch(`${url}/api/business-groups`, {
          method: 'POST',
          headers: authHeaders(admToken),
          body: JSON.stringify({ name: 'New Group' }),
        })
        assert.equal(createBgRes.status, 201)
        const newGroup = await createBgRes.json()
        assert.equal(newGroup.name, 'New Group')
        assert.equal(newGroup.companyId, data.companyId)

        // ─── Assignment rules management ───
        const rulesRes = await fetch(`${url}/api/assignment-rules`, { headers: authHeaders(admToken) })
        assert.equal(rulesRes.status, 200)
        const rulesBody = await rulesRes.json()
        assert.ok(rulesBody.items.length >= 1)

        const createRuleRes = await fetch(`${url}/api/assignment-rules`, {
          method: 'POST',
          headers: authHeaders(admToken),
          body: JSON.stringify({ category: '网络问题', targetGroupId: newGroup.id }),
        })
        assert.equal(createRuleRes.status, 201)

        // Duplicate rule should fail
        const dupRuleRes = await fetch(`${url}/api/assignment-rules`, {
          method: 'POST',
          headers: authHeaders(admToken),
          body: JSON.stringify({ category: '技术问题', targetGroupId: newGroup.id }),
        })
        assert.equal(dupRuleRes.status, 400)
        assert.equal((await dupRuleRes.json()).error.code, 'duplicate_rule')

        // ─── Company isolation ───
        // Create a second company with its own user
        const company2Id = `${qaRunId}-co2`
        await platform.db.run({ text: 'INSERT INTO companies (id, name, created_at) VALUES (?, ?, ?)', params: [company2Id, 'Other Company', ts()] })
        const otherUser = await platform.auth.userStore.create(
          { name: 'Other Submitter', email: `other-${qaRunId}@test.com`, companyId: company2Id, passwordChangeRequired: false },
          platform.auth.hashPassword(PASSWORD),
        )
        await platform.db.run({
          text: 'INSERT INTO user_profiles (id, user_id, company_id, department_id, name, email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          params: [randomUUID(), otherUser.id, company2Id, null, 'Other Submitter', `other-${qaRunId}@test.com`, ts()],
        })
        await platform.permissionKit.assignRole(otherUser.id, 'submitter')
        const otherToken = await login(url, `other-${qaRunId}@test.com`)

        // Other company user cannot see first company's ticket
        const crossRes = await fetch(`${url}/api/tickets/${ticket.id}`, { headers: authHeaders(otherToken) })
        assert.equal(crossRes.status, 403)
        assert.equal((await crossRes.json()).error.code, 'company_isolation')

        // ─── Role-based access control ───
        // Submitter cannot complete tickets
        const forbiddenComplete = await fetch(`${url}/api/tickets/${ticket2.id}/complete`, {
          method: 'POST',
          headers: authHeaders(subToken),
          body: JSON.stringify({}),
        })
        assert.equal(forbiddenComplete.status, 403)
        assert.equal((await forbiddenComplete.json()).error.code, 'forbidden')

        // Submitter cannot manage assignment rules
        const forbiddenRules = await fetch(`${url}/api/assignment-rules`, { headers: authHeaders(subToken) })
        assert.equal(forbiddenRules.status, 403)
      })
    } finally {
      await platform.close()
    }
  })
})
