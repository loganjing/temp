import { randomUUID } from 'node:crypto'
import type { Hono, MiddlewareHandler } from 'hono'
import type { initializePlatform } from './platform/bootstrap'
import type { AuthUser } from '@commonapp/userkit'
import { authorizationRegistry } from './platform/authorization'
import { registerPublicAuthRoutes, registerProtectedAuthRoutes } from './api/auth-routes'
import { registerMasterdataRoutes } from './api/masterdata-routes'
import { registerQuoteRoutes } from './api/quote-routes'
import { registerReceivableRoutes } from './api/receivable-routes'
import { registerAdjustmentRoutes } from './api/adjustment-routes'
import { registerReconRoutes } from './api/recon-routes'
import { registerSettlementRoutes } from './api/settlement-routes'
import { registerJobRoutes } from './api/job-routes'
import { registerReportRoutes } from './api/report-routes'
import { registerAuditRoutes } from './api/audit-routes'
import { registerUserRoutes } from './api/user-routes'

type Platform = Awaited<ReturnType<typeof initializePlatform>>
const errorBody = (code: string, message: string) => ({ error: { code, message } })
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

function requirePermission(platform: Platform, key: string): MiddlewareHandler {
  return async (context, next) => {
    try {
      await platform.permissionKit.requirePermission(currentUserId(context), key)
    } catch (error) {
      if (error instanceof Error && error.name === 'PermissionDeniedError') return context.json(errorBody('FORBIDDEN', 'Insufficient permissions'), 403)
      throw error
    }
    await next()
  }
}

export function registerPublicRoutes(app: Hono, platform: Platform) {
  app.get('/api/auth/bootstrap-status', async (context) => context.json({ required: (await platform.auth.userStore.count()) === 0 }))
  app.post('/api/auth/bootstrap-admin', platform.auth.loginRateLimit, async (context) => {
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
        await tx.run({
          text: 'INSERT INTO user_role_assignments (user_id, role_key, scope_type, scope_id, created_at) VALUES (?, ?, ?, ?, ?)',
          params: [id, 'admin', '', '', timestamp],
        })
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'BOOTSTRAP_CLOSED') return context.json(errorBody('BOOTSTRAP_CLOSED', 'An administrator already exists'), 409)
      console.error('[bootstrap-admin] failed')
      return context.json(errorBody('BOOTSTRAP_FAILED', 'Could not create the first administrator'), 500)
    }
    await platform.auditKit.record({ type: 'platform.admin.bootstrap', actorUserId: id, metadata: { email } })
    return context.json({ ok: true }, 201)
  })
  registerPublicAuthRoutes(app, platform)
  app.get('/api/auth/sso/start', (context) => platform.auth.sso.start(context as never))
  app.get('/api/auth/sso/callback', (context) => platform.auth.sso.callback(context as never))
  app.post('/api/auth/sso/exchange', (context) => platform.auth.sso.exchange(context as never))
}

