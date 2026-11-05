import { randomUUID } from 'node:crypto'
import type { Context, Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { initializePlatform } from './platform/bootstrap'
import type { AuthUser } from '@commonapp/userkit'
import { PermissionDeniedError } from '@commonapp/permissionkit'
import type {
  Ticket,
  TicketReply,
  TicketTransfer,
  TicketEvaluation,
  BusinessGroup,
  CategoryRule,
} from '../shared/tickets'

type Platform = Awaited<ReturnType<typeof initializePlatform>>

class ApiError extends Error {
  constructor(public code: string, public status: ContentfulStatusCode, message: string) {
    super(message)
  }
}
const errorBody = (code: string, message: string) => ({ error: { code, message } })
const invalid = (message: string) => new ApiError('INVALID_INPUT', 400, message)
const notFound = (message: string) => new ApiError('NOT_FOUND', 404, message)
const conflict = (message: string) => new ApiError('CONFLICT', 409, message)
const forbidden = (message: string) => new ApiError('AUTHZ_FAILED', 403, message)

// 统一错误映射：权限拒绝 → 403，业务约束 → 409，校验失败 → 400，资源不存在 → 404。
function handle(fn: (c: Context) => Promise<Response>) {
  return async (c: Context) => {
    try {
      return await fn(c)
    } catch (error) {
      if (error instanceof ApiError) return c.json(errorBody(error.code, error.message), error.status)
      if (error instanceof PermissionDeniedError) return c.json(errorBody('AUTHZ_FAILED', 'You do not have permission to perform this action'), 403)
      if (error instanceof TypeError) return c.json(errorBody('INVALID_INPUT', error.message), 400)
      throw error
    }
  }
}

const requireParam = (c: Context, name: string) => {
  const value = c.req.param(name)
  if (!value) throw invalid(`Missing path parameter: ${name}`)
  return value
}

const SLA_PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'P4'] as const
const TERMINAL_STATUSES = ['completed', 'cancelled']

const currentUser = (context: unknown): AuthUser =>
  (context as { get(name: string): unknown }).get('currentUser') as AuthUser

const requiredString = (value: unknown, name: string, maxLength: number) => {
  if (typeof value !== 'string' || !value.trim()) throw invalid(`${name} is required`)
  const trimmed = value.trim()
  if (trimmed.length > maxLength) throw invalid(`${name} must be at most ${maxLength} characters`)
  return trimmed
}

const parseLimit = (raw: string | undefined) => Math.min(Math.max(Number(raw ?? 20) || 20, 1), 100)
const parseOffset = (raw: string | undefined) => Math.max(Number(raw ?? 0) || 0, 0)

async function authorize(platform: Platform, userId: string, permissionKey: string) {
  try {
    return await platform.permission.requirePermission(userId, permissionKey)
  } catch (error) {
    if (error instanceof PermissionDeniedError) throw forbidden('You do not have permission to perform this action')
    throw error
  }
}

const mapTicket = (row: Record<string, unknown>): Ticket => ({
  id: String(row.id),
  companyId: String(row.company_id),
  subject: String(row.subject),
  description: String(row.description),
  category: String(row.category),
  slaPriority: String(row.sla_priority) as Ticket['slaPriority'],
  status: String(row.status) as Ticket['status'],
  submitterId: String(row.submitter_id),
  submitterName: String(row.submitter_name ?? ''),
  assignedGroupId: (row.assigned_group_id as string | null) ?? null,
  assigneeId: (row.assignee_id as string | null) ?? null,
  handlerId: (row.handler_id as string | null) ?? null,
  createdAt: String(row.created_at),
  handledAt: (row.handled_at as string | null) ?? null,
  completedAt: (row.completed_at as string | null) ?? null,
  cancelledAt: (row.cancelled_at as string | null) ?? null,
  cancelledBy: (row.cancelled_by as string | null) ?? null,
})

const TICKET_COLUMNS = `
  t.id, t.company_id, t.subject, t.description, t.category, t.sla_priority, t.status,
  t.submitter_id, u.name AS submitter_name, t.assigned_group_id, t.assignee_id, t.handler_id,
  t.created_at, t.handled_at, t.completed_at, t.cancelled_at, t.cancelled_by
`

