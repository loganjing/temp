import { randomUUID } from 'node:crypto'
import type { Hono, MiddlewareHandler, Context } from 'hono'
import type { initializePlatform } from './platform/bootstrap'
import type { AuthUser } from '@commonapp/userkit'
import { createPermissionService, type PermissionService } from './platform/permissions'
import { createAuditService, type AuditService } from './platform/audit'
import { createEmailService } from './platform/email'
import { createTicketService, ServiceError, type TicketService, type ServiceUser } from './services/ticket-service'
import { VALID_PRIORITIES } from '../shared/enums'
import type { RoleKey } from '../shared/enums'

type Platform = Awaited<ReturnType<typeof initializePlatform>>
const errorBody = (code: string, message: string) => ({ error: { code, message } })
const currentUserId = (context: unknown) => ((context as { get(name: string): unknown }).get('currentUser') as AuthUser).id
const getCurrentUser = (context: unknown): AuthUser => ((context as { get(name: string): unknown }).get('currentUser') as AuthUser)
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

type TicketPlatform = {
  permissions: PermissionService
  audit: AuditService
  email: ReturnType<typeof createEmailService>
  tickets: TicketService
}

let _tp: TicketPlatform | null = null
function initTicketPlatform(platform: Platform): TicketPlatform {
  if (_tp) return _tp
  const permissions = createPermissionService(platform.db)
  const audit = createAuditService(platform.db)
  const email = createEmailService()
  const tickets = createTicketService(platform.db, audit, email)
  _tp = { permissions, audit, email, tickets }
  return _tp
}

function toServiceUser(user: AuthUser): ServiceUser {
  return { id: user.id, companyId: user.companyId }
}

async function getUserRoles(tp: TicketPlatform, userId: string): Promise<string[]> {
  return tp.permissions.getRoles(userId)
}

function resolveRole(roles: string[]): string {
  if (roles.includes('admin')) return 'admin'
  if (roles.includes('handler')) return 'handler'
  if (roles.includes('submitter')) return 'submitter'
  return 'user'
}

function parsePage(query: Record<string, string | undefined>): { page: number; pageSize: number } {
  const page = Math.max(Number(query.page ?? 1) || 1, 1)
  const pageSize = Math.min(Math.max(Number(query.pageSize ?? 20) || 20, 1), 100)
  return { page, pageSize }
}

function companyScope(user: AuthUser, roles: string[], requestedCompanyId?: string): string | null {
  if (roles.includes('admin') && requestedCompanyId) return requestedCompanyId
  return user.companyId
}

