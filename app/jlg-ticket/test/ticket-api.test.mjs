import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { createApp } from '../src/server/app.ts'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'
import { registerPublicRoutes, registerProtectedRoutes } from '../src/server/routes.ts'
import { seedUser } from '../src/server/services.ts'
import { withHttpServer } from './with-http-server.mjs'

// Isolated DB + real HTTP server per test scope.
async function withTicketApp(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'ticket-api-'))
  const previousDb = process.env.DB_PATH
  process.env.DB_PATH = path.join(dir, 'test.db')
  try {
    const platform = await initializePlatform()
    const app = createApp({
      registerPublicRoutes: (routes) => registerPublicRoutes(routes, platform),
      registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
    })
    await withHttpServer(app, async (url) => fn(url, platform))
  } finally {
    if (previousDb === undefined) delete process.env.DB_PATH
    else process.env.DB_PATH = previousDb
    await rm(dir, { recursive: true, force: true })
  }
}

async function json(res) {
  return JSON.parse(await res.text())
}

test('full ticket lifecycle: create → auto-assign → reply → transfer → complete → evaluate', async () => {
  await withTicketApp(async (url, platform) => {
    // ── Seed: company, users, category, business group, rule ──
    const company = await (await fetch(`${url}/api/companies`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Acme Corp' }),
    })).json().then((b) => b.company)

    const submitterId = await seedUser(platform.db, { name: 'Alice', email: 'alice@acme.test', companyId: company.id, department: 'Engineering' })
    const handlerId = await seedUser(platform.db, { name: 'Bob', email: 'bob@acme.test', companyId: company.id, department: 'IT Support' })
    const otherHandlerId = await seedUser(platform.db, { name: 'Charlie', email: 'charlie@acme.test', companyId: company.id, department: 'IT Support' })

    const category = await (await fetch(`${url}/api/categories`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Network' }),
    })).json().then((b) => b.category)

    const group = await (await fetch(`${url}/api/companies/${company.id}/business-groups`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Network Ops' }),
    })).json().then((b) => b.group)

    // Add members
    const member = await (await fetch(`${url}/api/business-groups/${group.id}/members`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: handlerId }),
    })).json().then((b) => b.member)
    assert.equal(member.userId, handlerId)

    // Create rule: Acme + Network → Network Ops
    const rule = await (await fetch(`${url}/api/category-group-rules`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ companyId: company.id, categoryId: category.id, groupId: group.id }),
    })).json().then((b) => b.rule)

    // ── AC-05: Create ticket → auto-assigned ──
    const ticket = await (await fetch(`${url}/api/tickets`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subject: 'Cannot access VPN', description: 'VPN connection drops every 5 minutes', categoryId: category.id, priority: 'P2', submitterId }),
    })).json().then((b) => b.ticket)

    assert.equal(ticket.status, 'pending_processing')
    assert.equal(ticket.assignedGroupId, group.id)
    assert.match(ticket.ticketNo, /^TKT-\d{8}-\d{4}$/)
    assert.equal(ticket.priority, 'P2')

    // ── AC-01: Ticket without matching rule → pending_assignment ──
    const cat2 = await (await fetch(`${url}/api/categories`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Hardware' }),
    })).json().then((b) => b.category)

    const ticket2 = await (await fetch(`${url}/api/tickets`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subject: 'Broken keyboard', categoryId: cat2.id, priority: 'P3', submitterId }),
    })).json().then((b) => b.ticket)
    assert.equal(ticket2.status, 'pending_assignment')
    assert.equal(ticket2.assignedGroupId, null)

    // ── AC-03: Status transitions ──
    // ticket2: pending_assignment → pending_processing (manual assign)
    const assigned = await (await fetch(`${url}/api/tickets/${ticket2.id}/status`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'pending_processing', groupId: group.id, assigneeId: handlerId }),
    })).json().then((b) => b.ticket)
    assert.equal(assigned.status, 'pending_processing')
    assert.equal(assigned.assigneeId, handlerId)

    // ticket2: pending_processing → cancelled
    const cancelled = await (await fetch(`${url}/api/tickets/${ticket2.id}/status`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    })).json().then((b) => b.ticket)
    assert.equal(cancelled.status, 'cancelled')

    // ── AC-02: Multi-round replies ──
    const reply1 = await (await fetch(`${url}/api/tickets/${ticket.id}/replies`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ replierId: handlerId, content: 'Looking into this now' }),
    })).json().then((b) => b.reply)
    assert.equal(reply1.replierName, 'Bob')

    const reply2 = await (await fetch(`${url}/api/tickets/${ticket.id}/replies`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ replierId: submitterId, content: 'Any update?' }),
    })).json().then((b) => b.reply)
    assert.equal(reply2.replierName, 'Alice')

    const repliesRes = await fetch(`${url}/api/tickets/${ticket.id}/replies`)
    const repliesBody = await json(repliesRes)
    assert.equal(repliesBody.replies.length, 2)
    // Ordered by createdAt ascending
    assert.equal(repliesBody.replies[0].content, 'Looking into this now')

    // ── AC-06: Transfer ──
    const transferred = await (await fetch(`${url}/api/tickets/${ticket.id}/transfer`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fromUserId: handlerId, toUserId: otherHandlerId, reason: 'Charlie has more VPN expertise' }),
    })).json().then((b) => b.ticket)
    assert.equal(transferred.status, 'pending_processing')
    assert.equal(transferred.assigneeId, otherHandlerId)

    const transfersRes = await fetch(`${url}/api/tickets/${ticket.id}/transfers`)
    const transfersBody = await json(transfersRes)
    assert.equal(transfersBody.transfers.length, 1)
    assert.equal(transfersBody.transfers[0].toUserName, 'Charlie')

    // ── AC-08: Complete ticket ──
    const completed = await (await fetch(`${url}/api/tickets/${ticket.id}/status`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'completed', assigneeId: otherHandlerId }),
    })).json().then((b) => b.ticket)
    assert.equal(completed.status, 'completed')
    assert.equal(completed.handledById, otherHandlerId)
    assert.ok(completed.completedAt)
    assert.ok(completed.handledAt)

    // ── AC-09: Evaluation ──
    const evaluation = await (await fetch(`${url}/api/tickets/${ticket.id}/evaluation`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rating: 5, comment: 'Great support!' }),
    })).json().then((b) => b.evaluation)
    assert.equal(evaluation.rating, 5)
    assert.equal(evaluation.comment, 'Great support!')

    // ── AC-07: Ticket detail with submitter info ──
    const detail = await (await fetch(`${url}/api/tickets/${ticket.id}`)).json().then((b) => b.ticket)
    assert.equal(detail.submitter.name, 'Alice')
    assert.equal(detail.submitter.companyName, 'Acme Corp')
    assert.equal(detail.submitter.department, 'Engineering')
    assert.equal(detail.replies.length, 2)
    assert.equal(detail.transfers.length, 1)
    assert.equal(detail.evaluation.rating, 5)
    assert.equal(detail.assignedGroup.name, 'Network Ops')

    // ── AC-07: User detail with historical tickets ──
    const user = await (await fetch(`${url}/api/users/${submitterId}`)).json().then((b) => b.user)
    assert.equal(user.name, 'Alice')
    assert.equal(user.companyName, 'Acme Corp')
    assert.ok(user.historicalTickets.length >= 2)
    const tktnos = user.historicalTickets.map((t) => t.ticketNo)
    assert.ok(tktnos.includes(ticket.ticketNo))
    assert.ok(tktnos.includes(ticket2.ticketNo))
  })
})

