import type { Hono, Context } from 'hono'
import type { initializePlatform } from './platform/bootstrap'
import type { AuthUser } from '../shared/types'
import { SLA_PRIORITIES } from '../shared/types'
import { createTicket, listTickets, getTicketDetail, updateTicketStatus, addReply, getSubmitterInfo, completeTicket } from './services/ticket-service'
import { createGroup, listGroups, addMember, removeMember, createRule, listRules } from './services/group-service'
import { transferTicket } from './services/transfer-service'
import { createEvaluation, getEvaluation } from './services/evaluation-service'
import { getDistribution, getDashboard } from './services/stats-service'
import { listAuditLogs } from './services/audit-service'

type Platform = Awaited<ReturnType<typeof initializePlatform>>

function getUser(c: Context): AuthUser {
  return c.get('authUser')
}

function hasRole(user: AuthUser, ...roles: string[]): boolean {
  return user.roles.some((r) => roles.includes(r))
}

function parsePage(c: Context): number {
  const p = Number(c.req.query('page') ?? '1')
  return Number.isInteger(p) && p >= 1 ? p : 1
}

function parsePageSize(c: Context): number {
  const s = Number(c.req.query('pageSize') ?? '20')
  return Number.isInteger(s) && s >= 1 && s <= 100 ? s : 20
}

function forbidden(c: Context) {
  return c.json({ error: 'forbidden' }, 403)
}

// Check if submitter-only user can access a specific ticket
async function checkTicketAccess(c: Context, platform: Platform, ticketId: number): Promise<boolean> {
  const user = getUser(c)
  if (hasRole(user, 'handler', 'admin')) return true
  // Submitter: can only access own tickets
  const ticket = await platform.db.queryOne<{ submitter_id: number; company_id: string }>({
    text: 'SELECT submitter_id, company_id FROM tickets WHERE id = ?',
    params: [ticketId],
  })
  if (!ticket) return false
  if (ticket.company_id !== user.companyId) return false
  return String(ticket.submitter_id) === user.id
}

// 登录等公开端点
export function registerPublicRoutes(app: Hono, platform: Platform) {
  app.post('/api/auth/login', async (c) => {
    const body = await c.req.json().catch(() => null)
    if (!body || !body.email || !body.password) {
      return c.json({ error: 'validation_error', details: { email: 'required', password: 'required' } }, 400)
    }
    const user = await platform.auth.userStore.findByEmail(body.email)
    if (!user || !platform.auth.verifyPassword(body.password, user.password_hash)) {
      return c.json({ error: 'unauthorized' }, 401)
    }
    if (user.status !== 'active') {
      return c.json({ error: 'unauthorized' }, 401)
    }
    const roles = await platform.permissionKit.getRoles(String(user.id))
    const effectiveRoles = roles.length > 0 ? roles : [user.role]
    const role = effectiveRoles[0] ?? user.role
    const company = await platform.db.queryOne<{ name: string }>({
      text: 'SELECT name FROM companies WHERE id = ?',
      params: [String(user.company_id)],
    })
    const token = platform.auth.signToken({
      userId: String(user.id),
      companyId: String(user.company_id),
      name: user.name,
      email: user.email,
      roles: effectiveRoles,
    })
    return c.json({
      token,
      user: {
        id: String(user.id),
        name: user.name,
        email: user.email,
        companyId: String(user.company_id),
        role,
        companyName: company?.name ?? String(user.company_id),
        department: user.department ?? '',
      },
    })
  })
}

