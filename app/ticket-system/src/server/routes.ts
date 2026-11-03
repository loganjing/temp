import { randomUUID } from 'node:crypto'
import type { Hono, MiddlewareHandler } from 'hono'
import type { initializePlatform } from './platform/bootstrap'
import type { AuthUser } from '@commonapp/userkit'
import { registerTicketRoutes } from './ticket-routes'
import { registerAssignmentRoutes } from './assignment-routes'
import { registerStatisticsRoutes } from './statistics-routes'
import type { CurrentUser } from '../shared/types'

type Platform = Awaited<ReturnType<typeof initializePlatform>>
const errorBody = (code: string, message: string) => ({ error: { code, message } })
const getUser = (c: { get(name: string): unknown }): CurrentUser => c.get('currentUser') as CurrentUser
const currentUserId = (context: unknown) => ((context as { get(name: string): unknown }).get('currentUser') as AuthUser).id
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

const VALID_ROLES = ['submitter', 'handler', 'admin']

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

  // POST /api/auth/register — first user free, subsequent require admin auth
  app.post('/api/auth/register', platform.auth.loginRateLimit, async (context, next) => {
    const count = await platform.auth.userStore.count()
    if (count === 0) return await next()
    await (platform.auth.requireAnyAuth as MiddlewareHandler)(context, async () => {
      const currentUser = getUser(context)
      if (currentUser.role !== 'admin') {
        context.res = context.json(errorBody('FORBIDDEN', 'Only admin can register new users'), 403)
        return
      }
      await next()
    })
  }, async (context) => {
    const body = await context.req.json().catch(() => ({}))
    let username: string
    let password: string
    let displayName: string
    let email: string
    let companyId: string
    let role: string
    try {
      username = requiredString(body.username, 'username')
      password = requiredString(body.password, 'password', 256)
      displayName = requiredString(body.displayName, 'displayName')
      email = requiredString(body.email, 'email', 320).toLowerCase()
      companyId = requiredString(body.companyId, 'companyId')
      role = requiredString(body.role, 'role')
      if (!email.includes('@')) throw new TypeError('Enter a valid email address')
      if (!VALID_ROLES.includes(role)) throw new TypeError('role must be submitter, handler, or admin')
    } catch (error) {
      return context.json(errorBody('VALIDATION_ERROR', error instanceof Error ? error.message : 'Invalid input'), 400)
    }
    const departmentId = typeof body.departmentId === 'string' && body.departmentId.trim() ? body.departmentId.trim() : null
    const passwordHash = platform.auth.hashPassword(password)
    const ts = new Date().toISOString()

    try {
      const result = await platform.db.transaction(async (tx) => {
        // Auto-create company if not exists
        const company = await tx.queryOne<{ id: string }>({ text: 'SELECT id FROM companies WHERE id = ?', params: [companyId] })
        if (!company) {
          await tx.run({ text: 'INSERT INTO companies (id, name, created_at) VALUES (?, ?, ?)', params: [companyId, companyId, ts] })
        }
        if (departmentId) {
          const dept = await tx.queryOne<{ id: string }>({ text: 'SELECT id FROM departments WHERE id = ? AND company_id = ?', params: [departmentId, companyId] })
          if (!dept) throw new TypeError('Department not found')
        }

        const created = await tx.run({
          text: 'INSERT INTO users (id, name, email, phone, enabled, company_id, password_hash, password_change_required, created_at, updated_at) VALUES (?, ?, ?, NULL, 1, ?, ?, 0, ?, ?)',
          params: [randomUUID(), username, email, companyId, passwordHash, ts, ts],
        })
        if (created.changes === 0) throw new Error('USER_CREATE_FAILED')

        const user = await tx.queryOne<{ id: string }>({ text: 'SELECT id FROM users WHERE email = ?', params: [email] })
        if (!user) throw new Error('USER_LOOKUP_FAILED')

        const profileId = randomUUID()
        await tx.run({
          text: 'INSERT INTO user_profiles (id, user_id, company_id, department_id, display_name, email, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          params: [profileId, user.id, companyId, departmentId, displayName, email, role, ts],
        })

        return { userId: user.id, profileId }
      })

      return context.json({
        profileId: result.profileId,
        userId: result.userId,
        username,
        displayName,
        email,
        companyId,
        companyName: companyId,
        departmentId,
        departmentName: null,
        role,
      }, 201)
    } catch (error) {
      if (error instanceof TypeError) return context.json(errorBody('VALIDATION_ERROR', error.message), 400)
      if (error instanceof Error && /unique constraint/i.test(error.message)) return context.json(errorBody('CONFLICT', 'Username or email already exists'), 409)
      console.error('[register] failed', error)
      return context.json(errorBody('INTERNAL_ERROR', 'Could not register user'), 500)
    }
  })

  app.post('/api/auth/login', platform.auth.loginRateLimit, platform.auth.loginRoute as MiddlewareHandler)
  app.get('/api/auth/sso/start', (context) => platform.auth.sso.start(context as never))
  app.get('/api/auth/sso/callback', (context) => platform.auth.sso.callback(context as never))
  app.post('/api/auth/sso/exchange', (context) => platform.auth.sso.exchange(context as never))
}

export function registerProtectedRoutes(app: Hono, platform: Platform) {
  app.get('/api/auth/me', (context) => {
    const user = getUser(context)
    return context.json({
      id: user.id,
      profileId: user.profileId ?? null,
      userId: user.id,
      username: user.displayName ?? user.id,
      displayName: user.displayName ?? null,
      email: user.email,
      companyId: user.companyId,
      companyName: user.companyName ?? null,
      departmentId: user.departmentId ?? null,
      departmentName: user.departmentName ?? null,
      role: user.role,
      passwordChangeRequired: user.passwordChangeRequired,
    })
  })

  app.post('/api/auth/logout', (context) => context.body(null, 204))

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

  // Business routes
  registerTicketRoutes(app, platform)
  registerAssignmentRoutes(app, platform)
  registerStatisticsRoutes(app, platform)
}