export function registerProtectedRoutes(app: Hono, platform: Platform) {
  registerProtectedAuthRoutes(app, platform)
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
    await platform.auditKit.record({ type: 'platform.user.password_changed', actorUserId: userId })
    return context.json({ ok: true, passwordChangeRequired: false })
  })

  app.get('/api/admin/users', requirePermission(platform, authorizationRegistry.permissions.usersRead.key), async (context) => {
    const search = context.req.query('search') ?? ''
    const limit = Number(context.req.query('limit') ?? 50)
    const offset = Number(context.req.query('offset') ?? 0)
    const [users, total] = await Promise.all([
      platform.auth.userStore.list({ search, limit, offset }),
      platform.auth.userStore.count({ search }),
    ])
    return context.json({ users: await Promise.all(users.map(async (user) => ({ ...user, roles: await platform.permissionKit.getRoles(user.id) }))), total })
  })

  app.get('/api/admin/roles', requirePermission(platform, authorizationRegistry.permissions.usersRead.key), async (context) => {
    return context.json({ roles: await platform.permissionKit.listRoles() })
  })

  app.post('/api/admin/users', requirePermission(platform, authorizationRegistry.permissions.usersManage.key), async (context) => {
    const body = await context.req.json().catch(() => ({}))
    try {
      const name = requiredString(body.name, 'name')
      const email = requiredString(body.email, 'email', 320).toLowerCase()
      const password = requiredString(body.password, 'password', 256)
      if (!email.includes('@') || password.length < 12) throw new TypeError('Enter a valid email and a password with at least 12 characters')
      const user = await platform.auth.userStore.create({ name, email, phone: typeof body.phone === 'string' ? body.phone : null, passwordChangeRequired: true }, platform.auth.hashPassword(password))
      if (typeof body.role === 'string') await platform.permissionKit.assignRole(user.id, body.role)
      await platform.auditKit.record({ type: 'platform.user.created', actorUserId: currentUserId(context), metadata: { userId: user.id } })
      return context.json({ user: { ...user, roles: await platform.permissionKit.getRoles(user.id) } }, 201)
    } catch (error) {
      return context.json(errorBody('INVALID_USER', userMutationError(error, 'Could not create user')), error instanceof TypeError ? 400 : 409)
    }
  })

  app.patch('/api/admin/users/:id', requirePermission(platform, authorizationRegistry.permissions.usersManage.key), async (context) => {
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
      await platform.auditKit.record({ type: 'platform.user.updated', actorUserId: currentUserId(context), metadata: { userId: user.id } })
      return context.json({ user: { id: user.id, name: user.name, email: user.email, phone: user.phone } })
    } catch (error) {
      return context.json(errorBody('INVALID_USER', userMutationError(error, 'Could not update user')), error instanceof TypeError ? 400 : 409)
    }
  })

  app.patch('/api/admin/users/:id/status', requirePermission(platform, authorizationRegistry.permissions.usersManage.key), async (context) => {
    const body = await context.req.json().catch(() => ({}))
    if (typeof body.enabled !== 'boolean') return context.json(errorBody('INVALID_INPUT', 'enabled must be a boolean'), 400)
    const userId = context.req.param('id')
    let changed = false
    try {
      changed = await platform.db.transaction(async (tx) => {
        const role = !body.enabled ? await tx.queryOne({ text: "SELECT role_key FROM user_role_assignments WHERE user_id = ? AND role_key = 'admin' LIMIT 1", params: [userId] }) : null
        if (role) {
          const remaining = await tx.queryOne<{ total: number }>({ text: "SELECT COUNT(DISTINCT u.id) AS total FROM users u JOIN user_role_assignments r ON r.user_id = u.id WHERE r.role_key = 'admin' AND u.enabled = 1 AND u.id <> ?", params: [userId] })
          if (Number(remaining?.total ?? 0) === 0) throw new Error('LAST_ADMIN')
        }
        const result = await tx.run({ text: 'UPDATE users SET enabled = ?, updated_at = ? WHERE id = ?', params: [body.enabled ? 1 : 0, new Date().toISOString(), userId] })
        return result.changes === 1
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'LAST_ADMIN') return context.json(errorBody('LAST_ADMIN', 'Cannot disable the last enabled admin'), 409)
      throw error
    }
    if (!changed) return context.json(errorBody('NOT_FOUND', 'User not found'), 404)
    await platform.auditKit.record({ type: body.enabled ? 'platform.user.enabled' : 'platform.user.disabled', actorUserId: currentUserId(context), metadata: { userId } })
    return context.json({ ok: true })
  })

  app.post('/api/admin/users/:id/password', requirePermission(platform, authorizationRegistry.permissions.usersManage.key), async (context) => {
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
    await platform.auditKit.record({ type: 'platform.user.password_reset', actorUserId: currentUserId(context), metadata: { userId } })
    return context.json({ ok: true })
  })

  app.put('/api/admin/users/:id/roles/:role', requirePermission(platform, authorizationRegistry.permissions.rolesAssign.key), async (context) => {
    const userId = context.req.param('id')
    const role = context.req.param('role')
    if (!await platform.auth.userStore.findById(userId)) return context.json(errorBody('NOT_FOUND', 'User not found'), 404)
    try {
      await platform.permissionKit.assignRole(userId, role)
      await platform.auditKit.record({ type: 'platform.user.role_assigned', actorUserId: currentUserId(context), metadata: { userId, role } })
      return context.json({ roles: await platform.permissionKit.getRoles(userId) })
    } catch (error) {
      return context.json(errorBody('INVALID_ROLE', error instanceof Error ? error.message : 'Invalid role'), 400)
    }
  })

  app.delete('/api/admin/users/:id/roles/:role', requirePermission(platform, authorizationRegistry.permissions.rolesAssign.key), async (context) => {
    const userId = context.req.param('id')
    const role = context.req.param('role')
    const target = await platform.auth.userStore.findById(userId)
    if (!target) return context.json(errorBody('NOT_FOUND', 'User not found'), 404)
    if (role === 'admin' && target.enabled) {
      const remaining = await platform.db.queryOne<{ total: number }>({ text: "SELECT COUNT(DISTINCT u.id) AS total FROM users u JOIN user_role_assignments r ON r.user_id = u.id WHERE r.role_key = 'admin' AND u.enabled = 1 AND u.id <> ?", params: [userId] })
      if (Number(remaining?.total ?? 0) === 0) return context.json(errorBody('LAST_ADMIN', 'Cannot revoke the last enabled admin'), 409)
    }
    try {
      await platform.permissionKit.revokeRole(userId, role)
      await platform.auditKit.record({ type: 'platform.user.role_revoked', actorUserId: currentUserId(context), metadata: { userId, role } })
      return context.json({ roles: await platform.permissionKit.getRoles(userId) })
    } catch (error) {
      return context.json(errorBody('INVALID_ROLE', error instanceof Error ? error.message : 'Invalid role'), 409)
    }
  })

  // 业务域路由（技术契约第 2 节 API 全集）
  registerMasterdataRoutes(app, platform)
  registerQuoteRoutes(app, platform)
  registerReceivableRoutes(app, platform)
  registerAdjustmentRoutes(app, platform)
  registerReconRoutes(app, platform)
  registerSettlementRoutes(app, platform)
  registerJobRoutes(app, platform)
  registerReportRoutes(app, platform)
  registerAuditRoutes(app, platform)
  registerUserRoutes(app, platform)
}
