import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { createMemoryDb, runMigrations } from '@commonapp/dbkit'
import { createAuditKit } from '@commonapp/auditkit'
import { fileURLToPath } from 'node:url'
import {
  createTicket,
  listTickets,
  getTicket,
  updateTicket,
  addReply,
  listReplies,
  assignTicket,
  transferTicket,
  completeTicket,
  cancelTicket,
  getSubmitterInfo,
  listOperationLogs,
  getEvaluation,
  createEvaluation,
  listGroups,
  createGroup,
  listMembers,
  addMember,
  removeMember,
  listAutoAssignRules,
  createAutoAssignRule,
  listCategories,
  createCategory,
  distribution,
  dashboard,
  workbench,
  getUserInfo,
  ServiceError,
} from '../src/server/services.ts'

const migrationsDir = fileURLToPath(new URL('../src/server/migrations/', import.meta.url))

async function setupDb() {
  const db = createMemoryDb()
  await runMigrations(db, { directory: migrationsDir })
  return db
}

function makeUser(overrides = {}) {
  return {
    id: randomUUID(),
    role: 'submitter',
    status: 'active',
    name: 'Test User',
    email: `user-${randomUUID()}@example.test`,
    phone: null,
    companyId: randomUUID(),
    roles: ['submitter'],
    passwordChangeRequired: false,
    departmentId: null,
    ...overrides,
  }
}

async function seedCompany(db, companyId, name = 'Test Co') {
  const ts = new Date().toISOString()
  await db.run({ text: 'INSERT INTO companies (id, name, created_at) VALUES (?, ?, ?)', params: [companyId, name, ts] })
}

async function seedDepartment(db, deptId, companyId, name = 'Engineering') {
  const ts = new Date().toISOString()
  await db.run({ text: 'INSERT INTO departments (id, company_id, name, created_at) VALUES (?, ?, ?, ?)', params: [deptId, companyId, name, ts] })
}

async function seedUser(db, user) {
  const ts = new Date().toISOString()
  await db.run({
    text: 'INSERT INTO users (id, name, email, phone, enabled, company_id, department_id, role, password_hash, password_change_required, created_at, updated_at) VALUES (?, ?, ?, NULL, 1, ?, ?, ?, ?, 0, ?, ?)',
    params: [user.id, user.name, user.email, user.companyId, user.departmentId, user.role, 'hash', ts, ts],
  })
}

async function makeCtx(db) {
  return { db, audit: createAuditKit(db), emailClient: null }
}

test('ticket creation sets pending_assignment and records audit log', async () => {
  const db = await setupDb()
  const ctx = await makeCtx(db)
  const companyA = randomUUID()
  await seedCompany(db, companyA)
  const submitter = makeUser({ companyId: companyA, role: 'submitter' })
  await seedUser(db, submitter)
  const category = await createCategory(ctx, companyA, 'Network')
  const ticket = await createTicket(ctx, submitter, { title: 'Cannot connect', description: 'VPN down', categoryId: category.id, slaPriority: 'P1' })
  assert.equal(ticket.status, 'pending_assignment')
  assert.equal(ticket.slaPriority, 'P1')
  assert.equal(ticket.companyId, companyA)
  assert.equal(ticket.submitterId, submitter.id)
  assert.equal(ticket.categoryName, 'Network')
  const logs = await listOperationLogs(ctx, submitter, ticket.id)
  assert.ok(logs.some((l) => l.actionType === 'ticket_create'))
})

