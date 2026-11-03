import { randomUUID } from 'node:crypto'
import type { Hono, MiddlewareHandler } from 'hono'
import type { initializePlatform } from './platform/bootstrap'
import type { AuthUser } from '@commonapp/userkit'
import { createTicketService } from './services/ticket-service'
import { createOrganizationRepository } from './repositories/organization-repository'
import { PERMISSION_KEYS, TICKET_PRIORITIES, TICKET_STATUSES } from '../shared/constants'

type Platform = Awaited<ReturnType<typeof initializePlatform>>
const errorBody = (code: string, message: string) => ({ error: { code, message } })
const getCurrentUser = (context: unknown) => (context as { get(name: string): unknown }).get('currentUser') as AuthUser
const currentUserId = (context: unknown) => getCurrentUser(context).id
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

async function checkPermission(platform: Platform, userId: string, permissionKey: string): Promise<boolean> {
  try {
    await platform.permissionKit.requirePermission(userId, permissionKey)
    return true
  } catch {
    return false
  }
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
  const service = createTicketService({ db: platform.db, auditKit: platform.auditKit, email: platform.email, userStore: platform.auth.userStore })
  const org = service.org

  // ── Auth ──
  app.get('/api/auth/me', async (context) => {
    const user = getCurrentUser(context)
    const department = await org.findUserDepartment(user.id)
    return context.json({ ...user, department: department ? { id: department.id, name: department.name } : null })
  })
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

  // ── Admin users (existing) ──
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

  // ── Tickets ──
  app.get('/api/tickets', async (context) => {
    const user = getCurrentUser(context)
    if (!await checkPermission(platform, user.id, PERMISSION_KEYS.TICKET_READ)) return context.json(errorBody('FORBIDDEN', 'Permission denied'), 403)
    const companyId = user.companyId
    const result = await service.listTickets({
      companyId: companyId ?? undefined,
      status: context.req.query('status'),
      priority: context.req.query('priority'),
      category: context.req.query('category'),
      search: context.req.query('search'),
      sort: context.req.query('sort'),
      page: Number(context.req.query('page') ?? 1),
      pageSize: Number(context.req.query('pageSize') ?? 20),
    })
    return context.json(result)
  })

  app.post('/api/tickets', async (context) => {
    const user = getCurrentUser(context)
    if (!await checkPermission(platform, user.id, PERMISSION_KEYS.TICKET_CREATE)) return context.json(errorBody('FORBIDDEN', 'Permission denied'), 403)
    if (!user.companyId) return context.json(errorBody('NO_COMPANY', 'User has no company'), 400)
    const body = await context.req.json().catch(() => ({}))
    try {
      const subject = requiredString(body.subject, 'subject')
      const category = requiredString(body.category, 'category')
      const priority = String(body.priority ?? '')
      if (!TICKET_PRIORITIES.includes(priority as never)) throw new TypeError('priority must be one of P0-P4')
      const description = typeof body.description === 'string' ? body.description.trim() : null
      const ticket = await service.createTicket({ subject, description, category, priority: priority as never }, user.id, user.companyId)
      return context.json(ticket, 201)
    } catch (error) {
      return context.json(errorBody('INVALID_INPUT', error instanceof Error ? error.message : 'Invalid input'), 400)
    }
  })

  app.get('/api/tickets/:id', async (context) => {
    const user = getCurrentUser(context)
    if (!await checkPermission(platform, user.id, PERMISSION_KEYS.TICKET_READ)) return context.json(errorBody('FORBIDDEN', 'Permission denied'), 403)
    const detail = await service.getTicketDetail(context.req.param('id'))
    if (!detail) return context.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    if (detail.companyId !== user.companyId) return context.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    return context.json(detail)
  })

  app.post('/api/tickets/:id/replies', async (context) => {
    const user = getCurrentUser(context)
    if (!await checkPermission(platform, user.id, PERMISSION_KEYS.TICKET_REPLY)) return context.json(errorBody('FORBIDDEN', 'Permission denied'), 403)
    const body = await context.req.json().catch(() => ({}))
    try {
      const content = requiredString(body.content, 'content', 5000)
      const reply = await service.addReply(context.req.param('id'), user.id, content)
      if (!reply) return context.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
      return context.json(reply, 201)
    } catch (error) {
      return context.json(errorBody('INVALID_INPUT', error instanceof Error ? error.message : 'Invalid input'), 400)
    }
  })

  app.post('/api/tickets/:id/transfer', async (context) => {
    const user = getCurrentUser(context)
    if (!await checkPermission(platform, user.id, PERMISSION_KEYS.TICKET_TRANSFER)) return context.json(errorBody('FORBIDDEN', 'Permission denied'), 403)
    const body = await context.req.json().catch(() => ({}))
    const result = await service.transferTicket(context.req.param('id'), user.id, {
      targetUserId: typeof body.targetUserId === 'string' ? body.targetUserId : undefined,
      targetGroupId: typeof body.targetGroupId === 'string' ? body.targetGroupId : undefined,
    })
    if (!result) return context.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    if ('error' in result) {
      if (result.error === 'missing_target') return context.json(errorBody('MISSING_TARGET', 'At least one of targetUserId or targetGroupId is required'), 400)
      return context.json(errorBody('INVALID_STATUS', 'Ticket is not in pending_processing status'), 409)
    }
    return context.json(result)
  })

  app.post('/api/tickets/:id/complete', async (context) => {
    const user = getCurrentUser(context)
    if (!await checkPermission(platform, user.id, PERMISSION_KEYS.TICKET_COMPLETE)) return context.json(errorBody('FORBIDDEN', 'Permission denied'), 403)
    const result = await service.completeTicket(context.req.param('id'), user.id)
    if (!result) return context.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    if ('error' in result) return context.json(errorBody('INVALID_STATUS', 'Ticket is not in pending_processing status'), 409)
    return context.json(result)
  })

  app.post('/api/tickets/:id/cancel', async (context) => {
    const user = getCurrentUser(context)
    if (!await checkPermission(platform, user.id, PERMISSION_KEYS.TICKET_CANCEL)) return context.json(errorBody('FORBIDDEN', 'Permission denied'), 403)
    const result = await service.cancelTicket(context.req.param('id'), user.id)
    if (!result) return context.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    if ('error' in result) return context.json(errorBody('INVALID_STATUS', 'Ticket is already completed or cancelled'), 409)
    return context.json(result)
  })

  app.post('/api/tickets/:id/evaluation', async (context) => {
    const user = getCurrentUser(context)
    if (!await checkPermission(platform, user.id, PERMISSION_KEYS.TICKET_EVALUATE)) return context.json(errorBody('FORBIDDEN', 'Permission denied'), 403)
    const body = await context.req.json().catch(() => ({}))
    const rating = Number(body.rating)
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return context.json(errorBody('INVALID_INPUT', 'rating must be an integer between 1 and 5'), 400)
    const result = await service.evaluateTicket(context.req.param('id'), user.id, { rating, comment: typeof body.comment === 'string' ? body.comment.trim() : undefined })
    if (!result) return context.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    if ('error' in result) {
      if (result.error === 'already_evaluated') return context.json(errorBody('ALREADY_EVALUATED', 'Ticket has already been evaluated'), 409)
      return context.json(errorBody('INVALID_STATUS', 'Ticket must be completed before evaluation'), 409)
    }
    return context.json(result, 201)
  })

  app.get('/api/tickets/:id/logs', async (context) => {
    const user = getCurrentUser(context)
    if (!await checkPermission(platform, user.id, PERMISSION_KEYS.TICKET_READ)) return context.json(errorBody('FORBIDDEN', 'Permission denied'), 403)
    const logs = await service.getTicketLogs(context.req.param('id'))
    if (!logs) return context.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    return context.json(logs)
  })

  // ── Workbench ──
  app.get('/api/workbench/tickets', async (context) => {
    const user = getCurrentUser(context)
    if (!await checkPermission(platform, user.id, PERMISSION_KEYS.TICKET_READ)) return context.json(errorBody('FORBIDDEN', 'Permission denied'), 403)
    const result = await service.listWorkbenchTickets({
      companyId: user.companyId ?? undefined,
      status: context.req.query('status') ?? 'pending_processing',
      priority: context.req.query('priority'),
      category: context.req.query('category'),
      search: context.req.query('search'),
      sort: context.req.query('sort'),
      page: Number(context.req.query('page') ?? 1),
      pageSize: Number(context.req.query('pageSize') ?? 20),
      userId: user.id,
    })
    return context.json(result)
  })

  // ── Companies & Departments ──
  app.get('/api/companies', async (context) => {
    const companies = await org.listCompanies()
    return context.json({ items: companies })
  })
  app.post('/api/companies', async (context) => {
    const user = getCurrentUser(context)
    if (!await checkPermission(platform, user.id, PERMISSION_KEYS.USER_MANAGE)) return context.json(errorBody('FORBIDDEN', 'Permission denied'), 403)
    const body = await context.req.json().catch(() => ({}))
    try {
      const name = requiredString(body.name, 'name')
      const company = await org.createCompany(name)
      return context.json(company, 201)
    } catch (error) {
      return context.json(errorBody('INVALID_INPUT', error instanceof Error ? error.message : 'Invalid input'), 400)
    }
  })
  app.get('/api/companies/:companyId/departments', async (context) => {
    const departments = await org.listDepartments(context.req.param('companyId'))
    return context.json({ items: departments })
  })
  app.post('/api/companies/:companyId/departments', async (context) => {
    const user = getCurrentUser(context)
    if (!await checkPermission(platform, user.id, PERMISSION_KEYS.USER_MANAGE)) return context.json(errorBody('FORBIDDEN', 'Permission denied'), 403)
    const body = await context.req.json().catch(() => ({}))
    try {
      const name = requiredString(body.name, 'name')
      const department = await org.createDepartment(context.req.param('companyId'), name)
      return context.json(department, 201)
    } catch (error) {
      return context.json(errorBody('INVALID_INPUT', error instanceof Error ? error.message : 'Invalid input'), 400)
    }
  })

  // ── Business Groups ──
  app.get('/api/companies/:companyId/business-groups', async (context) => {
    const groups = await org.listBusinessGroups(context.req.param('companyId'))
    return context.json({ items: groups })
  })
  app.post('/api/companies/:companyId/business-groups', async (context) => {
    const user = getCurrentUser(context)
    if (!await checkPermission(platform, user.id, PERMISSION_KEYS.BUSINESS_GROUP_MANAGE)) return context.json(errorBody('FORBIDDEN', 'Permission denied'), 403)
    const body = await context.req.json().catch(() => ({}))
    try {
      const name = requiredString(body.name, 'name')
      const group = await org.createBusinessGroup(context.req.param('companyId'), name)
      return context.json(group, 201)
    } catch (error) {
      return context.json(errorBody('INVALID_INPUT', error instanceof Error ? error.message : 'Invalid input'), 400)
    }
  })
  app.post('/api/business-groups/:groupId/members', async (context) => {
    const user = getCurrentUser(context)
    if (!await checkPermission(platform, user.id, PERMISSION_KEYS.BUSINESS_GROUP_MANAGE)) return context.json(errorBody('FORBIDDEN', 'Permission denied'), 403)
    const groupId = context.req.param('groupId')
    const group = await org.findBusinessGroupById(groupId)
    if (!group) return context.json(errorBody('GROUP_NOT_FOUND', 'Business group not found'), 404)
    const body = await context.req.json().catch(() => ({}))
    const userId = typeof body.userId === 'string' ? body.userId.trim() : ''
    if (!userId) return context.json(errorBody('INVALID_INPUT', 'userId is required'), 400)
    if (await org.isGroupMember(groupId, userId)) return context.json(errorBody('ALREADY_MEMBER', 'User is already a member'), 409)
    await org.addGroupMember(groupId, userId)
    return context.json({ groupId, userId }, 201)
  })
  app.delete('/api/business-groups/:groupId/members/:userId', async (context) => {
    const user = getCurrentUser(context)
    if (!await checkPermission(platform, user.id, PERMISSION_KEYS.BUSINESS_GROUP_MANAGE)) return context.json(errorBody('FORBIDDEN', 'Permission denied'), 403)
    const groupId = context.req.param('groupId')
    const userId = context.req.param('userId')
    await org.removeGroupMember(groupId, userId)
    return context.json({ groupId, userId })
  })

  // ── Routing Rules ──
  app.get('/api/companies/:companyId/routing-rules', async (context) => {
    const rules = await org.listRoutingRules(context.req.param('companyId'))
    return context.json({ items: rules })
  })
  app.post('/api/companies/:companyId/routing-rules', async (context) => {
    const user = getCurrentUser(context)
    if (!await checkPermission(platform, user.id, PERMISSION_KEYS.ROUTING_RULE_MANAGE)) return context.json(errorBody('FORBIDDEN', 'Permission denied'), 403)
    const companyId = context.req.param('companyId')
    const body = await context.req.json().catch(() => ({}))
    try {
      const category = requiredString(body.category, 'category')
      const businessGroupId = requiredString(body.businessGroupId, 'businessGroupId')
      const existing = await org.findRoutingRule(companyId, category)
      if (existing) return context.json(errorBody('DUPLICATE_RULE', 'A routing rule for this category already exists'), 409)
      const rule = await org.createRoutingRule(companyId, category, businessGroupId)
      return context.json(rule, 201)
    } catch (error) {
      return context.json(errorBody('INVALID_INPUT', error instanceof Error ? error.message : 'Invalid input'), 400)
    }
  })

  // ── Users ──
  app.get('/api/users', async (context) => {
    const user = getCurrentUser(context)
    if (!await checkPermission(platform, user.id, PERMISSION_KEYS.USER_MANAGE)) return context.json(errorBody('FORBIDDEN', 'Permission denied'), 403)
    const result = await org.listUsers({
      companyId: context.req.query('companyId') ?? user.companyId ?? undefined,
      search: context.req.query('search'),
      page: Number(context.req.query('page') ?? 1),
      pageSize: Number(context.req.query('pageSize') ?? 20),
    })
    return context.json(result)
  })
  app.post('/api/users', async (context) => {
    const user = getCurrentUser(context)
    if (!await checkPermission(platform, user.id, PERMISSION_KEYS.USER_MANAGE)) return context.json(errorBody('FORBIDDEN', 'Permission denied'), 403)
    const body = await context.req.json().catch(() => ({}))
    try {
      const name = requiredString(body.name, 'name')
      const email = requiredString(body.email, 'email', 320).toLowerCase()
      const password = requiredString(body.password, 'password', 256)
      if (!email.includes('@') || password.length < 12) throw new TypeError('Enter a valid email and a password with at least 12 characters')
      const created = await org.createUserWithDepartment({
        name, email,
        phone: typeof body.phone === 'string' ? body.phone : null,
        password,
        companyId: typeof body.companyId === 'string' ? body.companyId : null,
        departmentId: typeof body.departmentId === 'string' ? body.departmentId : undefined,
        passwordHash: platform.auth.hashPassword(password),
      })
      return context.json(created, 201)
    } catch (error) {
      return context.json(errorBody('INVALID_USER', userMutationError(error, 'Could not create user')), error instanceof TypeError ? 400 : 409)
    }
  })

  // ── Stats ──
  app.get('/api/stats/distribution', async (context) => {
    const user = getCurrentUser(context)
    if (!await checkPermission(platform, user.id, PERMISSION_KEYS.STATS_READ)) return context.json(errorBody('FORBIDDEN', 'Permission denied'), 403)
    const dimension = context.req.query('dimension') === 'department' ? 'department' : 'company'
    const companyId = user.companyId
    if (dimension === 'company') {
      const items = await platform.db.queryAll<{ label: string; count: number }>({
        text: `SELECT c.name AS label, COUNT(t.id) AS count
               FROM companies c LEFT JOIN tickets t ON t.company_id = c.id
               WHERE c.id = ?
               GROUP BY c.id, c.name ORDER BY count DESC`,
        params: [companyId],
      })
      return context.json({ dimension, items })
    }
    const items = await platform.db.queryAll<{ label: string; count: number; companyId: string }>({
      text: `SELECT d.name AS label, COUNT(t.id) AS count, d.company_id AS companyId
             FROM departments d
             LEFT JOIN user_departments ud ON ud.department_id = d.id
             LEFT JOIN tickets t ON t.submitter_id = ud.user_id AND t.company_id = d.company_id
             WHERE d.company_id = ?
             GROUP BY d.id, d.name, d.company_id ORDER BY count DESC`,
      params: [companyId],
    })
    return context.json({ dimension, items })
  })

  app.get('/api/stats/dashboard', async (context) => {
    const user = getCurrentUser(context)
    if (!await checkPermission(platform, user.id, PERMISSION_KEYS.STATS_READ)) return context.json(errorBody('FORBIDDEN', 'Permission denied'), 403)
    const companyId = user.companyId
    const [totalRow, pendingRow, completedRow, cancelledRow, responseRow, satisfactionRow, hotRows] = await Promise.all([
      platform.db.queryOne<{ total: number }>({ text: 'SELECT COUNT(*) AS total FROM tickets WHERE company_id = ?', params: [companyId] }),
      platform.db.queryOne<{ total: number }>({ text: "SELECT COUNT(*) AS total FROM tickets WHERE company_id = ? AND status = 'pending_processing'", params: [companyId] }),
      platform.db.queryOne<{ total: number }>({ text: "SELECT COUNT(*) AS total FROM tickets WHERE company_id = ? AND status = 'completed'", params: [companyId] }),
      platform.db.queryOne<{ total: number }>({ text: "SELECT COUNT(*) AS total FROM tickets WHERE company_id = ? AND status = 'cancelled'", params: [companyId] }),
      platform.db.queryOne<{ avgMs: number | null }>({ text: "SELECT AVG((julianday(handled_at) - julianday(created_at)) * 86400000) AS avgMs FROM tickets WHERE company_id = ? AND status = 'completed' AND handled_at IS NOT NULL", params: [companyId] }),
      platform.db.queryOne<{ avgRating: number | null }>({
        text: `SELECT AVG(e.rating) AS avgRating FROM ticket_evaluations e
               JOIN tickets t ON e.ticket_id = t.id WHERE t.company_id = ?`,
        params: [companyId],
      }),
      platform.db.queryAll<{ category: string; count: number }>({
        text: 'SELECT category, COUNT(*) AS count FROM tickets WHERE company_id = ? GROUP BY category ORDER BY count DESC LIMIT 5',
        params: [companyId],
      }),
    ])
    return context.json({
      totalTickets: Number(totalRow?.total ?? 0),
      pendingCount: Number(pendingRow?.total ?? 0),
      completedCount: Number(completedRow?.total ?? 0),
      cancelledCount: Number(cancelledRow?.total ?? 0),
      avgResponseTimeMs: responseRow?.avgMs ?? null,
      avgSatisfaction: satisfactionRow?.avgRating ?? null,
      hotCategories: hotRows,
    })
  })
}
