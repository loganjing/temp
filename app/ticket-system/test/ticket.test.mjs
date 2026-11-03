import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createApp } from '../src/server/app.ts'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'
import { registerProtectedRoutes, registerPublicRoutes } from '../src/server/routes.ts'
import { withHttpServer } from './with-http-server.mjs'
import { seedTicketEnvironment, withQaEnvironment } from './fixtures/qa-environment.mjs'

async function login(url, email, password) {
  const res = await fetch(`${url}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  assert.equal(res.status, 200, `login failed for ${email}`)
  return (await res.json()).token
}

function authHeaders(token) {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

async function makeApp(platform) {
  return createApp({
    registerPublicRoutes: (routes) => registerPublicRoutes(routes, platform),
    registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
    protect: platform.auth.requireAnyAuth,
  })
}

test('AC-01: ticket created with category rule auto-assigns to business group and status is pending_processing', async () => {
  await withQaEnvironment(async ({ qaRunId }) => {
    const platform = await initializePlatform()
    try {
      const env = await seedTicketEnvironment(platform, { qaRunId })
      const app = await makeApp(platform)
      await withHttpServer(app, async (url) => {
        const token = await login(url, env.submitterA.email, env.password)
        const res = await fetch(`${url}/api/tickets`, {
          method: 'POST', headers: authHeaders(token),
          body: JSON.stringify({ title: 'Test ticket', description: 'A test issue', categoryId: env.catA, slaPriority: 'P2' }),
        })
        assert.equal(res.status, 201)
        const ticket = await res.json()
        assert.equal(ticket.status, 'pending_processing')
        assert.equal(ticket.businessGroupId, env.groupA)
        assert.equal(ticket.slaPriority, 'P2')
      })
    } finally { await platform.close() }
  })
})

test('ticket created without assignment rule stays pending_assignment', async () => {
  await withQaEnvironment(async ({ qaRunId }) => {
    const platform = await initializePlatform()
    try {
      const env = await seedTicketEnvironment(platform, { qaRunId })
      const app = await makeApp(platform)
      await withHttpServer(app, async (url) => {
        const token = await login(url, env.submitterA.email, env.password)
        const res = await fetch(`${url}/api/tickets`, {
          method: 'POST', headers: authHeaders(token),
          body: JSON.stringify({ title: 'Unassigned ticket', description: 'No rule', categoryId: env.catAUnassigned, slaPriority: 'P3' }),
        })
        const ticket = await res.json()
        assert.equal(ticket.status, 'pending_assignment')
        assert.equal(ticket.businessGroupId, null)
      })
    } finally { await platform.close() }
  })
})

test('AC-03: multiple replies record replier and timestamp', async () => {
  await withQaEnvironment(async ({ qaRunId }) => {
    const platform = await initializePlatform()
    try {
      const env = await seedTicketEnvironment(platform, { qaRunId })
      const app = await makeApp(platform)
      await withHttpServer(app, async (url) => {
        const subToken = await login(url, env.submitterA.email, env.password)
        const hdlToken = await login(url, env.handlerA.email, env.password)

        const created = await (await fetch(`${url}/api/tickets`, {
          method: 'POST', headers: authHeaders(subToken),
          body: JSON.stringify({ title: 'Reply test', description: 'desc', categoryId: env.catA, slaPriority: 'P1' }),
        })).json()

        await fetch(`${url}/api/tickets/${created.id}/replies`, { method: 'POST', headers: authHeaders(subToken), body: JSON.stringify({ content: 'First reply' }) })
        await fetch(`${url}/api/tickets/${created.id}/replies`, { method: 'POST', headers: authHeaders(hdlToken), body: JSON.stringify({ content: 'Second reply' }) })

        const detail = await (await fetch(`${url}/api/tickets/${created.id}`, { headers: authHeaders(subToken) })).json()
        assert.equal(detail.replies.length, 2)
        assert.equal(detail.replies[0].content, 'First reply')
        assert.equal(detail.replies[1].content, 'Second reply')
        assert.ok(detail.replies[0].replierName)
      })
    } finally { await platform.close() }
  })
})

test('AC-06: transfer resets status to pending_assignment and changes business group', async () => {
  await withQaEnvironment(async ({ qaRunId }) => {
    const platform = await initializePlatform()
    try {
      const env = await seedTicketEnvironment(platform, { qaRunId })
      const app = await makeApp(platform)
      await withHttpServer(app, async (url) => {
        const subToken = await login(url, env.submitterA.email, env.password)
        const hdlToken = await login(url, env.handlerA.email, env.password)

        const created = await (await fetch(`${url}/api/tickets`, {
          method: 'POST', headers: authHeaders(subToken),
          body: JSON.stringify({ title: 'Transfer test', description: 'desc', categoryId: env.catA, slaPriority: 'P2' }),
        })).json()

        const transferred = await (await fetch(`${url}/api/tickets/${created.id}/transfer`, {
          method: 'POST', headers: authHeaders(hdlToken),
          body: JSON.stringify({ toBusinessGroupId: env.groupB, reason: 'Wrong group' }),
        })).json()
        assert.equal(transferred.status, 'pending_assignment')
        assert.equal(transferred.businessGroupId, env.groupB)
      })
    } finally { await platform.close() }
  })
})

test('AC-02: completing a ticket sends email and records handler', async () => {
  await withQaEnvironment(async ({ qaRunId }) => {
    const platform = await initializePlatform()
    try {
      const env = await seedTicketEnvironment(platform, { qaRunId })
      const app = await makeApp(platform)
      await withHttpServer(app, async (url) => {
        const subToken = await login(url, env.submitterA.email, env.password)
        const hdlToken = await login(url, env.handlerA.email, env.password)

        const created = await (await fetch(`${url}/api/tickets`, {
          method: 'POST', headers: authHeaders(subToken),
          body: JSON.stringify({ title: 'Complete test', description: 'desc', categoryId: env.catA, slaPriority: 'P1' }),
        })).json()

        const completed = await (await fetch(`${url}/api/tickets/${created.id}/complete`, {
          method: 'POST', headers: authHeaders(hdlToken),
          body: JSON.stringify({ summary: 'Fixed the issue' }),
        })).json()
        assert.equal(completed.status, 'completed')
        assert.equal(completed.handlerId, env.handlerA.id)
        assert.ok(completed.completedAt)
      })
    } finally { await platform.close() }
  })
})

test('AC-07: cancel a pending ticket', async () => {
  await withQaEnvironment(async ({ qaRunId }) => {
    const platform = await initializePlatform()
    try {
      const env = await seedTicketEnvironment(platform, { qaRunId })
      const app = await makeApp(platform)
      await withHttpServer(app, async (url) => {
        const token = await login(url, env.submitterA.email, env.password)
        const created = await (await fetch(`${url}/api/tickets`, {
          method: 'POST', headers: authHeaders(token),
          body: JSON.stringify({ title: 'Cancel test', description: 'desc', categoryId: env.catA, slaPriority: 'P3' }),
        })).json()
        const cancelled = await (await fetch(`${url}/api/tickets/${created.id}/cancel`, {
          method: 'POST', headers: authHeaders(token), body: JSON.stringify({ reason: 'Not needed' }),
        })).json()
        assert.equal(cancelled.status, 'cancelled')
        assert.ok(cancelled.cancelledAt)
      })
    } finally { await platform.close() }
  })
})

test('cannot cancel a completed ticket', async () => {
  await withQaEnvironment(async ({ qaRunId }) => {
    const platform = await initializePlatform()
    try {
      const env = await seedTicketEnvironment(platform, { qaRunId })
      const app = await makeApp(platform)
      await withHttpServer(app, async (url) => {
        const subToken = await login(url, env.submitterA.email, env.password)
        const hdlToken = await login(url, env.handlerA.email, env.password)
        const created = await (await fetch(`${url}/api/tickets`, {
          method: 'POST', headers: authHeaders(subToken),
          body: JSON.stringify({ title: 'No cancel', description: 'desc', categoryId: env.catA, slaPriority: 'P1' }),
        })).json()
        await fetch(`${url}/api/tickets/${created.id}/complete`, { method: 'POST', headers: authHeaders(hdlToken), body: JSON.stringify({ summary: 'Done' }) })
        const res = await fetch(`${url}/api/tickets/${created.id}/cancel`, { method: 'POST', headers: authHeaders(subToken), body: JSON.stringify({}) })
        assert.equal(res.status, 409)
        const body = await res.json()
        assert.equal(body.error.code, 'invalid_status')
      })
    } finally { await platform.close() }
  })
})

test('AC-08: submitter can rate a completed ticket', async () => {
  await withQaEnvironment(async ({ qaRunId }) => {
    const platform = await initializePlatform()
    try {
      const env = await seedTicketEnvironment(platform, { qaRunId })
      const app = await makeApp(platform)
      await withHttpServer(app, async (url) => {
        const subToken = await login(url, env.submitterA.email, env.password)
        const hdlToken = await login(url, env.handlerA.email, env.password)
        const created = await (await fetch(`${url}/api/tickets`, {
          method: 'POST', headers: authHeaders(subToken),
          body: JSON.stringify({ title: 'Rate test', description: 'desc', categoryId: env.catA, slaPriority: 'P2' }),
        })).json()
        await fetch(`${url}/api/tickets/${created.id}/complete`, { method: 'POST', headers: authHeaders(hdlToken), body: JSON.stringify({ summary: 'Done' }) })
        const rated = await (await fetch(`${url}/api/tickets/${created.id}/satisfaction`, {
          method: 'POST', headers: authHeaders(subToken), body: JSON.stringify({ rating: 5, comment: 'Great' }),
        })).json()
        assert.equal(rated.rating, 5)
        assert.equal(rated.comment, 'Great')

        const detail = await (await fetch(`${url}/api/tickets/${created.id}`, { headers: authHeaders(subToken) })).json()
        assert.ok(detail.satisfaction)
        assert.equal(detail.satisfaction.rating, 5)
      })
    } finally { await platform.close() }
  })
})

test('non-submitter cannot rate a ticket', async () => {
  await withQaEnvironment(async ({ qaRunId }) => {
    const platform = await initializePlatform()
    try {
      const env = await seedTicketEnvironment(platform, { qaRunId })
      const app = await makeApp(platform)
      await withHttpServer(app, async (url) => {
        const subToken = await login(url, env.submitterA.email, env.password)
        const hdlToken = await login(url, env.handlerA.email, env.password)
        const created = await (await fetch(`${url}/api/tickets`, {
          method: 'POST', headers: authHeaders(subToken),
          body: JSON.stringify({ title: 'Rate forbidden', description: 'desc', categoryId: env.catA, slaPriority: 'P2' }),
        })).json()
        await fetch(`${url}/api/tickets/${created.id}/complete`, { method: 'POST', headers: authHeaders(hdlToken), body: JSON.stringify({ summary: 'Done' }) })
        const res = await fetch(`${url}/api/tickets/${created.id}/satisfaction`, { method: 'POST', headers: authHeaders(hdlToken), body: JSON.stringify({ rating: 1 }) })
        assert.equal(res.status, 403)
      })
    } finally { await platform.close() }
  })
})

test('AC-04: company isolation — company B submitter cannot see company A tickets', async () => {
  await withQaEnvironment(async ({ qaRunId }) => {
    const platform = await initializePlatform()
    try {
      const env = await seedTicketEnvironment(platform, { qaRunId })
      const app = await makeApp(platform)
      await withHttpServer(app, async (url) => {
        const tokenA = await login(url, env.submitterA.email, env.password)
        const tokenB = await login(url, env.submitterB.email, env.password)

        const created = await (await fetch(`${url}/api/tickets`, {
          method: 'POST', headers: authHeaders(tokenA),
          body: JSON.stringify({ title: 'Isolation test', description: 'desc', categoryId: env.catA, slaPriority: 'P1' }),
        })).json()

        const listB = await (await fetch(`${url}/api/tickets`, { headers: authHeaders(tokenB) })).json()
        assert.equal(listB.total, 0)

        const notFound = await fetch(`${url}/api/tickets/${created.id}`, { headers: authHeaders(tokenB) })
        assert.equal(notFound.status, 404)
      })
    } finally { await platform.close() }
  })
})

test('AC-05: admin creates business group, category, and assignment rule', async () => {
  await withQaEnvironment(async ({ qaRunId }) => {
    const platform = await initializePlatform()
    try {
      const env = await seedTicketEnvironment(platform, { qaRunId })
      const app = await makeApp(platform)
      await withHttpServer(app, async (url) => {
        const token = await login(url, env.adminA.email, env.password)

        const bg = await (await fetch(`${url}/api/business-groups`, {
          method: 'POST', headers: authHeaders(token), body: JSON.stringify({ name: 'New BG' }),
        })).json()
        assert.equal(bg.name, 'New BG')

        const cat = await (await fetch(`${url}/api/categories`, {
          method: 'POST', headers: authHeaders(token), body: JSON.stringify({ name: 'New Cat' }),
        })).json()
        assert.equal(cat.name, 'New Cat')

        const rule = await (await fetch(`${url}/api/assignment-rules`, {
          method: 'POST', headers: authHeaders(token), body: JSON.stringify({ categoryId: cat.id, businessGroupId: bg.id }),
        })).json()
        assert.equal(rule.categoryId, cat.id)
        assert.equal(rule.businessGroupId, bg.id)

        const member = await (await fetch(`${url}/api/business-groups/${bg.id}/members`, {
          method: 'POST', headers: authHeaders(token), body: JSON.stringify({ userId: env.handlerA.id }),
        })).json()
        assert.equal(member.userId, env.handlerA.id)
      })
    } finally { await platform.close() }
  })
})

test('AC-09: workbench returns pending_processing tickets for handler', async () => {
  await withQaEnvironment(async ({ qaRunId }) => {
    const platform = await initializePlatform()
    try {
      const env = await seedTicketEnvironment(platform, { qaRunId })
      const app = await makeApp(platform)
      await withHttpServer(app, async (url) => {
        const subToken = await login(url, env.submitterA.email, env.password)
        const hdlToken = await login(url, env.handlerA.email, env.password)

        await fetch(`${url}/api/tickets`, { method: 'POST', headers: authHeaders(subToken), body: JSON.stringify({ title: 'WB 1', description: 'd', categoryId: env.catA, slaPriority: 'P1' }) })
        await fetch(`${url}/api/tickets`, { method: 'POST', headers: authHeaders(subToken), body: JSON.stringify({ title: 'WB 2', description: 'd', categoryId: env.catA, slaPriority: 'P2' }) })

        const wb = await (await fetch(`${url}/api/workbench/tickets`, { headers: authHeaders(hdlToken) })).json()
        assert.equal(wb.total, 2)
        for (const item of wb.items) assert.equal(item.status, 'pending_processing')
      })
    } finally { await platform.close() }
  })
})

test('AC-10: dashboard returns totalTickets, avgResponseTime, avgSatisfaction, hotCategories', async () => {
  await withQaEnvironment(async ({ qaRunId }) => {
    const platform = await initializePlatform()
    try {
      const env = await seedTicketEnvironment(platform, { qaRunId })
      const app = await makeApp(platform)
      await withHttpServer(app, async (url) => {
        const subToken = await login(url, env.submitterA.email, env.password)
        const hdlToken = await login(url, env.handlerA.email, env.password)
        const admToken = await login(url, env.adminA.email, env.password)

        const t = await (await fetch(`${url}/api/tickets`, { method: 'POST', headers: authHeaders(subToken), body: JSON.stringify({ title: 'Dash', description: 'd', categoryId: env.catA, slaPriority: 'P1' }) })).json()
        await fetch(`${url}/api/tickets/${t.id}/replies`, { method: 'POST', headers: authHeaders(hdlToken), body: JSON.stringify({ content: 'Reply' }) })
        await fetch(`${url}/api/tickets/${t.id}/complete`, { method: 'POST', headers: authHeaders(hdlToken), body: JSON.stringify({ summary: 'Done' }) })
        await fetch(`${url}/api/tickets/${t.id}/satisfaction`, { method: 'POST', headers: authHeaders(subToken), body: JSON.stringify({ rating: 4 }) })

        const dash = await (await fetch(`${url}/api/statistics/dashboard`, { headers: authHeaders(admToken) })).json()
        assert.ok(dash.totalTickets >= 1)
        assert.ok(typeof dash.avgResponseTime === 'number')
        assert.ok(typeof dash.avgSatisfaction === 'number')
        assert.ok(Array.isArray(dash.hotCategories))

        const dist = await (await fetch(`${url}/api/statistics/distribution?dimension=company`, { headers: authHeaders(admToken) })).json()
        assert.ok(Array.isArray(dist.items))
        assert.ok(dist.items.length >= 1)
      })
    } finally { await platform.close() }
  })
})

test('AC-11: audit logs record ticket lifecycle operations', async () => {
  await withQaEnvironment(async ({ qaRunId }) => {
    const platform = await initializePlatform()
    try {
      const env = await seedTicketEnvironment(platform, { qaRunId })
      const app = await makeApp(platform)
      await withHttpServer(app, async (url) => {
        const subToken = await login(url, env.submitterA.email, env.password)
        const hdlToken = await login(url, env.handlerA.email, env.password)
        const admToken = await login(url, env.adminA.email, env.password)

        const t = await (await fetch(`${url}/api/tickets`, { method: 'POST', headers: authHeaders(subToken), body: JSON.stringify({ title: 'Audit', description: 'd', categoryId: env.catA, slaPriority: 'P1' }) })).json()
        await fetch(`${url}/api/tickets/${t.id}/replies`, { method: 'POST', headers: authHeaders(hdlToken), body: JSON.stringify({ content: 'Reply' }) })
        await fetch(`${url}/api/tickets/${t.id}/complete`, { method: 'POST', headers: authHeaders(hdlToken), body: JSON.stringify({ summary: 'Done' }) })
        await fetch(`${url}/api/tickets/${t.id}/satisfaction`, { method: 'POST', headers: authHeaders(subToken), body: JSON.stringify({ rating: 5 }) })

        const logs = await (await fetch(`${url}/api/logs?ticketId=${t.id}`, { headers: authHeaders(admToken) })).json()
        const actions = logs.items.map(l => l.action)
        assert.ok(actions.includes('ticket_created'))
        assert.ok(actions.includes('ticket_assigned'))
        assert.ok(actions.includes('ticket_replied'))
        assert.ok(actions.includes('ticket_completed'))
        assert.ok(actions.includes('ticket_rated'))
      })
    } finally { await platform.close() }
  })
})

test('user profile returns submitter info with department', async () => {
  await withQaEnvironment(async ({ qaRunId }) => {
    const platform = await initializePlatform()
    try {
      const env = await seedTicketEnvironment(platform, { qaRunId })
      const app = await makeApp(platform)
      await withHttpServer(app, async (url) => {
        const hdlToken = await login(url, env.handlerA.email, env.password)
        const profile = await (await fetch(`${url}/api/users/${env.submitterA.id}`, { headers: authHeaders(hdlToken) })).json()
        assert.equal(profile.id, env.submitterA.id)
        assert.equal(profile.email, env.submitterA.email)
        assert.equal(profile.role, 'submitter')
        assert.ok(profile.companyName)
      })
    } finally { await platform.close() }
  })
})

test('invalid slaPriority returns 400', async () => {
  await withQaEnvironment(async ({ qaRunId }) => {
    const platform = await initializePlatform()
    try {
      const env = await seedTicketEnvironment(platform, { qaRunId })
      const app = await makeApp(platform)
      await withHttpServer(app, async (url) => {
        const token = await login(url, env.submitterA.email, env.password)
        const res = await fetch(`${url}/api/tickets`, {
          method: 'POST', headers: authHeaders(token),
          body: JSON.stringify({ title: 'Bad priority', description: 'd', categoryId: env.catA, slaPriority: 'P9' }),
        })
        assert.equal(res.status, 400)
        assert.equal((await res.json()).error.code, 'invalid_input')
      })
    } finally { await platform.close() }
  })
})
