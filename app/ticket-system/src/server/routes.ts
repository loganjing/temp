import { randomUUID } from 'node:crypto'
import type { Hono, MiddlewareHandler } from 'hono'
import type { initializePlatform } from './platform/bootstrap'
import type { AuthUser } from '@commonapp/userkit'
import { BodyReader, ensureCompany } from './domain/support'
import { getUserProfile, registerUserRoutes } from './domain/users'
import { registerTicketRoutes } from './domain/tickets'
import { registerGroupRoutes } from './domain/groups'
import { registerStatsRoutes } from './domain/stats'
import { registerOutboxRoutes } from './domain/outbox'
import { registerLogRoutes } from './domain/logs'

type Platform = Awaited<ReturnType<typeof initializePlatform>>
const errorBody = (code: string, message: string) => ({ error: { code, message } })
const validationBody = (issues: Array<{ field: string; message: string }>) => ({
  error: { code: 'VALIDATION', message: '请求参数不正确', details: issues },
})
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

export function registerPublicRoutes(app: Hono, platform: Platform) {
  app.get('/api/auth/bootstrap-status', async (context) => context.json({ required: (await platform.auth.userStore.count()) === 0 }))
  app.post('/api/auth/bootstrap', platform.auth.loginRateLimit, async (context) => {
    const body = await context.req.json().catch(() => ({}))
    let name: string
    let email: string
    let password: string
    let companyName: string | null
    let department: string
    try {
      name = requiredString(body.name, 'name')
      email = requiredString(body.email, 'email', 320).toLowerCase()
      password = requiredString(body.password, 'password', 256)
      if (!email.includes('@') || password.length < 12) throw new TypeError('Enter a valid email and a password with at least 12 characters')
      companyName = typeof body.companyName === 'string' && body.companyName.trim() ? body.companyName.trim().slice(0, 200) : null
      department = typeof body.department === 'string' ? body.department.trim().slice(0, 100) : ''
    } catch (error) {
      return context.json(errorBody('VALIDATION', error instanceof Error ? error.message : 'Invalid input'), 400)
    }
    const passwordHash = platform.auth.hashPassword(password)
    const id = randomUUID()
    try {
      await platform.db.transaction(async (tx) => {
        const count = await tx.queryOne<{ total: number }>({ text: 'SELECT COUNT(*) AS total FROM users' })
        if (Number(count?.total ?? 0) !== 0) throw new Error('BOOTSTRAP_CLOSED')
        const timestamp = new Date().toISOString()
        const companyId = companyName === null ? null : await ensureCompany(tx, companyName, timestamp)
        await tx.run({
          text: 'INSERT INTO users (id, name, email, phone, enabled, company_id, password_hash, created_at, updated_at, department) VALUES (?, ?, ?, NULL, 1, ?, ?, ?, ?, ?)',
          params: [id, name, email, companyId === null ? null : String(companyId), passwordHash, timestamp, timestamp, department],
        })
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'BOOTSTRAP_CLOSED') return context.json(errorBody('BOOTSTRAP_CLOSED', 'An account already exists'), 409)
      console.error('[bootstrap] failed')
      return context.json(errorBody('BOOTSTRAP_FAILED', 'Could not create the first account'), 500)
    }
    return context.json({ ok: true }, 201)
  })
  // authkit 登录失败响应统一为契约第 1 节的 401 INVALID_CREDENTIALS 形状。
  app.post('/api/auth/login', platform.auth.loginRateLimit, async (context, next) => {
    const result = await (platform.auth.loginRoute as MiddlewareHandler)(context, next)
    if (!result) return
    if (result.status === 400) return context.json(errorBody('VALIDATION', '请输入邮箱与密码'), 400)
    if (result.status !== 200) return context.json(errorBody('INVALID_CREDENTIALS', '邮箱或密码不正确'), 401)
    return result
  })
  app.get('/api/auth/sso/start', (context) => platform.auth.sso.start(context as never))
  app.get('/api/auth/sso/callback', (context) => platform.auth.sso.callback(context as never))
  app.post('/api/auth/sso/exchange', (context) => platform.auth.sso.exchange(context as never))
}

export function registerProtectedRoutes(app: Hono, platform: Platform) {
  app.get('/api/auth/me', async (context) => {
    const user = (context as unknown as { get(key: string): unknown }).get('currentUser') as AuthUser
    const profile = await getUserProfile(platform.db, user.id)
    return context.json({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      roles: user.roles,
      passwordChangeRequired: user.passwordChangeRequired,
      ...(profile
        ? { userId: profile.userId, companyId: profile.companyId, companyName: profile.companyName, department: profile.department }
        : {}),
    })
  })
  // Bearer 凭证为无状态令牌：登出由客户端丢弃令牌完成，端点满足契约第 1 节形状。
  app.post('/api/auth/logout', (context) => context.json({ ok: true }))
  app.post('/api/auth/password', async (context) => {
    const body = await context.req.json().catch(() => ({}))
    let password: string
    try {
      password = requiredString(body.password, 'password', 256)
      if (password.length < 12) throw new TypeError('Password must contain at least 12 characters')
    } catch (error) {
      return context.json(errorBody('VALIDATION', error instanceof Error ? error.message : 'Invalid password'), 400)
    }
    const userId = currentUserId(context)
    if (!await platform.auth.userStore.updatePassword(userId, platform.auth.hashPassword(password))) return context.json(errorBody('NOT_FOUND', 'User not found'), 404)
    return context.json({ ok: true, passwordChangeRequired: false })
  })

  const enrichUsers = async (users: Array<{ id: string }>) => {
    if (users.length === 0) return new Map<string, { userNo: number; department: string; companyName: string }>()
    const placeholders = users.map(() => '?').join(', ')
    const rows = await platform.db.queryAll<{ id: string; user_no: number; department: string; company_name: string | null }>({
      text: `SELECT u.id, u.user_no, u.department, c.name AS company_name
             FROM users u LEFT JOIN companies c ON c.id = CAST(u.company_id AS INTEGER)
             WHERE u.id IN (${placeholders})`,
      params: users.map((user) => user.id),
    })
    return new Map(
      rows.map((row) => [row.id, { userNo: row.user_no, department: row.department ?? '', companyName: row.company_name ?? '' }]),
    )
  }

  app.get('/api/admin/users', async (context) => {
    const search = context.req.query('search') ?? ''
    const limit = Math.min(Math.max(Number(context.req.query('limit') ?? 50), 1), 100)
    const offset = Math.max(Number(context.req.query('offset') ?? 0), 0)
    const [users, total] = await Promise.all([
      platform.auth.userStore.list({ search, limit, offset }),
      platform.auth.userStore.count({ search }),
    ])
    const enriched = await enrichUsers(users)
    return context.json({
      users: users.map((user) => ({
        ...user,
        userNo: enriched.get(user.id)?.userNo ?? 0,
        companyName: enriched.get(user.id)?.companyName ?? '',
        department: enriched.get(user.id)?.department ?? '',
      })),
      total,
    })
  })

  // starter 用户创建端点扩展：公司名（不存在则创建 company）与部门字段（契约第 1 节）。
  app.post('/api/admin/users', async (context) => {
    const body = await context.req.json().catch(() => ({}))
    const reader = new BodyReader(body)
    const name = reader.string('name', { required: true, min: 1, max: 200 })
    const email = reader.string('email', { required: true, min: 3, max: 320 })
    const password = reader.string('password', { required: true, min: 12, max: 256 })
    const companyName = reader.string('companyName', { required: true, min: 1, max: 200 })
    const department = reader.string('department', { min: 0, max: 100 }) ?? ''
    if (name !== null && email !== null && !email.includes('@')) {
      reader.addIssue('email', 'email 必须是合法邮箱地址')
    }
    if (reader.issues.length > 0) return context.json(validationBody(reader.issues), 400)
    try {
      const created = await platform.db.transaction(async (tx) => {
        const timestamp = new Date().toISOString()
        const companyId = await ensureCompany(tx, companyName!, timestamp)
        const user = await platform.auth.userStore.create(
          {
            name: name!,
            email: email!.toLowerCase(),
            phone: typeof body.phone === 'string' ? body.phone : null,
            companyId: String(companyId),
            passwordChangeRequired: true,
          },
          platform.auth.hashPassword(password!),
        )
        await tx.run({ text: 'UPDATE users SET department = ? WHERE id = ?', params: [department, user.id] })
        const profile = await tx.queryOne<{ user_no: number }>({ text: 'SELECT user_no FROM users WHERE id = ?', params: [user.id] })
        return { user, userNo: profile?.user_no ?? 0 }
      })
      return context.json(
        { user: { ...created.user, userNo: created.userNo, companyName, department } },
        201,
      )
    } catch (error) {
      return context.json(errorBody('INVALID_USER', userMutationError(error, 'Could not create user')), error instanceof TypeError ? 400 : 409)
    }
  })

  app.patch('/api/admin/users/:id', async (context) => {
    const body = await context.req.json().catch(() => ({}))
    const reader = new BodyReader(body)
    const name = reader.string('name', { required: true, min: 1, max: 200 })
    const email = reader.string('email', { required: true, min: 3, max: 320 })
    const companyName = reader.string('companyName', { min: 1, max: 200 })
    let department: string | undefined
    if (body.department !== undefined) {
      department = reader.string('department', { min: 0, max: 100 }) ?? ''
    }
    if (name !== null && email !== null && !email.includes('@')) {
      reader.addIssue('email', 'email 必须是合法邮箱地址')
    }
    if (reader.issues.length > 0) return context.json(validationBody(reader.issues), 400)
    try {
      const updated = await platform.db.transaction(async (tx) => {
        const timestamp = new Date().toISOString()
        const companyId = companyName === null ? undefined : await ensureCompany(tx, companyName, timestamp)
        const user = await platform.auth.userStore.update(context.req.param('id'), {
          name: name!,
          email: email!.toLowerCase(),
          phone: typeof body.phone === 'string' ? body.phone : null,
          ...(companyId !== undefined ? { companyId: String(companyId) } : {}),
        })
        if (!user) return null
        if (department !== undefined) {
          await tx.run({ text: 'UPDATE users SET department = ? WHERE id = ?', params: [department, user.id] })
        }
        return user
      })
      if (!updated) return context.json(errorBody('NOT_FOUND', 'User not found'), 404)
      return context.json({ user: { id: updated.id, name: updated.name, email: updated.email, phone: updated.phone } })
    } catch (error) {
      return context.json(errorBody('INVALID_USER', userMutationError(error, 'Could not update user')), error instanceof TypeError ? 400 : 409)
    }
  })

  app.patch('/api/admin/users/:id/status', async (context) => {
    const body = await context.req.json().catch(() => ({}))
    if (typeof body.enabled !== 'boolean') return context.json(errorBody('VALIDATION', 'enabled must be a boolean'), 400)
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
      return context.json(errorBody('VALIDATION', error instanceof Error ? error.message : 'Invalid password'), 400)
    }
    const userId = context.req.param('id')
    const changed = await platform.auth.userStore.updatePassword(userId, platform.auth.hashPassword(password), true)
    if (!changed) return context.json(errorBody('NOT_FOUND', 'User not found'), 404)
    return context.json({ ok: true })
  })

  // 业务域路由：用户、工单、分配配置、统计、通知、审计。
  registerUserRoutes(app, platform)
  registerTicketRoutes(app, platform)
  registerGroupRoutes(app, platform)
  registerStatsRoutes(app, platform)
  registerOutboxRoutes(app, platform)
  registerLogRoutes(app, platform)
}
