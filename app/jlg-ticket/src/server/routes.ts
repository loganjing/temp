import { randomUUID } from 'node:crypto'
import type { Hono, Context } from 'hono'
import type { DbClient } from '@commonapp/dbkit'
import { isSlaPriority } from '../shared/constants'
import type {
  TicketSummary,
  TicketDetail,
  Reply,
  TransferRecord,
  Evaluation,
  Company,
  BusinessGroup,
  GroupMember,
  AssignmentRule,
  SubmitterInfo,
} from '../shared/types'
import type { initializePlatform } from './platform/bootstrap'

type Platform = Awaited<ReturnType<typeof initializePlatform>>

// --- helpers ---

function badRequest(c: Context, message: string) {
  return c.json({ error: { code: 'VALIDATION_ERROR', message } }, 400)
}
function notFound(c: Context, message = 'Resource not found') {
  return c.json({ error: { code: 'NOT_FOUND', message } }, 404)
}

function nowISO(): string {
  return new Date().toISOString()
}

interface TicketRow {
  id: string
  subject: string
  description: string
  category: string
  sla_priority: string
  submitter_name: string
  submitter_company_id: string
  submitter_department: string
  submitter_email: string
  status: string
  current_group_id: string | null
  handler_member_id: string | null
  handler_name: string | null
  processed_at: string | null
  created_at: string
  submitter_company_name: string
  current_group_name: string | null
}

function mapTicketDetail(row: TicketRow): TicketDetail {
  return {
    id: row.id,
    subject: row.subject,
    description: row.description,
    category: row.category,
    slaPriority: row.sla_priority,
    submitterName: row.submitter_name,
    submitterCompanyId: row.submitter_company_id,
    submitterDepartment: row.submitter_department,
    submitterEmail: row.submitter_email,
    status: row.status,
    currentGroupId: row.current_group_id,
    currentGroupName: row.current_group_name,
    handlerMemberId: row.handler_member_id,
    handlerName: row.handler_name,
    processedAt: row.processed_at,
    createdAt: row.created_at,
    submitterCompanyName: row.submitter_company_name,
  }
}

interface TicketSummaryRow {
  id: string
  subject: string
  category: string
  sla_priority: string
  status: string
  submitter_name: string
  current_group_name: string | null
  created_at: string
}

function mapTicketSummary(row: TicketSummaryRow): TicketSummary {
  return {
    id: row.id,
    subject: row.subject,
    category: row.category,
    slaPriority: row.sla_priority,
    status: row.status,
    submitterName: row.submitter_name,
    currentGroupName: row.current_group_name,
    createdAt: row.created_at,
  }
}

function mapReply(row: {
  id: string; ticket_id: string; replier_name: string; content: string; created_at: string
}): Reply {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    replierName: row.replier_name,
    content: row.content,
    createdAt: row.created_at,
  }
}

function mapTransfer(row: {
  id: string; ticket_id: string; from_group_name: string; to_group_name: string; transferred_by: string; created_at: string
}): TransferRecord {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    fromGroupName: row.from_group_name,
    toGroupName: row.to_group_name,
    transferredBy: row.transferred_by,
    createdAt: row.created_at,
  }
}

function mapEvaluation(row: {
  id: string; ticket_id: string; rating: number; comment: string | null; created_at: string
}): Evaluation {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.created_at,
  }
}

function mapCompany(row: { id: string; name: string; created_at: string }): Company {
  return { id: row.id, name: row.name, createdAt: row.created_at }
}

function mapGroup(row: { id: string; company_id: string; name: string; created_at: string }): BusinessGroup {
  return { id: row.id, companyId: row.company_id, name: row.name, createdAt: row.created_at }
}

function mapMember(row: { id: string; group_id: string; name: string; email: string; created_at: string }): GroupMember {
  return { id: row.id, groupId: row.group_id, name: row.name, email: row.email, createdAt: row.created_at }
}

function mapRule(row: {
  id: string; company_id: string; company_name: string; category: string; target_group_id: string; target_group_name: string; created_at: string
}): AssignmentRule {
  return {
    id: row.id,
    companyId: row.company_id,
    companyName: row.company_name,
    category: row.category,
    targetGroupId: row.target_group_id,
    targetGroupName: row.target_group_name,
    createdAt: row.created_at,
  }
}

