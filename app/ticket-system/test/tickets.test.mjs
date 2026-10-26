import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { createApp } from '../src/server/app.ts'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'
import { registerProtectedRoutes, registerPublicRoutes } from '../src/server/routes.ts'
import { createBusinessServices, ensureProjectSchema, ensurePermissionRegistry } from '../src/server/services/modules.ts'
import { createTicketService } from '../src/server/services/ticket-service.ts'
import { createCompanyRepository } from '../src/server/repositories/company.ts'
import { withHttpServer } from './with-http-server.mjs'
import { withQaEnvironment } from './fixtures/qa-environment.mjs'

const auth = (token) => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' })
const json = (body) => JSON.stringify(body)

async function setupPlatform() {
  const platform = await initializePlatform()
  const services = createBusinessServices(platform)
  await ensureProjectSchema(platform.db)
  await ensurePermissionRegistry(services.permissionKit)
  const ticket = createTicketService(services)
  const companyRepo = createCompanyRepository(platform.db)
  return { platform, services, ticket, companyRepo }
}

async function seedUser(ctx, { role, companyId, departmentId, name }) {
  const email = `${role}-${randomUUID()}@example.test`
  const password = randomUUID()
  const created = await ctx.platform.auth.userStore.create(
    { name, email, companyId, passwordChangeRequired: false },
    ctx.platform.auth.hashPassword(password),
  )
  await ctx.services.permissionKit.assignRole(created.id, role)
  await ctx.companyRepo.upsertProfile(created.id, companyId, departmentId ?? null, name)
  return { id: created.id, email, password, companyId, role }
}

async function login(url, email, password) {
  const res = await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: json({ email, password }) })
  assert.equal(res.status, 200, `login failed for ${email}`)
  return (await res.json()).token
}