test('company isolation: user from company B cannot see company A tickets', async () => {
  const db = await setupDb()
  const ctx = await makeCtx(db)
  const companyA = randomUUID()
  const companyB = randomUUID()
  await seedCompany(db, companyA)
  await seedCompany(db, companyB)
  const submitterA = makeUser({ companyId: companyA, role: 'submitter' })
  const submitterB = makeUser({ companyId: companyB, role: 'submitter' })
  await seedUser(db, submitterA)
  await seedUser(db, submitterB)
  const category = await createCategory(ctx, companyA, 'Infra')
  const ticket = await createTicket(ctx, submitterA, { title: 'Issue', description: 'desc', categoryId: category.id, slaPriority: 'P2' })
  const detail = await getTicket(ctx, submitterB, ticket.id)
  assert.equal(detail, null)
  const list = await listTickets(ctx, submitterB, {})
  assert.equal(list.total, 0)
})

test('auto-assign rule matches category and transitions to pending_processing', async () => {
  const db = await setupDb()
  const ctx = await makeCtx(db)
  const company = randomUUID()
  await seedCompany(db, company)
  const admin = makeUser({ companyId: company, role: 'admin' })
  const submitter = makeUser({ companyId: company, role: 'submitter' })
  await seedUser(db, admin)
  await seedUser(db, submitter)
  const category = await createCategory(ctx, company, 'DB')
  const group = await createGroup(ctx, company, 'DBA Team')
  await createAutoAssignRule(ctx, company, category.id, group.id)
  const ticket = await createTicket(ctx, submitter, { title: 'DB slow', description: 'queries timing out', categoryId: category.id, slaPriority: 'P0' })
  assert.equal(ticket.status, 'pending_processing')
  assert.equal(ticket.assignedGroupId, group.id)
  const logs = await listOperationLogs(ctx, submitter, ticket.id)
  assert.ok(logs.some((l) => l.actionType === 'ticket_auto_assign'))
})

test('auto-assign rule idempotency: duplicate categoryId returns 409', async () => {
  const db = await setupDb()
  const ctx = await makeCtx(db)
  const company = randomUUID()
  await seedCompany(db, company)
  const category = await createCategory(ctx, company, 'Security')
  const group = await createGroup(ctx, company, 'Sec Team')
  await createAutoAssignRule(ctx, company, category.id, group.id)
  await assert.rejects(() => createAutoAssignRule(ctx, company, category.id, group.id), (e) => e.status === 409 && e.code === 'CONFLICT')
})

test('ticket lifecycle: assign → transfer → complete with email fallback', async () => {
  const db = await setupDb()
  const ctx = await makeCtx(db)
  const company = randomUUID()
  await seedCompany(db, company)
  const submitter = makeUser({ companyId: company, role: 'submitter' })
  const handler1 = makeUser({ companyId: company, role: 'handler', name: 'Handler One' })
  const handler2 = makeUser({ companyId: company, role: 'handler', name: 'Handler Two' })
  await seedUser(db, submitter)
  await seedUser(db, handler1)
  await seedUser(db, handler2)
  const category = await createCategory(ctx, company, 'General')
  const ticket = await createTicket(ctx, submitter, { title: 'Help', description: 'need assistance', categoryId: category.id, slaPriority: 'P3' })
  const assigned = await assignTicket(ctx, handler1, ticket.id, { targetType: 'user', targetUserId: handler1.id })
  assert.equal(assigned.status, 'pending_processing')
  assert.equal(assigned.assignedHandlerId, handler1.id)
  const transferred = await transferTicket(ctx, handler1, ticket.id, { targetType: 'user', targetUserId: handler2.id, reason: 'reassign' })
  assert.equal(transferred.assignedHandlerId, handler2.id)
  const completed = await completeTicket(ctx, handler2, ticket.id, 'resolved')
  assert.equal(completed.status, 'completed')
  assert.equal(completed.handlerId, handler2.id)
  assert.ok(completed.handledAt)
})

test('cancel ticket from pending_assignment by submitter', async () => {
  const db = await setupDb()
  const ctx = await makeCtx(db)
  const company = randomUUID()
  await seedCompany(db, company)
  const submitter = makeUser({ companyId: company, role: 'submitter' })
  await seedUser(db, submitter)
  const category = await createCategory(ctx, company, 'Misc')
  const ticket = await createTicket(ctx, submitter, { title: 'Cancel me', description: 'no longer needed', categoryId: category.id, slaPriority: 'P4' })
  const cancelled = await cancelTicket(ctx, submitter, ticket.id, 'duplicate')
  assert.equal(cancelled.status, 'cancelled')
})