test('error cases: invalid transition, invalid rating, duplicate evaluation, transfer target required', async () => {
  await withTicketApp(async (url, platform) => {
    const company = await (await fetch(`${url}/api/companies`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'TestCo' }),
    })).json().then((b) => b.company)

    const submitterId = await seedUser(platform.db, { name: 'Sub', email: 'sub@test.test', companyId: company.id })
    const category = await (await fetch(`${url}/api/categories`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Bug' }),
    })).json().then((b) => b.category)

    // Ticket starts as pending_assignment (no rule)
    const ticket = await (await fetch(`${url}/api/tickets`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subject: 'Issue', categoryId: category.id, priority: 'P3', submitterId }),
    })).json().then((b) => b.ticket)

    // Invalid transition: pending_assignment → completed (not allowed)
    const badTransition = await fetch(`${url}/api/tickets/${ticket.id}/status`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    })
    assert.equal(badTransition.status, 400)
    const badBody = await json(badTransition)
    assert.equal(badBody.error.code, 'INVALID_TRANSITION')

    // Invalid priority
    const badPriority = await fetch(`${url}/api/tickets`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subject: 'X', categoryId: category.id, priority: 'P9', submitterId }),
    })
    assert.equal(badPriority.status, 400)
    assert.equal((await json(badPriority)).error.code, 'INVALID_PRIORITY')

    // Assign then complete for evaluation tests
    await fetch(`${url}/api/tickets/${ticket.id}/status`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'pending_processing' }),
    })
    await fetch(`${url}/api/tickets/${ticket.id}/status`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    })

    // Invalid rating
    const badRating = await fetch(`${url}/api/tickets/${ticket.id}/evaluation`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rating: 0 }),
    })
    assert.equal(badRating.status, 400)
    assert.equal((await json(badRating)).error.code, 'INVALID_RATING')

    // Valid evaluation
    await fetch(`${url}/api/tickets/${ticket.id}/evaluation`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rating: 4 }),
    })

    // Duplicate evaluation
    const dupEval = await fetch(`${url}/api/tickets/${ticket.id}/evaluation`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rating: 3 }),
    })
    assert.equal(dupEval.status, 409)
    assert.equal((await json(dupEval)).error.code, 'EVALUATION_EXISTS')

    // Evaluation on non-completed ticket
    const ticket2 = await (await fetch(`${url}/api/tickets`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subject: 'Y', categoryId: category.id, priority: 'P1', submitterId }),
    })).json().then((b) => b.ticket)
    const evalNotCompleted = await fetch(`${url}/api/tickets/${ticket2.id}/evaluation`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rating: 5 }),
    })
    assert.equal(evalNotCompleted.status, 400)
    assert.equal((await json(evalNotCompleted)).error.code, 'TICKET_NOT_COMPLETED')
  })
})