const TICKET_DETAIL_SELECT = `
  SELECT t.id, t.subject, t.description, t.category, t.sla_priority,
    t.submitter_name, t.submitter_company_id, t.submitter_department, t.submitter_email,
    t.status, t.current_group_id, t.handler_member_id, t.handler_name, t.processed_at, t.created_at,
    c.name AS submitter_company_name,
    bg.name AS current_group_name
  FROM tickets t
  LEFT JOIN companies c ON t.submitter_company_id = c.id
  LEFT JOIN business_groups bg ON t.current_group_id = bg.id
  WHERE t.id = ?
`

async function getTicketDetail(db: DbClient, id: string): Promise<TicketDetail | null> {
  const row = await db.queryOne<TicketRow>({ text: TICKET_DETAIL_SELECT, params: [id] })
  return row ? mapTicketDetail(row) : null
}

// --- route registration ---

export function registerPublicRoutes(app: Hono, platform: Platform) {
  const { db } = platform

  // === 1. POST /api/tickets — Create ticket ===
  app.post('/api/tickets', async (c) => {
    const body = await c.req.json()
    const { subject, description, category, slaPriority, submitterName, submitterCompanyId, submitterDepartment, submitterEmail } = body

    if (!subject || !description || !category || !submitterName || !submitterCompanyId || !submitterDepartment || !submitterEmail) {
      return badRequest(c, 'Missing required fields')
    }
    if (!slaPriority || !isSlaPriority(slaPriority)) {
      return badRequest(c, 'slaPriority must be one of P0-P4')
    }

    const company = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM companies WHERE id = ?', params: [submitterCompanyId] })
    if (!company) return notFound(c, 'submitterCompanyId not found')

    const id = randomUUID()
    const createdAt = nowISO()

    // Check assignment rule for auto-assignment
    const rule = await db.queryOne<{ target_group_id: string }>({
      text: 'SELECT target_group_id FROM assignment_rules WHERE company_id = ? AND category = ?',
      params: [submitterCompanyId, category],
    })

    const status = rule ? 'pending_process' : 'pending_assign'
    const currentGroupId = rule ? rule.target_group_id : null

    await db.run({
      text: `INSERT INTO tickets (id, subject, description, category, sla_priority, submitter_name, submitter_company_id, submitter_department, submitter_email, status, current_group_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [id, subject, description, category, slaPriority, submitterName, submitterCompanyId, submitterDepartment, submitterEmail, status, currentGroupId, createdAt],
    })

    const detail = await getTicketDetail(db, id)
    return c.json(detail, 201)
  })

  // === 2. GET /api/tickets — List tickets ===
  app.get('/api/tickets', async (c) => {
    const { status, slaPriority, category, groupId, q } = c.req.query()
    const conditions: string[] = []
    const params: unknown[] = []

    if (status) { conditions.push('t.status = ?'); params.push(status) }
    if (slaPriority) { conditions.push('t.sla_priority = ?'); params.push(slaPriority) }
    if (category) { conditions.push('t.category = ?'); params.push(category) }
    if (groupId) { conditions.push('t.current_group_id = ?'); params.push(groupId) }
    if (q) { conditions.push('(t.subject LIKE ? OR t.description LIKE ?)'); params.push(`%${q}%`, `%${q}%`) }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const totalRow = await db.queryOne<{ count: number }>({ text: `SELECT COUNT(*) AS count FROM tickets t ${where}`, params })
    const total = totalRow?.count ?? 0

    const rows = await db.queryAll<TicketSummaryRow>({
      text: `SELECT t.id, t.subject, t.category, t.sla_priority, t.status, t.submitter_name,
        bg.name AS current_group_name, t.created_at
        FROM tickets t
        LEFT JOIN business_groups bg ON t.current_group_id = bg.id
        ${where}
        ORDER BY t.created_at DESC`,
      params,
    })

    return c.json({ items: rows.map(mapTicketSummary), total })
  })

  // === 3. GET /api/tickets/:id — Ticket detail ===
  app.get('/api/tickets/:id', async (c) => {
    const detail = await getTicketDetail(db, c.req.param('id'))
    if (!detail) return notFound(c)
    return c.json(detail)
  })

  // === 4. PATCH /api/tickets/:id/status — Update status (cancel) ===
  app.patch('/api/tickets/:id/status', async (c) => {
    const body = await c.req.json()
    const { status: targetStatus } = body
    if (targetStatus !== 'cancelled') {
      return badRequest(c, 'Only "cancelled" status is supported')
    }

    const id = c.req.param('id')
    const ticket = await db.queryOne<{ status: string }>({ text: 'SELECT status FROM tickets WHERE id = ?', params: [id] })
    if (!ticket) return notFound(c)

    if (ticket.status !== 'pending_assign' && ticket.status !== 'pending_process') {
      return badRequest(c, `Cannot cancel ticket with status: ${ticket.status}`)
    }

    await db.run({ text: 'UPDATE tickets SET status = ? WHERE id = ?', params: ['cancelled', id] })
    const detail = await getTicketDetail(db, id)
    return c.json(detail)
  })

  // === 5. POST /api/tickets/:id/assign — Manual assign ===
  app.post('/api/tickets/:id/assign', async (c) => {
    const body = await c.req.json()
    const { groupId } = body
    if (!groupId) return badRequest(c, 'groupId is required')

    const id = c.req.param('id')
    const ticket = await db.queryOne<{ id: string; status: string; submitter_company_id: string }>({
      text: 'SELECT id, status, submitter_company_id FROM tickets WHERE id = ?',
      params: [id],
    })
    if (!ticket) return notFound(c)

    if (ticket.status !== 'pending_assign') {
      return badRequest(c, `Ticket status must be pending_assign, got: ${ticket.status}`)
    }

    // Validate group belongs to ticket's company
    const group = await db.queryOne<{ id: string; company_id: string }>({
      text: 'SELECT id, company_id FROM business_groups WHERE id = ?',
      params: [groupId],
    })
    if (!group) return notFound(c, 'Group not found')
    if (group.company_id !== ticket.submitter_company_id) {
      return badRequest(c, 'Group does not belong to the ticket submitter company')
    }

    await db.run({ text: 'UPDATE tickets SET status = ?, current_group_id = ? WHERE id = ?', params: ['pending_process', groupId, id] })
    const detail = await getTicketDetail(db, id)
    return c.json(detail)
  })

  // === 6. POST /api/tickets/:id/transfer — Transfer ===
  app.post('/api/tickets/:id/transfer', async (c) => {
    const body = await c.req.json()
    const { toGroupId, transferredBy } = body
    if (!toGroupId) return badRequest(c, 'toGroupId is required')
    if (!transferredBy) return badRequest(c, 'transferredBy is required')

    const id = c.req.param('id')
    const ticket = await db.queryOne<{ id: string; status: string; current_group_id: string }>({
      text: 'SELECT id, status, current_group_id FROM tickets WHERE id = ?',
      params: [id],
    })
    if (!ticket) return notFound(c)

    if (ticket.status !== 'pending_process') {
      return badRequest(c, `Ticket status must be pending_process, got: ${ticket.status}`)
    }
    if (ticket.current_group_id === toGroupId) {
      return badRequest(c, 'toGroupId must differ from current group')
    }

    const toGroup = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM business_groups WHERE id = ?', params: [toGroupId] })
    if (!toGroup) return notFound(c, 'Target group not found')

    const fromGroupId = ticket.current_group_id!

    await db.transaction(async (tx) => {
      await tx.run({
        text: 'INSERT INTO ticket_transfers (id, ticket_id, from_group_id, to_group_id, transferred_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        params: [randomUUID(), id, fromGroupId, toGroupId, transferredBy, nowISO()],
      })
      await tx.run({
        text: 'UPDATE tickets SET current_group_id = ? WHERE id = ?',
        params: [toGroupId, id],
      })
    })

    const detail = await getTicketDetail(db, id)
    return c.json(detail)
  })

  // === 7. POST /api/tickets/:id/complete — Complete ===
  app.post('/api/tickets/:id/complete', async (c) => {
    const body = await c.req.json()
    const { handlerMemberId, handlerName } = body
    if (!handlerMemberId) return badRequest(c, 'handlerMemberId is required')
    if (!handlerName) return badRequest(c, 'handlerName is required')

    const id = c.req.param('id')
    const ticket = await db.queryOne<{ id: string; status: string }>({ text: 'SELECT id, status FROM tickets WHERE id = ?', params: [id] })
    if (!ticket) return notFound(c)

    if (ticket.status !== 'pending_process') {
      return badRequest(c, `Ticket status must be pending_process, got: ${ticket.status}`)
    }

    await db.run({
      text: 'UPDATE tickets SET status = ?, handler_member_id = ?, handler_name = ?, processed_at = ? WHERE id = ?',
      params: ['completed', handlerMemberId, handlerName, nowISO(), id],
    })

    const detail = await getTicketDetail(db, id)
    return c.json(detail)
  })

  // === 8. GET /api/tickets/:id/submitter-info — Submitter info ===
  app.get('/api/tickets/:id/submitter-info', async (c) => {
    const id = c.req.param('id')
    const ticket = await db.queryOne<{
      submitter_name: string; submitter_company_id: string; submitter_department: string; submitter_email: string; submitter_company_name: string
    }>({
      text: `SELECT t.submitter_name, t.submitter_company_id, t.submitter_department, t.submitter_email, c.name AS submitter_company_name
        FROM tickets t LEFT JOIN companies c ON t.submitter_company_id = c.id WHERE t.id = ?`,
      params: [id],
    })
    if (!ticket) return notFound(c)

    const historyTickets = await db.queryAll<TicketSummaryRow>({
      text: `SELECT t.id, t.subject, t.category, t.sla_priority, t.status, t.submitter_name,
        bg.name AS current_group_name, t.created_at
        FROM tickets t
        LEFT JOIN business_groups bg ON t.current_group_id = bg.id
        WHERE t.submitter_email = ?
        ORDER BY t.created_at DESC`,
      params: [ticket.submitter_email],
    })

    const info: SubmitterInfo = {
      name: ticket.submitter_name,
      company: ticket.submitter_company_name,
      companyId: ticket.submitter_company_id,
      department: ticket.submitter_department,
      email: ticket.submitter_email,
      historyTickets: historyTickets.map(mapTicketSummary),
    }
    return c.json(info)
  })

  // === 9. GET /api/tickets/:id/replies — List replies ===
  app.get('/api/tickets/:id/replies', async (c) => {
    const id = c.req.param('id')
    const ticket = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM tickets WHERE id = ?', params: [id] })
    if (!ticket) return notFound(c)

    const rows = await db.queryAll<{ id: string; ticket_id: string; replier_name: string; content: string; created_at: string }>({
      text: 'SELECT id, ticket_id, replier_name, content, created_at FROM ticket_replies WHERE ticket_id = ? ORDER BY created_at ASC',
      params: [id],
    })
    return c.json({ items: rows.map(mapReply) })
  })

  // === 10. POST /api/tickets/:id/replies — Add reply ===
  app.post('/api/tickets/:id/replies', async (c) => {
    const body = await c.req.json()
    const { replierName, content } = body
    if (!replierName) return badRequest(c, 'replierName is required')
    if (!content) return badRequest(c, 'content is required')

    const id = c.req.param('id')
    const ticket = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM tickets WHERE id = ?', params: [id] })
    if (!ticket) return notFound(c)

    const replyId = randomUUID()
    const createdAt = nowISO()
    await db.run({
      text: 'INSERT INTO ticket_replies (id, ticket_id, replier_name, content, created_at) VALUES (?, ?, ?, ?, ?)',
      params: [replyId, id, replierName, content, createdAt],
    })

    const row = await db.queryOne<{ id: string; ticket_id: string; replier_name: string; content: string; created_at: string }>({
      text: 'SELECT id, ticket_id, replier_name, content, created_at FROM ticket_replies WHERE id = ?',
      params: [replyId],
    })
    return c.json(mapReply(row!), 201)
  })

  // === 11. GET /api/tickets/:id/transfers — Transfer history ===
  app.get('/api/tickets/:id/transfers', async (c) => {
    const id = c.req.param('id')
    const ticket = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM tickets WHERE id = ?', params: [id] })
    if (!ticket) return notFound(c)

    const rows = await db.queryAll<{ id: string; ticket_id: string; from_group_name: string; to_group_name: string; transferred_by: string; created_at: string }>({
      text: `SELECT tt.id, tt.ticket_id, fg.name AS from_group_name, tg.name AS to_group_name, tt.transferred_by, tt.created_at
        FROM ticket_transfers tt
        LEFT JOIN business_groups fg ON tt.from_group_id = fg.id
        LEFT JOIN business_groups tg ON tt.to_group_id = tg.id
        WHERE tt.ticket_id = ?
        ORDER BY tt.created_at ASC`,
      params: [id],
    })
    return c.json({ items: rows.map(mapTransfer) })
  })

  // === 12. GET /api/tickets/:id/evaluation — Get evaluation ===
  app.get('/api/tickets/:id/evaluation', async (c) => {
    const id = c.req.param('id')
    const ticket = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM tickets WHERE id = ?', params: [id] })
    if (!ticket) return notFound(c)

    const row = await db.queryOne<{ id: string; ticket_id: string; rating: number; comment: string | null; created_at: string }>({
      text: 'SELECT id, ticket_id, rating, comment, created_at FROM evaluations WHERE ticket_id = ?',
      params: [id],
    })
    if (!row) return notFound(c, 'Evaluation not found')
    return c.json(mapEvaluation(row))
  })

  // === 13. POST /api/tickets/:id/evaluation — Submit evaluation ===
  app.post('/api/tickets/:id/evaluation', async (c) => {
    const body = await c.req.json()
    const { rating, comment } = body
    if (typeof rating !== 'number' || rating < 1 || rating > 5) {
      return badRequest(c, 'rating must be a number between 1 and 5')
    }

    const id = c.req.param('id')
    const ticket = await db.queryOne<{ id: string; status: string }>({ text: 'SELECT id, status FROM tickets WHERE id = ?', params: [id] })
    if (!ticket) return notFound(c)

    if (ticket.status !== 'completed') {
      return badRequest(c, `Ticket status must be completed, got: ${ticket.status}`)
    }

    const existing = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM evaluations WHERE ticket_id = ?', params: [id] })
    if (existing) return badRequest(c, 'Evaluation already exists for this ticket')

    const evalId = randomUUID()
    const createdAt = nowISO()
    await db.run({
      text: 'INSERT INTO evaluations (id, ticket_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?)',
      params: [evalId, id, rating, comment ?? null, createdAt],
    })

    const row = await db.queryOne<{ id: string; ticket_id: string; rating: number; comment: string | null; created_at: string }>({
      text: 'SELECT id, ticket_id, rating, comment, created_at FROM evaluations WHERE id = ?',
      params: [evalId],
    })
    return c.json(mapEvaluation(row!), 201)
  })

  // === 14. GET /api/companies — List companies ===
  app.get('/api/companies', async (c) => {
    const rows = await db.queryAll<{ id: string; name: string; created_at: string }>({
      text: 'SELECT id, name, created_at FROM companies ORDER BY created_at ASC',
    })
    return c.json({ items: rows.map(mapCompany) })
  })

  // === 15. POST /api/companies — Create company ===
  app.post('/api/companies', async (c) => {
    const body = await c.req.json()
    const { name } = body
    if (!name) return badRequest(c, 'name is required')

    const id = randomUUID()
    const createdAt = nowISO()
    await db.run({ text: 'INSERT INTO companies (id, name, created_at) VALUES (?, ?, ?)', params: [id, name, createdAt] })
    const row = await db.queryOne<{ id: string; name: string; created_at: string }>({ text: 'SELECT id, name, created_at FROM companies WHERE id = ?', params: [id] })
    return c.json(mapCompany(row!), 201)
  })

  // === 16. GET /api/companies/:id/groups — List groups ===
  app.get('/api/companies/:id/groups', async (c) => {
    const companyId = c.req.param('id')
    const company = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM companies WHERE id = ?', params: [companyId] })
    if (!company) return notFound(c)

    const rows = await db.queryAll<{ id: string; company_id: string; name: string; created_at: string }>({
      text: 'SELECT id, company_id, name, created_at FROM business_groups WHERE company_id = ? ORDER BY created_at ASC',
      params: [companyId],
    })
    return c.json({ items: rows.map(mapGroup) })
  })

  // === 17. POST /api/companies/:id/groups — Create group ===
  app.post('/api/companies/:id/groups', async (c) => {
    const body = await c.req.json()
    const { name } = body
    if (!name) return badRequest(c, 'name is required')

    const companyId = c.req.param('id')
    const company = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM companies WHERE id = ?', params: [companyId] })
    if (!company) return notFound(c)

    const id = randomUUID()
    const createdAt = nowISO()
    await db.run({ text: 'INSERT INTO business_groups (id, company_id, name, created_at) VALUES (?, ?, ?, ?)', params: [id, companyId, name, createdAt] })
    const row = await db.queryOne<{ id: string; company_id: string; name: string; created_at: string }>({ text: 'SELECT id, company_id, name, created_at FROM business_groups WHERE id = ?', params: [id] })
    return c.json(mapGroup(row!), 201)
  })

  // === 18. GET /api/groups/:id/members — List members ===
  app.get('/api/groups/:id/members', async (c) => {
    const groupId = c.req.param('id')
    const group = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM business_groups WHERE id = ?', params: [groupId] })
    if (!group) return notFound(c)

    const rows = await db.queryAll<{ id: string; group_id: string; name: string; email: string; created_at: string }>({
      text: 'SELECT id, group_id, name, email, created_at FROM group_members WHERE group_id = ? ORDER BY created_at ASC',
      params: [groupId],
    })
    return c.json({ items: rows.map(mapMember) })
  })

  // === 19. POST /api/groups/:id/members — Add member ===
  app.post('/api/groups/:id/members', async (c) => {
    const body = await c.req.json()
    const { name, email } = body
    if (!name) return badRequest(c, 'name is required')
    if (!email) return badRequest(c, 'email is required')

    const groupId = c.req.param('id')
    const group = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM business_groups WHERE id = ?', params: [groupId] })
    if (!group) return notFound(c)

    const id = randomUUID()
    const createdAt = nowISO()
    await db.run({ text: 'INSERT INTO group_members (id, group_id, name, email, created_at) VALUES (?, ?, ?, ?, ?)', params: [id, groupId, name, email, createdAt] })
    const row = await db.queryOne<{ id: string; group_id: string; name: string; email: string; created_at: string }>({ text: 'SELECT id, group_id, name, email, created_at FROM group_members WHERE id = ?', params: [id] })
    return c.json(mapMember(row!), 201)
  })

  // === 20. GET /api/assignment-rules — List rules ===
  app.get('/api/assignment-rules', async (c) => {
    const { companyId } = c.req.query()
    const where = companyId ? 'WHERE ar.company_id = ?' : ''
    const params = companyId ? [companyId] : []

    const rows = await db.queryAll<{
      id: string; company_id: string; company_name: string; category: string; target_group_id: string; target_group_name: string; created_at: string
    }>({
      text: `SELECT ar.id, ar.company_id, c.name AS company_name, ar.category,
        ar.target_group_id, bg.name AS target_group_name, ar.created_at
        FROM assignment_rules ar
        LEFT JOIN companies c ON ar.company_id = c.id
        LEFT JOIN business_groups bg ON ar.target_group_id = bg.id
        ${where}
        ORDER BY ar.created_at ASC`,
      params,
    })
    return c.json({ items: rows.map(mapRule) })
  })

  // === 21. POST /api/assignment-rules — Create rule ===
  app.post('/api/assignment-rules', async (c) => {
    const body = await c.req.json()
    const { companyId, category, targetGroupId } = body
    if (!companyId) return badRequest(c, 'companyId is required')
    if (!category) return badRequest(c, 'category is required')
    if (!targetGroupId) return badRequest(c, 'targetGroupId is required')

    const company = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM companies WHERE id = ?', params: [companyId] })
    if (!company) return notFound(c, 'Company not found')

    const group = await db.queryOne<{ id: string; company_id: string }>({ text: 'SELECT id, company_id FROM business_groups WHERE id = ?', params: [targetGroupId] })
    if (!group) return notFound(c, 'Target group not found')
    if (group.company_id !== companyId) {
      return badRequest(c, 'targetGroupId does not belong to the specified company')
    }

    const existing = await db.queryOne<{ id: string }>({
      text: 'SELECT id FROM assignment_rules WHERE company_id = ? AND category = ?',
      params: [companyId, category],
    })
    if (existing) return badRequest(c, 'Assignment rule already exists for this company and category')

    const id = randomUUID()
    const createdAt = nowISO()
    await db.run({
      text: 'INSERT INTO assignment_rules (id, company_id, category, target_group_id, created_at) VALUES (?, ?, ?, ?, ?)',
      params: [id, companyId, category, targetGroupId, createdAt],
    })

    const row = await db.queryOne<{
      id: string; company_id: string; company_name: string; category: string; target_group_id: string; target_group_name: string; created_at: string
    }>({
      text: `SELECT ar.id, ar.company_id, c.name AS company_name, ar.category,
        ar.target_group_id, bg.name AS target_group_name, ar.created_at
        FROM assignment_rules ar
        LEFT JOIN companies c ON ar.company_id = c.id
        LEFT JOIN business_groups bg ON ar.target_group_id = bg.id
        WHERE ar.id = ?`,
      params: [id],
    })
    return c.json(mapRule(row!), 201)
  })
}

// Protected routes not used (no auth module selected).
export function registerProtectedRoutes(_app: Hono, _platform: Platform) {}
