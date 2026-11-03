import { randomUUID } from 'node:crypto'
import type { Context, Hono, MiddlewareHandler } from 'hono'
import type { initializePlatform } from './platform/bootstrap'
import type { AuthUser } from '@commonapp/userkit'
import { ErrorCode, VALID_PRIORITIES } from '../shared/constants'
import {
  DomainError, type DomainContext,
  createCompany, listCompanies, createDepartment, listDepartments,
  createUserProfile, getUserProfileByUserId,
  createTicket, listTickets, getTicketDetail, updateTicketStatus, addReply, transferTicket, completeTicket,
  createEvaluation, getEvaluation, getSubmitterProfile,
  listBusinessGroups, createBusinessGroup, addGroupMember, removeGroupMember,
  listAssignmentRules, createAssignmentRule, deleteAssignmentRule,
  getStatisticsOverview, getStatisticsDistribution, getTicketLogs,
} from './domain'

type Platform = Awaited<ReturnType<typeof initializePlatform>>
const errorBody = (code: string, message: string, details?: string[]) => details ? { error: { code, message, details } } : { error: { code, message } }

function resolvePrimaryRole(roles: string[]): string {
  if (roles.includes('admin')) return 'admin'
  if (roles.includes('handler')) return 'handler'
  return 'submitter'
}

function getDomainContext(context: Context): DomainContext {
  const ctx = context as unknown as { get(name: string): unknown }
  const user = ctx.get('currentUser') as AuthUser
  const profile = ctx.get('profile') as { profileId: string; companyId: string; departmentId: string | null } | undefined
  const role = ctx.get('role') as string | undefined
  return {
    userId: user.id,
    profileId: profile?.profileId ?? null,
    companyId: profile?.companyId ?? user.companyId ?? null,
    role: role ?? resolvePrimaryRole(user.roles),
  }
}

function requireRole(ctx: DomainContext, ...allowed: string[]) {
  if (!allowed.includes(ctx.role)) throw new DomainError(ErrorCode.FORBIDDEN, 'Insufficient permissions', 403)
}

const requiredString = (value: unknown, name: string, maxLength = 200) => {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) throw new DomainError(ErrorCode.VALIDATION_ERROR, `${name} is required`)
  return value.trim()
}
const userMutationError = (error: unknown, fallback: string) => {
  if (error instanceof DomainError) return error.message
  if (error instanceof TypeError) return error.message
  if (error instanceof Error && /unique constraint/i.test(error.message)) return 'Email or phone is already in use'
  console.error('[users] mutation failed')
  return fallback
}