test('evaluation: submitter rates completed ticket; duplicate returns 409', async () => {
  const db = await setupDb()
  const ctx = await makeCtx(db)
  const company = randomUUID()
  await seedCompany(db, company)
  const submitter = makeUser({ companyId: company, role: 'submitter' })
  const handler = makeUser({ companyId: company, role: 'handler' })
  await seedUser(db, submitter)
  await seedUser(db, handler)
  const category = await createCategory(ctx, company, 'Support')
  const ticket = await createTicket(ctx, submitter, { title: 'Rate me', description: 'done', categoryId: category.id, slaPriority: 'P2' })
  await assignTicket(ctx, handler, ticket.id, { targetType: 'user', targetUserId: handler.id })
  await completeTicket(ctx, handler, ticket.id)
  const evalResult = await createEvaluation(ctx, submitter, ticket.id, 5, 'great')
  assert.equal(evalResult.rating, 5)
  const fetched = await getEvaluation(ctx, submitter, ticket.id)
  assert.equal(fetched.rating, 5)
  await assert.rejects(() => createEvaluation(ctx, submitter, ticket.id, 3), (e) => e.status === 409)
})

test('evaluation rejects non-completed ticket and non-submitter', async () => {
  const db = await setupDb()
  const ctx = await makeCtx(db)
  const company = randomUUID()
  await seedCompany(db, company)
  const submitter = makeUser({ companyId: company, role: 'submitter' })
  const handler = makeUser({ companyId: company, role: 'handler' })
  await seedUser(db, submitter)
  await seedUser(db, handler)
  const category = await createCategory(ctx, company, 'Bug')
  const ticket = await createTicket(ctx, submitter, { title: 'Bug', description: 'crash', categoryId: category.id, slaPriority: 'P1' })
  await assert.rejects(() => createEvaluation(ctx, submitter, ticket.id, 4), (e) => e.status === 409)
  await assignTicket(ctx, handler, ticket.id, { targetType: 'user', targetUserId: handler.id })
  await completeTicket(ctx, handler, ticket.id)
  await assert.rejects(() => createEvaluation(ctx, handler, ticket.id, 4), (e) => e.status === 403)
})

test('replies are listed in ascending time order', async () => {
  const db = await setupDb()
  const ctx = await makeCtx(db)
  const company = randomUUID()
  await seedCompany(db, company)
  const submitter = makeUser({ companyId: company, role: 'submitter' })
  await seedUser(db, submitter)
  const category = await createCategory(ctx, company, 'Chat')
  const ticket = await createTicket(ctx, submitter, { title: 'Replies', description: 'multi', categoryId: category.id, slaPriority: 'P2' })
  const r1 = await addReply(ctx, submitter, ticket.id, 'first')
  await new Promise((r) => setTimeout(r, 10))
  const r2 = await addReply(ctx, submitter, ticket.id, 'second')
  const replies = await listReplies(ctx, submitter, ticket.id)
  assert.equal(replies.length, 2)
  assert.equal(replies[0].id, r1.id)
  assert.equal(replies[1].id, r2.id)
})

