import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createApp } from '../src/server/app.ts'
import { registerPublicRoutes, registerProtectedRoutes } from '../src/server/routes.ts'
import { initializePlatform } from '../src/server/platform/bootstrap.ts'
import { withHttpServer } from './with-http-server.mjs'

const json = (res) => res.json()

async function post(url, path, body) {
  return fetch(`${url}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function patch(url, path, body) {
  return fetch(`${url}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

test('ticket lifecycle: create → auto-assign → reply → transfer → complete → evaluate', async () => {
  const previous = process.env.DB_PATH
  process.env.DB_PATH = ':memory:'
  const platform = await initializePlatform()
  try {
    const app = createApp({
      registerPublicRoutes: (routes) => registerPublicRoutes(routes, platform),
      registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
    })
    await withHttpServer({ fetch: app.fetch, close: undefined }, async (url) => {
      // Create company
      const company = await json(await post(url, '/api/companies', { name: 'Acme Corp' }))
      assert.equal(company.name, 'Acme Corp')
      assert.ok(company.id)

      // Create business group
      const group = await json(await post(url, `/api/companies/${company.id}/groups`, { name: 'Support Team' }))
      assert.equal(group.companyId, company.id)
      assert.equal(group.name, 'Support Team')

      // Add member
      const member = await json(await post(url, `/api/groups/${group.id}/members`, { name: 'Jane Smith', email: 'jane@acme.com' }))
      assert.equal(member.groupId, group.id)
      assert.equal(member.email, 'jane@acme.com')

      // Create assignment rule
      const rule = await json(await post(url, '/api/assignment-rules', {
        companyId: company.id,
        category: 'network',
        targetGroupId: group.id,
      }))
      assert.equal(rule.companyName, 'Acme Corp')
      assert.equal(rule.targetGroupName, 'Support Team')

      // Create ticket (auto-assigned via rule)
      const ticket = await json(await post(url, '/api/tickets', {
        subject: 'Network outage',
        description: 'Cannot access internal services',
        category: 'network',
        slaPriority: 'P1',
        submitterName: 'Alice Lee',
        submitterCompanyId: company.id,
        submitterDepartment: 'Operations',
        submitterEmail: 'alice@acme.com',
      }))
      assert.equal(ticket.status, 'pending_process')
      assert.equal(ticket.currentGroupId, group.id)
      assert.equal(ticket.currentGroupName, 'Support Team')
      assert.equal(ticket.submitterCompanyName, 'Acme Corp')

      // Create ticket without matching rule (pending_assign)
      const ticket2 = await json(await post(url, '/api/tickets', {
        subject: 'Hardware request',
        description: 'Need new laptop',
        category: 'hardware',
        slaPriority: 'P3',
        submitterName: 'Alice Lee',
        submitterCompanyId: company.id,
        submitterDepartment: 'Operations',
        submitterEmail: 'alice@acme.com',
      }))
      assert.equal(ticket2.status, 'pending_assign')
      assert.equal(ticket2.currentGroupId, null)

      // List tickets
      const list = await json(await fetch(`${url}/api/tickets`))
      assert.equal(list.total, 2)
      assert.equal(list.items.length, 2)

      // Filter by status
      const pendingProcess = await json(await fetch(`${url}/api/tickets?status=pending_process`))
      assert.equal(pendingProcess.items.length, 1)
      assert.equal(pendingProcess.items[0].id, ticket.id)

      // Search
      const search = await json(await fetch(`${url}/api/tickets?q=outage`))
      assert.equal(search.items.length, 1)

      // Get ticket detail
      const detail = await json(await fetch(`${url}/api/tickets/${ticket.id}`))
      assert.equal(detail.id, ticket.id)
      assert.equal(detail.subject, 'Network outage')

      // Add replies
      const reply1 = await json(await post(url, `/api/tickets/${ticket.id}/replies`, {
        replierName: 'Jane Smith',
        content: 'Looking into this now',
      }))
      assert.equal(reply1.content, 'Looking into this now')
      assert.equal(reply1.replierName, 'Jane Smith')

      const reply2 = await json(await post(url, `/api/tickets/${ticket.id}/replies`, {
        replierName: 'Alice Lee',
        content: 'Any update?',
      }))

      // List replies
      const replies = await json(await fetch(`${url}/api/tickets/${ticket.id}/replies`))
      assert.equal(replies.items.length, 2)
      assert.equal(replies.items[0].replierName, 'Jane Smith')
      assert.equal(replies.items[1].replierName, 'Alice Lee')

      // Create second group for transfer
      const group2 = await json(await post(url, `/api/companies/${company.id}/groups`, { name: 'Engineering Team' }))

      // Transfer ticket
      const transferred = await json(await post(url, `/api/tickets/${ticket.id}/transfer`, {
        toGroupId: group2.id,
        transferredBy: 'Jane Smith',
      }))
      assert.equal(transferred.status, 'pending_process')
      assert.equal(transferred.currentGroupId, group2.id)

      // Transfer history
      const transfers = await json(await fetch(`${url}/api/tickets/${ticket.id}/transfers`))
      assert.equal(transfers.items.length, 1)
      assert.equal(transfers.items[0].fromGroupName, 'Support Team')
      assert.equal(transfers.items[0].toGroupName, 'Engineering Team')

      // Complete ticket
      const completed = await json(await post(url, `/api/tickets/${ticket.id}/complete`, {
        handlerMemberId: member.id,
        handlerName: 'Jane Smith',
      }))
      assert.equal(completed.status, 'completed')
      assert.equal(completed.handlerName, 'Jane Smith')
      assert.ok(completed.processedAt)

      // Submit evaluation
      const evaluation = await json(await post(url, `/api/tickets/${ticket.id}/evaluation`, {
        rating: 5,
        comment: 'Excellent support',
      }))
      assert.equal(evaluation.rating, 5)
      assert.equal(evaluation.comment, 'Excellent support')

      // Get evaluation
      const evalGet = await json(await fetch(`${url}/api/tickets/${ticket.id}/evaluation`))
      assert.equal(evalGet.rating, 5)

      // Duplicate evaluation → 400
      const dupEval = await post(url, `/api/tickets/${ticket.id}/evaluation`, { rating: 3 })
      assert.equal(dupEval.status, 400)
      const dupEvalBody = await json(dupEval)
      assert.equal(dupEvalBody.error.code, 'VALIDATION_ERROR')

      // Submitter info with history tickets
      const submitterInfo = await json(await fetch(`${url}/api/tickets/${ticket.id}/submitter-info`))
      assert.equal(submitterInfo.name, 'Alice Lee')
      assert.equal(submitterInfo.company, 'Acme Corp')
      assert.equal(submitterInfo.department, 'Operations')
      assert.ok(submitterInfo.historyTickets.length >= 2)

      // Cancel ticket2
      const cancelled = await json(await patch(url, `/api/tickets/${ticket2.id}/status`, { status: 'cancelled' }))
      assert.equal(cancelled.status, 'cancelled')

      // Cannot cancel completed ticket
      const badCancel = await patch(url, `/api/tickets/${ticket.id}/status`, { status: 'cancelled' })
      assert.equal(badCancel.status, 400)

      // Manual assign ticket2 (pending_assign → cancelled, should fail)
      const badAssign = await post(url, `/api/tickets/${ticket2.id}/assign`, { groupId: group.id })
      assert.equal(badAssign.status, 400)

      // 404 for non-existent ticket
      const notFound = await fetch(`${url}/api/tickets/nonexistent-id`)
      assert.equal(notFound.status, 404)

      // Validation error for missing required field
      const badTicket = await post(url, '/api/tickets', { subject: 'Incomplete' })
      assert.equal(badTicket.status, 400)
      const badTicketBody = await json(badTicket)
      assert.equal(badTicketBody.error.code, 'VALIDATION_ERROR')

      // Invalid slaPriority
      const badPriority = await post(url, '/api/tickets', {
        subject: 'Test', description: 'Test', category: 'test',
        slaPriority: 'P9', submitterName: 'A', submitterCompanyId: company.id,
        submitterDepartment: 'D', submitterEmail: 'a@b.com',
      })
      assert.equal(badPriority.status, 400)

      // Duplicate assignment rule
      const dupRule = await post(url, '/api/assignment-rules', {
        companyId: company.id, category: 'network', targetGroupId: group.id,
      })
      assert.equal(dupRule.status, 400)

      // List companies
      const companies = await json(await fetch(`${url}/api/companies`))
      assert.ok(companies.items.length >= 1)

      // List groups
      const groups = await json(await fetch(`${url}/api/companies/${company.id}/groups`))
      assert.equal(groups.items.length, 2)

      // List members
      const members = await json(await fetch(`${url}/api/groups/${group.id}/members`))
      assert.equal(members.items.length, 1)

      // List rules with filter
      const rules = await json(await fetch(`${url}/api/assignment-rules?companyId=${company.id}`))
      assert.equal(rules.items.length, 1)
    })
  } finally {
    await platform.close()
    if (previous === undefined) delete process.env.DB_PATH
    else process.env.DB_PATH = previous
  }
})