function serviceErrorResponse(context: Context, error: unknown) {
  if (error instanceof ServiceError) {
    return context.json(errorBody(error.code, error.message), error.status)
  }
  console.error('[ticket] unhandled service error', error)
  return context.json(errorBody('INTERNAL_ERROR', 'Internal server error'), 500)
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
    const companyId = randomUUID()
    const tp = initTicketPlatform(platform)
    try {
      await platform.db.transaction(async (tx) => {
        const count = await tx.queryOne<{ total: number }>({ text: 'SELECT COUNT(*) AS total FROM users' })
        if (Number(count?.total ?? 0) !== 0) throw new Error('BOOTSTRAP_CLOSED')
        const timestamp = new Date().toISOString()
        await tx.run({ text: 'INSERT INTO companies (id, name, created_at) VALUES (?, ?, ?)', params: [companyId, `${name}的工单系统`, timestamp] })
        await tx.run({
          text: 'INSERT INTO users (id, name, email, phone, enabled, company_id, department, password_hash, password_change_required, created_at, updated_at) VALUES (?, ?, ?, NULL, 1, ?, NULL, ?, 0, ?, ?)',
          params: [id, name, email, companyId, passwordHash, timestamp, timestamp],
        })
      })
      await tp.permissions.assignRole(id, 'admin' as RoleKey)
      await tp.permissions.assignRole(id, 'submitter' as RoleKey)
      await tp.permissions.assignRole(id, 'handler' as RoleKey)
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
  const tp = initTicketPlatform(platform)

  // ── 认证 ──
  app.get('/api/auth/me', async (context) => {
    const user = getCurrentUser(context)
    const roles = await getUserRoles(tp, user.id)
    const userRow = await platform.db.queryOne<{ department: string | null }>({
      text: 'SELECT department FROM users WHERE id = ?',
      params: [user.id],
    })
    return context.json({
      id: user.id,
      name: user.name,
      email: user.email,
      companyId: user.companyId,
      department: userRow?.department ?? null,
      role: resolveRole(roles),
    })
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

  // ── 用户管理 ──
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
      const user = await platform.auth.userStore.create({
        name, email,
        phone: typeof body.phone === 'string' ? body.phone : null,
        companyId: typeof body.companyId === 'string' ? body.companyId : null,
        passwordChangeRequired: true,
      }, platform.auth.hashPassword(password))
      if (typeof body.department === 'string') {
        await platform.db.run({ text: 'UPDATE users SET department = ? WHERE id = ?', params: [body.department, user.id] })
      }
      if (Array.isArray(body.roles)) {
        for (const role of body.roles) {
          if (['submitter', 'handler', 'admin'].includes(role)) {
            await tp.permissions.assignRole(user.id, role as RoleKey)
          }
        }
      }
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
        companyId: typeof body.companyId === 'string' ? body.companyId : undefined,
      })
      if (!user) return context.json(errorBody('NOT_FOUND', 'User not found'), 404)
      if (typeof body.department === 'string') {
        await platform.db.run({ text: 'UPDATE users SET department = ? WHERE id = ?', params: [body.department, user.id] })
      }
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

  // ── 工单管理 ──
  app.post('/api/tickets', async (context) => {
    const user = getCurrentUser(context)
    const roles = await getUserRoles(tp, user.id)
    if (!roles.includes('submitter') && !roles.includes('admin')) {
      return context.json(errorBody('FORBIDDEN', 'Submitter role required'), 403)
    }
    const body = await context.req.json().catch(() => ({}))
    try {
      const subject = requiredString(body.subject, 'subject', 500)
      const description = requiredString(body.description, 'description', 10000)
      const category = requiredString(body.category, 'category', 100)
      const priority = requiredString(body.priority, 'priority', 10)
      if (!VALID_PRIORITIES.includes(priority)) throw new TypeError('priority must be one of P0-P4')
      const ticket = await tp.tickets.createTicket(toServiceUser(user), { subject, description, category, priority })
      return context.json(ticket, 201)
    } catch (error) {
      return serviceErrorResponse(context, error)
    }
  })

  app.get('/api/tickets', async (context) => {
    const user = getCurrentUser(context)
    const roles = await getUserRoles(tp, user.id)
    const { page, pageSize } = parsePage(context.req.query())
    const companyId = companyScope(user, roles, context.req.query('companyId') ?? undefined)
    const result = await tp.tickets.listTickets(companyId, {
      status: context.req.query('status') ?? undefined,
      priority: context.req.query('priority') ?? undefined,
      category: context.req.query('category') ?? undefined,
      page, pageSize,
    })
    return context.json(result)
  })

  app.get('/api/tickets/:id', async (context) => {
    const user = getCurrentUser(context)
    const roles = await getUserRoles(tp, user.id)
    const companyId = companyScope(user, roles)
    const ticket = await tp.tickets.getTicketDetail(companyId, context.req.param('id'))
    if (!ticket) return context.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    return context.json(ticket)
  })

  app.patch('/api/tickets/:id', async (context) => {
    const user = getCurrentUser(context)
    const roles = await getUserRoles(tp, user.id)
    if (!roles.includes('submitter') && !roles.includes('handler') && !roles.includes('admin')) {
      return context.json(errorBody('FORBIDDEN', 'Insufficient role'), 403)
    }
    const body = await context.req.json().catch(() => ({}))
    if (body.status !== 'cancelled') return context.json(errorBody('INVALID_INPUT', 'Only status=cancelled is supported'), 400)
    try {
      const ticket = await tp.tickets.cancelTicket(toServiceUser(user), context.req.param('id'))
      if (!ticket) return context.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
      return context.json(ticket)
    } catch (error) {
      return serviceErrorResponse(context, error)
    }
  })

  app.post('/api/tickets/:id/replies', async (context) => {
    const user = getCurrentUser(context)
    const roles = await getUserRoles(tp, user.id)
    if (!roles.includes('submitter') && !roles.includes('handler') && !roles.includes('admin')) {
      return context.json(errorBody('FORBIDDEN', 'Insufficient role'), 403)
    }
    const body = await context.req.json().catch(() => ({}))
    try {
      const content = requiredString(body.content, 'content', 10000)
      const reply = await tp.tickets.addReply(toServiceUser(user), user.name, context.req.param('id'), content)
      if (!reply) return context.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
      return context.json(reply, 201)
    } catch (error) {
      return serviceErrorResponse(context, error)
    }
  })

  // ── 工单分配 ──
  app.post('/api/business-groups', async (context) => {
    const user = getCurrentUser(context)
    const roles = await getUserRoles(tp, user.id)
    if (!roles.includes('admin')) return context.json(errorBody('FORBIDDEN', 'Admin role required'), 403)
    if (!user.companyId) return context.json(errorBody('NO_COMPANY', 'User has no company'), 400)
    const body = await context.req.json().catch(() => ({}))
    try {
      const name = requiredString(body.name, 'name', 200)
      const group = await tp.tickets.createBusinessGroup(user.companyId, name)
      return context.json(group, 201)
    } catch (error) {
      return serviceErrorResponse(context, error)
    }
  })

  app.get('/api/business-groups', async (context) => {
    const user = getCurrentUser(context)
    if (!user.companyId) return context.json({ items: [] })
    const result = await tp.tickets.listBusinessGroups(user.companyId)
    return context.json(result)
  })

  app.put('/api/business-groups/:id/members', async (context) => {
    const user = getCurrentUser(context)
    const roles = await getUserRoles(tp, user.id)
    if (!roles.includes('admin')) return context.json(errorBody('FORBIDDEN', 'Admin role required'), 403)
    if (!user.companyId) return context.json(errorBody('NO_COMPANY', 'User has no company'), 400)
    const body = await context.req.json().catch(() => ({}))
    if (!Array.isArray(body.memberIds)) return context.json(errorBody('INVALID_INPUT', 'memberIds must be an array'), 400)
    const group = await tp.tickets.setBusinessGroupMembers(user.companyId, context.req.param('id'), body.memberIds as string[])
    if (!group) return context.json(errorBody('NOT_FOUND', 'Business group not found'), 404)
    return context.json(group)
  })

  app.post('/api/assignment-rules', async (context) => {
    const user = getCurrentUser(context)
    const roles = await getUserRoles(tp, user.id)
    if (!roles.includes('admin')) return context.json(errorBody('FORBIDDEN', 'Admin role required'), 403)
    if (!user.companyId) return context.json(errorBody('NO_COMPANY', 'User has no company'), 400)
    const body = await context.req.json().catch(() => ({}))
    try {
      const category = requiredString(body.category, 'category', 100)
      const businessGroupId = requiredString(body.businessGroupId, 'businessGroupId')
      const rule = await tp.tickets.createAssignmentRule(user.companyId, category, businessGroupId)
      if (!rule) return context.json(errorBody('NOT_FOUND', 'Business group not found'), 404)
      return context.json(rule, 201)
    } catch (error) {
      return serviceErrorResponse(context, error)
    }
  })

  app.get('/api/assignment-rules', async (context) => {
    const user = getCurrentUser(context)
    if (!user.companyId) return context.json({ items: [] })
    const result = await tp.tickets.listAssignmentRules(user.companyId)
    return context.json(result)
  })

  // ── 工单协作 ──
  app.post('/api/tickets/:id/transfer', async (context) => {
    const user = getCurrentUser(context)
    const roles = await getUserRoles(tp, user.id)
    if (!roles.includes('handler') && !roles.includes('admin')) {
      return context.json(errorBody('FORBIDDEN', 'Handler role required'), 403)
    }
    const body = await context.req.json().catch(() => ({}))
    try {
      const toHandlerId = requiredString(body.toHandlerId, 'toHandlerId')
      const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
      const ticket = await tp.tickets.transferTicket(toServiceUser(user), context.req.param('id'), toHandlerId, reason)
      if (!ticket) return context.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
      return context.json(ticket)
    } catch (error) {
      return serviceErrorResponse(context, error)
    }
  })

  // ── 工单处理 ──
  app.get('/api/tickets/:id/submitter', async (context) => {
    const user = getCurrentUser(context)
    const roles = await getUserRoles(tp, user.id)
    if (!roles.includes('handler') && !roles.includes('admin')) {
      return context.json(errorBody('FORBIDDEN', 'Handler role required'), 403)
    }
    const companyId = companyScope(user, roles)
    const info = await tp.tickets.getSubmitterInfo(companyId, context.req.param('id'))
    if (!info) return context.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    return context.json(info)
  })

  app.post('/api/tickets/:id/complete', async (context) => {
    const user = getCurrentUser(context)
    const roles = await getUserRoles(tp, user.id)
    if (!roles.includes('handler') && !roles.includes('admin')) {
      return context.json(errorBody('FORBIDDEN', 'Handler role required'), 403)
    }
    const body = await context.req.json().catch(() => ({}))
    try {
      const resolution = requiredString(body.resolution, 'resolution', 10000)
      const ticket = await tp.tickets.completeTicket(toServiceUser(user), context.req.param('id'), resolution)
      if (!ticket) return context.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
      return context.json(ticket)
    } catch (error) {
      return serviceErrorResponse(context, error)
    }
  })

  // ── 用户评价 ──
  app.post('/api/tickets/:id/evaluation', async (context) => {
    const user = getCurrentUser(context)
    const roles = await getUserRoles(tp, user.id)
    if (!roles.includes('submitter') && !roles.includes('admin')) {
      return context.json(errorBody('FORBIDDEN', 'Submitter role required'), 403)
    }
    const body = await context.req.json().catch(() => ({}))
    try {
      const rating = Number(body.rating)
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new TypeError('rating must be an integer 1-5')
      const comment = typeof body.comment === 'string' && body.comment.trim() ? body.comment.trim() : null
      const evaluation = await tp.tickets.createEvaluation(toServiceUser(user), context.req.param('id'), rating, comment)
      return context.json(evaluation, 201)
    } catch (error) {
      return serviceErrorResponse(context, error)
    }
  })

  app.get('/api/tickets/:id/evaluation', async (context) => {
    const user = getCurrentUser(context)
    const roles = await getUserRoles(tp, user.id)
    const companyId = companyScope(user, roles)
    const evaluation = await tp.tickets.getEvaluation(companyId, context.req.param('id'))
    if (!evaluation) return context.json(errorBody('NOT_FOUND', 'Evaluation not found'), 404)
    return context.json(evaluation)
  })

  // ── 统计分析 ──
  app.get('/api/statistics/distribution', async (context) => {
    const user = getCurrentUser(context)
    const roles = await getUserRoles(tp, user.id)
    const dimension = context.req.query('dimension')
    if (dimension !== 'company' && dimension !== 'department') {
      return context.json(errorBody('INVALID_INPUT', 'dimension must be "company" or "department"'), 400)
    }
    const companyId = companyScope(user, roles, context.req.query('companyId') ?? undefined)
    try {
      const result = await tp.tickets.getDistribution(companyId, dimension)
      return context.json(result)
    } catch (error) {
      return serviceErrorResponse(context, error)
    }
  })

  app.get('/api/statistics/dashboard', async (context) => {
    const user = getCurrentUser(context)
    const roles = await getUserRoles(tp, user.id)
    if (!roles.includes('admin')) return context.json(errorBody('FORBIDDEN', 'Admin role required'), 403)
    const companyId = companyScope(user, roles, context.req.query('companyId') ?? undefined)
    const result = await tp.tickets.getDashboard(companyId)
    return context.json(result)
  })

  // ── 工单工作台 ──
  app.get('/api/workbench/tickets', async (context) => {
    const user = getCurrentUser(context)
    const roles = await getUserRoles(tp, user.id)
    const { page, pageSize } = parsePage(context.req.query())
    const companyId = companyScope(user, roles, context.req.query('companyId') ?? undefined)
    const result = await tp.tickets.getWorkbenchTickets(companyId, {
      search: context.req.query('search') ?? undefined,
      priority: context.req.query('priority') ?? undefined,
      category: context.req.query('category') ?? undefined,
      sort: context.req.query('sort') ?? 'created_desc',
      page, pageSize,
    })
    return context.json(result)
  })

  // ── 操作日志 ──
  app.get('/api/tickets/:id/logs', async (context) => {
    const user = getCurrentUser(context)
    const roles = await getUserRoles(tp, user.id)
    const companyId = companyScope(user, roles)
    const result = await tp.tickets.getTicketLogs(companyId, context.req.param('id'))
    if (!result) return context.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    return context.json(result)
  })
}
