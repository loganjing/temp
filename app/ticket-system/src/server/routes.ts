import { randomUUID } from 'node:crypto'
import type { Hono, MiddlewareHandler } from 'hono'
import type { initializePlatform } from './platform/bootstrap'
import type { AppAuthUser } from './platform/auth'
import type { AuthUser } from '@commonapp/userkit'
import type { UserRole } from '../shared/types'
import { createTicketService } from './services/ticket-service'
import { createAssignmentService } from './services/assignment-service'
import { createCollaborationService } from './services/collaboration-service'
import { createStatsService } from './services/stats-service'
import { BusinessError } from './services/context'

type Platform = Awaited<ReturnType<typeof initializePlatform>>
const errorBody = (code: string, message: string) => ({ error: { code, message } })
const getAppUser = (context: unknown): AppAuthUser => (context as { get(name: string): unknown }).get('currentUser') as AppAuthUser
const getCompanyId = (context: unknown): string => {
  const companyId = getAppUser(context).companyId
  if (!companyId) throw new BusinessError('FORBIDDEN', '当前用户未关联公司', 403)
  return companyId
}
const requireRole = (context: unknown, ...roles: UserRole[]): AppAuthUser => {
  const user = getAppUser(context)
  if (!roles.includes(user.role as UserRole)) throw new BusinessError('FORBIDDEN', '无权限执行此操作', 403)
  return user
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

function formatError(error: unknown) {
  if (error instanceof BusinessError) return { body: errorBody(error.code, error.message), status: error.status }
  if (error instanceof TypeError) return { body: errorBody('INVALID_INPUT', error.message), status: 400 }
  console.error('[routes] unhandled business error', error)
  return { body: errorBody('INTERNAL_ERROR', 'Internal server error'), status: 500 }
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
          text: 'INSERT INTO users (id, name, email, phone, enabled, company_id, password_hash, password_change_required, created_at, updated_at) VALUES (?, ?, ?, NULL, 1, NULL, ?, ?, ?)',
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
  // Service instances
  const ticketService = createTicketService({ db: platform.db, audit: platform.audit, email: platform.email })
  const assignmentService = createAssignmentService({ db: platform.db, audit: platform.audit, email: platform.email })
  const collaborationService = createCollaborationService({ db: platform.db, audit: platform.audit, email: platform.email })
  const statsService = createStatsService({ db: platform.db, audit: platform.audit, email: platform.email })

  // ── Auth context ──
  app.get('/api/auth/me', (context) => {
    const user = getAppUser(context)
    return context.json({
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        companyId: user.companyId ?? '',
        companyName: user.companyName,
        department: user.department,
        role: user.role as UserRole,
      },
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
    const userId = getAppUser(context).id
    if (!await platform.auth.userStore.updatePassword(userId, platform.auth.hashPassword(password))) return context.json(errorBody('NOT_FOUND', 'User not found'), 404)
    return context.json({ ok: true, passwordChangeRequired: false })
  })

  // ── Admin user management (existing) ──
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
  app.post('/api/tickets', async (context) => {
    try {
      const companyId = getCompanyId(context)
      const user = getAppUser(context)
      const body = await context.req.json().catch(() => ({}))
      const subject = requiredString(body.subject, 'subject', 500)
      const description = requiredString(body.description, 'description', 10000)
      const categoryId = requiredString(body.categoryId, 'categoryId')
      const priority = requiredString(body.priority, 'priority', 10)
      if (!['P0', 'P1', 'P2', 'P3', 'P4'].includes(priority)) throw new TypeError('priority must be P0-P4')
      // Validate category belongs to company
      const category = await platform.db.queryOne<{ company_id: string }>({ text: 'SELECT company_id FROM categories WHERE id = ?', params: [categoryId] })
      if (!category || category.company_id !== companyId) throw new BusinessError('NOT_FOUND', '分类不存在或不属于同公司', 404)
      const ticket = await ticketService.createTicket(companyId, user.id, { subject, description, categoryId, priority })
      return context.json({ data: ticket }, 201)
    } catch (error) {
      const { body, status } = formatError(error)
      return context.json(body, status as 400 | 403 | 404 | 500)
    }
  })

  app.get('/api/tickets', async (context) => {
    try {
      const companyId = getCompanyId(context)
      const user = getAppUser(context)
      const page = Math.max(Number(context.req.query('page') ?? 1), 1)
      const pageSize = Math.min(Math.max(Number(context.req.query('pageSize') ?? 20), 1), 100)
      const result = await ticketService.listTickets(companyId, user.id, user.role as UserRole, {
        status: context.req.query('status') || undefined,
        priority: context.req.query('priority') || undefined,
        categoryId: context.req.query('categoryId') || undefined,
        search: context.req.query('search') || undefined,
        sort: context.req.query('sort') || undefined,
        order: context.req.query('order') || undefined,
        page,
        pageSize,
      })
      return context.json(result)
    } catch (error) {
      const { body, status } = formatError(error)
      return context.json(body, status as 400 | 403 | 500)
    }
  })

  app.get('/api/tickets/:id', async (context) => {
    try {
      const companyId = getCompanyId(context)
      const detail = await ticketService.getTicketDetail(companyId, context.req.param('id'))
      return context.json({ data: detail })
    } catch (error) {
      const { body, status } = formatError(error)
      return context.json(body, status as 400 | 403 | 404 | 500)
    }
  })

  app.patch('/api/tickets/:id/status', async (context) => {
    try {
      const companyId = getCompanyId(context)
      const user = getAppUser(context)
      const body = await context.req.json().catch(() => ({}))
      const status = requiredString(body.status, 'status', 20)
      if (!['completed', 'cancelled'].includes(status)) throw new TypeError('status must be completed or cancelled')
      const ticket = await ticketService.updateStatus(companyId, context.req.param('id'), user.id, user.role as UserRole, status as 'completed' | 'cancelled')
      return context.json({ data: ticket })
    } catch (error) {
      const { body, status } = formatError(error)
      return context.json(body, status as 400 | 403 | 404 | 409 | 500)
    }
  })

  app.post('/api/tickets/:id/replies', async (context) => {
    try {
      const companyId = getCompanyId(context)
      const user = getAppUser(context)
      const body = await context.req.json().catch(() => ({}))
      const content = requiredString(body.content, 'content', 10000)
      const reply = await ticketService.addReply(companyId, context.req.param('id'), user.id, user.role as UserRole, content)
      return context.json({ data: reply }, 201)
    } catch (error) {
      const { body, status } = formatError(error)
      return context.json(body, status as 400 | 403 | 404 | 500)
    }
  })

  app.post('/api/tickets/:id/transfer', async (context) => {
    try {
      const companyId = getCompanyId(context)
      const user = getAppUser(context)
      const body = await context.req.json().catch(() => ({}))
      const toUserId = typeof body.toUserId === 'string' && body.toUserId.trim() ? body.toUserId.trim() : undefined
      const toGroupId = typeof body.toGroupId === 'string' && body.toGroupId.trim() ? body.toGroupId.trim() : undefined
      const ticket = await ticketService.transferTicket(companyId, context.req.param('id'), user.id, user.role as UserRole, { toUserId, toGroupId })
      return context.json({ data: ticket })
    } catch (error) {
      const { body, status } = formatError(error)
      return context.json(body, status as 400 | 403 | 404 | 409 | 500)
    }
  })

  app.post('/api/tickets/:id/evaluation', async (context) => {
    try {
      const companyId = getCompanyId(context)
      const user = getAppUser(context)
      const body = await context.req.json().catch(() => ({}))
      if (typeof body.rating !== 'number' || body.rating < 1 || body.rating > 5) throw new TypeError('rating must be an integer 1-5')
      const comment = typeof body.comment === 'string' ? body.comment.trim() || null : null
      const evaluation = await ticketService.addEvaluation(companyId, context.req.param('id'), user.id, body.rating, comment)
      return context.json({ data: evaluation }, 201)
    } catch (error) {
      const { body, status } = formatError(error)
      return context.json(body, status as 400 | 403 | 404 | 409 | 500)
    }
  })

  app.get('/api/tickets/:id/submitter-info', async (context) => {
    try {
      const companyId = getCompanyId(context)
      const user = getAppUser(context)
      const info = await ticketService.getSubmitterInfo(companyId, context.req.param('id'), user.id, user.role as UserRole)
      return context.json({ data: info })
    } catch (error) {
      const { body, status } = formatError(error)
      return context.json(body, status as 400 | 403 | 404 | 500)
    }
  })

  app.get('/api/tickets/:id/logs', async (context) => {
    try {
      const companyId = getCompanyId(context)
      const logs = await ticketService.getLogs(companyId, context.req.param('id'))
      return context.json({ data: logs })
    } catch (error) {
      const { body, status } = formatError(error)
      return context.json(body, status as 400 | 403 | 404 | 500)
    }
  })

  // ── Business groups ──
  app.post('/api/business-groups', async (context) => {
    try {
      const companyId = getCompanyId(context)
      requireRole(context, 'admin')
      const body = await context.req.json().catch(() => ({}))
      const name = requiredString(body.name, 'name', 200)
      const group = await collaborationService.createBusinessGroup(companyId, name)
      return context.json({ data: group }, 201)
    } catch (error) {
      const { body, status } = formatError(error)
      return context.json(body, status as 400 | 403 | 500)
    }
  })

  app.get('/api/business-groups', async (context) => {
    try {
      const companyId = getCompanyId(context)
      const groups = await collaborationService.listBusinessGroups(companyId)
      return context.json({ data: groups })
    } catch (error) {
      const { body, status } = formatError(error)
      return context.json(body, status as 400 | 403 | 500)
    }
  })

  app.post('/api/business-groups/:id/members', async (context) => {
    try {
      const companyId = getCompanyId(context)
      requireRole(context, 'admin')
      const body = await context.req.json().catch(() => ({}))
      const userId = requiredString(body.userId, 'userId')
      const member = await collaborationService.addMember(companyId, context.req.param('id'), userId)
      return context.json({ data: member }, 201)
    } catch (error) {
      const { body, status } = formatError(error)
      return context.json(body, status as 400 | 403 | 404 | 409 | 500)
    }
  })

  // ── Categories ──
  app.post('/api/categories', async (context) => {
    try {
      const companyId = getCompanyId(context)
      requireRole(context, 'admin')
      const body = await context.req.json().catch(() => ({}))
      const name = requiredString(body.name, 'name', 200)
      const category = await assignmentService.createCategory(companyId, name)
      return context.json({ data: category }, 201)
    } catch (error) {
      const { body, status } = formatError(error)
      return context.json(body, status as 400 | 403 | 500)
    }
  })

  app.get('/api/categories', async (context) => {
    try {
      const companyId = getCompanyId(context)
      const categories = await assignmentService.listCategories(companyId)
      return context.json({ data: categories })
    } catch (error) {
      const { body, status } = formatError(error)
      return context.json(body, status as 400 | 403 | 500)
    }
  })

  // ── Assignment rules ──
  app.post('/api/assignment-rules', async (context) => {
    try {
      const companyId = getCompanyId(context)
      requireRole(context, 'admin')
      const body = await context.req.json().catch(() => ({}))
      const categoryId = requiredString(body.categoryId, 'categoryId')
      const groupId = requiredString(body.groupId, 'groupId')
      const rule = await assignmentService.createAssignmentRule(companyId, categoryId, groupId)
      return context.json({ data: rule }, 201)
    } catch (error) {
      const { body, status } = formatError(error)
      return context.json(body, status as 400 | 403 | 404 | 409 | 500)
    }
  })

  app.get('/api/assignment-rules', async (context) => {
    try {
      const companyId = getCompanyId(context)
      const rules = await assignmentService.listAssignmentRules(companyId)
      return context.json({ data: rules })
    } catch (error) {
      const { body, status } = formatError(error)
      return context.json(body, status as 400 | 403 | 500)
    }
  })

  // ── Dashboard ──
  app.get('/api/dashboard/stats', async (context) => {
    try {
      const companyId = getCompanyId(context)
      requireRole(context, 'handler', 'admin')
      const endDate = context.req.query('endDate') ?? new Date().toISOString()
      const startDate = context.req.query('startDate') ?? new Date(Date.now() - 30 * 86400000).toISOString()
      const stats = await statsService.getDashboardStats(companyId, startDate, endDate)
      return context.json({ data: stats })
    } catch (error) {
      const { body, status } = formatError(error)
      return context.json(body, status as 400 | 403 | 500)
    }
  })

  app.get('/api/dashboard/distribution', async (context) => {
    try {
      const companyId = getCompanyId(context)
      const user = getAppUser(context)
      requireRole(context, 'handler', 'admin')
      const dimension = context.req.query('dimension')
      if (dimension !== 'company' && dimension !== 'department') throw new TypeError('dimension must be company or department')
      const distribution = await statsService.getDistribution(companyId, user.role as UserRole, dimension, context.req.query('status') || undefined)
      return context.json({ data: distribution })
    } catch (error) {
      const { body, status } = formatError(error)
      return context.json(body, status as 400 | 403 | 500)
    }
  })
}
