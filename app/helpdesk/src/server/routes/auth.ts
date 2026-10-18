// Auth routes (contract §2): public login + protected logout/me.
import type { Hono } from 'hono'
import { requestLocale, requireSession, type AppEnv, type SessionUser } from '../core/session'
import type { Platform } from '../platform/bootstrap'
import { safeJsonBody, stringOf } from './helpers'

export function registerAuthPublicRoutes(app: Hono<AppEnv>, platform: Platform): void {
  app.post('/api/auth/login', async (c) => {
    const locale = requestLocale(c)
    const body = await safeJsonBody(c)
    const result = await platform.auth.login(stringOf(body, 'email'), stringOf(body, 'password'), locale)
    return c.json(result)
  })
}

export function registerAuthRoutes(app: Hono<AppEnv>, platform: Platform): void {
  app.post('/api/auth/logout', (c) => {
    const header = c.req.header('authorization') ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
    platform.auth.logout(token)
    return c.body(null, 204)
  })

  app.get('/api/auth/me', async (c) => {
    const user: SessionUser = requireSession(c)
    return c.json(await platform.auth.profile(user))
  })
}