test('submitter info includes history tickets and department', async () => {
  const db = await setupDb()
  const ctx = await makeCtx(db)
  const company = randomUUID()
  const dept = randomUUID()
  await seedCompany(db, company)
  await seedDepartment(db, dept, company)
  const submitter = makeUser({ companyId: company, role: 'submitter', departmentId: dept, name: 'Alice' })
  await seedUser(db, submitter)
  const category = await createCategory(ctx, company, 'HR')
  await createTicket(ctx, submitter, { title: 'T1', description: 'd', categoryId: category.id, slaPriority: 'P2' })
  await createTicket(ctx, submitter, { title: 'T2', description: 'd', categoryId: category.id, slaPriority: 'P3' })
  const ticket = await createTicket(ctx, submitter, { title: 'T3', description: 'd', categoryId: category.id, slaPriority: 'P1' })
  const info = await getSubmitterInfo(ctx, submitter, ticket.id)
  assert.equal(info.fullName, 'Alice')
  assert.equal(info.departmentName, 'Engineering')
  assert.equal(info.ticketCount, 3)
  assert.equal(info.historyTickets.length, 3)
})

test('business group member management', async () => {
  const db = await setupDb()
  const ctx = await makeCtx(db)
  const company = randomUUID()
  await seedCompany(db, company)
  const group = await createGroup(ctx, company, 'Ops')
  const member = makeUser({ companyId: company, role: 'handler', name: 'Bob' })
  await seedUser(db, member)
  const added = await addMember(ctx, group.id, member.id)
  assert.equal(added.userId, member.id)
  const members = await listMembers(ctx, group.id)
  assert.equal(members.length, 1)
  const groups = await listGroups(ctx, company)
  assert.equal(groups[0].memberCount, 1)
  const removed = await removeMember(ctx, group.id, member.id)
  assert.equal(removed, true)
  const afterRemoval = await listMembers(ctx, group.id)
  assert.equal(afterRemoval.length, 0)
})

test('statistics dashboard aggregates tickets and evaluations', async () => {
  const db = await setupDb()
  const ctx = await makeCtx(db)
  const company = randomUUID()
  await seedCompany(db, company)
  const submitter = makeUser({ companyId: company, role: 'submitter' })
  const handler = makeUser({ companyId: company, role: 'handler' })
  await seedUser(db, submitter)
  await seedUser(db, handler)
  const category = await createCategory(ctx, company, 'Stats')
  const t1 = await createTicket(ctx, submitter, { title: 't1', description: 'd', categoryId: category.id, slaPriority: 'P1' })
  await createTicket(ctx, submitter, { title: 't2', description: 'd', categoryId: category.id, slaPriority: 'P2' })
  await assignTicket(ctx, handler, t1.id, { targetType: 'user', targetUserId: handler.id })
  await completeTicket(ctx, handler, t1.id)
  await createEvaluation(ctx, submitter, t1.id, 4)
  const dash = await dashboard(ctx, company)
  assert.equal(dash.totalTickets, 2)
  assert.equal(dash.byStatus.completed, 1)
  assert.equal(dash.byStatus.pending_assignment, 1)
  assert.equal(dash.totalEvaluations, 1)
  assert.equal(dash.satisfactionScore, 4)
  assert.ok(dash.topCategories.length >= 1)
  assert.equal(dash.topCategories[0].categoryName, 'Stats')
})

test('statistics distribution by company dimension', async () => {
  const db = await setupDb()
  const ctx = await makeCtx(db)
  const company = randomUUID()
  await seedCompany(db, company, 'Acme')
  const submitter = makeUser({ companyId: company, role: 'submitter' })
  await seedUser(db, submitter)
  const category = await createCategory(ctx, company, 'Dist')
  await createTicket(ctx, submitter, { title: 'a', description: 'd', categoryId: category.id, slaPriority: 'P1' })
  await createTicket(ctx, submitter, { title: 'b', description: 'd', categoryId: category.id, slaPriority: 'P2' })
  const dist = await distribution(ctx, submitter, 'company')
  assert.equal(dist.groups.length, 1)
  assert.equal(dist.groups[0].label, 'Acme')
  assert.equal(dist.groups[0].total, 2)
})