test('ticket lifecycle: create, auto-assign, reply, transfer, complete, evaluate, logs, isolation', async () => {
  await withQaEnvironment(async () => {
    const ctx = await setupPlatform()
    try {
      const companyA = await ctx.companyRepo.createCompany('Company A')
      const deptEng = await ctx.companyRepo.createDepartment(companyA.id, 'Engineering')
      const companyB = await ctx.companyRepo.createCompany('Company B')

      const submitterA = await seedUser(ctx, { role: 'submitter', companyId: companyA.id, departmentId: deptEng.id, name: 'Sub A' })
      const handlerA = await seedUser(ctx, { role: 'handler', companyId: companyA.id, departmentId: deptEng.id, name: 'Handler A' })
      const adminA = await seedUser(ctx, { role: 'admin', companyId: companyA.id, name: 'Admin A' })
      const submitterB = await seedUser(ctx, { role: 'submitter', companyId: companyB.id, name: 'Sub B' })

      const app = createApp({
        registerPublicRoutes: (r) => registerPublicRoutes(r, ctx.platform),
        registerProtectedRoutes: (r) => registerProtectedRoutes(r, ctx.platform),
        protect: ctx.platform.auth.requireAnyAuth,
      })

      await withHttpServer(app, async (url) => {
        const adminToken = await login(url, adminA.email, adminA.password)
        const subToken = await login(url, submitterA.email, submitterA.password)
        const handlerToken = await login(url, handlerA.email, handlerA.password)

        // Business group + member + assignment rule (AC-06, AC-07 setup)
        const groupRes = await fetch(`${url}/api/business-groups`, { method: 'POST', headers: auth(adminToken), body: json({ company_id: companyA.id, name: 'Support Group' }) })
        assert.equal(groupRes.status, 201)
        const group = await groupRes.json()
        assert.equal(group.company_id, companyA.id)

        const memRes = await fetch(`${url}/api/business-groups/${group.id}/members`, { method: 'POST', headers: auth(adminToken), body: json({ user_id: handlerA.id }) })
        assert.equal(memRes.status, 201)

        const ruleRes = await fetch(`${url}/api/assignment-rules`, { method: 'POST', headers: auth(adminToken), body: json({ company_id: companyA.id, category: 'network', business_group_id: group.id }) })
        assert.equal(ruleRes.status, 201)
        // duplicate rule -> 409
        const dupRule = await fetch(`${url}/api/assignment-rules`, { method: 'POST', headers: auth(adminToken), body: json({ company_id: companyA.id, category: 'network', business_group_id: group.id }) })
        assert.equal(dupRule.status, 409)

        // AC-01 + AC-07: create ticket with matching category auto-assigns
        const ticketRes = await fetch(`${url}/api/tickets`, { method: 'POST', headers: auth(subToken), body: json({ subject: 'Network down', description: 'cannot reach server', category: 'network', priority: 'P1' }) })
        assert.equal(ticketRes.status, 201)
        const ticket = await ticketRes.json()
        assert.equal(ticket.status, 'pending_processing')
        assert.equal(ticket.assigned_group_id, group.id)
        assert.equal(ticket.company_id, companyA.id)
        assert.equal(ticket.submitter_id, submitterA.id)
        assert.equal(ticket.priority, 'P1')
        assert.ok(ticket.id)
        assert.ok(ticket.created_at)

        // AC-03: company isolation — submitter B sees no tickets from A
        const subBToken = await login(url, submitterB.email, submitterB.password)
        const listB = await (await fetch(`${url}/api/tickets`, { headers: auth(subBToken) })).json()
        assert.equal(listB.data.length, 0)
        const detailB = await fetch(`${url}/api/tickets/${ticket.id}`, { headers: auth(subBToken) })
        assert.equal(detailB.status, 403)

        // AC-04: edit ticket (submitter own, status pending_processing -> 409? contract says edit only when created/pending_assignment). pending_processing not editable -> 403/409
        const editConflict = await fetch(`${url}/api/tickets/${ticket.id}`, { method: 'PUT', headers: auth(subToken), body: json({ subject: 'Edited subject' }) })
        assert.equal(editConflict.status, 409)

        // AC-02: multi-round replies
        const r1 = await fetch(`${url}/api/tickets/${ticket.id}/replies`, { method: 'POST', headers: auth(subToken), body: json({ content: 'please help' }) })
        assert.equal(r1.status, 201)
        const r2 = await fetch(`${url}/api/tickets/${ticket.id}/replies`, { method: 'POST', headers: auth(handlerToken), body: json({ content: 'on it' }) })
        assert.equal(r2.status, 201)
        const replies = await (await fetch(`${url}/api/tickets/${ticket.id}/replies`, { headers: auth(handlerToken) })).json()
        assert.equal(replies.length, 2)
        assert.equal(replies[0].content, 'please help')
        assert.equal(replies[1].content, 'on it')

        // AC-09: submitter full info (handler view)
        const submitterInfo = await (await fetch(`${url}/api/tickets/${ticket.id}/submitter-info`, { headers: auth(handlerToken) })).json()
        assert.equal(submitterInfo.display_name, 'Sub A')
        assert.equal(submitterInfo.company.id, companyA.id)
        assert.equal(submitterInfo.department.id, deptEng.id)
        assert.ok(submitterInfo.history_tickets.length >= 1)

        // AC-08: transfer to handler
        const transferRes = await fetch(`${url}/api/tickets/${ticket.id}/transfer`, { method: 'POST', headers: auth(handlerToken), body: json({ to_handler_id: handlerA.id, reason: 'taking over' }) })
        assert.equal(transferRes.status, 200)
        const transferred = await transferRes.json()
        assert.equal(transferred.assigned_handler_id, handlerA.id)

        // AC-13: workbench — handler sees assigned ticket
        const workbench = await (await fetch(`${url}/api/workbench/tickets`, { headers: auth(handlerToken) })).json()
        assert.ok(workbench.data.some((t) => t.id === ticket.id))

        // AC-10: complete
        const completeRes = await fetch(`${url}/api/tickets/${ticket.id}/complete`, { method: 'POST', headers: auth(handlerToken) })
        assert.equal(completeRes.status, 200)
        const completed = await completeRes.json()
        assert.equal(completed.status, 'completed')
        assert.ok(completed.completed_at)
        assert.equal(completed.completed_by, handlerA.id)
        // idempotent complete -> 409
        const reComplete = await fetch(`${url}/api/tickets/${ticket.id}/complete`, { method: 'POST', headers: auth(handlerToken) })
        assert.equal(reComplete.status, 409)

        // AC-11: evaluation
        const evalRes = await fetch(`${url}/api/tickets/${ticket.id}/evaluation`, { method: 'POST', headers: auth(subToken), body: json({ rating: 5, comment: 'great' }) })
        assert.equal(evalRes.status, 201)
        const evalGet = await (await fetch(`${url}/api/tickets/${ticket.id}/evaluation`, { headers: auth(subToken) })).json()
        assert.equal(evalGet.rating, 5)
        // duplicate evaluation -> 409
        const evalDup = await fetch(`${url}/api/tickets/${ticket.id}/evaluation`, { method: 'POST', headers: auth(subToken), body: json({ rating: 3 }) })
        assert.equal(evalDup.status, 409)

        // AC-14: operation logs
        const logs = (await (await fetch(`${url}/api/tickets/${ticket.id}/logs`, { headers: auth(subToken) })).json()).data
        const actions = logs.map((l) => l.action)
        assert.ok(actions.includes('ticket.created'))
        assert.ok(actions.includes('ticket.assigned'))
        assert.ok(actions.includes('ticket.transferred'))
        assert.ok(actions.includes('ticket.completed'))

        // AC-12: stats dashboard + distribution
        const dash = await (await fetch(`${url}/api/stats/dashboard`, { headers: auth(adminToken) })).json()
        assert.ok(dash.ticket_count >= 1)
        assert.ok(dash.hot_topics.length >= 1)
        const dist = await (await fetch(`${url}/api/stats/distribution?group_by=company`, { headers: auth(adminToken) })).json()
        assert.ok(dist.distribution.some((d) => d.dimension === 'Company A'))
      })
    } finally {
      await ctx.platform.close()
    }
  })
})

