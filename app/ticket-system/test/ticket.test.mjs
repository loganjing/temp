import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { createApp } from '../src/server/app.ts'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'
import { registerProtectedRoutes, registerPublicRoutes } from '../src/server/routes.ts'
import { withHttpServer } from './with-http-server.mjs'
import { withQaEnvironment } from './fixtures/qa-environment.mjs'

async function setupCompany(platform, companyId, companyName) {
  await platform.db.run({
    text: 'INSERT INTO companies (id, name, created_at) VALUES (?, ?, ?)',
    params: [companyId, companyName, new Date().toISOString()],
  })
}

async function registerViaHttp(url, token, body) {
  const headers = { 'content-type': 'application/json' }
  if (token) headers.authorization = `Bearer ${token}`
  const res = await fetch(`${url}/api/auth/register`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

async function login(url, email, password) {
  const res = await fetch(`${url}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return await res.json()
}

function makeApp(platform) {
  return createApp({
    registerPublicRoutes: (r) => registerPublicRoutes(r, platform),
    registerProtectedRoutes: (r) => registerProtectedRoutes(r, platform),
    protect: platform.auth.requireAnyAuth,
  })
}

function genPwd() {
  return randomUUID().repeat(2).slice(0, 24)
}

test('ticket lifecycle: create → auto-assign → complete → evaluate', async () => {
  await withQaEnvironment(async () => {
    const platform = await initializePlatform()
    try {
      const companyId = `co-${randomUUID()}`
      await setupCompany(platform, companyId, 'Test Company')

      const app = makeApp(platform)
      await withHttpServer(app, async (url) => {
        // Register admin (first user, no auth needed)
        const adminEmail = `admin-${randomUUID()}@example.test`
        const adminPwd = genPwd()
        const adminReg = await registerViaHttp(url, null, {
          username: 'admin', password: adminPwd, displayName: 'Admin User',
          email: adminEmail, companyId, role: 'admin',
        })
        assert.equal(adminReg.status, 201)

        // Login as admin
        const adminLogin = await login(url, adminEmail, adminPwd)
        assert.equal(adminLogin.token != null, true)
        const adminToken = adminLogin.token

        // Register submitter (admin auth)
        const subEmail = `sub-${randomUUID()}@example.test`
        const subPwd = genPwd()
        const subReg = await registerViaHttp(url, adminToken, {
          username: 'submitter', password: subPwd, displayName: 'Submitter User',
          email: subEmail, companyId, role: 'submitter',
        })
        assert.equal(subReg.status, 201)

        // Register handler (admin auth)
        const handlerEmail = `handler-${randomUUID()}@example.test`
        const handlerPwd = genPwd()
        const handlerReg = await registerViaHttp(url, adminToken, {
          username: 'handler', password: handlerPwd, displayName: 'Handler User',
          email: handlerEmail, companyId, role: 'handler',
        })
        assert.equal(handlerReg.status, 201)

        // Create business group
        const groupRes = await fetch(`${url}/api/business-groups`, {
          method: 'POST',
          headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Support Team' }),
        })
        assert.equal(groupRes.status, 201)
        const group = await groupRes.json()

        // Add handler as member
        const memberRes = await fetch(`${url}/api/business-groups/${group.id}/members`, {
          method: 'POST',
          headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
          body: JSON.stringify({ profileId: handlerReg.body.profileId }),
        })
        assert.equal(memberRes.status, 201)

        // Create routing rule
        const ruleRes = await fetch(`${url}/api/routing-rules`, {
          method: 'POST',
          headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
          body: JSON.stringify({ category: 'network', targetGroupId: group.id }),
        })
        assert.equal(ruleRes.status, 201)

        // Login as submitter and create ticket (auto-assign)
        const subLogin = await login(url, subEmail, subPwd)
        const subToken = subLogin.token

        const ticketRes = await fetch(`${url}/api/tickets`, {
          method: 'POST',
          headers: { authorization: `Bearer ${subToken}`, 'content-type': 'application/json' },
          body: JSON.stringify({ subject: 'Network down', description: 'Cannot access internet', category: 'network', slaPriority: 'P1' }),
        })
        assert.equal(ticketRes.status, 201)
        const ticket = await ticketRes.json()
        assert.equal(ticket.status, 'pending_processing')
        assert.equal(ticket.assignedGroupId, group.id)

        // Complete ticket as admin
        const completeRes = await fetch(`${url}/api/tickets/${ticket.id}/complete`, {
          method: 'POST',
          headers: { authorization: `Bearer ${adminToken}` },
        })
        assert.equal(completeRes.status, 200)
        const completed = await completeRes.json()
        assert.equal(completed.status, 'completed')
        assert.ok(completed.completedAt)
        assert.ok(completed.completedBy)

        // Submit evaluation as submitter
        const evalRes = await fetch(`${url}/api/tickets/${ticket.id}/evaluation`, {
          method: 'POST',
          headers: { authorization: `Bearer ${subToken}`, 'content-type': 'application/json' },
          body: JSON.stringify({ satisfactionScore: 5, comment: 'Great service' }),
        })
        assert.equal(evalRes.status, 201)
        const evalBody = await evalRes.json()
        assert.equal(evalBody.satisfactionScore, 5)

        // Check ticket detail
        const detailRes = await fetch(`${url}/api/tickets/${ticket.id}`, {
          headers: { authorization: `Bearer ${adminToken}` },
        })
        assert.equal(detailRes.status, 200)
        const detail = await detailRes.json()
        assert.equal(detail.ticket.id, ticket.id)
        assert.equal(detail.submitter.displayName, 'Submitter User')
        assert.ok(detail.submitterHistory.length >= 1)
        assert.ok(detail.recentLogs.length >= 1)
        assert.ok(detail.evaluation)

        // Check logs
        const logsRes = await fetch(`${url}/api/tickets/${ticket.id}/logs`, {
          headers: { authorization: `Bearer ${adminToken}` },
        })
        assert.equal(logsRes.status, 200)
        const logs = await logsRes.json()
        assert.ok(logs.length >= 2)
        const actions = logs.map((l) => l.action)
        assert.ok(actions.includes('ticket.created'))
        assert.ok(actions.includes('ticket.assigned'))
        assert.ok(actions.includes('ticket.completed'))
      })
    } finally {
      await platform.close()
    }
  })
})

test('ticket without routing rule stays pending_assignment', async () => {
  await withQaEnvironment(async () => {
    const platform = await initializePlatform()
    try {
      const companyId = `co-${randomUUID()}`
      await setupCompany(platform, companyId, 'Test Co')

      const app = makeApp(platform)
      await withHttpServer(app, async (url) => {
        const subEmail = `sub-${randomUUID()}@example.test`
        const subPwd = genPwd()
        const reg = await registerViaHttp(url, null, {
          username: 'sub', password: subPwd, displayName: 'Sub',
          email: subEmail, companyId, role: 'submitter',
        })
        assert.equal(reg.status, 201)

        const subLogin = await login(url, subEmail, subPwd)
        const ticketRes = await fetch(`${url}/api/tickets`, {
          method: 'POST',
          headers: { authorization: `Bearer ${subLogin.token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ subject: 'Test', description: 'Desc', category: 'general', slaPriority: 'P2' }),
        })
        const ticket = await ticketRes.json()
        assert.equal(ticket.status, 'pending_assignment')
        assert.equal(ticket.assignedGroupId, null)
      })
    } finally {
      await platform.close()
    }
  })
})

