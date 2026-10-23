import { randomUUID } from 'node:crypto'
import type { Hono, MiddlewareHandler } from 'hono'
import type { initializePlatform } from './platform/bootstrap'
import type { AuthUser } from '@commonapp/userkit'

type Platform = Awaited<ReturnType<typeof initializePlatform>>
type CurrentUser = AuthUser & { department: string | null }

const errorBody = (code: string, message: string) => ({ error: { code, message } })
const getUser = (context: unknown): CurrentUser =>
  (context as { get(name: string): CurrentUser }).get('currentUser')
const currentUserId = (context: unknown) => getUser(context).id
const requiredString = (value: unknown, name: string, maxLength = 200) => {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) throw new TypeError(`${name} is required`)
  return value.trim()
}
const userMutationError = (error: unknown, fallback: string) => {
  if (error instanceof TypeError) return error.message
  if (error instanceof Error && /unique constraint/i.test(error.message)) return 'Email or phone is already in use'
  console.error('[users] mutation failed')
  return fallback
}
const now = () => new Date().toISOString()
const uuid = () => randomUUID()

const requireRole = (...allowedRoles: string[]): MiddlewareHandler => async (context, next) => {
  const user = getUser(context)
  const hasRole = user.roles?.some((r) => allowedRoles.includes(r)) ?? false
  if (!hasRole) return context.json(errorBody('forbidden', 'Insufficient role'), 403)
  await next()
}

const VALID_PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'P4']
const SORT_FIELDS: Record<string, string> = {
  createdAt: 't.created_at',
  priority: 't.priority',
  status: 't.status',
  subject: 't.subject',
}

function parseSort(sort?: string): string {
  if (!sort) return 't.created_at DESC'
  const [field, dir] = sort.split(':')
  const column = SORT_FIELDS[field]
  if (!column) return 't.created_at DESC'
  return `${column} ${dir === 'asc' ? 'ASC' : 'DESC'}`
}

function parsePage(context: unknown): { page: number; pageSize: number; offset: number } {
  const query = (context as { req: { query: (name: string) => string | undefined } }).req.query.bind((context as { req: unknown }).req)
  const page = Math.max(Number(query('page') ?? 1) || 1, 1)
  const pageSize = Math.min(Math.max(Number(query('pageSize') ?? 20) || 20, 1), 100)
  return { page, pageSize, offset: (page - 1) * pageSize }
}

function mapTicket(row: Record<string, unknown>) {
  return {
    id: row.id,
    subject: row.subject,
    description: row.description,
    categoryId: row.category_id,
    categoryName: row.category_name ?? null,
    priority: row.priority,
    status: row.status,
    submitterId: row.submitter_id,
    submitterName: row.submitter_name,
    submitterEmail: row.submitter_email,
    submitterCompany: row.submitter_company,
    submitterDepartment: row.submitter_department,
    assignedGroupId: row.assigned_group_id,
    assignedGroupName: row.assigned_group_name ?? null,
    assignedHandlerId: row.assigned_handler_id,
    assignedHandlerName: row.assigned_handler_name ?? null,
    createdAt: row.created_at,
    processedAt: row.processed_at,
    completedAt: row.completed_at,
    completedBy: row.completed_by,
  }
}

function mapTicketCreate(row: Record<string, unknown>) {
  return {
    id: row.id,
    subject: row.subject,
    description: row.description,
    categoryId: row.category_id,
    priority: row.priority,
    status: row.status,
    submitterId: row.submitter_id,
    submitterName: row.submitter_name,
    submitterEmail: row.submitter_email,
    submitterCompany: row.submitter_company,
    submitterDepartment: row.submitter_department,
    assignedGroupId: row.assigned_group_id,
    createdAt: row.created_at,
  }
}

function mapReply(row: Record<string, unknown>) {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    replierId: row.replier_id,
    replierName: row.replier_name,
    content: row.content,
    createdAt: row.created_at,
  }
}

async function getTicketRow(db: Platform['db'], ticketId: string, companyId: string) {
  return db.queryOne<Record<string, unknown>>({
    text: `SELECT t.*, c.name AS category_name, bg.name AS assigned_group_name, u.name AS assigned_handler_name
           FROM tickets t
           LEFT JOIN ticket_categories c ON t.category_id = c.id
           LEFT JOIN business_groups bg ON t.assigned_group_id = bg.id
           LEFT JOIN users u ON t.assigned_handler_id = u.id
           WHERE t.id = ? AND t.company_id = ?`,
    params: [ticketId, companyId],
  })
}

async function recordAudit(platform: Platform, type: string, userId: string, companyId: string | null, actorName: string, metadata: Record<string, unknown> = {}) {
  await platform.auditKit.record({
    type,
    actorUserId: userId,
    metadata: { companyId, actorName, ...metadata },
  })
}