test('cancel path and status conflicts', async () => {
  await withQaEnvironment(async () => {
    const ctx = await setupPlatform()
    try {
      const companyA = await ctx.companyRepo.createCompany('Company A')
      const submitterA = await seedUser(ctx, { role: 'submitter', companyId: companyA.id, name: 'Sub A' })
      const handlerA = await seedUser(ctx, { role: 'handler', companyId: companyA.id, name: 'Handler A' })
      const adminA = await seedUser(ctx, { role: 'admin', companyId: companyA.id, name: 'Admin A' })

      const app = createApp({
        registerPublicRoutes: (r) => registerPublicRoutes(r, ctx.platform),
        registerProtectedRoutes: (r) => registerProtectedRoutes(r, ctx.platform),
        protect: ctx.platform.auth.requireAnyAuth,
      })

      await withHttpServer(app, async (url) => {
        const subToken = await login(url, submitterA.email, submitterA.password)
        const handlerToken = await login(url, handlerA.email, handlerA.password)
        const adminToken = await login(url, adminA.email, adminA.password)

        // no assignment rule -> ticket stays pending_assignment
        const ticketRes = await fetch(`${url}/api/tickets`, { method: 'POST', headers: auth(subToken), body: json({ subject: 'Help', description: 'desc', category: 'general', priority: 'P2' }) })
        const ticket = await ticketRes.json()
        assert.equal(ticket.status, 'pending_assignment')

        // submitter edits own ticket while pending_assignment (AC-04)
        const editRes = await fetch(`${url}/api/tickets/${ticket.id}`, { method: 'PUT', headers: auth(subToken), body: json({ subject: 'Help edited', priority: 'P3' }) })
        assert.equal(editRes.status, 200)
        const edited = await editRes.json()
        assert.equal(edited.subject, 'Help edited')
        assert.equal(edited.priority, 'P3')

        // submitter cancels own ticket (AC-05 cancel path)
        const cancelRes = await fetch(`${url}/api/tickets/${ticket.id}/cancel`, { method: 'POST', headers: auth(subToken), body: json({ reason: 'not needed' }) })
        assert.equal(cancelRes.status, 200)
        const cancelled = await cancelRes.json()
        assert.equal(cancelled.status, 'cancelled')
        // cancel again -> 409
        const cancelDup = await fetch(`${url}/api/tickets/${ticket.id}/cancel`, { method: 'POST', headers: auth(subToken), body: json({}) })
        assert.equal(cancelDup.status, 409)
        // complete a cancelled ticket -> 409
        const completeConflict = await fetch(`${url}/api/tickets/${ticket.id}/complete`, { method: 'POST', headers: auth(handlerToken) })
        assert.equal(completeConflict.status, 409)
      })
    } finally {
      await ctx.platform.close()
    }
  })
})