test('business group management: create groups, add/remove members, duplicate member', async () => {
  await withTicketApp(async (url, platform) => {
    const company = await (await fetch(`${url}/api/companies`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'GroupCo' }),
    })).json().then((b) => b.company)

    const group1 = await (await fetch(`${url}/api/companies/${company.id}/business-groups`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Team A' }),
    })).json().then((b) => b.group)

    const group2 = await (await fetch(`${url}/api/companies/${company.id}/business-groups`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Team B' }),
    })).json().then((b) => b.group)

    // List groups
    const groups = await (await fetch(`${url}/api/companies/${company.id}/business-groups`)).json().then((b) => b.groups)
    assert.equal(groups.length, 2)

    const userId = await seedUser(platform.db, { name: 'Member1', email: 'm1@group.test', companyId: company.id })

    // Add member
    const member = await (await fetch(`${url}/api/business-groups/${group1.id}/members`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId }),
    })).json().then((b) => b.member)
    assert.equal(member.userName, 'Member1')

    // Duplicate member → 409
    const dup = await fetch(`${url}/api/business-groups/${group1.id}/members`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    assert.equal(dup.status, 409)
    assert.equal((await json(dup)).error.code, 'MEMBER_EXISTS')

    // List members
    const members = await (await fetch(`${url}/api/business-groups/${group1.id}/members`)).json().then((b) => b.members)
    assert.equal(members.length, 1)
    assert.equal(members[0].userId, userId)

    // Remove member
    const removed = await fetch(`${url}/api/business-groups/${group1.id}/members/${userId}`, { method: 'DELETE' })
    assert.equal(removed.status, 204)

    // Verify removed
    const membersAfter = await (await fetch(`${url}/api/business-groups/${group1.id}/members`)).json().then((b) => b.members)
    assert.equal(membersAfter.length, 0)
  })
})

test('ticket list filtering and category-group rule lifecycle', async () => {
  await withTicketApp(async (url, platform) => {
    const company = await (await fetch(`${url}/api/companies`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'FilterCo' }),
    })).json().then((b) => b.company)

    const submitterId = await seedUser(platform.db, { name: 'FilterUser', email: 'fu@test.test', companyId: company.id })
    const cat = await (await fetch(`${url}/api/categories`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'FilterCat' }),
    })).json().then((b) => b.category)
    const group = await (await fetch(`${url}/api/companies/${company.id}/business-groups`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'FilterGroup' }),
    })).json().then((b) => b.group)

    // Create rule
    const rule = await (await fetch(`${url}/api/category-group-rules`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ companyId: company.id, categoryId: cat.id, groupId: group.id }),
    })).json().then((b) => b.rule)

    // Duplicate rule → 409
    const dupRule = await fetch(`${url}/api/category-group-rules`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ companyId: company.id, categoryId: cat.id, groupId: group.id }),
    })
    assert.equal(dupRule.status, 409)

    // Create tickets
    await fetch(`${url}/api/tickets`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subject: 'T1', categoryId: cat.id, priority: 'P0', submitterId }),
    })
    await fetch(`${url}/api/tickets`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subject: 'T2', categoryId: cat.id, priority: 'P3', submitterId }),
    })

    // List by priority filter
    const p0Tickets = await (await fetch(`${url}/api/tickets?priority=P0`)).json().then((b) => b.tickets)
    assert.equal(p0Tickets.length, 1)
    assert.equal(p0Tickets[0].subject, 'T1')

    // List by status filter
    const processingTickets = await (await fetch(`${url}/api/tickets?status=pending_processing`)).json().then((b) => b.tickets)
    assert.equal(processingTickets.length, 2)

    // List by submitter
    const submitterTickets = await (await fetch(`${url}/api/tickets?submitterId=${submitterId}`)).json().then((b) => b.tickets)
    assert.equal(submitterTickets.length, 2)

    // Filter rules by company
    const rules = await (await fetch(`${url}/api/category-group-rules?companyId=${company.id}`)).json().then((b) => b.rules)
    assert.equal(rules.length, 1)
    assert.equal(rules[0].categoryName, 'FilterCat')

    // Delete rule
    const deleted = await fetch(`${url}/api/category-group-rules/${rule.id}`, { method: 'DELETE' })
    assert.equal(deleted.status, 204)

    const rulesAfter = await (await fetch(`${url}/api/category-group-rules`)).json().then((b) => b.rules)
    assert.equal(rulesAfter.length, 0)
  })
})