async function loadTicket(platform: Platform, ticketId: string, companyId: string): Promise<Ticket> {
  const row = await platform.db.queryOne<Record<string, unknown>>({
    text: `SELECT ${TICKET_COLUMNS} FROM tickets t LEFT JOIN users u ON u.id = t.submitter_id WHERE t.id = ? AND t.company_id = ?`,
    params: [ticketId, companyId],
  })
  if (!row) throw notFound('Ticket not found')
  return mapTicket(row)
}

async function recordTicketAudit(
  platform: Platform,
  event: { type: string; userId: string; ticketId: string; method: string; route: string; statusCode: number; metadata?: Record<string, unknown> },
) {
  await platform.audit.record({
    type: event.type,
    actorUserId: event.userId,
    method: event.method,
    route: event.route,
    statusCode: event.statusCode,
    metadata: { ticketId: event.ticketId, ...event.metadata },
  })
}

interface TicketListQuery {
  status?: string
  category?: string
  slaPriority?: string
  search?: string
  sort?: string
  order?: string
  limit: number
  offset: number
}

function ticketListQuery(context: { req: { query: (key: string) => string | undefined } }): TicketListQuery {
  return {
    status: context.req.query('status'),
    category: context.req.query('category'),
    slaPriority: context.req.query('slaPriority'),
    search: context.req.query('search'),
    sort: context.req.query('sort'),
    order: context.req.query('order'),
    limit: parseLimit(context.req.query('limit')),
    offset: parseOffset(context.req.query('offset')),
  }
}

async function queryTickets(db: Platform['db'], companyId: string, query: TicketListQuery): Promise<{ tickets: Ticket[]; total: number }> {
  const where: string[] = ['t.company_id = ?']
  const params: unknown[] = [companyId]
  if (query.status) { where.push('t.status = ?'); params.push(query.status) }
  if (query.category) { where.push('t.category = ?'); params.push(query.category) }
  if (query.slaPriority) {
    if (!SLA_PRIORITIES.includes(query.slaPriority as typeof SLA_PRIORITIES[number])) throw invalid('slaPriority must be one of P0-P4')
    where.push('t.sla_priority = ?'); params.push(query.slaPriority)
  }
  if (query.search) { where.push('lower(t.subject) LIKE ?'); params.push(`%${query.search.trim().toLowerCase()}%`) }
  const sortField = query.sort === 'sla_priority' ? 't.sla_priority' : 't.created_at'
  const order = query.order === 'asc' ? 'ASC' : 'DESC'
  const whereClause = where.join(' AND ')
  const totalRow = await db.queryOne<{ total: number }>({ text: `SELECT COUNT(*) AS total FROM tickets t WHERE ${whereClause}`, params })
  const rows = await db.queryAll<Record<string, unknown>>({
    text: `SELECT ${TICKET_COLUMNS} FROM tickets t LEFT JOIN users u ON u.id = t.submitter_id WHERE ${whereClause} ORDER BY ${sortField} ${order}, t.id DESC LIMIT ? OFFSET ?`,
    params: [...params, query.limit, query.offset],
  })
  return { tickets: rows.map(mapTicket), total: Number(totalRow?.total ?? 0) }
}

