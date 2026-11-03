import { randomUUID } from 'node:crypto'
import type { Hono } from 'hono'
import type { DbClient } from '@commonapp/dbkit'
import type { EmailClient } from '@commonapp/emailkit'
import type { initializePlatform } from './platform/bootstrap'
import type { CurrentUser } from '../shared/types'

type Platform = Awaited<ReturnType<typeof initializePlatform>>
const errorBody = (code: string, message: string) => ({ error: { code, message } })
const getUser = (c: { get(name: string): unknown }): CurrentUser => c.get('currentUser') as CurrentUser
const now = () => new Date().toISOString()

const SLA_PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'P4']
const VALID_STATUSES = ['pending_assignment', 'pending_processing', 'completed', 'cancelled']

interface TicketRow {
  id: string
  company_id: string
  submitter_profile_id: string
  subject: string
  description: string | null
  category: string
  sla_priority: string
  status: string
  assigned_group_id: string | null
  assigned_handler_id: string | null
  created_at: string
  completed_at: string | null
  completed_by: string | null
}

function ticketResponse(t: TicketRow): Record<string, unknown> {
  return {
    id: t.id,
    companyId: t.company_id,
    submitterProfileId: t.submitter_profile_id,
    subject: t.subject,
    description: t.description,
    category: t.category,
    slaPriority: t.sla_priority,
    status: t.status,
    assignedGroupId: t.assigned_group_id,
    assignedHandlerId: t.assigned_handler_id,
    createdAt: t.created_at,
    completedAt: t.completed_at,
    completedBy: t.completed_by,
  }
}

async function getTicketForCompany(db: DbClient, ticketId: string, companyId: string): Promise<TicketRow | null> {
  return db.queryOne<TicketRow>({
    text: 'SELECT * FROM tickets WHERE id = ? AND company_id = ?',
    params: [ticketId, companyId],
  })
}