test('workbench returns handler assigned tickets sorted by SLA priority', async () => {
  const db = await setupDb()
  const ctx = await makeCtx(db)
  const company = randomUUID()
  await seedCompany(db, company)
  const submitter = makeUser({ companyId: company, role: 'submitter' })
  const handler = makeUser({ companyId: company, role: 'handler' })
  await seedUser(db, submitter)
  await seedUser(db, handler)
  const category = await createCategory(ctx, company, 'WB')
  const tLow = await createTicket(ctx, submitter, { title: 'low', description: 'd', categoryId: category.id, slaPriority: 'P3' })
  const tHigh = await createTicket(ctx, submitter, { title: 'high', description: 'd', categoryId: category.id, slaPriority: 'P0' })
  await assignTicket(ctx, handler, tLow.id, { targetType: 'user', targetUserId: handler.id })
  await assignTicket(ctx, handler, tHigh.id, { targetType: 'user', targetUserId: handler.id })
  const wb = await workbench(ctx, handler, { sortBy: 'slaPriority', sortOrder: 'asc' })
  assert.equal(wb.total, 2)
  assert.equal(wb.items[0].slaPriority, 'P0')
  assert.equal(wb.items[1].slaPriority, 'P3')
})

test('update ticket only allowed for submitter or admin in pending states', async () => {
  const db = await setupDb()
  const ctx = await makeCtx(db)
  const company = randomUUID()
  await seedCompany(db, company)
  const submitter = makeUser({ companyId: company, role: 'submitter' })
  const otherSubmitter = makeUser({ companyId: company, role: 'submitter', name: 'Other' })
  await seedUser(db, submitter)
  await seedUser(db, otherSubmitter)
  const category = await createCategory(ctx, company, 'Upd')
  const ticket = await createTicket(ctx, submitter, { title: 'orig', description: 'd', categoryId: category.id, slaPriority: 'P2' })
  await assert.rejects(() => updateTicket(ctx, otherSubmitter, ticket.id, { title: 'hacked' }), (e) => e.status === 403)
  const updated = await updateTicket(ctx, submitter, ticket.id, { title: 'renamed', slaPriority: 'P1' })
  assert.equal(updated.title, 'renamed')
  assert.equal(updated.slaPriority, 'P1')
})

test('transfer requires assigned handler; non-assigned handler is forbidden', async () => {
  const db = await setupDb()
  const ctx = await makeCtx(db)
  const company = randomUUID()
  await seedCompany(db, company)
  const submitter = makeUser({ companyId: company, role: 'submitter' })
  const handler1 = makeUser({ companyId: company, role: 'handler', name: 'H1' })
  const handler2 = makeUser({ companyId: company, role: 'handler', name: 'H2' })
  await seedUser(db, submitter)
  await seedUser(db, handler1)
  await seedUser(db, handler2)
  const category = await createCategory(ctx, company, 'Trans')
  const ticket = await createTicket(ctx, submitter, { title: 'trans', description: 'd', categoryId: category.id, slaPriority: 'P2' })
  await assignTicket(ctx, handler1, ticket.id, { targetType: 'user', targetUserId: handler1.id })
  await assert.rejects(() => transferTicket(ctx, handler2, ticket.id, { targetType: 'user', targetUserId: handler1.id }), (e) => e.status === 403)
})

test('getUserInfo returns UserInfo shape with company and department names', async () => {
  const db = await setupDb()
  const ctx = await makeCtx(db)
  const company = randomUUID()
  const dept = randomUUID()
  await seedCompany(db, company, 'Globex')
  await seedDepartment(db, dept, company, 'Sales')
  const user = makeUser({ companyId: company, role: 'admin', departmentId: dept, name: 'Carol' })
  await seedUser(db, user)
  const info = await getUserInfo(ctx, user)
  assert.equal(info.role, 'admin')
  assert.equal(info.companyName, 'Globex')
  assert.equal(info.departmentName, 'Sales')
  assert.equal(info.fullName, 'Carol')
  assert.equal(info.username, user.email)
})