test('company isolation: users cannot see other company tickets', async () => {
  await withQaEnvironment(async () => {
    const platform = await initializePlatform()
    try {
      const co1 = `co1-${randomUUID()}`
      const co2 = `co2-${randomUUID()}`
      await setupCompany(platform, co1, 'Company 1')
      await setupCompany(platform, co2, 'Company 2')

      const app = makeApp(platform)
      await withHttpServer(app, async (url) => {
        const pwd = genPwd()
        const email1 = `u1-${randomUUID()}@example.test`
        const email2 = `u2-${randomUUID()}@example.test`

        await registerViaHttp(url, null, { username: 'u1', password: pwd, displayName: 'U1', email: email1, companyId: co1, role: 'submitter' })
        // Register co2 user — need admin token from co1 first
        const co1Login = await login(url, email1, pwd)
        // co1 user is submitter, not admin — register co2 user as first user of co2 won't work
        // Instead, insert co2 user directly via db
        const co2UserId = randomUUID()
        const co2ProfileId = randomUUID()
        const ts = new Date().toISOString()
        const passwordHash = platform.auth.hashPassword(pwd)
        await platform.db.run({
          text: 'INSERT INTO users (id, name, email, phone, enabled, company_id, password_hash, password_change_required, created_at, updated_at) VALUES (?, ?, ?, NULL, 1, ?, ?, 0, ?, ?)',
          params: [co2UserId, 'U2', email2, co2, passwordHash, ts, ts],
        })
        await platform.db.run({
          text: 'INSERT INTO user_profiles (id, user_id, company_id, department_id, display_name, email, role, created_at) VALUES (?, ?, ?, NULL, ?, ?, ?, ?)',
          params: [co2ProfileId, co2UserId, co2, 'U2', email2, 'submitter', ts],
        })

        // co1 user creates a ticket
        const ticketRes = await fetch(`${url}/api/tickets`, {
          method: 'POST',
          headers: { authorization: `Bearer ${co1Login.token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ subject: 'Co1 Ticket', category: 'test', slaPriority: 'P3' }),
        })
        assert.equal(ticketRes.status, 201)

        // co2 user logs in and checks list — should see 0 tickets
        const co2Login = await login(url, email2, pwd)
        const listRes = await fetch(`${url}/api/tickets?status=pending_assignment`, {
          headers: { authorization: `Bearer ${co2Login.token}` },
        })
        const list = await listRes.json()
        assert.equal(list.total, 0)
      })
    } finally {
      await platform.close()
    }
  })
})

test('cancel ticket and verify state machine', async () => {
  await withQaEnvironment(async () => {
    const platform = await initializePlatform()
    try {
      const companyId = `co-${randomUUID()}`
      await setupCompany(platform, companyId, 'Test Co')

      const app = makeApp(platform)
      await withHttpServer(app, async (url) => {
        const subEmail = `sub-${randomUUID()}@example.test`
        const subPwd = genPwd()
        await registerViaHttp(url, null, {
          username: 'sub', password: subPwd, displayName: 'Sub',
          email: subEmail, companyId, role: 'submitter',
        })

        const subLogin = await login(url, subEmail, subPwd)
        const ticketRes = await fetch(`${url}/api/tickets`, {
          method: 'POST',
          headers: { authorization: `Bearer ${subLogin.token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ subject: 'Cancel Me', category: 'test', slaPriority: 'P3' }),
        })
        const ticket = await ticketRes.json()

        // Cancel
        const cancelRes = await fetch(`${url}/api/tickets/${ticket.id}/cancel`, {
          method: 'POST',
          headers: { authorization: `Bearer ${subLogin.token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ reason: 'Not needed' }),
        })
        assert.equal(cancelRes.status, 200)
        assert.equal((await cancelRes.json()).status, 'cancelled')

        // Cannot cancel again
        const cancel2Res = await fetch(`${url}/api/tickets/${ticket.id}/cancel`, {
          method: 'POST',
          headers: { authorization: `Bearer ${subLogin.token}`, 'content-type': 'application/json' },
          body: JSON.stringify({}),
        })
        assert.equal(cancel2Res.status, 409)
      })
    } finally {
      await platform.close()
    }
  })
})

test('statistics dashboard returns correct data', async () => {
  await withQaEnvironment(async () => {
    const platform = await initializePlatform()
    try {
      const companyId = `co-${randomUUID()}`
      await setupCompany(platform, companyId, 'Stats Co')

      const app = makeApp(platform)
      await withHttpServer(app, async (url) => {
        const subEmail = `sub-${randomUUID()}@example.test`
        const subPwd = genPwd()
        await registerViaHttp(url, null, {
          username: 'sub', password: subPwd, displayName: 'Sub',
          email: subEmail, companyId, role: 'submitter',
        })

        const subLogin = await login(url, subEmail, subPwd)
        await fetch(`${url}/api/tickets`, {
          method: 'POST',
          headers: { authorization: `Bearer ${subLogin.token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ subject: 'Stats Test', category: 'bug', slaPriority: 'P2' }),
        })

        const statsRes = await fetch(`${url}/api/statistics/dashboard`, {
          headers: { authorization: `Bearer ${subLogin.token}` },
        })
        assert.equal(statsRes.status, 200)
        const stats = await statsRes.json()
        assert.equal(stats.totalTickets, 1)
        assert.ok(stats.hotCategories.length >= 1)
        assert.equal(stats.hotCategories[0].category, 'bug')

        const distRes = await fetch(`${url}/api/statistics/distribution?dimension=company`, {
          headers: { authorization: `Bearer ${subLogin.token}` },
        })
        assert.equal(distRes.status, 200)
        const dist = await distRes.json()
        assert.equal(dist[0].dimensionName, 'Stats Co')
      })
    } finally {
      await platform.close()
    }
  })
})