export function registerTicketRoutes(app: Hono, platform: Platform) {
  const { db, auditKit, emailClient } = platform

  // POST /api/tickets — create ticket
  app.post('/api/tickets', async (c) => {
    const user = getUser(c)
    if (!user.profileId) return c.json(errorBody('FORBIDDEN', 'No profile found'), 403)
    if (user.role !== 'submitter' && user.role !== 'admin')
      return c.json(errorBody('FORBIDDEN', 'Only submitter or admin can create tickets'), 403)

    const body = await c.req.json().catch(() => ({}))
    const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
    const description = typeof body.description === 'string' ? body.description.trim() : ''
    const category = typeof body.category === 'string' ? body.category.trim() : ''
    const slaPriority = typeof body.slaPriority === 'string' ? body.slaPriority : ''
    if (!subject || !category || !SLA_PRIORITIES.includes(slaPriority))
      return c.json(errorBody('VALIDATION_ERROR', 'subject, category and slaPriority (P0-P4) are required'), 400)

    const ticketId = randomUUID()
    const ts = now()
    const companyId = user.companyId!

    const ticket = await db.transaction(async (tx) => {
      const routingRule = await tx.queryOne<{ target_group_id: string }>({
        text: 'SELECT target_group_id FROM category_routing_rules WHERE company_id = ? AND category = ?',
        params: [companyId, category],
      })
      const status = routingRule ? 'pending_processing' : 'pending_assignment'
      const groupId = routingRule?.target_group_id ?? null

      await tx.run({
        text: `INSERT INTO tickets (id, company_id, submitter_profile_id, subject, description, category, sla_priority, status, assigned_group_id, assigned_handler_id, created_at, completed_at, completed_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, NULL)`,
        params: [ticketId, companyId, user.profileId, subject, description || null, category, slaPriority, status, groupId, ts],
      })

      if (routingRule) {
        await auditKit.record({
          type: 'ticket.assigned',
          actorUserId: user.profileId ?? undefined,
          metadata: { ticketId, groupId, auto: true },
        })
      }
      await auditKit.record({
        type: 'ticket.created',
        actorUserId: user.profileId ?? undefined,
        metadata: { ticketId, subject, category, slaPriority },
      })

      return tx.queryOne<TicketRow>({ text: 'SELECT * FROM tickets WHERE id = ?', params: [ticketId] })
    })

    return c.json(ticketResponse(ticket!), 201)
  })

  // GET /api/tickets — list tickets
  app.get('/api/tickets', async (c) => {
    const user = getUser(c)
    if (!user.companyId) return c.json(errorBody('FORBIDDEN', 'No company context'), 403)
    const companyId = user.companyId

    const status = c.req.query('status') ?? null
    const search = c.req.query('search') ?? ''
    const sortBy = c.req.query('sortBy') ?? 'created_at'
    const sortOrder = c.req.query('sortOrder') ?? 'desc'
    const page = Math.max(1, Number(c.req.query('page') ?? 1))
    const pageSize = Math.max(1, Math.min(100, Number(c.req.query('pageSize') ?? 20)))

    const validSort = ['created_at', 'sla_priority', 'status'].includes(sortBy) ? sortBy : 'created_at'
    const order = sortOrder === 'asc' ? 'ASC' : 'DESC'
    const statusFilter = VALID_STATUSES.includes(status) ? status : null

    const conditions: string[] = ['t.company_id = ?']
    const params: unknown[] = [companyId]
    if (statusFilter) {
      conditions.push('t.status = ?')
      params.push(statusFilter)
    }
    if (search) {
      conditions.push('(t.subject LIKE ? OR t.description LIKE ?)')
      params.push(`%${search}%`, `%${search}%`)
    }
    const where = conditions.join(' AND ')

    const total = await db.queryOne<{ total: number }>({
      text: `SELECT COUNT(*) AS total FROM tickets t WHERE ${where}`,
      params,
    })
    const offset = (page - 1) * pageSize
    const rows = await db.queryAll<TicketRow & {
      submitter_name: string
      assigned_group_name: string | null
      assigned_handler_name: string | null
    }>({
      text: `SELECT t.*, p.display_name AS submitter_name,
                    g.name AS assigned_group_name, hp.display_name AS assigned_handler_name
             FROM tickets t
             LEFT JOIN user_profiles p ON p.id = t.submitter_profile_id
             LEFT JOIN business_groups g ON g.id = t.assigned_group_id
             LEFT JOIN user_profiles hp ON hp.id = t.assigned_handler_id
             WHERE ${where}
             ORDER BY t.${validSort} ${order}
             LIMIT ? OFFSET ?`,
      params: [...params, pageSize, offset],
    })

    return c.json({
      items: rows.map((r) => ({
        id: r.id,
        subject: r.subject,
        category: r.category,
        slaPriority: r.sla_priority,
        status: r.status,
        submitterProfileId: r.submitter_profile_id,
        submitterName: r.submitter_name,
        assignedGroupId: r.assigned_group_id,
        assignedGroupName: r.assigned_group_name,
        assignedHandlerId: r.assigned_handler_id,
        assignedHandlerName: r.assigned_handler_name,
        createdAt: r.created_at,
        completedAt: r.completed_at,
      })),
      total: Number(total?.total ?? 0),
      page,
      pageSize,
    })
  })

  // GET /api/tickets/:id — ticket detail
  app.get('/api/tickets/:id', async (c) => {
    const user = getUser(c)
    if (!user.companyId) return c.json(errorBody('FORBIDDEN', 'No company context'), 403)
    const ticketId = c.req.param('id')

    const ticket = await db.queryOne<TicketRow & {
      company_name: string
      assigned_group_name: string | null
      assigned_handler_name: string | null
      completed_by_name: string | null
    }>({
      text: `SELECT t.*, c.name AS company_name, g.name AS assigned_group_name,
                    hp.display_name AS assigned_handler_name, cp.display_name AS completed_by_name
             FROM tickets t
             LEFT JOIN companies c ON c.id = t.company_id
             LEFT JOIN business_groups g ON g.id = t.assigned_group_id
             LEFT JOIN user_profiles hp ON hp.id = t.assigned_handler_id
             LEFT JOIN user_profiles cp ON cp.id = t.completed_by
             WHERE t.id = ? AND t.company_id = ?`,
      params: [ticketId, user.companyId],
    })
    if (!ticket) return c.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)

    const submitter = await db.queryOne<{
      profile_id: string
      display_name: string
      email: string
      company_name: string
      department_name: string | null
    }>({
      text: `SELECT p.id AS profile_id, p.display_name, p.email, c.name AS company_name, d.name AS department_name
             FROM user_profiles p
             LEFT JOIN companies c ON c.id = p.company_id
             LEFT JOIN departments d ON d.id = p.department_id
             WHERE p.id = ?`,
      params: [ticket.submitter_profile_id],
    })

    const submitterHistory = await db.queryAll<{ id: string; subject: string; category: string; status: string; created_at: string }>({
      text: `SELECT id, subject, category, status, created_at FROM tickets
             WHERE submitter_profile_id = ? ORDER BY created_at DESC LIMIT 10`,
      params: [ticket.submitter_profile_id],
    })

    const replies = await db.queryAll<{
      id: string
      replier_profile_id: string
      replier_name: string
      content: string
      created_at: string
    }>({
      text: `SELECT r.id, r.replier_profile_id, p.display_name AS replier_name, r.content, r.created_at
             FROM ticket_replies r
             LEFT JOIN user_profiles p ON p.id = r.replier_profile_id
             WHERE r.ticket_id = ? ORDER BY r.created_at ASC`,
      params: [ticketId],
    })

    const recentLogs = await db.queryAll<{
      id: string
      actor_user_id: string
      event_type: string
      metadata_json: string
      occurred_at: string
      actor_name: string
    }>({
      text: `SELECT a.id, a.actor_user_id, a.event_type, a.metadata_json, a.occurred_at,
                    p.display_name AS actor_name
             FROM audit_events a
             LEFT JOIN user_profiles p ON p.id = a.actor_user_id
             WHERE a.event_type LIKE 'ticket.%' AND json_extract(a.metadata_json, '$.ticketId') = ?
             ORDER BY a.occurred_at DESC LIMIT 20`,
      params: [ticketId],
    })

    const evaluation = await db.queryOne<{
      satisfaction_score: number
      comment: string | null
      created_at: string
    }>({
      text: 'SELECT satisfaction_score, comment, created_at FROM ticket_evaluations WHERE ticket_id = ?',
      params: [ticketId],
    })

    return c.json({
      ticket: {
        id: ticket.id,
        subject: ticket.subject,
        description: ticket.description,
        category: ticket.category,
        slaPriority: ticket.sla_priority,
        status: ticket.status,
        companyId: ticket.company_id,
        companyName: ticket.company_name,
        submitterProfileId: ticket.submitter_profile_id,
        assignedGroupId: ticket.assigned_group_id,
        assignedGroupName: ticket.assigned_group_name,
        assignedHandlerId: ticket.assigned_handler_id,
        assignedHandlerName: ticket.assigned_handler_name,
        createdAt: ticket.created_at,
        completedAt: ticket.completed_at,
        completedBy: ticket.completed_by,
        completedByName: ticket.completed_by_name,
      },
      submitter: submitter
        ? {
            profileId: submitter.profile_id,
            displayName: submitter.display_name,
            email: submitter.email,
            companyName: submitter.company_name,
            departmentName: submitter.department_name,
          }
        : null,
      submitterHistory: submitterHistory.map((h) => ({
        id: h.id,
        subject: h.subject,
        category: h.category,
        status: h.status,
        createdAt: h.created_at,
      })),
      replies: replies.map((r) => ({
        id: r.id,
        replierProfileId: r.replier_profile_id,
        replierName: r.replier_name,
        content: r.content,
        createdAt: r.created_at,
      })),
      recentLogs: recentLogs.map((l) => ({
        id: l.id,
        actorId: l.actor_user_id,
        actorName: l.actor_name,
        action: l.event_type,
        createdAt: l.occurred_at,
      })),
      evaluation: evaluation
        ? {
            satisfactionScore: evaluation.satisfaction_score,
            comment: evaluation.comment,
            createdAt: evaluation.created_at,
          }
        : null,
    })
  })

  // POST /api/tickets/:id/replies
  app.post('/api/tickets/:id/replies', async (c) => {
    const user = getUser(c)
    if (!user.profileId) return c.json(errorBody('FORBIDDEN', 'No profile'), 403)
    const ticketId = c.req.param('id')

    const ticket = await getTicketForCompany(db, ticketId, user.companyId!)
    if (!ticket) return c.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    if (ticket.status === 'completed' || ticket.status === 'cancelled')
      return c.json(errorBody('CONFLICT', 'Ticket is completed or cancelled'), 409)

    const isAuthorized =
      user.role === 'admin' ||
      ticket.submitter_profile_id === user.profileId ||
      ticket.assigned_handler_id === user.profileId
    if (!isAuthorized) return c.json(errorBody('FORBIDDEN', 'Not authorized to reply'), 403)

    const body = await c.req.json().catch(() => ({}))
    const content = typeof body.content === 'string' ? body.content.trim() : ''
    if (!content) return c.json(errorBody('VALIDATION_ERROR', 'content is required'), 400)

    const replyId = randomUUID()
    const ts = now()
    await db.run({
      text: 'INSERT INTO ticket_replies (id, ticket_id, replier_profile_id, content, created_at) VALUES (?, ?, ?, ?, ?)',
      params: [replyId, ticketId, user.profileId, content, ts],
    })

    return c.json(
      {
        id: replyId,
        ticketId,
        replierProfileId: user.profileId,
        replierName: user.displayName,
        content,
        createdAt: ts,
      },
      201,
    )
  })

  // POST /api/tickets/:id/assign
  app.post('/api/tickets/:id/assign', async (c) => {
    const user = getUser(c)
    if (user.role !== 'admin') return c.json(errorBody('FORBIDDEN', 'Admin only'), 403)
    const ticketId = c.req.param('id')

    const ticket = await getTicketForCompany(db, ticketId, user.companyId!)
    if (!ticket) return c.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    if (ticket.status !== 'pending_assignment')
      return c.json(errorBody('CONFLICT', 'Ticket must be pending_assignment'), 409)

    const body = await c.req.json().catch(() => ({}))
    const groupId = typeof body.groupId === 'string' ? body.groupId.trim() : ''
    if (!groupId) return c.json(errorBody('VALIDATION_ERROR', 'groupId is required'), 400)

    const group = await db.queryOne<{ id: string }>({
      text: 'SELECT id FROM business_groups WHERE id = ? AND company_id = ?',
      params: [groupId, user.companyId],
    })
    if (!group) return c.json(errorBody('NOT_FOUND', 'Business group not found'), 404)

    const ts = now()
    await db.transaction(async (tx) => {
      await tx.run({
        text: "UPDATE tickets SET status = 'pending_processing', assigned_group_id = ? WHERE id = ?",
        params: [groupId, ticketId],
      })
      await auditKit.record({
        type: 'ticket.assigned',
        actorUserId: user.profileId!,
        metadata: { ticketId, groupId, auto: false },
      })
    })

    const updated = await getTicketForCompany(db, ticketId, user.companyId!)
    return c.json(ticketResponse(updated!))
  })

  // POST /api/tickets/:id/transfer
  app.post('/api/tickets/:id/transfer', async (c) => {
    const user = getUser(c)
    if (!user.profileId) return c.json(errorBody('FORBIDDEN', 'No profile'), 403)
    const ticketId = c.req.param('id')

    const ticket = await getTicketForCompany(db, ticketId, user.companyId!)
    if (!ticket) return c.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    if (ticket.status !== 'pending_processing')
      return c.json(errorBody('CONFLICT', 'Ticket must be pending_processing'), 409)

    const isAuthorized = user.role === 'admin' || ticket.assigned_handler_id === user.profileId
    if (!isAuthorized) return c.json(errorBody('FORBIDDEN', 'Not authorized to transfer'), 403)

    const body = await c.req.json().catch(() => ({}))
    const toGroupId = typeof body.toGroupId === 'string' && body.toGroupId.trim() ? body.toGroupId.trim() : null
    const toProfileId = typeof body.toProfileId === 'string' && body.toProfileId.trim() ? body.toProfileId.trim() : null
    if (!toGroupId && !toProfileId)
      return c.json(errorBody('VALIDATION_ERROR', 'toGroupId or toProfileId is required'), 400)

    const transferId = randomUUID()
    const ts = now()
    await db.transaction(async (tx) => {
      if (toGroupId) {
        const group = await tx.queryOne<{ id: string }>({
          text: 'SELECT id FROM business_groups WHERE id = ? AND company_id = ?',
          params: [toGroupId, user.companyId],
        })
        if (!group) throw new Error('TARGET_GROUP_NOT_FOUND')
      }
      if (toProfileId) {
        const profile = await tx.queryOne<{ id: string }>({
          text: 'SELECT id FROM user_profiles WHERE id = ? AND company_id = ?',
          params: [toProfileId, user.companyId],
        })
        if (!profile) throw new Error('TARGET_PROFILE_NOT_FOUND')
      }

      await tx.run({
        text: 'INSERT INTO ticket_transfers (id, ticket_id, from_profile_id, to_group_id, to_profile_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        params: [transferId, ticketId, user.profileId, toGroupId, toProfileId, ts],
      })
      await tx.run({
        text: 'UPDATE tickets SET assigned_group_id = COALESCE(?, assigned_group_id), assigned_handler_id = COALESCE(?, assigned_handler_id) WHERE id = ?',
        params: [toGroupId, toProfileId, ticketId],
      })
      await auditKit.record({
        type: 'ticket.transferred',
        actorUserId: user.profileId ?? undefined,
        metadata: { ticketId, fromProfileId: user.profileId, toGroupId, toProfileId },
      })
    })

    const updated = await getTicketForCompany(db, ticketId, user.companyId!)
    return c.json(ticketResponse(updated!))
  })

  // POST /api/tickets/:id/complete
  app.post('/api/tickets/:id/complete', async (c) => {
    const user = getUser(c)
    if (!user.profileId) return c.json(errorBody('FORBIDDEN', 'No profile'), 403)
    const ticketId = c.req.param('id')

    const ticket = await getTicketForCompany(db, ticketId, user.companyId!)
    if (!ticket) return c.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    if (ticket.status !== 'pending_processing')
      return c.json(errorBody('CONFLICT', 'Ticket must be pending_processing'), 409)

    const isAuthorized = user.role === 'admin' || ticket.assigned_handler_id === user.profileId
    if (!isAuthorized) return c.json(errorBody('FORBIDDEN', 'Not authorized to complete'), 403)

    const ts = now()
    await db.transaction(async (tx) => {
      await tx.run({
        text: "UPDATE tickets SET status = 'completed', completed_at = ?, completed_by = ? WHERE id = ?",
        params: [ts, user.profileId, ticketId],
      })
      await auditKit.record({
        type: 'ticket.completed',
        actorUserId: user.profileId ?? undefined,
        metadata: { ticketId, completedBy: user.profileId, completedAt: ts },
      })
    })

    // Send email notification (outside transaction)
    await sendCompletionEmail(emailClient, db, ticket.submitter_profile_id, ticket.subject, ticketId)

    const updated = await getTicketForCompany(db, ticketId, user.companyId!)
    return c.json(ticketResponse(updated!))
  })

  // POST /api/tickets/:id/cancel
  app.post('/api/tickets/:id/cancel', async (c) => {
    const user = getUser(c)
    if (!user.profileId) return c.json(errorBody('FORBIDDEN', 'No profile'), 403)
    const ticketId = c.req.param('id')

    const ticket = await getTicketForCompany(db, ticketId, user.companyId!)
    if (!ticket) return c.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    if (ticket.status === 'completed' || ticket.status === 'cancelled')
      return c.json(errorBody('CONFLICT', 'Ticket is already completed or cancelled'), 409)

    const isAuthorized = user.role === 'admin' || ticket.submitter_profile_id === user.profileId
    if (!isAuthorized) return c.json(errorBody('FORBIDDEN', 'Not authorized to cancel'), 403)

    const body = await c.req.json().catch(() => ({}))
    const reason = typeof body.reason === 'string' ? body.reason : null
    const ts = now()

    await db.transaction(async (tx) => {
      await tx.run({
        text: "UPDATE tickets SET status = 'cancelled' WHERE id = ?",
        params: [ticketId],
      })
      await auditKit.record({
        type: 'ticket.cancelled',
        actorUserId: user.profileId ?? undefined,
        metadata: { ticketId, reason },
      })
    })

    const updated = await getTicketForCompany(db, ticketId, user.companyId!)
    return c.json(ticketResponse(updated!))
  })

  // POST /api/tickets/:id/evaluation
  app.post('/api/tickets/:id/evaluation', async (c) => {
    const user = getUser(c)
    if (!user.profileId) return c.json(errorBody('FORBIDDEN', 'No profile'), 403)
    const ticketId = c.req.param('id')

    const ticket = await getTicketForCompany(db, ticketId, user.companyId!)
    if (!ticket) return c.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    if (ticket.status !== 'completed')
      return c.json(errorBody('CONFLICT', 'Ticket must be completed to evaluate'), 409)
    if (ticket.submitter_profile_id !== user.profileId)
      return c.json(errorBody('FORBIDDEN', 'Only the submitter can evaluate'), 403)

    const existing = await db.queryOne<{ id: string }>({
      text: 'SELECT id FROM ticket_evaluations WHERE ticket_id = ?',
      params: [ticketId],
    })
    if (existing) return c.json(errorBody('CONFLICT', 'Ticket already evaluated'), 409)

    const body = await c.req.json().catch(() => ({}))
    const score = Number(body.satisfactionScore)
    if (!Number.isInteger(score) || score < 1 || score > 5)
      return c.json(errorBody('VALIDATION_ERROR', 'satisfactionScore must be an integer 1-5'), 400)
    const comment = typeof body.comment === 'string' ? body.comment : null

    const evalId = randomUUID()
    const ts = now()
    await db.run({
      text: 'INSERT INTO ticket_evaluations (id, ticket_id, evaluator_profile_id, satisfaction_score, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      params: [evalId, ticketId, user.profileId, score, comment, ts],
    })

    return c.json(
      {
        id: evalId,
        ticketId,
        evaluatorProfileId: user.profileId,
        satisfactionScore: score,
        comment,
        createdAt: ts,
      },
      201,
    )
  })

  // GET /api/tickets/:id/logs
  app.get('/api/tickets/:id/logs', async (c) => {
    const user = getUser(c)
    if (!user.companyId) return c.json(errorBody('FORBIDDEN', 'No company context'), 403)
    const ticketId = c.req.param('id')

    const ticket = await getTicketForCompany(db, ticketId, user.companyId)
    if (!ticket) return c.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)

    const logs = await db.queryAll<{
      id: string
      actor_user_id: string | null
      event_type: string
      metadata_json: string
      occurred_at: string
      actor_name: string | null
    }>({
      text: `SELECT a.id, a.actor_user_id, a.event_type, a.metadata_json, a.occurred_at,
                    p.display_name AS actor_name
             FROM audit_events a
             LEFT JOIN user_profiles p ON p.id = a.actor_user_id
             WHERE a.event_type LIKE 'ticket.%' AND json_extract(a.metadata_json, '$.ticketId') = ?
             ORDER BY a.occurred_at DESC`,
      params: [ticketId],
    })

    return c.json(
      logs.map((l) => ({
        id: l.id,
        actorId: l.actor_user_id,
        actorName: l.actor_name,
        action: l.event_type,
        targetId: ticketId,
        metadata: l.metadata_json ? JSON.parse(l.metadata_json) : {},
        createdAt: l.occurred_at,
      })),
    )
  })
}

async function sendCompletionEmail(
  emailClient: EmailClient | null,
  db: DbClient,
  submitterProfileId: string,
  subject: string,
  ticketId: string,
) {
  if (!emailClient) return
  const submitter = await db.queryOne<{ email: string; display_name: string }>({
    text: 'SELECT email, display_name FROM user_profiles WHERE id = ?',
    params: [submitterProfileId],
  })
  if (!submitter) return
  try {
    await emailClient.send({
      to: submitter.email,
      subject: '工单已完成',
      text: `您好 ${submitter.display_name}，\n\n您的工单「${subject}」（编号：${ticketId}）已完成处理。\n\n工单系统`,
    })
  } catch (error) {
    console.error('[email] failed to send completion notification', error)
  }
}