export function registerPublicRoutes(app: Hono, platform: Platform) {
  app.get('/api/auth/bootstrap-status', async (context) => context.json({ required: (await platform.auth.userStore.count()) === 0 }))
  app.post('/api/auth/bootstrap', platform.auth.loginRateLimit, async (context) => {
    const body = await context.req.json().catch(() => ({}))
    let name: string
    let email: string
    let password: string
    try {
      name = requiredString(body.name, 'name')
      email = requiredString(body.email, 'email', 320).toLowerCase()
      password = requiredString(body.password, 'password', 256)
      if (!email.includes('@') || password.length < 12) throw new TypeError('Enter a valid email and a password with at least 12 characters')
    } catch (error) {
      return context.json(errorBody('INVALID_INPUT', error instanceof Error ? error.message : 'Invalid input'), 400)
    }
    const passwordHash = platform.auth.hashPassword(password)
    const id = uuid()
    try {
      await platform.db.transaction(async (tx) => {
        const count = await tx.queryOne<{ total: number }>({ text: 'SELECT COUNT(*) AS total FROM users' })
        if (Number(count?.total ?? 0) !== 0) throw new Error('BOOTSTRAP_CLOSED')
        const timestamp = now()
        await tx.run({
          text: 'INSERT INTO users (id, name, email, phone, enabled, company_id, password_hash, created_at, updated_at) VALUES (?, ?, ?, NULL, 1, NULL, ?, ?, ?)',
          params: [id, name, email, passwordHash, timestamp, timestamp],
        })
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'BOOTSTRAP_CLOSED') return context.json(errorBody('BOOTSTRAP_CLOSED', 'An account already exists'), 409)
      console.error('[bootstrap] failed')
      return context.json(errorBody('BOOTSTRAP_FAILED', 'Could not create the first account'), 500)
    }
    return context.json({ ok: true }, 201)
  })
  app.post('/api/auth/login', platform.auth.loginRateLimit, platform.auth.loginRoute as MiddlewareHandler)
  app.get('/api/auth/sso/start', (context) => platform.auth.sso.start(context as never))
  app.get('/api/auth/sso/callback', (context) => platform.auth.sso.callback(context as never))
  app.post('/api/auth/sso/exchange', (context) => platform.auth.sso.exchange(context as never))
}

export function registerProtectedRoutes(app: Hono, platform: Platform) {
  // ── Auth ──
  app.get('/api/auth/me', (context) => {
    const user = getUser(context)
    return context.json({
      id: user.id,
      name: user.name,
      email: user.email,
      companyId: user.companyId,
      department: user.department,
      roles: user.roles ?? [],
    })
  })

  app.post('/api/auth/logout', (context) => context.json({}))

  app.post('/api/auth/password', async (context) => {
    const body = await context.req.json().catch(() => ({}))
    let password: string
    try {
      password = requiredString(body.password, 'password', 256)
      if (password.length < 12) throw new TypeError('Password must contain at least 12 characters')
    } catch (error) {
      return context.json(errorBody('INVALID_INPUT', error instanceof Error ? error.message : 'Invalid password'), 400)
    }
    const userId = currentUserId(context)
    if (!await platform.auth.userStore.updatePassword(userId, platform.auth.hashPassword(password))) return context.json(errorBody('NOT_FOUND', 'User not found'), 404)
    return context.json({ ok: true, passwordChangeRequired: false })
  })

  // ── Existing user management ──
  app.get('/api/admin/users', async (context) => {
    const search = context.req.query('search') ?? ''
    const limit = Math.min(Math.max(Number(context.req.query('limit') ?? 50), 1), 100)
    const offset = Math.max(Number(context.req.query('offset') ?? 0), 0)
    const [users, total] = await Promise.all([
      platform.auth.userStore.list({ search, limit, offset }),
      platform.auth.userStore.count({ search }),
    ])
    return context.json({ users, total })
  })

  app.post('/api/admin/users', async (context) => {
    const body = await context.req.json().catch(() => ({}))
    try {
      const name = requiredString(body.name, 'name')
      const email = requiredString(body.email, 'email', 320).toLowerCase()
      const password = requiredString(body.password, 'password', 256)
      if (!email.includes('@') || password.length < 12) throw new TypeError('Enter a valid email and a password with at least 12 characters')
      const user = await platform.auth.userStore.create({ name, email, phone: typeof body.phone === 'string' ? body.phone : null, passwordChangeRequired: true }, platform.auth.hashPassword(password))
      return context.json({ user }, 201)
    } catch (error) {
      return context.json(errorBody('INVALID_USER', userMutationError(error, 'Could not create user')), error instanceof TypeError ? 400 : 409)
    }
  })

  app.patch('/api/admin/users/:id', async (context) => {
    const body = await context.req.json().catch(() => ({}))
    try {
      const email = requiredString(body.email, 'email', 320).toLowerCase()
      if (!email.includes('@')) throw new TypeError('Enter a valid email address')
      const user = await platform.auth.userStore.update(context.req.param('id'), {
        name: requiredString(body.name, 'name'),
        email,
        phone: typeof body.phone === 'string' ? body.phone : null,
      })
      if (!user) return context.json(errorBody('NOT_FOUND', 'User not found'), 404)
      return context.json({ user: { id: user.id, name: user.name, email: user.email, phone: user.phone } })
    } catch (error) {
      return context.json(errorBody('INVALID_USER', userMutationError(error, 'Could not update user')), error instanceof TypeError ? 400 : 409)
    }
  })

  app.patch('/api/admin/users/:id/status', async (context) => {
    const body = await context.req.json().catch(() => ({}))
    if (typeof body.enabled !== 'boolean') return context.json(errorBody('INVALID_INPUT', 'enabled must be a boolean'), 400)
    const userId = context.req.param('id')
    const changed = await platform.db.transaction(async (tx) => {
      const result = await tx.run({ text: 'UPDATE users SET enabled = ?, updated_at = ? WHERE id = ?', params: [body.enabled ? 1 : 0, now(), userId] })
      return result.changes === 1
    })
    if (!changed) return context.json(errorBody('NOT_FOUND', 'User not found'), 404)
    return context.json({ ok: true })
  })

  app.post('/api/admin/users/:id/password', async (context) => {
    const body = await context.req.json().catch(() => ({}))
    let password: string
    try {
      password = requiredString(body.password, 'password', 256)
      if (password.length < 12) throw new TypeError('Password must contain at least 12 characters')
    } catch (error) {
      return context.json(errorBody('INVALID_INPUT', error instanceof Error ? error.message : 'Invalid password'), 400)
    }
    const userId = context.req.param('id')
    const changed = await platform.auth.userStore.updatePassword(userId, platform.auth.hashPassword(password), true)
    if (!changed) return context.json(errorBody('NOT_FOUND', 'User not found'), 404)
    return context.json({ ok: true })
  })

  // ── Ticket management ──

  app.post('/api/tickets', requireRole('submitter'), async (context) => {
    const user = getUser(context)
    if (!user.companyId) return context.json(errorBody('forbidden', 'User must belong to a company'), 403)
    const body = await context.req.json().catch(() => ({}))
    let subject: string
    let description: string
    let categoryId: string
    let priority: string
    try {
      subject = requiredString(body.subject, 'subject', 500)
      description = typeof body.description === 'string' ? body.description.trim() : ''
      categoryId = requiredString(body.categoryId, 'categoryId')
      priority = requiredString(body.priority, 'priority', 4)
      if (!VALID_PRIORITIES.includes(priority)) throw new TypeError('priority must be one of P0-P4')
    } catch (error) {
      return context.json(errorBody('invalid_request', error instanceof Error ? error.message : 'Invalid input'), 400)
    }

    const companyRow = await platform.db.queryOne<{ name: string }>({ text: 'SELECT name FROM companies WHERE id = ?', params: [user.companyId] })
    const companyName = companyRow?.name ?? user.companyId
    const categoryRow = await platform.db.queryOne<{ id: string }>({ text: 'SELECT id FROM ticket_categories WHERE id = ? AND company_id = ?', params: [categoryId, user.companyId] })
    if (!categoryRow) return context.json(errorBody('invalid_request', 'Category not found in your company'), 400)

    const ticketId = uuid()
    const timestamp = now()

    const ruleRow = await platform.db.queryOne<{ group_id: string }>({
      text: 'SELECT group_id FROM assignment_rules WHERE company_id = ? AND category_id = ? ORDER BY id DESC LIMIT 1',
      params: [user.companyId, categoryId],
    })

    const status = ruleRow ? 'pending_processing' : 'pending_assignment'
    const assignedGroupId = ruleRow?.group_id ?? null

    await platform.db.run({
      text: `INSERT INTO tickets (id, company_id, subject, description, category_id, priority, status, submitter_id, submitter_name, submitter_email, submitter_company, submitter_department, assigned_group_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [ticketId, user.companyId, subject, description, categoryId, priority, status, user.id, user.name, user.email, companyName, user.department, assignedGroupId, timestamp],
    })

    await recordAudit(platform, 'ticket_create', user.id, user.companyId, user.name, { targetTicketId: ticketId })
    if (ruleRow) await recordAudit(platform, 'ticket_assign', user.id, user.companyId, user.name, { targetTicketId: ticketId, groupId: ruleRow.group_id })

    const ticketRow = await getTicketRow(platform.db, ticketId, user.companyId)
    return context.json(mapTicketCreate(ticketRow!), 201)
  })

  app.get('/api/tickets', async (context) => {
    const user = getUser(context)
    if (!user.companyId) return context.json(errorBody('forbidden', 'User must belong to a company'), 403)
    const isAdmin = user.roles?.includes('admin') ?? false
    const requestedCompanyId = context.req.query('companyId')
    const companyId = isAdmin ? (requestedCompanyId ?? null) : user.companyId
    const { page, pageSize, offset } = parsePage(context)

    const conditions: string[] = []
    const params: unknown[] = []
    if (companyId) { conditions.push('t.company_id = ?'); params.push(companyId) }
    const status = context.req.query('status')
    if (status) { conditions.push('t.status = ?'); params.push(status) }
    const priority = context.req.query('priority')
    if (priority) { conditions.push('t.priority = ?'); params.push(priority) }
    const catId = context.req.query('categoryId')
    if (catId) { conditions.push('t.category_id = ?'); params.push(catId) }
    const search = context.req.query('search')
    if (search) { conditions.push('(t.subject LIKE ? OR t.description LIKE ?)'); params.push(`%${search}%`, `%${search}%`) }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const orderBy = parseSort(context.req.query('sort'))

    const rows = await platform.db.queryAll<Record<string, unknown>>({
      text: `SELECT t.*, c.name AS category_name, bg.name AS assigned_group_name, u.name AS assigned_handler_name
             FROM tickets t
             LEFT JOIN ticket_categories c ON t.category_id = c.id
             LEFT JOIN business_groups bg ON t.assigned_group_id = bg.id
             LEFT JOIN users u ON t.assigned_handler_id = u.id
             ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      params: [...params, pageSize, offset],
    })
    const countRow = await platform.db.queryOne<{ total: number }>({ text: `SELECT COUNT(*) AS total FROM tickets t ${where}`, params })
    return context.json({ items: rows.map(mapTicket), total: Number(countRow?.total ?? 0), page, pageSize })
  })

  app.get('/api/tickets/:id', async (context) => {
    const user = getUser(context)
    if (!user.companyId) return context.json(errorBody('forbidden', 'User must belong to a company'), 403)
    const ticketId = context.req.param('id')
    const ticketRow = await getTicketRow(platform.db, ticketId, user.companyId)
    if (!ticketRow) return context.json(errorBody('not_found', 'Ticket not found'), 404)
    const replies = await platform.db.queryAll<Record<string, unknown>>({
      text: 'SELECT id, ticket_id, replier_id, replier_name, content, created_at FROM ticket_replies WHERE ticket_id = ? ORDER BY created_at ASC',
      params: [ticketId],
    })
    return context.json({ ...mapTicket(ticketRow), replies: replies.map(mapReply) })
  })

  app.patch('/api/tickets/:id/status', requireRole('submitter', 'admin'), async (context) => {
    const user = getUser(context)
    if (!user.companyId) return context.json(errorBody('forbidden', 'User must belong to a company'), 403)
    const body = await context.req.json().catch(() => ({}))
    if (body.status !== 'cancelled') return context.json(errorBody('invalid_request', 'Only cancelled status is supported'), 400)
    const ticketId = context.req.param('id')
    const ticketRow = await getTicketRow(platform.db, ticketId, user.companyId)
    if (!ticketRow) return context.json(errorBody('not_found', 'Ticket not found'), 404)

    const isSubmitter = user.roles?.includes('submitter') ?? false
    const isAdmin = user.roles?.includes('admin') ?? false
    if (isSubmitter && !isAdmin && ticketRow.submitter_id !== user.id) {
      return context.json(errorBody('forbidden', 'Can only cancel your own ticket'), 403)
    }

    if (ticketRow.status === 'completed' || ticketRow.status === 'cancelled') {
      return context.json(errorBody('conflict', 'Cannot change status of completed or cancelled ticket'), 409)
    }

    await platform.db.run({ text: 'UPDATE tickets SET status = ? WHERE id = ? AND company_id = ?', params: ['cancelled', ticketId, user.companyId] })
    await recordAudit(platform, 'ticket_cancel', user.id, user.companyId, user.name, { targetTicketId: ticketId })

    const updated = await getTicketRow(platform.db, ticketId, user.companyId)
    return context.json(mapTicket(updated!))
  })

  app.post('/api/tickets/:id/replies', requireRole('submitter', 'handler', 'admin'), async (context) => {
    const user = getUser(context)
    if (!user.companyId) return context.json(errorBody('forbidden', 'User must belong to a company'), 403)
    const body = await context.req.json().catch(() => ({}))
    let content: string
    try { content = requiredString(body.content, 'content', 5000) } catch (error) {
      return context.json(errorBody('invalid_request', error instanceof Error ? error.message : 'Invalid input'), 400)
    }
    const ticketId = context.req.param('id')
    const ticketRow = await getTicketRow(platform.db, ticketId, user.companyId)
    if (!ticketRow) return context.json(errorBody('not_found', 'Ticket not found'), 404)

    const replyId = uuid()
    const timestamp = now()
    await platform.db.run({
      text: 'INSERT INTO ticket_replies (id, ticket_id, replier_id, replier_name, content, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      params: [replyId, ticketId, user.id, user.name, content, timestamp],
    })
    return context.json({ id: replyId, ticketId, replierId: user.id, replierName: user.name, content, createdAt: timestamp }, 201)
  })

  app.post('/api/tickets/:id/complete', requireRole('handler', 'admin'), async (context) => {
    const user = getUser(context)
    if (!user.companyId) return context.json(errorBody('forbidden', 'User must belong to a company'), 403)
    const ticketId = context.req.param('id')
    const ticketRow = await getTicketRow(platform.db, ticketId, user.companyId)
    if (!ticketRow) return context.json(errorBody('not_found', 'Ticket not found'), 404)

    if (ticketRow.assigned_handler_id !== user.id) {
      return context.json(errorBody('forbidden', 'Only the assigned handler can complete this ticket'), 403)
    }
    if (ticketRow.status !== 'pending_processing') {
      return context.json(errorBody('conflict', 'Ticket must be in pending_processing status'), 409)
    }

    const timestamp = now()
    await platform.db.run({
      text: 'UPDATE tickets SET status = ?, completed_by = ?, completed_at = ? WHERE id = ? AND company_id = ?',
      params: ['completed', user.id, timestamp, ticketId, user.companyId],
    })

    const emailResult = await platform.emailClient.send({
      to: ticketRow.submitter_email as string,
      subject: `工单已完成: ${ticketRow.subject as string}`,
      text: `您的工单 "${ticketRow.subject as string}" 已完成处理。`,
    })
    if (emailResult.status === 'failed') {
      await recordAudit(platform, 'email_send_failed', user.id, user.companyId, user.name, { targetTicketId: ticketId, reason: emailResult.message })
    }

    await recordAudit(platform, 'ticket_complete', user.id, user.companyId, user.name, { targetTicketId: ticketId })
    const updated = await getTicketRow(platform.db, ticketId, user.companyId)
    return context.json(mapTicket(updated!))
  })

  // ── Ticket assignment ──

  app.post('/api/business-groups', requireRole('admin'), async (context) => {
    const user = getUser(context)
    if (!user.companyId) return context.json(errorBody('forbidden', 'User must belong to a company'), 403)
    const body = await context.req.json().catch(() => ({}))
    let name: string
    try { name = requiredString(body.name, 'name', 200) } catch (error) {
      return context.json(errorBody('invalid_request', error instanceof Error ? error.message : 'Invalid input'), 400)
    }
    const id = uuid()
    await platform.db.run({ text: 'INSERT INTO business_groups (id, company_id, name) VALUES (?, ?, ?)', params: [id, user.companyId, name] })
    return context.json({ id, companyId: user.companyId, name }, 201)
  })

  app.get('/api/business-groups', requireRole('admin'), async (context) => {
    const user = getUser(context)
    if (!user.companyId) return context.json(errorBody('forbidden', 'User must belong to a company'), 403)
    const groups = await platform.db.queryAll<{ id: string; company_id: string; name: string }>({
      text: 'SELECT id, company_id, name FROM business_groups WHERE company_id = ? ORDER BY name',
      params: [user.companyId],
    })
    const result = await Promise.all(groups.map(async (g) => {
      const members = await platform.db.queryAll<{ id: string; user_id: string; user_name: string }>({
        text: 'SELECT bgm.id, bgm.user_id, u.name AS user_name FROM business_group_members bgm JOIN users u ON bgm.user_id = u.id WHERE bgm.group_id = ?',
        params: [g.id],
      })
      return { id: g.id, companyId: g.company_id, name: g.name, members: members.map((m) => ({ id: m.id, userId: m.user_id, userName: m.user_name })) }
    }))
    return context.json(result)
  })

  app.post('/api/business-groups/:id/members', requireRole('admin'), async (context) => {
    const user = getUser(context)
    if (!user.companyId) return context.json(errorBody('forbidden', 'User must belong to a company'), 403)
    const groupId = context.req.param('id')
    const body = await context.req.json().catch(() => ({}))
    let userIdParam: string
    try { userIdParam = requiredString(body.userId, 'userId') } catch (error) {
      return context.json(errorBody('invalid_request', error instanceof Error ? error.message : 'Invalid input'), 400)
    }

    const groupRow = await platform.db.queryOne<{ company_id: string }>({ text: 'SELECT company_id FROM business_groups WHERE id = ?', params: [groupId] })
    if (!groupRow || groupRow.company_id !== user.companyId) return context.json(errorBody('not_found', 'Business group not found'), 404)

    const targetUserRow = await platform.db.queryOne<{ id: string }>({ text: 'SELECT id FROM users WHERE id = ? AND company_id = ?', params: [userIdParam, user.companyId] })
    if (!targetUserRow) return context.json(errorBody('invalid_request', 'User is not in the same company'), 400)

    const memberId = uuid()
    await platform.db.run({ text: 'INSERT INTO business_group_members (id, group_id, user_id) VALUES (?, ?, ?)', params: [memberId, groupId, userIdParam] })
    return context.json({ id: memberId, groupId, userId: userIdParam }, 201)
  })

  app.delete('/api/business-groups/:id/members/:userId', requireRole('admin'), async (context) => {
    const user = getUser(context)
    if (!user.companyId) return context.json(errorBody('forbidden', 'User must belong to a company'), 403)
    const groupId = context.req.param('id')
    const userIdParam = context.req.param('userId')
    const groupRow = await platform.db.queryOne<{ company_id: string }>({ text: 'SELECT company_id FROM business_groups WHERE id = ?', params: [groupId] })
    if (!groupRow || groupRow.company_id !== user.companyId) return context.json(errorBody('not_found', 'Business group not found'), 404)
    await platform.db.run({ text: 'DELETE FROM business_group_members WHERE group_id = ? AND user_id = ?', params: [groupId, userIdParam] })
    return context.json({})
  })

  app.post('/api/ticket-categories', requireRole('admin'), async (context) => {
    const user = getUser(context)
    if (!user.companyId) return context.json(errorBody('forbidden', 'User must belong to a company'), 403)
    const body = await context.req.json().catch(() => ({}))
    let name: string
    try { name = requiredString(body.name, 'name', 200) } catch (error) {
      return context.json(errorBody('invalid_request', error instanceof Error ? error.message : 'Invalid input'), 400)
    }
    const id = uuid()
    await platform.db.run({ text: 'INSERT INTO ticket_categories (id, company_id, name) VALUES (?, ?, ?)', params: [id, user.companyId, name] })
    return context.json({ id, companyId: user.companyId, name }, 201)
  })

  app.get('/api/ticket-categories', async (context) => {
    const user = getUser(context)
    if (!user.companyId) return context.json(errorBody('forbidden', 'User must belong to a company'), 403)
    const rows = await platform.db.queryAll<{ id: string; company_id: string; name: string }>({
      text: 'SELECT id, company_id, name FROM ticket_categories WHERE company_id = ? ORDER BY name',
      params: [user.companyId],
    })
    return context.json(rows.map((r) => ({ id: r.id, companyId: r.company_id, name: r.name })))
  })

  app.post('/api/assignment-rules', requireRole('admin'), async (context) => {
    const user = getUser(context)
    if (!user.companyId) return context.json(errorBody('forbidden', 'User must belong to a company'), 403)
    const body = await context.req.json().catch(() => ({}))
    let categoryId: string
    let groupId: string
    try {
      categoryId = requiredString(body.categoryId, 'categoryId')
      groupId = requiredString(body.groupId, 'groupId')
    } catch (error) {
      return context.json(errorBody('invalid_request', error instanceof Error ? error.message : 'Invalid input'), 400)
    }

    const catRow = await platform.db.queryOne<{ id: string }>({ text: 'SELECT id FROM ticket_categories WHERE id = ? AND company_id = ?', params: [categoryId, user.companyId] })
    if (!catRow) return context.json(errorBody('invalid_request', 'Category not found in your company'), 400)
    const groupRow = await platform.db.queryOne<{ id: string }>({ text: 'SELECT id FROM business_groups WHERE id = ? AND company_id = ?', params: [groupId, user.companyId] })
    if (!groupRow) return context.json(errorBody('invalid_request', 'Business group not found in your company'), 400)

    const id = uuid()
    await platform.db.run({ text: 'INSERT INTO assignment_rules (id, company_id, category_id, group_id) VALUES (?, ?, ?, ?)', params: [id, user.companyId, categoryId, groupId] })
    return context.json({ id, companyId: user.companyId, categoryId, groupId }, 201)
  })

  app.get('/api/assignment-rules', requireRole('admin'), async (context) => {
    const user = getUser(context)
    if (!user.companyId) return context.json(errorBody('forbidden', 'User must belong to a company'), 403)
    const rows = await platform.db.queryAll<{ id: string; company_id: string; category_id: string; category_name: string; group_id: string; group_name: string }>({
      text: `SELECT ar.id, ar.company_id, ar.category_id, c.name AS category_name, ar.group_id, bg.name AS group_name
             FROM assignment_rules ar
             LEFT JOIN ticket_categories c ON ar.category_id = c.id
             LEFT JOIN business_groups bg ON ar.group_id = bg.id
             WHERE ar.company_id = ?`,
      params: [user.companyId],
    })
    return context.json(rows.map((r) => ({ id: r.id, companyId: r.company_id, categoryId: r.category_id, categoryName: r.category_name, groupId: r.group_id, groupName: r.group_name })))
  })

  // ── Ticket collaboration ──

  app.post('/api/tickets/:id/transfer', requireRole('handler', 'admin'), async (context) => {
    const user = getUser(context)
    if (!user.companyId) return context.json(errorBody('forbidden', 'User must belong to a company'), 403)
    const ticketId = context.req.param('id')
    const body = await context.req.json().catch(() => ({}))
    let toUserId: string
    try { toUserId = requiredString(body.toUserId, 'toUserId') } catch (error) {
      return context.json(errorBody('invalid_request', error instanceof Error ? error.message : 'Invalid input'), 400)
    }

    const ticketRow = await getTicketRow(platform.db, ticketId, user.companyId)
    if (!ticketRow) return context.json(errorBody('not_found', 'Ticket not found'), 404)

    if (ticketRow.assigned_handler_id !== user.id) {
      return context.json(errorBody('forbidden', 'Only the current handler can transfer this ticket'), 403)
    }
    if (ticketRow.status !== 'pending_processing') {
      return context.json(errorBody('conflict', 'Ticket must be in pending_processing status'), 409)
    }

    const memberRow = await platform.db.queryOne<{ bgm_id: string }>({
      text: `SELECT bgm.id AS bgm_id FROM business_group_members bgm
             JOIN business_groups bg ON bgm.group_id = bg.id
             WHERE bgm.user_id = ? AND bg.company_id = ?`,
      params: [toUserId, user.companyId],
    })
    if (!memberRow) return context.json(errorBody('invalid_request', 'Target user is not a business group member in your company'), 400)

    const timestamp = now()
    await platform.db.transaction(async (tx) => {
      await tx.run({ text: 'UPDATE tickets SET assigned_handler_id = ? WHERE id = ? AND company_id = ?', params: [toUserId, ticketId, user.companyId] })
      await tx.run({ text: 'INSERT INTO ticket_transfers (id, ticket_id, from_user_id, to_user_id, created_at) VALUES (?, ?, ?, ?, ?)', params: [uuid(), ticketId, user.id, toUserId, timestamp] })
    })

    await recordAudit(platform, 'ticket_transfer', user.id, user.companyId, user.name, { targetTicketId: ticketId, fromUserId: user.id, toUserId })
    const updated = await getTicketRow(platform.db, ticketId, user.companyId)
    return context.json(mapTicket(updated!))
  })

  // ── Ticket processing ──

  app.get('/api/tickets/:id/submitter', requireRole('handler', 'admin'), async (context) => {
    const user = getUser(context)
    if (!user.companyId) return context.json(errorBody('forbidden', 'User must belong to a company'), 403)
    const ticketId = context.req.param('id')
    const ticketRow = await getTicketRow(platform.db, ticketId, user.companyId)
    if (!ticketRow) return context.json(errorBody('not_found', 'Ticket not found'), 404)

    const historyTickets = await platform.db.queryAll<{ id: string; subject: string; status: string; priority: string; created_at: string }>({
      text: 'SELECT id, subject, status, priority, created_at FROM tickets WHERE submitter_id = ? AND company_id = ? ORDER BY created_at DESC',
      params: [ticketRow.submitter_id, user.companyId],
    })

    return context.json({
      id: ticketRow.submitter_id,
      name: ticketRow.submitter_name,
      email: ticketRow.submitter_email,
      companyId: user.companyId,
      companyName: ticketRow.submitter_company,
      department: ticketRow.submitter_department,
      historyTickets: historyTickets.map((t) => ({ id: t.id, subject: t.subject, status: t.status, priority: t.priority, createdAt: t.created_at })),
    })
  })

  // ── Evaluation ──

  app.post('/api/tickets/:id/evaluation', requireRole('submitter'), async (context) => {
    const user = getUser(context)
    if (!user.companyId) return context.json(errorBody('forbidden', 'User must belong to a company'), 403)
    const ticketId = context.req.param('id')
    const body = await context.req.json().catch(() => ({}))
    const rating = Number(body.rating)
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return context.json(errorBody('invalid_request', 'rating must be an integer between 1 and 5'), 400)
    }
    const comment = typeof body.comment === 'string' ? body.comment.trim() : null

    const ticketRow = await getTicketRow(platform.db, ticketId, user.companyId)
    if (!ticketRow) return context.json(errorBody('not_found', 'Ticket not found'), 404)

    if (ticketRow.submitter_id !== user.id) {
      return context.json(errorBody('forbidden', 'Only the ticket submitter can evaluate'), 403)
    }
    if (ticketRow.status !== 'completed') {
      return context.json(errorBody('conflict', 'Ticket must be completed before evaluation'), 409)
    }

    const existing = await platform.db.queryOne<{ id: string }>({ text: 'SELECT id FROM ticket_evaluations WHERE ticket_id = ?', params: [ticketId] })
    if (existing) return context.json(errorBody('conflict', 'Ticket already evaluated'), 409)

    const evalId = uuid()
    const timestamp = now()
    await platform.db.run({
      text: 'INSERT INTO ticket_evaluations (id, ticket_id, evaluator_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      params: [evalId, ticketId, user.id, rating, comment, timestamp],
    })

    await recordAudit(platform, 'ticket_evaluate', user.id, user.companyId, user.name, { targetTicketId: ticketId, rating })
    return context.json({ id: evalId, ticketId, evaluatorId: user.id, rating, comment, createdAt: timestamp }, 201)
  })

  app.get('/api/tickets/:id/evaluation', async (context) => {
    const user = getUser(context)
    if (!user.companyId) return context.json(errorBody('forbidden', 'User must belong to a company'), 403)
    const ticketId = context.req.param('id')
    const ticketRow = await getTicketRow(platform.db, ticketId, user.companyId)
    if (!ticketRow) return context.json(errorBody('not_found', 'Ticket not found'), 404)

    const evalRow = await platform.db.queryOne<{ id: string; ticket_id: string; evaluator_id: string; rating: number; comment: string | null; created_at: string }>({
      text: 'SELECT id, ticket_id, evaluator_id, rating, comment, created_at FROM ticket_evaluations WHERE ticket_id = ?',
      params: [ticketId],
    })
    if (!evalRow) return context.json(errorBody('not_found', 'Evaluation not found'), 404)
    return context.json({ id: evalRow.id, ticketId: evalRow.ticket_id, evaluatorId: evalRow.evaluator_id, rating: evalRow.rating, comment: evalRow.comment, createdAt: evalRow.created_at })
  })

  // ── Statistics ──

  app.get('/api/statistics/distribution', requireRole('admin'), async (context) => {
    const user = getUser(context)
    if (!user.companyId) return context.json(errorBody('forbidden', 'User must belong to a company'), 403)
    const dimension = context.req.query('dimension')
    if (dimension !== 'company' && dimension !== 'department') {
      return context.json(errorBody('invalid_request', 'dimension must be company or department'), 400)
    }

    if (dimension === 'company') {
      const rows = await platform.db.queryAll<{ company_id: string; company_name: string; ticket_count: number }>({
        text: `SELECT t.company_id, COALESCE(c.name, t.company_id) AS company_name, COUNT(*) AS ticket_count
               FROM tickets t LEFT JOIN companies c ON t.company_id = c.id
               GROUP BY t.company_id ORDER BY ticket_count DESC`,
      })
      return context.json(rows.map((r) => ({ companyId: r.company_id, companyName: r.company_name, ticketCount: Number(r.ticket_count) })))
    }

    const companyId = context.req.query('companyId') ?? user.companyId
    const rows = await platform.db.queryAll<{ department: string | null; ticket_count: number }>({
      text: `SELECT t.submitter_department AS department, COUNT(*) AS ticket_count
             FROM tickets t WHERE t.company_id = ?
             GROUP BY t.submitter_department ORDER BY ticket_count DESC`,
      params: [companyId],
    })
    return context.json(rows.map((r) => ({ department: r.department ?? '', ticketCount: Number(r.ticket_count) })))
  })

  app.get('/api/statistics/dashboard', requireRole('admin'), async (context) => {
    const user = getUser(context)
    if (!user.companyId) return context.json(errorBody('forbidden', 'User must belong to a company'), 403)
    const companyId = user.companyId

    const [totalRow, avgTimeRow, avgRatingRow, hotCatRows, statusRows] = await Promise.all([
      platform.db.queryOne<{ total: number }>({ text: 'SELECT COUNT(*) AS total FROM tickets WHERE company_id = ?', params: [companyId] }),
      platform.db.queryOne<{ avg_ms: number | null }>({
        text: `SELECT CAST(AVG((julianday(completed_at) - julianday(created_at)) * 86400000) AS INTEGER) AS avg_ms
               FROM tickets WHERE company_id = ? AND completed_at IS NOT NULL`,
        params: [companyId],
      }),
      platform.db.queryOne<{ avg_rating: number | null }>({
        text: `SELECT AVG(e.rating) AS avg_rating FROM ticket_evaluations e
               JOIN tickets t ON e.ticket_id = t.id WHERE t.company_id = ?`,
        params: [companyId],
      }),
      platform.db.queryAll<{ category_id: string; category_name: string; ticket_count: number }>({
        text: `SELECT t.category_id, c.name AS category_name, COUNT(*) AS ticket_count
               FROM tickets t LEFT JOIN ticket_categories c ON t.category_id = c.id
               WHERE t.company_id = ? AND t.category_id IS NOT NULL
               GROUP BY t.category_id, c.name ORDER BY ticket_count DESC LIMIT 5`,
        params: [companyId],
      }),
      platform.db.queryAll<{ status: string; count: number }>({
        text: 'SELECT status, COUNT(*) AS count FROM tickets WHERE company_id = ? GROUP BY status',
        params: [companyId],
      }),
    ])

    const statusBreakdown: Record<string, number> = { created: 0, pending_assignment: 0, pending_processing: 0, completed: 0, cancelled: 0 }
    for (const row of statusRows) statusBreakdown[row.status] = Number(row.count)

    return context.json({
      totalTickets: Number(totalRow?.total ?? 0),
      avgResponseTimeMs: avgTimeRow?.avg_ms ?? null,
      avgSatisfaction: avgRatingRow?.avg_rating ?? null,
      hotCategories: hotCatRows.map((r) => ({ categoryId: r.category_id, categoryName: r.category_name, ticketCount: Number(r.ticket_count) })),
      statusBreakdown,
    })
  })

  // ── Workbench ──

  app.get('/api/workbench/tickets', requireRole('handler', 'admin'), async (context) => {
    const user = getUser(context)
    if (!user.companyId) return context.json(errorBody('forbidden', 'User must belong to a company'), 403)
    const isAdmin = user.roles?.includes('admin') ?? false
    const { page, pageSize, offset } = parsePage(context)

    const conditions = ['t.status = ?']
    const params: unknown[] = ['pending_processing']

    if (isAdmin) {
      const requestedCompanyId = context.req.query('companyId')
      if (requestedCompanyId) { conditions.push('t.company_id = ?'); params.push(requestedCompanyId) }
    } else {
      conditions.push('t.company_id = ?', 't.assigned_handler_id = ?')
      params.push(user.companyId, user.id)
    }

    const priority = context.req.query('priority')
    if (priority) { conditions.push('t.priority = ?'); params.push(priority) }
    const catId = context.req.query('categoryId')
    if (catId) { conditions.push('t.category_id = ?'); params.push(catId) }
    const search = context.req.query('search')
    if (search) { conditions.push('t.subject LIKE ?'); params.push(`%${search}%`) }

    const where = `WHERE ${conditions.join(' AND ')}`
    const orderBy = parseSort(context.req.query('sort'))

    const rows = await platform.db.queryAll<Record<string, unknown>>({
      text: `SELECT t.*, c.name AS category_name, bg.name AS assigned_group_name, u.name AS assigned_handler_name
             FROM tickets t
             LEFT JOIN ticket_categories c ON t.category_id = c.id
             LEFT JOIN business_groups bg ON t.assigned_group_id = bg.id
             LEFT JOIN users u ON t.assigned_handler_id = u.id
             ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      params: [...params, pageSize, offset],
    })
    const countRow = await platform.db.queryOne<{ total: number }>({ text: `SELECT COUNT(*) AS total FROM tickets t ${where}`, params })
    return context.json({ items: rows.map(mapTicket), total: Number(countRow?.total ?? 0), page, pageSize })
  })

  // ── Audit logs ──

  app.get('/api/audit-logs', requireRole('admin'), async (context) => {
    const user = getUser(context)
    if (!user.companyId) return context.json(errorBody('forbidden', 'User must belong to a company'), 403)
    const { page, pageSize, offset } = parsePage(context)
    const ticketId = context.req.query('ticketId')
    const action = context.req.query('action')

    const conditions = ["json_extract(metadata_json, '$.companyId') = ?"]
    const params: unknown[] = [user.companyId]
    if (action) { conditions.push('event_type = ?'); params.push(action) }
    if (ticketId) { conditions.push("json_extract(metadata_json, '$.targetTicketId') = ?"); params.push(ticketId) }

    const where = `WHERE ${conditions.join(' AND ')}`
    const rows = await platform.db.queryAll<{ id: string; occurred_at: string; event_type: string; actor_user_id: string | null; metadata_json: string }>({
      text: `SELECT id, occurred_at, event_type, actor_user_id, metadata_json
             FROM audit_events ${where} ORDER BY occurred_at DESC, id DESC LIMIT ? OFFSET ?`,
      params: [...params, pageSize, offset],
    })
    const countRow = await platform.db.queryOne<{ total: number }>({ text: `SELECT COUNT(*) AS total FROM audit_events ${where}`, params })

    const items = rows.map((row) => {
      const meta = JSON.parse(row.metadata_json ?? '{}') as Record<string, unknown>
      return {
        id: row.id,
        actorId: row.actor_user_id ?? '',
        actorName: meta.actorName ?? '',
        action: row.event_type,
        targetTicketId: meta.targetTicketId ?? null,
        createdAt: row.occurred_at,
        details: null as string | null,
      }
    })
    return context.json({ items, total: Number(countRow?.total ?? 0), page, pageSize })
  })
}