export function registerBusinessRoutes(app: Hono, platform: Platform) {
  // --- 工单管理 ---

  app.get('/api/tickets', handle(async (context) => {
    const user = currentUser(context)
    const result = await queryTickets(platform.db, user.companyId ?? '', ticketListQuery(context))
    return context.json(result)
  }))

  app.post('/api/tickets', handle(async (context) => {
    const user = currentUser(context)
    await authorize(platform, user.id, 'ticket.create')
    if (!user.companyId) throw forbidden('Current user is not bound to a company')
    const body = await context.req.json().catch(() => ({}))
    const subject = requiredString(body.subject, 'subject', 200)
    const description = requiredString(body.description, 'description', 5000)
    const category = requiredString(body.category, 'category', 100)
    const slaPriorityRaw = body.slaPriority ?? 'P3'
    if (!SLA_PRIORITIES.includes(slaPriorityRaw)) throw invalid('slaPriority must be one of P0-P4')
    const slaPriority = slaPriorityRaw as Ticket['slaPriority']
    const now = new Date().toISOString()
    const ticketId = randomUUID()
    await platform.db.transaction(async (tx) => {
      await tx.run({
        text: `INSERT INTO tickets (id, company_id, subject, description, category, sla_priority, status, submitter_id, created_at) VALUES (?, ?, ?, ?, ?, ?, 'created', ?, ?)`,
        params: [ticketId, user.companyId, subject, description, category, slaPriority, user.id, now],
      })
      // 自动按分类规则匹配分配到业务组。
      const rule = await tx.queryOne<{ business_group_id: string }>({
        text: 'SELECT business_group_id FROM category_assignment_rules WHERE company_id = ? AND category = ?',
        params: [user.companyId, category],
      })
      if (rule) {
        await tx.run({
          text: `UPDATE tickets SET assigned_group_id = ?, status = 'pending_processing' WHERE id = ?`,
          params: [rule.business_group_id, ticketId],
        })
      } else {
        await tx.run({ text: `UPDATE tickets SET status = 'pending_assignment' WHERE id = ?`, params: [ticketId] })
      }
    })
    const ticket = await loadTicket(platform, ticketId, user.companyId)
    await recordTicketAudit(platform, { type: 'ticket.created', userId: user.id, ticketId, method: context.req.method, route: context.req.path, statusCode: 201 })
    if (ticket.assignedGroupId) {
      await recordTicketAudit(platform, { type: 'ticket.assigned', userId: user.id, ticketId, method: context.req.method, route: context.req.path, statusCode: 201, metadata: { businessGroupId: ticket.assignedGroupId, auto: true } })
    }
    return context.json({ ticket }, 201)
  }))

  app.get('/api/tickets/:id', handle(async (context) => {
    const user = currentUser(context)
    const ticket = await loadTicket(platform, requireParam(context, 'id'), user.companyId ?? '')
    const replyRows = await platform.db.queryAll<Record<string, unknown>>({
      text: `SELECT r.id, r.ticket_id, r.replier_id, u.name AS replier_name, r.content, r.replied_at FROM ticket_replies r LEFT JOIN users u ON u.id = r.replier_id WHERE r.ticket_id = ? ORDER BY r.replied_at ASC, r.id ASC`,
      params: [ticket.id],
    })
    const replies: TicketReply[] = replyRows.map((row) => ({
      id: String(row.id), ticketId: String(row.ticket_id), replierId: String(row.replier_id),
      replierName: String(row.replier_name ?? ''), content: String(row.content), repliedAt: String(row.replied_at),
    }))
    return context.json({ ticket, replies })
  }))

  app.patch('/api/tickets/:id', handle(async (context) => {
    const user = currentUser(context)
    const ticket = await loadTicket(platform, requireParam(context, 'id'), user.companyId ?? '')
    await authorize(platform, user.id, 'ticket.assign')
    if (TERMINAL_STATUSES.includes(ticket.status)) throw conflict('Cannot update a terminal ticket')
    const body = await context.req.json().catch(() => ({}))
    if (body.slaPriority === undefined) throw invalid('Only slaPriority can be updated')
    if (!SLA_PRIORITIES.includes(body.slaPriority)) throw invalid('slaPriority must be one of P0-P4')
    await platform.db.run({ text: 'UPDATE tickets SET sla_priority = ? WHERE id = ?', params: [body.slaPriority, ticket.id] })
    const updated = await loadTicket(platform, ticket.id, user.companyId ?? '')
    return context.json({ ticket: updated })
  }))

  // --- 工单回复 ---

  app.post('/api/tickets/:id/replies', handle(async (context) => {
    const user = currentUser(context)
    // 先按公司隔离加载工单（跨公司 → 404，不暴露存在性），再做权限校验。
    const ticket = await loadTicket(platform, requireParam(context, 'id'), user.companyId ?? '')
    await authorize(platform, user.id, 'ticket.reply')
    if (TERMINAL_STATUSES.includes(ticket.status)) throw conflict('Cannot reply to a terminal ticket')
    const body = await context.req.json().catch(() => ({}))
    const content = requiredString(body.content, 'content', 5000)
    const replyId = randomUUID()
    const now = new Date().toISOString()
    await platform.db.run({
      text: 'INSERT INTO ticket_replies (id, ticket_id, replier_id, content, replied_at) VALUES (?, ?, ?, ?, ?)',
      params: [replyId, ticket.id, user.id, content, now],
    })
    const reply: TicketReply = { id: replyId, ticketId: ticket.id, replierId: user.id, replierName: user.name, content, repliedAt: now }
    await recordTicketAudit(platform, { type: 'ticket.replied', userId: user.id, ticketId: ticket.id, method: context.req.method, route: context.req.path, statusCode: 201, metadata: { replyId } })
    return context.json({ reply }, 201)
  }))

  // --- 工单操作 ---

  app.post('/api/tickets/:id/assign', handle(async (context) => {
    const user = currentUser(context)
    const ticket = await loadTicket(platform, requireParam(context, 'id'), user.companyId ?? '')
    await authorize(platform, user.id, 'ticket.assign')
    if (ticket.status !== 'pending_assignment') throw conflict('Ticket is not pending assignment')
    const body = await context.req.json().catch(() => ({}))
    const businessGroupId = requiredString(body.businessGroupId, 'businessGroupId', 100)
    const group = await platform.db.queryOne<{ id: string }>({ text: 'SELECT id FROM business_groups WHERE id = ? AND company_id = ?', params: [businessGroupId, user.companyId] })
    if (!group) throw invalid('businessGroupId does not belong to the current company')
    const assigneeId = typeof body.assigneeId === 'string' && body.assigneeId.trim() ? body.assigneeId.trim() : null
    if (assigneeId) {
      const member = await platform.db.queryOne<{ id: string }>({ text: 'SELECT user_id AS id FROM business_group_members WHERE group_id = ? AND user_id = ?', params: [businessGroupId, assigneeId] })
      if (!member) throw invalid('assigneeId is not a member of the business group')
    }
    await platform.db.run({
      text: `UPDATE tickets SET assigned_group_id = ?, assignee_id = ?, status = 'pending_processing' WHERE id = ?`,
      params: [businessGroupId, assigneeId, ticket.id],
    })
    const updated = await loadTicket(platform, ticket.id, user.companyId ?? '')
    await recordTicketAudit(platform, { type: 'ticket.assigned', userId: user.id, ticketId: ticket.id, method: context.req.method, route: context.req.path, statusCode: 200, metadata: { businessGroupId, assigneeId } })
    return context.json({ ticket: updated })
  }))

  app.post('/api/tickets/:id/transfer', handle(async (context) => {
    const user = currentUser(context)
    const ticket = await loadTicket(platform, requireParam(context, 'id'), user.companyId ?? '')
    await authorize(platform, user.id, 'ticket.transfer')
    if (ticket.status !== 'pending_processing') throw conflict('Ticket is not pending processing')
    const body = await context.req.json().catch(() => ({}))
    const toGroupId = requiredString(body.toGroupId, 'toGroupId', 100)
    const group = await platform.db.queryOne<{ id: string }>({ text: 'SELECT id FROM business_groups WHERE id = ? AND company_id = ?', params: [toGroupId, user.companyId] })
    if (!group) throw invalid('toGroupId does not belong to the current company')
    const toAssigneeId = typeof body.toAssigneeId === 'string' && body.toAssigneeId.trim() ? body.toAssigneeId.trim() : null
    const reason = typeof body.reason === 'string' ? body.reason.trim() : null
    const transferId = randomUUID()
    const now = new Date().toISOString()
    await platform.db.transaction(async (tx) => {
      await tx.run({
        text: 'INSERT INTO ticket_transfers (id, ticket_id, from_group_id, from_assignee_id, to_group_id, to_assignee_id, transferred_by, transferred_at, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        params: [transferId, ticket.id, ticket.assignedGroupId, ticket.assigneeId, toGroupId, toAssigneeId, user.id, now, reason],
      })
      await tx.run({ text: 'UPDATE tickets SET assigned_group_id = ?, assignee_id = ? WHERE id = ?', params: [toGroupId, toAssigneeId, ticket.id] })
    })
    const updated = await loadTicket(platform, ticket.id, user.companyId ?? '')
    const transfer: TicketTransfer = {
      id: transferId, ticketId: ticket.id, fromGroupId: ticket.assignedGroupId, fromAssigneeId: ticket.assigneeId,
      toGroupId, toAssigneeId, transferredBy: user.id, transferredAt: now, reason,
    }
    await recordTicketAudit(platform, { type: 'ticket.transferred', userId: user.id, ticketId: ticket.id, method: context.req.method, route: context.req.path, statusCode: 200, metadata: { transferId, toGroupId } })
    return context.json({ ticket: updated, transfer })
  }))

  app.post('/api/tickets/:id/complete', handle(async (context) => {
    const user = currentUser(context)
    const ticket = await loadTicket(platform, requireParam(context, 'id'), user.companyId ?? '')
    await authorize(platform, user.id, 'ticket.complete')
    if (ticket.status !== 'pending_processing') throw conflict('Ticket is not pending processing')
    const body = await context.req.json().catch(() => ({}))
    const resolution = typeof body.resolution === 'string' ? body.resolution.trim() : null
    const now = new Date().toISOString()
    await platform.db.run({
      text: `UPDATE tickets SET handler_id = ?, handled_at = ?, completed_at = ?, status = 'completed' WHERE id = ?`,
      params: [user.id, now, now, ticket.id],
    })
    const updated = await loadTicket(platform, ticket.id, user.companyId ?? '')
    await recordTicketAudit(platform, { type: 'ticket.completed', userId: user.id, ticketId: ticket.id, method: context.req.method, route: context.req.path, statusCode: 200, metadata: { resolution } })
    // 邮件通知提交人；发送失败记录日志与审计，但不回滚工单完成。
    try {
      const submitter = await platform.auth.userStore.findById(ticket.submitterId)
      if (submitter?.email) {
        const result = await platform.email.send({
          to: submitter.email,
          subject: `工单已完成：${ticket.subject}`,
          text: `您的工单「${ticket.subject}」已处理完成。`,
          html: `<p>您的工单「${ticket.subject}」已处理完成。</p>`,
        })
        await recordTicketAudit(platform, { type: 'email.sent', userId: user.id, ticketId: ticket.id, method: context.req.method, route: context.req.path, statusCode: 200, metadata: { to: submitter.email, result: result.status } })
      }
    } catch (error) {
      console.error('[tickets] completion email failed', error)
      await recordTicketAudit(platform, { type: 'email.sent', userId: user.id, ticketId: ticket.id, method: context.req.method, route: context.req.path, statusCode: 200, metadata: { result: 'error' } })
    }
    return context.json({ ticket: updated })
  }))

  app.post('/api/tickets/:id/cancel', handle(async (context) => {
    const user = currentUser(context)
    const ticket = await loadTicket(platform, requireParam(context, 'id'), user.companyId ?? '')
    await authorize(platform, user.id, 'ticket.cancel')
    if (TERMINAL_STATUSES.includes(ticket.status)) throw conflict('Cannot cancel a terminal ticket')
    const body = await context.req.json().catch(() => ({}))
    const reason = typeof body.reason === 'string' ? body.reason.trim() : null
    const now = new Date().toISOString()
    await platform.db.run({
      text: `UPDATE tickets SET cancelled_at = ?, cancelled_by = ?, status = 'cancelled' WHERE id = ?`,
      params: [now, user.id, ticket.id],
    })
    const updated = await loadTicket(platform, ticket.id, user.companyId ?? '')
    await recordTicketAudit(platform, { type: 'ticket.cancelled', userId: user.id, ticketId: ticket.id, method: context.req.method, route: context.req.path, statusCode: 200, metadata: { reason } })
    return context.json({ ticket: updated })
  }))

  // --- 工单评价 ---

  app.post('/api/tickets/:id/evaluation', handle(async (context) => {
    const user = currentUser(context)
    const ticket = await loadTicket(platform, requireParam(context, 'id'), user.companyId ?? '')
    await authorize(platform, user.id, 'ticket.evaluate')
    if (ticket.submitterId !== user.id) throw forbidden('Only the submitter can evaluate the ticket')
    if (ticket.status !== 'completed') throw conflict('Ticket is not completed')
    const body = await context.req.json().catch(() => ({}))
    const rating = Number(body.rating)
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw invalid('rating must be an integer between 1 and 5')
    const comment = typeof body.comment === 'string' && body.comment.trim() ? requiredString(body.comment, 'comment', 1000) : null
    const evaluationId = randomUUID()
    const now = new Date().toISOString()
    try {
      await platform.db.run({
        text: 'INSERT INTO ticket_evaluations (id, ticket_id, submitter_id, rating, comment, evaluated_at) VALUES (?, ?, ?, ?, ?, ?)',
        params: [evaluationId, ticket.id, user.id, rating, comment, now],
      })
    } catch (error) {
      if (error instanceof Error && /unique constraint/i.test(error.message)) throw conflict('Ticket has already been evaluated')
      throw error
    }
    const evaluation: TicketEvaluation = { id: evaluationId, ticketId: ticket.id, submitterId: user.id, rating, comment, evaluatedAt: now }
    await recordTicketAudit(platform, { type: 'ticket.evaluated', userId: user.id, ticketId: ticket.id, method: context.req.method, route: context.req.path, statusCode: 201, metadata: { rating } })
    return context.json({ evaluation }, 201)
  }))

  // --- 提交人信息 ---

  app.get('/api/tickets/:id/submitter-info', handle(async (context) => {
    const user = currentUser(context)
    const ticket = await loadTicket(platform, requireParam(context, 'id'), user.companyId ?? '')
    await authorize(platform, user.id, 'ticket.reply')
    const submitter = await platform.auth.userStore.findById(ticket.submitterId)
    if (!submitter) throw notFound('Submitter not found')
    // userkit 不暴露 department_id，直接从 users 表读取部门维度。
    const submitterDept = await platform.db.queryOne<{ department_id: string | null }>({ text: 'SELECT department_id FROM users WHERE id = ?', params: [submitter.id] })
    const departmentId = submitterDept?.department_id ?? null
    const company = await platform.db.queryOne<{ name: string }>({ text: 'SELECT name FROM companies WHERE id = ?', params: [submitter.companyId] })
    const department = departmentId
      ? await platform.db.queryOne<{ name: string }>({ text: 'SELECT name FROM departments WHERE id = ?', params: [departmentId] })
      : null
    const historyRows = await platform.db.queryAll<Record<string, unknown>>({
      text: `SELECT id, subject, status, category, created_at FROM tickets WHERE submitter_id = ? AND company_id = ? ORDER BY created_at DESC, id DESC LIMIT 50`,
      params: [submitter.id, user.companyId],
    })
    return context.json({
      submitter: {
        id: submitter.id,
        name: submitter.name,
        email: submitter.email,
        phone: submitter.phone,
        companyId: submitter.companyId ?? '',
        companyName: company?.name ?? '',
        departmentId,
        departmentName: department?.name ?? null,
      },
      historyTickets: historyRows.map((row) => ({
        id: String(row.id), subject: String(row.subject), status: String(row.status), category: String(row.category), createdAt: String(row.created_at),
      })),
    })
  }))

  // --- 操作日志 ---

  app.get('/api/tickets/:id/logs', handle(async (context) => {
    const user = currentUser(context)
    const ticket = await loadTicket(platform, requireParam(context, 'id'), user.companyId ?? '')
    const pattern = `%"ticketId":"${ticket.id}"%`
    const rows = await platform.db.queryAll<Record<string, unknown>>({
      text: `SELECT a.id, a.occurred_at, a.event_type, a.actor_user_id, u.name AS actor_name, a.method, a.route, a.status_code, a.metadata_json FROM audit_events a LEFT JOIN users u ON u.id = a.actor_user_id WHERE a.metadata_json LIKE ? ORDER BY a.occurred_at DESC, a.id DESC LIMIT 100`,
      params: [pattern],
    })
    return context.json({
      logs: rows.map((row) => ({
        id: String(row.id),
        occurredAt: String(row.occurred_at),
        eventType: String(row.event_type),
        actorUserId: (row.actor_user_id as string | null) ?? null,
        actorName: (row.actor_name as string | null) ?? null,
        method: (row.method as string | null) ?? null,
        route: (row.route as string | null) ?? null,
        statusCode: (row.status_code as number | null) ?? null,
        metadataJson: String(row.metadata_json ?? '{}'),
      })),
    })
  }))

  // --- 业务组管理 ---

  async function mapBusinessGroup(row: Record<string, unknown>): Promise<BusinessGroup> {
    const members = await platform.db.queryAll<{ user_id: string; name: string; email: string }>({
      text: `SELECT m.user_id, u.name, u.email FROM business_group_members m LEFT JOIN users u ON u.id = m.user_id WHERE m.group_id = ? ORDER BY u.name, m.user_id`,
      params: [row.id],
    })
    return {
      id: String(row.id),
      companyId: String(row.company_id),
      name: String(row.name),
      createdAt: String(row.created_at),
      members: members.map((m) => ({ userId: m.user_id, userName: m.name ?? '', userEmail: m.email ?? '' })),
    }
  }

  app.get('/api/business-groups', handle(async (context) => {
    const user = currentUser(context)
    const rows = await platform.db.queryAll<Record<string, unknown>>({
      text: 'SELECT id, company_id, name, created_at FROM business_groups WHERE company_id = ? ORDER BY name, id',
      params: [user.companyId],
    })
    const groups = await Promise.all(rows.map(mapBusinessGroup))
    return context.json({ groups })
  }))

  app.post('/api/business-groups', handle(async (context) => {
    const user = currentUser(context)
    await authorize(platform, user.id, 'ticket.manage_groups')
    if (!user.companyId) throw forbidden('Current user is not bound to a company')
    const body = await context.req.json().catch(() => ({}))
    const name = requiredString(body.name, 'name', 100)
    const id = randomUUID()
    const now = new Date().toISOString()
    await platform.db.run({
      text: 'INSERT INTO business_groups (id, company_id, name, created_at) VALUES (?, ?, ?, ?)',
      params: [id, user.companyId, name, now],
    })
    const group = await mapBusinessGroup({ id, company_id: user.companyId, name, created_at: now })
    return context.json({ group }, 201)
  }))

  app.post('/api/business-groups/:id/members', handle(async (context) => {
    const user = currentUser(context)
    await authorize(platform, user.id, 'ticket.manage_groups')
    const groupId = requireParam(context, 'id')
    const group = await platform.db.queryOne<{ id: string }>({ text: 'SELECT id FROM business_groups WHERE id = ? AND company_id = ?', params: [groupId, user.companyId] })
    if (!group) throw notFound('Business group not found')
    const body = await context.req.json().catch(() => ({}))
    const userId = requiredString(body.userId, 'userId', 100)
    const existing = await platform.db.queryOne<{ id: string }>({ text: 'SELECT id FROM business_group_members WHERE group_id = ? AND user_id = ?', params: [groupId, userId] })
    if (existing) throw conflict('Member already exists')
    await platform.db.run({
      text: 'INSERT INTO business_group_members (id, group_id, user_id, created_at) VALUES (?, ?, ?, ?)',
      params: [randomUUID(), groupId, userId, new Date().toISOString()],
    })
    return context.json({ ok: true }, 201)
  }))

  app.delete('/api/business-groups/:id/members/:userId', handle(async (context) => {
    const user = currentUser(context)
    await authorize(platform, user.id, 'ticket.manage_groups')
    const groupId = requireParam(context, 'id')
    const group = await platform.db.queryOne<{ id: string }>({ text: 'SELECT id FROM business_groups WHERE id = ? AND company_id = ?', params: [groupId, user.companyId] })
    if (!group) throw notFound('Business group not found')
    const result = await platform.db.run({ text: 'DELETE FROM business_group_members WHERE group_id = ? AND user_id = ?', params: [groupId, context.req.param('userId')] })
    if (result.changes === 0) throw notFound('Member not found')
    return context.json({ ok: true })
  }))

  // --- 分类分配规则 ---

  app.get('/api/category-rules', handle(async (context) => {
    const user = currentUser(context)
    const rows = await platform.db.queryAll<Record<string, unknown>>({
      text: `SELECT r.id, r.company_id, r.category, r.business_group_id, g.name AS business_group_name, r.created_at FROM category_assignment_rules r LEFT JOIN business_groups g ON g.id = r.business_group_id WHERE r.company_id = ? ORDER BY r.category, r.id`,
      params: [user.companyId],
    })
    const rules: CategoryRule[] = rows.map((row) => ({
      id: String(row.id),
      companyId: String(row.company_id),
      category: String(row.category),
      businessGroupId: String(row.business_group_id),
      businessGroupName: String(row.business_group_name ?? ''),
      createdAt: String(row.created_at),
    }))
    return context.json({ rules })
  }))

  app.post('/api/category-rules', handle(async (context) => {
    const user = currentUser(context)
    await authorize(platform, user.id, 'ticket.manage_rules')
    if (!user.companyId) throw forbidden('Current user is not bound to a company')
    const body = await context.req.json().catch(() => ({}))
    const category = requiredString(body.category, 'category', 100)
    const businessGroupId = requiredString(body.businessGroupId, 'businessGroupId', 100)
    const group = await platform.db.queryOne<{ id: string }>({ text: 'SELECT id FROM business_groups WHERE id = ? AND company_id = ?', params: [businessGroupId, user.companyId] })
    if (!group) throw invalid('businessGroupId does not belong to the current company')
    const id = randomUUID()
    const now = new Date().toISOString()
    try {
      await platform.db.run({
        text: 'INSERT INTO category_assignment_rules (id, company_id, category, business_group_id, created_at) VALUES (?, ?, ?, ?, ?)',
        params: [id, user.companyId, category, businessGroupId, now],
      })
    } catch (error) {
      if (error instanceof Error && /unique constraint/i.test(error.message)) throw conflict('A rule for this category already exists')
      throw error
    }
    const rule: CategoryRule = { id, companyId: user.companyId, category, businessGroupId, businessGroupName: '', createdAt: now }
    return context.json({ rule }, 201)
  }))

  app.delete('/api/category-rules/:id', handle(async (context) => {
    const user = currentUser(context)
    await authorize(platform, user.id, 'ticket.manage_rules')
    const result = await platform.db.run({ text: 'DELETE FROM category_assignment_rules WHERE id = ? AND company_id = ?', params: [requireParam(context, 'id'), user.companyId] })
    if (result.changes === 0) throw notFound('Rule not found')
    return context.json({ ok: true })
  }))

  // --- 工作台 ---

  app.get('/api/workbench', handle(async (context) => {
    const user = currentUser(context)
    await authorize(platform, user.id, 'ticket.view_workbench')
    const query = ticketListQuery(context)
    const status = context.req.query('status') ?? 'pending_processing'
    const result = await queryTickets(platform.db, user.companyId ?? '', { ...query, status })
    return context.json(result)
  }))

  // --- 统计分析 ---

  app.get('/api/statistics', handle(async (context) => {
    const user = currentUser(context)
    await authorize(platform, user.id, 'ticket.view_statistics')
    const companyId = user.companyId ?? ''
    const dimension = context.req.query('dimension') === 'department' ? 'department' : 'company'
    const distributionRows = dimension === 'department'
      ? await platform.db.queryAll<{ label: string; total: number; pending: number; completed: number; cancelled: number }>({
          text: `SELECT COALESCE(d.name, '未分配部门') AS label, COUNT(*) AS total,
                   SUM(CASE WHEN t.status = 'pending_assignment' OR t.status = 'pending_processing' THEN 1 ELSE 0 END) AS pending,
                   SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) AS completed,
                   SUM(CASE WHEN t.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
                 FROM tickets t LEFT JOIN users u ON u.id = t.submitter_id LEFT JOIN departments d ON d.id = u.department_id
                 WHERE t.company_id = ? GROUP BY COALESCE(d.name, '未分配部门') ORDER BY total DESC`,
          params: [companyId],
        })
      : await platform.db.queryAll<{ label: string; total: number; pending: number; completed: number; cancelled: number }>({
          text: `SELECT c.name AS label, COUNT(*) AS total,
                   SUM(CASE WHEN t.status = 'pending_assignment' OR t.status = 'pending_processing' THEN 1 ELSE 0 END) AS pending,
                   SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) AS completed,
                   SUM(CASE WHEN t.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
                 FROM tickets t LEFT JOIN companies c ON c.id = t.company_id
                 WHERE t.company_id = ? GROUP BY c.name ORDER BY total DESC`,
          params: [companyId],
        })
    const totalRow = await platform.db.queryOne<{ total: number }>({ text: 'SELECT COUNT(*) AS total FROM tickets WHERE company_id = ?', params: [companyId] })
    const avgRow = await platform.db.queryOne<{ avg: number | null }>({
      text: `SELECT AVG((julianday(completed_at) - julianday(created_at)) * 24 * 60) AS avg FROM tickets WHERE company_id = ? AND status = 'completed' AND completed_at IS NOT NULL`,
      params: [companyId],
    })
    const satisfactionRow = await platform.db.queryOne<{ avg: number | null }>({
      text: `SELECT AVG(e.rating) AS avg FROM ticket_evaluations e JOIN tickets t ON t.id = e.ticket_id WHERE t.company_id = ?`,
      params: [companyId],
    })
    const hotspotRows = await platform.db.queryAll<{ category: string; count: number }>({
      text: `SELECT category, COUNT(*) AS count FROM tickets WHERE company_id = ? GROUP BY category ORDER BY count DESC, category ASC LIMIT 5`,
      params: [companyId],
    })
    return context.json({
      distribution: distributionRows.map((row) => ({
        label: String(row.label), total: Number(row.total), pending: Number(row.pending ?? 0),
        completed: Number(row.completed ?? 0), cancelled: Number(row.cancelled ?? 0),
      })),
      metrics: {
        totalTickets: Number(totalRow?.total ?? 0),
        avgResponseTimeMinutes: Math.round(Number(avgRow?.avg ?? 0) * 10) / 10,
        satisfactionScore: Math.round(Number(satisfactionRow?.avg ?? 0) * 100) / 100,
        hotspotCategories: hotspotRows.map((row) => ({ category: String(row.category), count: Number(row.count) })),
      },
    })
  }))
}
