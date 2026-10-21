import { randomUUID } from 'node:crypto'
import type { Hono } from 'hono'
import type { initializePlatform } from '../platform/bootstrap'
import { ApiError, notFound } from '../errors'
import { contextUser, readJson, wrap } from '../http'
import { loadSession } from '../session'
import { findCompany } from '../services/org-config'
import { requireEmail, requireSecret, requireString } from '../validation'

type Platform = Awaited<ReturnType<typeof initializePlatform>>

/** auth 域（契约 §1）：登录、登出、当前用户，及冷启动初始管理员。 */

export function registerPublicAuthRoutes(app: Hono, platform: Platform) {
  app.get('/api/auth/bootstrap-status', wrap(async (c) => c.json({ required: (await platform.auth.userStore.count()) === 0 })))

  // 冷启动初始管理员：仅在无任何用户时可用，创建后由 /api/users 开户（契约 §2，admin 收紧）。
  app.post('/api/auth/bootstrap', platform.auth.loginRateLimit, wrap(async (c) => {
    const body = await readJson(c)
    const username = requireString(body.username, 'username', 3, 64)
    const password = requireSecret(body.password, 'password', 8, 128)
    const displayName = body.displayName === undefined ? username : requireString(body.displayName, 'displayName', 1, 64)
    const email = body.email === undefined ? `${username}@tickets.invalid` : requireEmail(body.email, 'email')
    const id = randomUUID()
    const at = new Date().toISOString()
    await platform.db.transaction(async (tx) => {
      const count = await tx.queryOne<{ total: number }>({ text: 'SELECT COUNT(*) AS total FROM users' })
      if (Number(count?.total ?? 0) !== 0) throw new ApiError(409, 'BOOTSTRAP_CLOSED', 'An account already exists')
      await tx.run({
        text: 'INSERT INTO users (id, name, email, phone, enabled, company_id, password_hash, password_change_required, created_at, updated_at) VALUES (?, ?, ?, NULL, 1, NULL, ?, 0, ?, ?)',
        params: [id, username, email, platform.auth.hashPassword(password), at, at],
      })
      await tx.run({
        text: "INSERT INTO user_profiles (user_id, display_name, email, company_id, department, role, created_at) VALUES (?, ?, ?, NULL, '', 'admin', ?)",
        params: [id, displayName, email, at],
      })
    })
    return c.json({ ok: true }, 201)
  }))

  app.post('/api/auth/login', platform.auth.loginRateLimit, wrap(async (c) => {
    const body = await c.req.json().catch(() => null)
    const username = typeof body?.username === 'string' ? body.username.trim() : ''
    const password = typeof body?.password === 'string' ? body.password : ''
    if (!username || !password) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid username or password')
    // userkit 的 findByField 仅支持 email/phone；登录标识 username 存于 users.name，直接按可信表查询。
    const user = await platform.db.queryOne<{ id: string; name: string; email: string | null; enabled: number; password_hash: string }>({
      text: 'SELECT id, name, email, enabled, password_hash FROM users WHERE name = ?',
      params: [username],
    })
    if (!user || user.enabled !== 1 || !platform.auth.verifyPassword(password, user.password_hash)) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid username or password')
    }
    const session = await loadSession(platform.db, { id: user.id, name: user.name, email: user.email })
    return c.json({
      token: platform.auth.signToken(user.id),
      user: {
        userId: session.userId,
        username: session.username,
        displayName: session.profile?.displayName ?? session.username,
        email: session.profile?.email ?? session.email,
        companyId: session.profile?.companyId ?? null,
        department: session.profile?.department ?? null,
        role: session.profile?.role ?? null,
      },
    })
  }))

  app.get('/api/auth/sso/start', (c) => platform.auth.sso.start(c as never))
  app.get('/api/auth/sso/callback', (c) => platform.auth.sso.callback(c as never))
  app.post('/api/auth/sso/exchange', (c) => platform.auth.sso.exchange(c as never))

  // 公开段处理 logout：吊销后的 token 无法再通过认证，重复登出必须仍返回 204（幂等）。
  app.post('/api/auth/logout', wrap(async (c) => {
    const token = c.req.header('authorization')?.match(/^Bearer\s+(.+)$/)?.[1]
    if (token) platform.auth.revokeToken(token)
    return c.body(null, 204)
  }))
}

export function registerProtectedAuthRoutes(app: Hono, platform: Platform) {
  app.get('/api/me', wrap(async (c) => {
    const session = await loadSession(platform.db, contextUser(c))
    const companyName =
      session.profile?.companyId != null ? (await findCompany(platform.db, session.profile.companyId))?.name ?? null : null
    return c.json({
      userId: session.userId,
      username: session.username,
      displayName: session.profile?.displayName ?? session.username,
      email: session.profile?.email ?? session.email,
      companyId: session.profile?.companyId ?? null,
      companyName,
      department: session.profile?.department ?? null,
      role: session.profile?.role ?? null,
    })
  }))

  app.post('/api/auth/password', platform.auth.loginRateLimit, wrap(async (c) => {
    const body = await readJson(c)
    const password = requireSecret(body.password, 'password', 12, 128)
    const changed = await platform.auth.userStore.updatePassword(contextUser(c).id, platform.auth.hashPassword(password))
    if (!changed) throw notFound('User not found')
    return c.json({ ok: true, passwordChangeRequired: false })
  }))
}
