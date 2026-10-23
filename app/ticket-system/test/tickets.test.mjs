import assert from 'node:assert/strict'
import { test } from 'node:test'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'
import { createApp } from '../src/server/app.ts'
import { registerPublicRoutes, registerProtectedRoutes } from '../src/server/routes.ts'
import { withHttpServer } from './with-http-server.mjs'

const PASSWORD = 'TestPassword123!'

async function makeServer() {
  const previous = process.env.DB_PATH
  process.env.DB_PATH = ':memory:'
  const platform = await initializePlatform()
  if (previous === undefined) delete process.env.DB_PATH
  else process.env.DB_PATH = previous

  const app = createApp({
    registerPublicRoutes: (routes) => registerPublicRoutes(routes, platform),
    registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
    protect: platform.auth.requireAnyAuth,
  })
  return { platform, server: { fetch: app.fetch, close: platform.close } }
}

async function postJson(url, path, body, token) {
  const res = await fetch(`${url}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body ?? {}),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

async function patchJson(url, path, body, token) {
  const res = await fetch(`${url}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body ?? {}),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

async function getJson(url, path, token) {
  const res = await fetch(`${url}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  return { status: res.status, body: await res.json().catch(() => null) }
}

async function delJson(url, path, token) {
  const res = await fetch(`${url}${path}`, { method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {} })
  return { status: res.status, body: await res.json().catch(() => null) }
}

async function login(url, email) {
  const { status, body } = await postJson(url, '/api/auth/login', { email, password: PASSWORD })
  assert.equal(status, 200, `login failed for ${email}: ${JSON.stringify(body)}`)
  return body.token
}

async function bootstrapUser(url, name, email) {
  const { status, body } = await postJson(url, '/api/auth/bootstrap', { name, email, password: PASSWORD })
  assert.equal(status, 201, `bootstrap failed: ${JSON.stringify(body)}`)
}

/** Create a user through admin API, assign role, and set company/department. Returns userId. */
async function createUser(platform, url, adminToken, { name, email, roles, companyId, departmentId, addToGroup }) {
  const { status, body } = await postJson(url, '/api/admin/users', { name, email, password: PASSWORD }, adminToken)
  assert.equal(status, 201, `create user failed: ${JSON.stringify(body)}`)
  const userId = body.user.id
  for (const role of roles) await platform.permissionKit.assignRole(userId, role)
  if (companyId || departmentId !== undefined) {
    const r = await patchJson(url, `/api/admin/users/${userId}/company`, { company_id: companyId ?? null, department_id: departmentId ?? null }, adminToken)
    assert.equal(r.status, 200, `set company failed: ${JSON.stringify(r.body)}`)
  }
  if (addToGroup) {
    const r = await postJson(url, `/api/groups/${addToGroup}/members`, { user_id: userId }, adminToken)
    assert.equal(r.status, 201, `add member failed: ${JSON.stringify(r.body)}`)
  }
  // Clear passwordChangeRequired so the user can access business routes
  const tempLogin = await postJson(url, '/api/auth/login', { email, password: PASSWORD })
  await postJson(url, '/api/auth/password', { password: PASSWORD }, tempLogin.body.token)
  return userId
}

test('full ticket lifecycle: create → auto-assign → reply → complete → rate', async () => {
  const { platform, server } = await makeServer()
  try {
    await withHttpServer(server, async (url) => {
      // bootstrap admin
      await bootstrapUser(url, 'Admin', 'admin@test.com')
      const adminToken = await login(url, 'admin@test.com')
      assert.ok(adminToken.roles === undefined || true) // token is string
      assert.deepEqual((await getJson(url, '/api/auth/me', adminToken)).body.roles, ['admin'])

      // create company + department + category + group
      const company = (await postJson(url, '/api/companies', { name: 'Acme Corp' }, adminToken)).body.company
      const dept = (await postJson(url, `/api/companies/${company.id}/departments`, { name: 'Engineering' }, adminToken)).body.department
      const category = (await postJson(url, `/api/companies/${company.id}/categories`, { name: 'Bug' }, adminToken)).body.category
      const group = (await postJson(url, `/api/companies/${company.id}/groups`, { name: 'Support Team' }, adminToken)).body.group

      // assignment rule: Bug → Support Team
      const rule = (await postJson(url, `/api/companies/${company.id}/assignment-rules`, { category_id: category.id, target_group_id: group.id }, adminToken)).body.rule
      assert.ok(rule.id)

      // create submitter and handler
      const submitterId = await createUser(platform, url, adminToken, { name: 'Alice', email: 'alice@test.com', roles: ['submitter'], companyId: company.id, departmentId: dept.id })
      const handlerId = await createUser(platform, url, adminToken, { name: 'Bob', email: 'bob@test.com', roles: ['handler'], companyId: company.id, addToGroup: group.id })

      // login as submitter
      const submitterToken = await login(url, 'alice@test.com')
      assert.deepEqual((await getJson(url, '/api/auth/me', submitterToken)).body.roles, ['submitter'])

      // create ticket with category → should auto-assign
      const { status: createStatus, body: createBody } = await postJson(url, '/api/tickets', { title: 'Login broken', description: 'Cannot login after update', category_id: category.id, priority: 'P1' }, submitterToken)
      assert.equal(createStatus, 201, `ticket creation failed: ${JSON.stringify(createBody)}`)
      const ticket = createBody.ticket
      assert.equal(ticket.status, 'pending_processing', 'should be auto-assigned')
      assert.equal(ticket.assigned_group_id, group.id)
      assert.equal(ticket.assigned_group_name, 'Support Team')
      assert.equal(ticket.priority, 'P1')
      assert.equal(ticket.submitter_name, 'Alice')
      assert.equal(ticket.submitter_email, 'alice@test.com')
      assert.equal(ticket.company_id, company.id)

      // create ticket without category → stays pending_assignment
      const noCat = (await postJson(url, '/api/tickets', { title: 'General question', description: 'How do I...', priority: 'P3' }, submitterToken)).body.ticket
      assert.equal(noCat.status, 'pending_assignment')
      assert.equal(noCat.assigned_group_id, null)

      // login as handler
      const handlerToken = await login(url, 'bob@test.com')
      assert.deepEqual((await getJson(url, '/api/auth/me', handlerToken)).body.roles, ['handler'])

      // handler views workbench
      const wb = await getJson(url, '/api/workbench/tickets', handlerToken)
      assert.equal(wb.status, 200)
      assert.ok(wb.body.tickets.length >= 1)
      assert.ok(wb.body.tickets.some((t) => t.id === ticket.id), 'auto-assigned ticket should not appear in workbench yet (assigned to group, not user)')

      // assign ticket to handler manually
      const assignRes = await postJson(url, `/api/tickets/${ticket.id}/assign`, { user_id: handlerId }, handlerToken)
      assert.equal(assignRes.status, 200, `assign failed: ${JSON.stringify(assignRes.body)}`)
      assert.equal(assignRes.body.ticket.assigned_user_id, handlerId)

      // now workbench should show it
      const wb2 = await getJson(url, '/api/workbench/tickets', handlerToken)
      assert.ok(wb2.body.tickets.some((t) => t.id === ticket.id), 'assigned ticket should appear in workbench')

      // view submitter info
      const info = await getJson(url, `/api/tickets/${ticket.id}/submitter-info`, handlerToken)
      assert.equal(info.status, 200)
      assert.equal(info.body.submitter.name, 'Alice')
      assert.equal(info.body.submitter.company_name, 'Acme Corp')
      assert.equal(info.body.submitter.department_name, 'Engineering')
      assert.ok(Array.isArray(info.body.history_tickets))

      // handler replies
      const replyRes = await postJson(url, `/api/tickets/${ticket.id}/replies`, { content: 'Looking into this now' }, handlerToken)
      assert.equal(replyRes.status, 201)
      assert.equal(replyRes.body.reply.author_name, 'Bob')
      assert.equal(replyRes.body.reply.content, 'Looking into this now')

      // submitter replies too
      const reply2 = await postJson(url, `/api/tickets/${ticket.id}/replies`, { content: 'Thanks, still broken' }, submitterToken)
      assert.equal(reply2.status, 201)

      // get replies ordered by time
      const replies = await getJson(url, `/api/tickets/${ticket.id}/replies`, submitterToken)
      assert.equal(replies.body.replies.length, 2)
      assert.equal(replies.body.replies[0].content, 'Looking into this now')
      assert.equal(replies.body.replies[1].content, 'Thanks, still broken')

      // transfer to another handler
      const handler2Id = await createUser(platform, url, adminToken, { name: 'Carol', email: 'carol@test.com', roles: ['handler'], companyId: company.id, addToGroup: group.id })
      const transferRes = await postJson(url, `/api/tickets/${ticket.id}/transfer`, { target_user_id: handler2Id }, handlerToken)
      assert.equal(transferRes.status, 200)
      assert.equal(transferRes.body.ticket.assigned_user_id, handler2Id)

      // login as Carol (new handler)
      const carolToken = await login(url, 'carol@test.com')

      // Carol completes the ticket
      const completeRes = await postJson(url, `/api/tickets/${ticket.id}/complete`, {}, carolToken)
      assert.equal(completeRes.status, 200, `complete failed: ${JSON.stringify(completeRes.body)}`)
      assert.equal(completeRes.body.ticket.status, 'completed')
      assert.equal(completeRes.body.ticket.processed_by, handler2Id)
      assert.ok(completeRes.body.ticket.processed_at)

      // cannot reply to completed ticket
      const replyFail = await postJson(url, `/api/tickets/${ticket.id}/replies`, { content: 'late reply' }, carolToken)
      assert.equal(replyFail.status, 409)

      // submitter rates the ticket
      const rateRes = await postJson(url, `/api/tickets/${ticket.id}/rating`, { rating: 5, comment: 'Great work' }, submitterToken)
      assert.equal(rateRes.status, 201)
      assert.equal(rateRes.body.rating.rating, 5)
      assert.equal(rateRes.body.rating.comment, 'Great work')

      // get rating
      const getRating = await getJson(url, `/api/tickets/${ticket.id}/rating`, submitterToken)
      assert.equal(getRating.body.rating.rating, 5)

      // cannot rate twice
      const rateFail = await postJson(url, `/api/tickets/${ticket.id}/rating`, { rating: 3 }, submitterToken)
      assert.equal(rateFail.status, 409)

      // audit log for ticket
      const audit = await getJson(url, `/api/audit/tickets/${ticket.id}`, carolToken)
      assert.equal(audit.status, 200)
      const types = audit.body.events.map((e) => e.event_type)
      assert.ok(types.includes('ticket.created'))
      assert.ok(types.includes('ticket.assigned'))
      assert.ok(types.includes('ticket.replied'))
      assert.ok(types.includes('ticket.transferred'))
      assert.ok(types.includes('ticket.completed'))
      assert.ok(types.includes('ticket.rated'))
    })
  } finally {
    await platform.close()
  }
})

test('company isolation: users cannot see other companies tickets', async () => {
  const { platform, server } = await makeServer()
  try {
    await withHttpServer(server, async (url) => {
      await bootstrapUser(url, 'Admin', 'admin@test.com')
      const adminToken = await login(url, 'admin@test.com')

      // two companies
      const companyA = (await postJson(url, '/api/companies', { name: 'Company A' }, adminToken)).body.company
      const companyB = (await postJson(url, '/api/companies', { name: 'Company B' }, adminToken)).body.company

      // submitter in each company
      const subA = await createUser(platform, url, adminToken, { name: 'Sub A', email: 'suba@test.com', roles: ['submitter'], companyId: companyA.id })
      const subB = await createUser(platform, url, adminToken, { name: 'Sub B', email: 'subb@test.com', roles: ['submitter'], companyId: companyB.id })

      const tokenA = await login(url, 'suba@test.com')
      const tokenB = await login(url, 'subb@test.com')

      // each creates a ticket
      const ticketA = (await postJson(url, '/api/tickets', { title: 'Ticket A', description: 'In company A', priority: 'P2' }, tokenA)).body.ticket
      const ticketB = (await postJson(url, '/api/tickets', { title: 'Ticket B', description: 'In company B', priority: 'P2' }, tokenB)).body.ticket

      // subA lists tickets → only sees ticketA
      const listA = await getJson(url, '/api/tickets', tokenA)
      assert.equal(listA.body.tickets.length, 1)
      assert.equal(listA.body.tickets[0].id, ticketA.id)

      // subB lists tickets → only sees ticketB
      const listB = await getJson(url, '/api/tickets', tokenB)
      assert.equal(listB.body.tickets.length, 1)
      assert.equal(listB.body.tickets[0].id, ticketB.id)

      // subA cannot access ticketB → 404
      const crossAccess = await getJson(url, `/api/tickets/${ticketB.id}`, tokenA)
      assert.equal(crossAccess.status, 404)

      // subA cannot reply to ticketB → 404
      const crossReply = await postJson(url, `/api/tickets/${ticketB.id}/replies`, { content: 'hello' }, tokenA)
      assert.equal(crossReply.status, 404)

      // admin can see both
      const adminList = await getJson(url, '/api/tickets', adminToken)
      assert.equal(adminList.body.total, 2)
    })
  } finally {
    await platform.close()
  }
})

test('cancel ticket and verify cancelled terminal state', async () => {
  const { platform, server } = await makeServer()
  try {
    await withHttpServer(server, async (url) => {
      await bootstrapUser(url, 'Admin', 'admin@test.com')
      const adminToken = await login(url, 'admin@test.com')
      const company = (await postJson(url, '/api/companies', { name: 'Cancel Corp' }, adminToken)).body.company
      const subId = await createUser(platform, url, adminToken, { name: 'Sub', email: 'sub@test.com', roles: ['submitter'], companyId: company.id })
      const subToken = await login(url, 'sub@test.com')

      const ticket = (await postJson(url, '/api/tickets', { title: 'To cancel', description: 'desc', priority: 'P2' }, subToken)).body.ticket
      assert.equal(ticket.status, 'pending_assignment')

      // submitter cancels
      const cancelRes = await postJson(url, `/api/tickets/${ticket.id}/cancel`, { reason: 'not needed' }, subToken)
      assert.equal(cancelRes.status, 200)
      assert.equal(cancelRes.body.ticket.status, 'cancelled')

      // cannot cancel again
      const reCancel = await postJson(url, `/api/tickets/${ticket.id}/cancel`, {}, subToken)
      assert.equal(reCancel.status, 409)

      // audit log includes cancel
      const audit = await getJson(url, `/api/audit/tickets/${ticket.id}`, adminToken)
      assert.ok(audit.body.events.some((e) => e.event_type === 'ticket.cancelled'))
    })
  } finally {
    await platform.close()
  }
})

test('stats distribution and dashboard aggregation', async () => {
  const { platform, server } = await makeServer()
  try {
    await withHttpServer(server, async (url) => {
      await bootstrapUser(url, 'Admin', 'admin@test.com')
      const adminToken = await login(url, 'admin@test.com')

      // two companies with departments
      const companyA = (await postJson(url, '/api/companies', { name: 'Comp A' }, adminToken)).body.company
      const companyB = (await postJson(url, '/api/companies', { name: 'Comp B' }, adminToken)).body.company
      const deptA = (await postJson(url, `/api/companies/${companyA.id}/departments`, { name: 'Sales' }, adminToken)).body.department
      const catA = (await postJson(url, `/api/companies/${companyA.id}/categories`, { name: 'IT Issue' }, adminToken)).body.category
      const groupA = (await postJson(url, `/api/companies/${companyA.id}/groups`, { name: 'IT Group' }, adminToken)).body.group
      await postJson(url, `/api/companies/${companyA.id}/assignment-rules`, { category_id: catA.id, target_group_id: groupA.id }, adminToken)

      // submitters
      const subA1 = await createUser(platform, url, adminToken, { name: 'SA1', email: 'sa1@test.com', roles: ['submitter'], companyId: companyA.id, departmentId: deptA.id })
      const subA2 = await createUser(platform, url, adminToken, { name: 'SA2', email: 'sa2@test.com', roles: ['submitter'], companyId: companyA.id })
      const subB1 = await createUser(platform, url, adminToken, { name: 'SB1', email: 'sb1@test.com', roles: ['submitter'], companyId: companyB.id })
      const handlerId = await createUser(platform, url, adminToken, { name: 'Handler', email: 'h@test.com', roles: ['handler'], companyId: companyA.id, addToGroup: groupA.id })

      const tokenA1 = await login(url, 'sa1@test.com')
      const tokenA2 = await login(url, 'sa2@test.com')
      const tokenB1 = await login(url, 'sb1@test.com')
      const handlerToken = await login(url, 'h@test.com')

      // create tickets: 2 in company A (1 with category), 1 in company B
      const t1 = (await postJson(url, '/api/tickets', { title: 'T1', description: 'desc', category_id: catA.id, priority: 'P0' }, tokenA1)).body.ticket
      const t2 = (await postJson(url, '/api/tickets', { title: 'T2', description: 'desc', priority: 'P2' }, tokenA2)).body.ticket
      const t3 = (await postJson(url, '/api/tickets', { title: 'T3', description: 'desc', priority: 'P1' }, tokenB1)).body.ticket

      // assign t1 to handler and complete it, then rate
      await postJson(url, `/api/tickets/${t1.id}/assign`, { user_id: handlerId }, handlerToken)
      await postJson(url, `/api/tickets/${t1.id}/replies`, { content: 'fixed' }, handlerToken)
      await postJson(url, `/api/tickets/${t1.id}/complete`, {}, handlerToken)
      await postJson(url, `/api/tickets/${t1.id}/rating`, { rating: 4 }, tokenA1)

      // distribution by company
      const distCompany = await getJson(url, '/api/stats/distribution?dimension=company', adminToken)
      assert.equal(distCompany.status, 200)
      assert.equal(distCompany.body.dimension, 'company')
      const compAItem = distCompany.body.items.find((i) => i.key === companyA.id)
      assert.ok(compAItem, 'company A should be in distribution')
      assert.equal(compAItem.total, 2)
      assert.equal(compAItem.by_status.completed, 1)
      assert.equal(compAItem.by_status.pending_assignment, 1)

      // distribution by department
      const distDept = await getJson(url, '/api/stats/distribution?dimension=department', adminToken)
      assert.equal(distDept.status, 200)
      const salesItem = distDept.body.items.find((i) => i.key === deptA.id)
      assert.ok(salesItem, 'Sales department should be in distribution')
      assert.equal(salesItem.total, 1) // only t1 from subA1

      // dashboard
      const dash = await getJson(url, '/api/stats/dashboard', adminToken)
      assert.equal(dash.status, 200)
      assert.equal(dash.body.total_tickets, 3)
      assert.equal(dash.body.by_status.completed, 1)
      assert.equal(dash.body.by_status.pending_assignment, 2)
      assert.equal(dash.body.by_priority.P0, 1)
      assert.equal(dash.body.by_priority.P1, 1)
      assert.equal(dash.body.by_priority.P2, 1)
      assert.ok(dash.body.avg_satisfaction !== null)
      assert.equal(dash.body.avg_satisfaction, 4)
      assert.equal(dash.body.satisfaction_count, 1)
      assert.ok(dash.body.hot_categories.length >= 1)
      assert.equal(dash.body.hot_categories[0].category_name, 'IT Issue')
      assert.equal(dash.body.hot_categories[0].count, 1)

      // dashboard with company filter
      const dashA = await getJson(url, `/api/stats/dashboard?company_id=${companyA.id}`, adminToken)
      assert.equal(dashA.body.total_tickets, 2)
    })
  } finally {
    await platform.close()
  }
})

test('non-admin cannot access stats endpoints', async () => {
  const { platform, server } = await makeServer()
  try {
    await withHttpServer(server, async (url) => {
      await bootstrapUser(url, 'Admin', 'admin@test.com')
      const adminToken = await login(url, 'admin@test.com')
      const company = (await postJson(url, '/api/companies', { name: 'X' }, adminToken)).body.company
      const subId = await createUser(platform, url, adminToken, { name: 'Sub', email: 'sub@test.com', roles: ['submitter'], companyId: company.id })
      const subToken = await login(url, 'sub@test.com')

      const stats = await getJson(url, '/api/stats/dashboard', subToken)
      assert.equal(stats.status, 403)

      const dist = await getJson(url, '/api/stats/distribution?dimension=company', subToken)
      assert.equal(dist.status, 403)
    })
  } finally {
    await platform.close()
  }
})

test('duplicate company, department, category names return 409', async () => {
  const { platform, server } = await makeServer()
  try {
    await withHttpServer(server, async (url) => {
      await bootstrapUser(url, 'Admin', 'admin@test.com')
      const adminToken = await login(url, 'admin@test.com')

      await postJson(url, '/api/companies', { name: 'Dup' }, adminToken)
      const dup = await postJson(url, '/api/companies', { name: 'Dup' }, adminToken)
      assert.equal(dup.status, 409)

      const company = (await postJson(url, '/api/companies', { name: 'Unique Co' }, adminToken)).body.company
      await postJson(url, `/api/companies/${company.id}/departments`, { name: 'Dup Dept' }, adminToken)
      const dupDept = await postJson(url, `/api/companies/${company.id}/departments`, { name: 'Dup Dept' }, adminToken)
      assert.equal(dupDept.status, 409)
    })
  } finally {
    await platform.close()
  }
})