export function registerPublicRoutes(app: Hono, platform: Platform) {
  app.get('/api/auth/bootstrap-status', async (context) => context.json({ required: (await platform.auth.userStore.count()) === 0 }))
  app.post('/api/auth/bootstrap', platform.auth.loginRateLimit, async (context) => {
    const body = await context.req.json().catch(() => ({}))
    let name: string, email: string, password: string
    try {
      name = requiredString(body.name, 'name')
      email = requiredString(body.email, 'email', 320).toLowerCase()
      password = requiredString(body.password, 'password', 256)
      if (!email.includes('@') || password.length < 12) throw new DomainError('INVALID_INPUT', 'Enter a valid email and a password with at least 12 characters')
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
  app.post('/api/auth/login', platform.auth.loginRateLimit, async (context) => {
    const body = await context.req.json().catch(() => ({}))
    const username = typeof body.username === 'string' ? body.username : (typeof body.email === 'string' ? body.email : '')
    const password = typeof body.password === 'string' ? body.password : ''
    if (!username || !password) return context.json(errorBody(ErrorCode.INVALID_CREDENTIALS, 'Invalid username or password'), 401)
    const user = await platform.auth.userStore.findByCredential(username, 'email')
    if (!user || !platform.auth.verifyPassword(password, user.passwordHash)) return context.json(errorBody(ErrorCode.INVALID_CREDENTIALS, 'Invalid username or password'), 401)
    if (!user.enabled) return context.json(errorBody(ErrorCode.INVALID_CREDENTIALS, 'Account is disabled'), 401)
    const token = platform.auth.signToken(user.id)
    const roles = await platform.permissionKit.getRoles(user.id)
    const role = resolvePrimaryRole(roles)
    return context.json({ token, user: { id: user.id, name: user.name, role, companyId: user.companyId ?? '' } }, 200)
  })
  app.get('/api/auth/sso/start', (context) => platform.auth.sso.start(context as never))
  app.get('/api/auth/sso/callback', (context) => platform.auth.sso.callback(context as never))
  app.post('/api/auth/sso/exchange', (context) => platform.auth.sso.exchange(context as never))
}

export function registerProtectedRoutes(app: Hono, platform: Platform) {
  // ─── Auth ───
  app.get('/api/auth/me', async (context) => {
    const user = (context as unknown as { get(name: string): AuthUser }).get('currentUser')
    const profile = (context as unknown as { get(name: string): unknown }).get('profile') as { companyId: string; departmentId: string | null } | undefined
    const role = (context as unknown as { get(name: string): unknown }).get('role') as string | undefined
    return context.json({
      id: user.id, name: user.name, email: user.email,
      role: role ?? resolvePrimaryRole(user.roles),
      companyId: profile?.companyId ?? user.companyId ?? '',
      departmentId: profile?.departmentId ?? null,
      phone: user.phone, roles: user.roles, passwordChangeRequired: user.passwordChangeRequired,
    })
  })
  app.post('/api/auth/logout', (context) => context.json({ ok: true }))
  app.post('/api/auth/password', async (context) => {
    const body = await context.req.json().catch(() => ({}))
    let password: string
    try {
      password = requiredString(body.password, 'password', 256)
      if (password.length < 12) throw new DomainError('INVALID_INPUT', 'Password must contain at least 12 characters')
    } catch (error) {
      return context.json(errorBody('INVALID_INPUT', error instanceof Error ? error.message : 'Invalid password'), 400)
    }
    const userId = ((context as unknown as { get(name: string): AuthUser }).get('currentUser')).id
    if (!await platform.auth.userStore.updatePassword(userId, platform.auth.hashPassword(password))) return context.json(errorBody('NOT_FOUND', 'User not found'), 404)
    return context.json({ ok: true, passwordChangeRequired: false })
  })

  // ─── Admin: user management (existing) ───
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
      if (!email.includes('@') || password.length < 12) throw new DomainError('INVALID_USER', 'Enter a valid email and a password with at least 12 characters')
      const user = await platform.auth.userStore.create({ name, email, phone: typeof body.phone === 'string' ? body.phone : null, passwordChangeRequired: true }, platform.auth.hashPassword(password))
      return context.json({ user }, 201)
    } catch (error) {
      return context.json(errorBody('INVALID_USER', userMutationError(error, 'Could not create user')), (error instanceof DomainError || error instanceof TypeError) ? 400 : 409)
    }
  })
  app.patch('/api/admin/users/:id', async (context) => {
    const body = await context.req.json().catch(() => ({}))
    try {
      const email = requiredString(body.email, 'email', 320).toLowerCase()
      if (!email.includes('@')) throw new DomainError('INVALID_USER', 'Enter a valid email address')
      const user = await platform.auth.userStore.update(context.req.param('id'), {
        name: requiredString(body.name, 'name'),
        email,
        phone: typeof body.phone === 'string' ? body.phone : null,
      })
      if (!user) return context.json(errorBody('NOT_FOUND', 'User not found'), 404)
      return context.json({ user: { id: user.id, name: user.name, email: user.email, phone: user.phone } })
    } catch (error) {
      return context.json(errorBody('INVALID_USER', userMutationError(error, 'Could not update user')), (error instanceof DomainError || error instanceof TypeError) ? 400 : 409)
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
      if (password.length < 12) throw new DomainError('INVALID_INPUT', 'Password must contain at least 12 characters')
    } catch (error) {
      return context.json(errorBody('INVALID_INPUT', error instanceof Error ? error.message : 'Invalid password'), 400)
    }
    const userId = context.req.param('id')
    const changed = await platform.auth.userStore.updatePassword(userId, platform.auth.hashPassword(password), true)
    if (!changed) return context.json(errorBody('NOT_FOUND', 'User not found'), 404)
    return context.json({ ok: true })
  })

  // ─── Admin: company & department management ───
  app.post('/api/admin/companies', async (context) => {
    const ctx = getDomainContext(context)
    requireRole(ctx, 'admin')
    const body = await context.req.json().catch(() => ({}))
    const name = requiredString(body.name, 'name')
    const company = await createCompany(platform.db, name)
    return context.json(company, 201)
  })
  app.get('/api/admin/companies', async (context) => {
    const companies = await listCompanies(platform.db)
    return context.json({ items: companies.map(c => ({ id: c.id, name: c.name, createdAt: c.created_at })) })
  })
  app.post('/api/admin/departments', async (context) => {
    const ctx = getDomainContext(context)
    requireRole(ctx, 'admin')
    const body = await context.req.json().catch(() => ({}))
    const companyId = requiredString(body.companyId, 'companyId')
    const name = requiredString(body.name, 'name')
    const dept = await createDepartment(platform.db, companyId, name)
    return context.json({ id: dept.id, companyId: dept.companyId, name: dept.name, createdAt: dept.createdAt }, 201)
  })
  app.get('/api/admin/departments', async (context) => {
    const ctx = getDomainContext(context)
    const companyId = context.req.query('companyId') ?? ctx.companyId ?? ''
    const depts = await listDepartments(platform.db, companyId)
    return context.json({ items: depts.map(d => ({ id: d.id, companyId: d.company_id, name: d.name, createdAt: d.created_at })) })
  })

  // ─── Admin: user profiles & role assignment ───
  app.post('/api/admin/user-profiles', async (context) => {
    const ctx = getDomainContext(context)
    requireRole(ctx, 'admin')
    const body = await context.req.json().catch(() => ({}))
    const userId = requiredString(body.userId, 'userId')
    const companyId = requiredString(body.companyId, 'companyId')
    const name = requiredString(body.name, 'name')
    const email = requiredString(body.email, 'email', 320)
    const departmentId = typeof body.departmentId === 'string' && body.departmentId ? body.departmentId : null
    const role = typeof body.role === 'string' ? body.role : 'submitter'
    const profile = await createUserProfile(platform.db, userId, companyId, departmentId, name, email)
    if (['submitter', 'handler', 'admin'].includes(role)) {
      await platform.permissionKit.assignRole(userId, role)
    }
    return context.json(profile, 201)
  })
  app.post('/api/admin/users/:id/roles', async (context) => {
    const ctx = getDomainContext(context)
    requireRole(ctx, 'admin')
    const userId = context.req.param('id')
    const body = await context.req.json().catch(() => ({}))
    const role = requiredString(body.role, 'role')
    if (!['submitter', 'handler', 'admin'].includes(role)) return context.json(errorBody(ErrorCode.VALIDATION_ERROR, 'Invalid role'), 400)
    await platform.permissionKit.assignRole(userId, role)
    return context.json({ ok: true })
  })

  // ─── Tickets ───
  app.get('/api/tickets', async (context) => {
    const ctx = getDomainContext(context)
    const result = await listTickets(platform.db, ctx, {
      status: context.req.query('status'),
      category: context.req.query('category'),
      companyId: context.req.query('companyId'),
      keyword: context.req.query('keyword'),
      sort: context.req.query('sort'),
      order: context.req.query('order'),
      page: Number(context.req.query('page') ?? 1),
      pageSize: Number(context.req.query('pageSize') ?? 20),
    })
    return context.json(result)
  })
  app.post('/api/tickets', async (context) => {
    const ctx = getDomainContext(context)
    requireRole(ctx, 'submitter', 'admin')
    const body = await context.req.json().catch(() => ({}))
    const subject = requiredString(body.subject, 'subject', 500)
    const description = requiredString(body.description, 'description', 10000)
    const category = requiredString(body.category, 'category', 100)
    const priority = requiredString(body.priority, 'priority', 4)
    if (!VALID_PRIORITIES.includes(priority as typeof VALID_PRIORITIES[number])) return context.json(errorBody(ErrorCode.VALIDATION_ERROR, 'Invalid priority'), 400)
    const ticket = await createTicket(platform.db, platform.auditKit, ctx, { subject, description, category, priority })
    return context.json(ticket, 201)
  })
  app.get('/api/tickets/:id', async (context) => {
    const ctx = getDomainContext(context)
    const detail = await getTicketDetail(platform.db, ctx, context.req.param('id'))
    if (!detail) return context.json(errorBody(ErrorCode.NOT_FOUND, 'Ticket not found'), 404)
    return context.json(detail)
  })
  app.patch('/api/tickets/:id/status', async (context) => {
    const ctx = getDomainContext(context)
    requireRole(ctx, 'handler', 'admin')
    const body = await context.req.json().catch(() => ({}))
    const status = requiredString(body.status, 'status', 30)
    const ticket = await updateTicketStatus(platform.db, platform.auditKit, ctx, context.req.param('id'), status)
    return context.json(ticket)
  })
  app.post('/api/tickets/:id/replies', async (context) => {
    const ctx = getDomainContext(context)
    const body = await context.req.json().catch(() => ({}))
    const content = requiredString(body.content, 'content', 5000)
    const reply = await addReply(platform.db, ctx, context.req.param('id'), content)
    return context.json(reply, 201)
  })
  app.post('/api/tickets/:id/transfer', async (context) => {
    const ctx = getDomainContext(context)
    requireRole(ctx, 'handler', 'admin')
    const body = await context.req.json().catch(() => ({}))
    const targetGroupId = requiredString(body.targetGroupId, 'targetGroupId')
    const ticket = await transferTicket(platform.db, platform.auditKit, ctx, context.req.param('id'), targetGroupId)
    return context.json(ticket)
  })
  app.post('/api/tickets/:id/complete', async (context) => {
    const ctx = getDomainContext(context)
    requireRole(ctx, 'handler', 'admin')
    const ticket = await completeTicket(platform.db, platform.auditKit, platform.emailClient, ctx, context.req.param('id'))
    return context.json(ticket)
  })
  app.get('/api/tickets/:id/logs', async (context) => {
    const ctx = getDomainContext(context)
    const logs = await getTicketLogs(platform.db, ctx, context.req.param('id'))
    return context.json(logs)
  })

  // ─── Evaluations ───
  app.post('/api/tickets/:id/evaluation', async (context) => {
    const ctx = getDomainContext(context)
    const body = await context.req.json().catch(() => ({}))
    const rating = Number(body.rating)
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return context.json(errorBody(ErrorCode.VALIDATION_ERROR, 'Rating must be an integer between 1 and 5'), 400)
    const comment = typeof body.comment === 'string' ? body.comment : null
    const evaluation = await createEvaluation(platform.db, ctx, context.req.param('id'), rating, comment)
    return context.json(evaluation, 201)
  })
  app.get('/api/tickets/:id/evaluation', async (context) => {
    const evaluation = await getEvaluation(platform.db, context.req.param('id'))
    return context.json(evaluation)
  })

  // ─── Submitter profile ───
  app.get('/api/users/:id/profile', async (context) => {
    const ctx = getDomainContext(context)
    requireRole(ctx, 'handler', 'admin')
    const profile = await getSubmitterProfile(platform.db, ctx, context.req.param('id'))
    return context.json(profile)
  })

  // ─── Business groups ───
  app.get('/api/business-groups', async (context) => {
    const ctx = getDomainContext(context)
    const result = await listBusinessGroups(platform.db, ctx, context.req.query('companyId'))
    return context.json(result)
  })
  app.post('/api/business-groups', async (context) => {
    const ctx = getDomainContext(context)
    requireRole(ctx, 'admin')
    const body = await context.req.json().catch(() => ({}))
    const name = requiredString(body.name, 'name')
    const group = await createBusinessGroup(platform.db, ctx, name)
    return context.json(group, 201)
  })
  app.post('/api/business-groups/:id/members', async (context) => {
    const ctx = getDomainContext(context)
    requireRole(ctx, 'admin')
    const body = await context.req.json().catch(() => ({}))
    const userId = requiredString(body.userId, 'userId')
    const member = await addGroupMember(platform.db, ctx, context.req.param('id'), userId)
    return context.json(member, 201)
  })
  app.delete('/api/business-groups/:id/members/:userId', async (context) => {
    const ctx = getDomainContext(context)
    requireRole(ctx, 'admin')
    const result = await removeGroupMember(platform.db, ctx, context.req.param('id'), context.req.param('userId'))
    return context.json(result)
  })

  // ─── Assignment rules ───
  app.get('/api/assignment-rules', async (context) => {
    const ctx = getDomainContext(context)
    requireRole(ctx, 'admin')
    const result = await listAssignmentRules(platform.db, ctx)
    return context.json(result)
  })
  app.post('/api/assignment-rules', async (context) => {
    const ctx = getDomainContext(context)
    requireRole(ctx, 'admin')
    const body = await context.req.json().catch(() => ({}))
    const category = requiredString(body.category, 'category', 100)
    const targetGroupId = requiredString(body.targetGroupId, 'targetGroupId')
    const rule = await createAssignmentRule(platform.db, ctx, category, targetGroupId)
    return context.json(rule, 201)
  })
  app.delete('/api/assignment-rules/:id', async (context) => {
    const ctx = getDomainContext(context)
    requireRole(ctx, 'admin')
    const result = await deleteAssignmentRule(platform.db, ctx, context.req.param('id'))
    return context.json(result)
  })

  // ─── Statistics ───
  app.get('/api/statistics/overview', async (context) => {
    const ctx = getDomainContext(context)
    requireRole(ctx, 'handler', 'admin')
    const result = await getStatisticsOverview(platform.db, ctx, context.req.query('companyId'))
    return context.json(result)
  })
  app.get('/api/statistics/distribution', async (context) => {
    const ctx = getDomainContext(context)
    requireRole(ctx, 'handler', 'admin')
    const dimension = context.req.query('dimension') === 'department' ? 'department' : 'company'
    const result = await getStatisticsDistribution(platform.db, ctx, dimension, context.req.query('companyId'))
    return context.json(result)
  })
}
