import { randomUUID } from 'node:crypto'
import type { Hono, MiddlewareHandler, Context } from 'hono'
import type { initializePlatform } from './platform/bootstrap'
import type { AuthUser } from '@commonapp/userkit'
import { createTicketService } from './services/ticket-service'
import { createOrganizationService } from './services/organization-service'
import { createStatisticsService } from './services/statistics-service'
import { TICKET_STATUS, isSlaPriority } from '../shared/types'

type Platform = Awaited<ReturnType<typeof initializePlatform>>
const errorBody = (code: string, message: string) => ({ error: { code, message } })
const currentUserId = (context: Context) => ((context as unknown as { get(name: string): unknown }).get('currentUser') as AuthUser).id
const getCompanyId = (context: Context): string | null => {
  const user = (context as unknown as { get(name: string): unknown }).get('currentUser') as AuthUser | undefined
  return user?.companyId ?? null
}
const requireCompanyContext = (context: Context): string | null => {
  const companyId = getCompanyId(context)
  if (!companyId) return null
  return companyId
}
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
    const id = randomUUID()
    try {
      await platform.db.transaction(async (tx) => {
        const count = await tx.queryOne<{ total: number }>({ text: 'SELECT COUNT(*) AS total FROM users' })
        if (Number(count?.total ?? 0) !== 0) throw new Error('BOOTSTRAP_CLOSED')
        const timestamp = new Date().toISOString()
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
  app.get('/api/auth/me', (context) => context.json((context as unknown as { get(key: string): unknown }).get('currentUser')))
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
      const result = await tx.run({ text: 'UPDATE users SET enabled = ?, updated_at = ? WHERE id = ?', params: [body.enabled ? 1 : 0, new Date().toISOString(), userId] })
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

  // ── Business routes ──

  const ticketService = createTicketService(platform.db, platform.emailClient, platform.auditKit)
  const organizationService = createOrganizationService(platform.db)
  const statisticsService = createStatisticsService(platform.db)

  // Companies
  app.get('/api/companies', async (context) => {
    const companies = await organizationService.listCompanies()
    return context.json(companies)
  })

  app.post('/api/companies', async (context) => {
    const body = await context.req.json().catch(() => ({}))
    let name: string
    try { name = requiredString(body.name, 'name') } catch (error) {
      return context.json(errorBody('bad_request', error instanceof Error ? error.message : 'name is required'), 400)
    }
    const company = await organizationService.createCompany(name)
    return context.json(company, 201)
  })

  // Departments
  app.get('/api/companies/:companyId/departments', async (context) => {
    const companyId = requireCompanyContext(context)
    if (!companyId || context.req.param('companyId') !== companyId) return context.json(errorBody('not_found', 'Not found'), 404)
    const departments = await organizationService.listDepartments(companyId)
    return context.json(departments)
  })

  app.post('/api/companies/:companyId/departments', async (context) => {
    const companyId = requireCompanyContext(context)
    if (!companyId || context.req.param('companyId') !== companyId) return context.json(errorBody('not_found', 'Not found'), 404)
    const body = await context.req.json().catch(() => ({}))
    let name: string
    try { name = requiredString(body.name, 'name') } catch (error) {
      return context.json(errorBody('bad_request', error instanceof Error ? error.message : 'name is required'), 400)
    }
    const department = await organizationService.createDepartment(companyId, name)
    return context.json(department, 201)
  })

  // Business groups
  app.get('/api/companies/:companyId/groups', async (context) => {
    const companyId = requireCompanyContext(context)
    if (!companyId || context.req.param('companyId') !== companyId) return context.json(errorBody('not_found', 'Not found'), 404)
    const groups = await organizationService.listGroups(companyId)
    return context.json(groups)
  })

  app.post('/api/companies/:companyId/groups', async (context) => {
    const companyId = requireCompanyContext(context)
    if (!companyId || context.req.param('companyId') !== companyId) return context.json(errorBody('not_found', 'Not found'), 404)
    const body = await context.req.json().catch(() => ({}))
    let name: string
    try { name = requiredString(body.name, 'name') } catch (error) {
      return context.json(errorBody('bad_request', error instanceof Error ? error.message : 'name is required'), 400)
    }
    const group = await organizationService.createGroup(companyId, name)
    return context.json(group, 201)
  })

  // Group members
  app.get('/api/companies/:companyId/groups/:groupId/members', async (context) => {
    const companyId = requireCompanyContext(context)
    if (!companyId || context.req.param('companyId') !== companyId) return context.json(errorBody('not_found', 'Not found'), 404)
    const groupId = context.req.param('groupId')
    const members = await organizationService.listMembers(companyId, groupId)
    return context.json(members)
  })

  app.post('/api/companies/:companyId/groups/:groupId/members', async (context) => {
    const companyId = requireCompanyContext(context)
    if (!companyId || context.req.param('companyId') !== companyId) return context.json(errorBody('not_found', 'Not found'), 404)
    const groupId = context.req.param('groupId')
    const body = await context.req.json().catch(() => ({}))
    const userId = typeof body.userId === 'string' ? body.userId.trim() : ''
    if (!userId) return context.json(errorBody('bad_request', 'userId is required'), 400)
    const member = await organizationService.addMember(companyId, groupId, userId)
    if (member === null) {
      // Could be group not found or already a member
      const groupExists = await organizationService.groupExistsInCompany(groupId, companyId)
      if (!groupExists) return context.json(errorBody('not_found', 'Group not found'), 404)
      return context.json(errorBody('conflict', 'User is already a member'), 409)
    }
    return context.json(member, 201)
  })

  app.delete('/api/companies/:companyId/groups/:groupId/members/:userId', async (context) => {
    const companyId = requireCompanyContext(context)
    if (!companyId || context.req.param('companyId') !== companyId) return context.json(errorBody('not_found', 'Not found'), 404)
    const groupId = context.req.param('groupId')
    const userId = context.req.param('userId')
    const removed = await organizationService.removeMember(companyId, groupId, userId)
    if (!removed) return context.json(errorBody('not_found', 'Member not found'), 404)
    return context.body(null, 204)
  })

  // Assignment rules
  app.get('/api/companies/:companyId/assignment-rules', async (context) => {
    const companyId = requireCompanyContext(context)
    if (!companyId || context.req.param('companyId') !== companyId) return context.json(errorBody('not_found', 'Not found'), 404)
    const rules = await organizationService.listAssignmentRules(companyId)
    return context.json(rules)
  })

  app.post('/api/companies/:companyId/assignment-rules', async (context) => {
    const companyId = requireCompanyContext(context)
    if (!companyId || context.req.param('companyId') !== companyId) return context.json(errorBody('not_found', 'Not found'), 404)
    const body = await context.req.json().catch(() => ({}))
    const category = typeof body.category === 'string' ? body.category.trim() : ''
    const groupId = typeof body.groupId === 'string' ? body.groupId.trim() : ''
    if (!category || !groupId) return context.json(errorBody('bad_request', 'category and groupId are required'), 400)
    const rule = await organizationService.createAssignmentRule(companyId, category, groupId)
    if (rule === null) {
      const groupExists = await organizationService.groupExistsInCompany(groupId, companyId)
      if (!groupExists) return context.json(errorBody('not_found', 'Group not found'), 404)
      return context.json(errorBody('conflict', 'Assignment rule for this category already exists'), 409)
    }
    return context.json(rule, 201)
  })

  // Tickets — create
  app.post('/api/tickets', async (context) => {
    const companyId = requireCompanyContext(context)
    if (!companyId) return context.json(errorBody('forbidden', 'Company context required'), 403)
    const body = await context.req.json().catch(() => ({}))
    let subject: string, description: string, category: string, slaPriority: string
    try {
      subject = requiredString(body.subject, 'subject')
      description = requiredString(body.description, 'description', 10000)
      category = requiredString(body.category, 'category')
      slaPriority = requiredString(body.slaPriority, 'slaPriority', 10)
    } catch (error) {
      return context.json(errorBody('bad_request', error instanceof Error ? error.message : 'Invalid input'), 400)
    }
    if (!isSlaPriority(slaPriority)) return context.json(errorBody('bad_request', 'slaPriority must be one of P0, P1, P2, P3, P4'), 400)
    const ticket = await ticketService.createTicket({
      companyId, submitterUserId: currentUserId(context),
      subject, description, category, slaPriority,
    })
    return context.json(ticket, 201)
  })

  // Tickets — list
  app.get('/api/tickets', async (context) => {
    const companyId = requireCompanyContext(context)
    if (!companyId) return context.json(errorBody('forbidden', 'Company context required'), 403)
    const page = Math.max(Number(context.req.query('page') ?? 1) || 1, 1)
    const pageSize = Math.min(Math.max(Number(context.req.query('pageSize') ?? 20) || 20, 1), 100)
    const result = await ticketService.listTickets({
      companyId,
      status: context.req.query('status') || undefined,
      category: context.req.query('category') || undefined,
      slaPriority: context.req.query('slaPriority') || undefined,
      search: context.req.query('search') || undefined,
      sort: context.req.query('sort') || undefined,
      order: context.req.query('order') || undefined,
      page, pageSize,
    })
    return context.json(result)
  })

  // Tickets — get by id
  app.get('/api/tickets/:id', async (context) => {
    const companyId = requireCompanyContext(context)
    if (!companyId) return context.json(errorBody('forbidden', 'Company context required'), 403)
    const ticket = await ticketService.getTicket(context.req.param('id'), companyId)
    if (!ticket) return context.json(errorBody('not_found', 'Ticket not found'), 404)
    return context.json(ticket)
  })

  // Tickets — update (assign/complete/cancel)
  app.patch('/api/tickets/:id', async (context) => {
    const companyId = requireCompanyContext(context)
    if (!companyId) return context.json(errorBody('forbidden', 'Company context required'), 403)
    const ticketId = context.req.param('id')
    const body = await context.req.json().catch(() => ({}))
    const status = typeof body.status === 'string' ? body.status : undefined
    const assignedGroupId = body.assignedGroupId === undefined ? undefined : (body.assignedGroupId === null ? null : String(body.assignedGroupId))
    const assignedUserId = body.assignedUserId === undefined ? undefined : (body.assignedUserId === null ? null : String(body.assignedUserId))

    const existing = await ticketService.getTicket(ticketId, companyId)
    if (!existing) return context.json(errorBody('not_found', 'Ticket not found'), 404)

    if (status === TICKET_STATUS.PENDING_PROCESS && existing.status === TICKET_STATUS.PENDING_ASSIGN) {
      const ticket = await ticketService.updateTicket({ ticketId, companyId, userId: currentUserId(context), status, assignedGroupId, assignedUserId })
      return context.json(ticket)
    }
    if (status === TICKET_STATUS.COMPLETED) {
      if (existing.status !== TICKET_STATUS.PENDING_PROCESS) return context.json(errorBody('conflict', 'Ticket must be in pending_process state to complete'), 409)
      const ticket = await ticketService.updateTicket({ ticketId, companyId, userId: currentUserId(context), status })
      return context.json(ticket)
    }
    if (status === TICKET_STATUS.CANCELLED) {
      const ticket = await ticketService.updateTicket({ ticketId, companyId, userId: currentUserId(context), status })
      return context.json(ticket)
    }
    return context.json(errorBody('bad_request', 'Invalid status transition'), 400)
  })

  // Tickets — transfer
  app.post('/api/tickets/:id/transfer', async (context) => {
    const companyId = requireCompanyContext(context)
    if (!companyId) return context.json(errorBody('forbidden', 'Company context required'), 403)
    const ticketId = context.req.param('id')
    const body = await context.req.json().catch(() => ({}))
    const toGroupId = body.toGroupId === undefined ? null : (body.toGroupId === null ? null : String(body.toGroupId))
    const toUserId = body.toUserId === undefined ? null : (body.toUserId === null ? null : String(body.toUserId))

    const existing = await ticketService.getTicket(ticketId, companyId)
    if (!existing) return context.json(errorBody('not_found', 'Ticket not found'), 404)
    if (existing.status !== TICKET_STATUS.PENDING_PROCESS) return context.json(errorBody('conflict', 'Ticket is not in pending_process state'), 409)

    const ticket = await ticketService.transferTicket({ ticketId, companyId, userId: currentUserId(context), toGroupId, toUserId })
    return context.json(ticket)
  })

  // Tickets — replies
  app.post('/api/tickets/:id/replies', async (context) => {
    const companyId = requireCompanyContext(context)
    if (!companyId) return context.json(errorBody('forbidden', 'Company context required'), 403)
    const ticketId = context.req.param('id')
    const existing = await ticketService.getTicket(ticketId, companyId)
    if (!existing) return context.json(errorBody('not_found', 'Ticket not found'), 404)
    const body = await context.req.json().catch(() => ({}))
    let content: string
    try { content = requiredString(body.content, 'content', 10000) } catch (error) {
      return context.json(errorBody('bad_request', error instanceof Error ? error.message : 'content is required'), 400)
    }
    const reply = await ticketService.addReply({ ticketId, companyId, userId: currentUserId(context), content })
    return context.json(reply, 201)
  })

  app.get('/api/tickets/:id/replies', async (context) => {
    const companyId = requireCompanyContext(context)
    if (!companyId) return context.json(errorBody('forbidden', 'Company context required'), 403)
    const ticketId = context.req.param('id')
    const existing = await ticketService.getTicket(ticketId, companyId)
    if (!existing) return context.json(errorBody('not_found', 'Ticket not found'), 404)
    const replies = await ticketService.listReplies(ticketId, companyId)
    return context.json(replies)
  })

  // Tickets — submitter info
  app.get('/api/tickets/:id/submitter', async (context) => {
    const companyId = requireCompanyContext(context)
    if (!companyId) return context.json(errorBody('forbidden', 'Company context required'), 403)
    const ticketId = context.req.param('id')
    const info = await ticketService.getSubmitterInfo(ticketId, companyId)
    if (!info) return context.json(errorBody('not_found', 'Ticket not found'), 404)
    return context.json(info)
  })

  // Tickets — evaluation
  app.post('/api/tickets/:id/evaluation', async (context) => {
    const companyId = requireCompanyContext(context)
    if (!companyId) return context.json(errorBody('forbidden', 'Company context required'), 403)
    const ticketId = context.req.param('id')
    const body = await context.req.json().catch(() => ({}))
    const rating = Number(body.rating)
    if (!Number.isInteger(rating)) return context.json(errorBody('bad_request', 'rating must be an integer'), 400)

    const existing = await ticketService.getTicket(ticketId, companyId)
    if (!existing) return context.json(errorBody('not_found', 'Ticket not found'), 404)
    if (existing.status !== TICKET_STATUS.COMPLETED) return context.json(errorBody('conflict', 'Ticket must be completed to evaluate'), 409)
    if (await ticketService.hasEvaluation(ticketId, currentUserId(context))) return context.json(errorBody('conflict', 'Ticket already evaluated by this user'), 409)

    const evaluation = await ticketService.addEvaluation({ ticketId, companyId, userId: currentUserId(context), rating })
    return context.json(evaluation, 201)
  })

  // Statistics
  app.get('/api/statistics/distribution', async (context) => {
    const companyId = requireCompanyContext(context)
    if (!companyId) return context.json(errorBody('forbidden', 'Company context required'), 403)
    const dimension = context.req.query('dimension') === 'department' ? 'department' : 'company'
    const result = await statisticsService.getDistribution(companyId, dimension)
    return context.json(result)
  })

  app.get('/api/statistics/dashboard', async (context) => {
    const companyId = requireCompanyContext(context)
    if (!companyId) return context.json(errorBody('forbidden', 'Company context required'), 403)
    const result = await statisticsService.getDashboard(companyId)
    return context.json(result)
  })

  // Audit logs
  app.get('/api/audit-logs', async (context) => {
    const companyId = requireCompanyContext(context)
    if (!companyId) return context.json(errorBody('forbidden', 'Company context required'), 403)
    const ticketId = context.req.query('ticketId') || null
    const eventType = context.req.query('eventType') || null
    const page = Math.max(Number(context.req.query('page') ?? 1) || 1, 1)
    const pageSize = Math.min(Math.max(Number(context.req.query('pageSize') ?? 20) || 20, 1), 100)
    const offset = (page - 1) * pageSize

    const conditions: string[] = ["json_extract(metadata_json, '$.companyId') = ?"]
    const values: unknown[] = [companyId]
    if (eventType) { conditions.push('event_type = ?'); values.push(eventType) }
    if (ticketId) { conditions.push("json_extract(metadata_json, '$.ticketId') = ?"); values.push(ticketId) }
    const where = conditions.join(' AND ')

    const countRow = await platform.db.queryOne<{ total: number }>({
      text: `SELECT COUNT(*) AS total FROM audit_events WHERE ${where}`,
      params: values,
    })
    const rows = await platform.db.queryAll<{
      id: string; occurred_at: string; event_type: string; actor_user_id: string | null;
      actor_name: string | null; metadata_json: string
    }>({
      text: `SELECT ae.id, ae.occurred_at, ae.event_type, ae.actor_user_id, ae.metadata_json,
               COALESCE(up.full_name, u.name) AS actor_name
             FROM audit_events ae
             LEFT JOIN users u ON u.id = ae.actor_user_id
             LEFT JOIN user_profiles up ON up.user_id = ae.actor_user_id
             WHERE ${where}
             ORDER BY ae.occurred_at DESC, ae.id DESC
             LIMIT ? OFFSET ?`,
      params: [...values, pageSize, offset],
    })

    return context.json({
      items: rows.map((r) => {
        const metadata = JSON.parse(r.metadata_json ?? '{}')
        return {
          id: r.id,
          eventType: r.event_type,
          actorId: r.actor_user_id,
          actorName: r.actor_name,
          targetType: metadata.targetType ?? 'ticket',
          targetId: metadata.ticketId ?? metadata.targetId ?? '',
          metadata,
          createdAt: new Date(r.occurred_at).getTime(),
        }
      }),
      total: Number(countRow?.total ?? 0),
      page,
      pageSize,
    })
  })
}