// 业务路由
export function registerProtectedRoutes(app: Hono, platform: Platform) {
  // ---- Ticket core ----

  // POST /api/tickets — create ticket (submitter, admin)
  app.post('/api/tickets', async (c) => {
    const user = getUser(c)
    if (!hasRole(user, 'submitter', 'admin')) return forbidden(c)

    const body = await c.req.json().catch(() => null)
    if (!body) return c.json({ error: 'validation_error', details: { body: 'required' } }, 400)
    const { title, description, category, slaPriority } = body
    if (!title || title.length < 1 || title.length > 200) {
      return c.json({ error: 'validation_error', details: { title: '1-200 characters' } }, 400)
    }
    if (!description || description.length < 1 || description.length > 5000) {
      return c.json({ error: 'validation_error', details: { description: '1-5000 characters' } }, 400)
    }
    if (!category) {
      return c.json({ error: 'validation_error', details: { category: 'required' } }, 400)
    }
    if (!slaPriority || !SLA_PRIORITIES.includes(slaPriority)) {
      return c.json({ error: 'validation_error', details: { slaPriority: 'P0-P4' } }, 400)
    }

    const result = await createTicket(platform.db, platform.auditKit, {
      title,
      description,
      category,
      slaPriority,
      companyId: user.companyId,
      submitterId: Number(user.id),
      submitterName: user.name,
      actorEmail: user.email,
    })
    return c.json(result, 201)
  })

  // GET /api/tickets — list (handler, admin)
  app.get('/api/tickets', async (c) => {
    const user = getUser(c)
    if (!hasRole(user, 'handler', 'admin')) return forbidden(c)

    const result = await listTickets(platform.db, {
      companyId: user.companyId,
      status: c.req.query('status') ?? undefined,
      category: c.req.query('category') ?? undefined,
      slaPriority: c.req.query('slaPriority') ?? undefined,
      groupId: c.req.query('groupId') ?? undefined,
      search: c.req.query('search') ?? undefined,
      sortBy: c.req.query('sortBy') ?? undefined,
      page: parsePage(c),
      pageSize: parsePageSize(c),
    })
    return c.json(result)
  })

  // GET /api/tickets/:id — detail (submitter own, handler, admin)
  app.get('/api/tickets/:id', async (c) => {
    const user = getUser(c)
    const ticketId = Number(c.req.param('id'))
    if (!Number.isFinite(ticketId)) return c.json({ error: 'ticket_not_found' }, 404)

    const hasAccess = await checkTicketAccess(c, platform, ticketId)
    if (!hasAccess) return forbidden(c)

    const ticket = await getTicketDetail(platform.db, ticketId, user.companyId)
    if (!ticket) return c.json({ error: 'ticket_not_found' }, 404)
    return c.json(ticket)
  })

  // PATCH /api/tickets/:id/status — status transition (handler, admin)
  app.patch('/api/tickets/:id/status', async (c) => {
    const user = getUser(c)
    if (!hasRole(user, 'handler', 'admin')) return forbidden(c)

    const ticketId = Number(c.req.param('id'))
    const body = await c.req.json().catch(() => null)
    if (!body || !body.status) {
      return c.json({ error: 'validation_error', details: { status: 'required' } }, 400)
    }
    const validStatuses = ['pending_assignment', 'pending_processing', 'cancelled']
    if (!validStatuses.includes(body.status)) {
      return c.json({ error: 'validation_error', details: { status: 'invalid' } }, 400)
    }

    const result = await updateTicketStatus(platform.db, platform.auditKit, {
      ticketId,
      companyId: user.companyId,
      targetStatus: body.status,
      actorId: user.id,
      actorName: user.name,
    })
    if (result.error) {
      const status = result.error === 'ticket_not_found' ? 404 : 400
      return c.json({ error: result.error }, status)
    }
    return c.json(result.ticket)
  })

  // POST /api/tickets/:id/replies — add reply (submitter own, handler, admin)
  app.post('/api/tickets/:id/replies', async (c) => {
    const user = getUser(c)
    const ticketId = Number(c.req.param('id'))
    if (!Number.isFinite(ticketId)) return c.json({ error: 'ticket_not_found' }, 404)

    const hasAccess = await checkTicketAccess(c, platform, ticketId)
    if (!hasAccess) return forbidden(c)

    const body = await c.req.json().catch(() => null)
    if (!body || !body.content || body.content.length < 1 || body.content.length > 5000) {
      return c.json({ error: 'validation_error', details: { content: '1-5000 characters' } }, 400)
    }

    const result = await addReply(platform.db, platform.auditKit, {
      ticketId,
      companyId: user.companyId,
      replierId: Number(user.id),
      replierName: user.name,
      content: body.content,
    })
    if (result.error) return c.json({ error: result.error }, 404)
    return c.json(result.reply, 201)
  })

  // ---- Business groups & rules ----

  // POST /api/business-groups — create group (admin)
  app.post('/api/business-groups', async (c) => {
    const user = getUser(c)
    if (!hasRole(user, 'admin')) return forbidden(c)

    const body = await c.req.json().catch(() => null)
    if (!body || !body.name || body.name.length < 1 || body.name.length > 100) {
      return c.json({ error: 'validation_error', details: { name: '1-100 characters' } }, 400)
    }

    const result = await createGroup(platform.db, platform.auditKit, user.companyId, body.name, user.id, user.name)
    return c.json(result, 201)
  })

  // GET /api/business-groups — list groups (admin, handler)
  app.get('/api/business-groups', async (c) => {
    const user = getUser(c)
    if (!hasRole(user, 'admin', 'handler')) return forbidden(c)

    const items = await listGroups(platform.db, user.companyId)
    return c.json({ items })
  })

  // POST /api/business-groups/:id/members — add member (admin)
  app.post('/api/business-groups/:id/members', async (c) => {
    const user = getUser(c)
    if (!hasRole(user, 'admin')) return forbidden(c)

    const groupId = Number(c.req.param('id'))
    const body = await c.req.json().catch(() => null)
    if (!body || !body.userId) {
      return c.json({ error: 'validation_error', details: { userId: 'required' } }, 400)
    }

    const result = await addMember(platform.db, platform.auditKit, groupId, user.companyId, Number(body.userId), user.id, user.name)
    if (result.error) {
      const status = result.error === 'already_member' ? 400 : 404
      return c.json({ error: result.error }, status)
    }
    return c.json(result.result, 201)
  })

  // DELETE /api/business-groups/:id/members/:userId — remove member (admin)
  app.delete('/api/business-groups/:id/members/:userId', async (c) => {
    const user = getUser(c)
    if (!hasRole(user, 'admin')) return forbidden(c)

    const groupId = Number(c.req.param('id'))
    const userId = Number(c.req.param('userId'))

    await removeMember(platform.db, platform.auditKit, groupId, user.companyId, userId, user.id, user.name)
    return c.body(null, 204)
  })

  // POST /api/assignment-rules — create rule (admin)
  app.post('/api/assignment-rules', async (c) => {
    const user = getUser(c)
    if (!hasRole(user, 'admin')) return forbidden(c)

    const body = await c.req.json().catch(() => null)
    if (!body || !body.category || !body.groupId) {
      return c.json({ error: 'validation_error', details: { category: 'required', groupId: 'required' } }, 400)
    }

    const result = await createRule(platform.db, platform.auditKit, user.companyId, body.category, Number(body.groupId), user.id, user.name)
    if (result.error) {
      const status = result.error === 'duplicate_rule' ? 400 : 404
      return c.json({ error: result.error }, status)
    }
    return c.json(result.result, 201)
  })

  // GET /api/assignment-rules — list rules (admin)
  app.get('/api/assignment-rules', async (c) => {
    const user = getUser(c)
    if (!hasRole(user, 'admin')) return forbidden(c)

    const items = await listRules(platform.db, user.companyId)
    return c.json({ items })
  })

  // ---- Transfer ----

  // POST /api/tickets/:id/transfer — transfer ticket (handler, admin)
  app.post('/api/tickets/:id/transfer', async (c) => {
    const user = getUser(c)
    if (!hasRole(user, 'handler', 'admin')) return forbidden(c)

    const ticketId = Number(c.req.param('id'))
    const body = await c.req.json().catch(() => null)
    if (!body || !body.reason) {
      return c.json({ error: 'validation_error', details: { reason: 'required' } }, 400)
    }

    const toGroupId = body.toGroupId ? Number(body.toGroupId) : null
    const toUserId = body.toUserId ? Number(body.toUserId) : null

    // Validate: exactly one target
    if ((toGroupId != null) === (toUserId != null)) {
      return c.json({ error: 'invalid_target' }, 400)
    }

    const result = await transferTicket(platform.db, platform.auditKit, {
      ticketId,
      companyId: user.companyId,
      fromUserId: Number(user.id),
      toGroupId,
      toUserId,
      reason: body.reason,
      actorId: user.id,
      actorName: user.name,
    })
    if (result.error) {
      const status = result.error === 'ticket_not_found' ? 404 : 400
      return c.json({ error: result.error }, status)
    }
    return c.json(result.result)
  })

  // ---- Processing & notification ----

  // GET /api/tickets/:id/submitter-info — submitter info (handler, admin)
  app.get('/api/tickets/:id/submitter-info', async (c) => {
    const user = getUser(c)
    if (!hasRole(user, 'handler', 'admin')) return forbidden(c)

    const ticketId = Number(c.req.param('id'))
    const result = await getSubmitterInfo(platform.db, ticketId, user.companyId)
    if (!result) return c.json({ error: 'ticket_not_found' }, 404)
    return c.json(result)
  })

  // POST /api/tickets/:id/complete — complete ticket (handler, admin)
  app.post('/api/tickets/:id/complete', async (c) => {
    const user = getUser(c)
    if (!hasRole(user, 'handler', 'admin')) return forbidden(c)

    const ticketId = Number(c.req.param('id'))
    const result = await completeTicket(platform.db, platform.auditKit, platform.emailClient, {
      ticketId,
      companyId: user.companyId,
      handlerId: Number(user.id),
      handlerName: user.name,
    })
    if (result.error) {
      const status = result.error === 'ticket_not_found' ? 404 : 400
      return c.json({ error: result.error }, status)
    }
    return c.json(result.result)
  })

  // ---- Evaluation ----

  // POST /api/tickets/:id/evaluation — submit evaluation (submitter own)
  app.post('/api/tickets/:id/evaluation', async (c) => {
    const user = getUser(c)
    if (!hasRole(user, 'submitter')) return forbidden(c)

    const ticketId = Number(c.req.param('id'))

    // Verify ownership
    const hasAccess = await checkTicketAccess(c, platform, ticketId)
    if (!hasAccess) return forbidden(c)

    const body = await c.req.json().catch(() => null)
    if (!body || body.rating == null || typeof body.rating !== 'number' || body.rating < 1 || body.rating > 5) {
      return c.json({ error: 'validation_error', details: { rating: '1-5' } }, 400)
    }

    const result = await createEvaluation(platform.db, platform.auditKit, {
      ticketId,
      companyId: user.companyId,
      rating: body.rating,
      comment: body.comment ?? null,
      actorId: user.id,
      actorName: user.name,
    })
    if (result.error) {
      const status = result.error === 'ticket_not_found' ? 404 : 400
      return c.json({ error: result.error }, status)
    }
    return c.json(result.result, 201)
  })

  // GET /api/tickets/:id/evaluation — view evaluation (submitter own, handler, admin)
  app.get('/api/tickets/:id/evaluation', async (c) => {
    const user = getUser(c)
    const ticketId = Number(c.req.param('id'))

    const hasAccess = await checkTicketAccess(c, platform, ticketId)
    if (!hasAccess) return forbidden(c)

    const result = await getEvaluation(platform.db, ticketId, user.companyId)
    if (!result) return c.json({ error: 'evaluation_not_found' }, 404)
    return c.json(result)
  })

  // ---- Statistics ----

  // GET /api/stats/distribution — distribution (admin)
  app.get('/api/stats/distribution', async (c) => {
    const user = getUser(c)
    if (!hasRole(user, 'admin')) return forbidden(c)

    const dimension = (c.req.query('dimension') ?? 'company') as 'company' | 'department'
    const dim = dimension === 'department' ? 'department' : 'company'
    const items = await getDistribution(platform.db, dim)
    return c.json({ dimension: dim, items })
  })

  // GET /api/stats/dashboard — dashboard (admin)
  app.get('/api/stats/dashboard', async (c) => {
    const user = getUser(c)
    if (!hasRole(user, 'admin')) return forbidden(c)

    const companyId = c.req.query('companyId') ?? undefined
    const result = await getDashboard(platform.db, companyId)
    return c.json(result)
  })

  // ---- Audit logs ----

  // GET /api/audit-logs — audit log query (admin)
  app.get('/api/audit-logs', async (c) => {
    const user = getUser(c)
    if (!hasRole(user, 'admin')) return forbidden(c)

    const result = await listAuditLogs(platform.db, {
      ticketId: c.req.query('ticketId') ?? undefined,
      action: c.req.query('action') ?? undefined,
      page: parsePage(c),
      pageSize: parsePageSize(c),
    })
    return c.json(result)
  })
}
