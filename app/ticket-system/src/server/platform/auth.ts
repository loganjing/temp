import type { Context, MiddlewareHandler } from 'hono'
import { createAuth } from '@commonapp/authkit'
import { createUserResolver, createUserStore, type AuthUser as PlatformAuthUser } from '@commonapp/userkit'
import type { DbClient } from '@commonapp/dbkit'
import { findAuthProfile, toAuthUser } from '../profile'

const PASSWORD_CHANGE_ALLOWED_PATHS = ['/api/auth/me', '/api/auth/password']

export function createApplicationAuth(db: DbClient) {
  const userStore = createUserStore(db)
  const userResolver = createUserResolver(userStore)
  const auth = createAuth({ userResolver })

  // 认证边界：authkit 识别当前用户；401/403 响应统一为契约错误结构（AUTH_REQUIRED）。
  const requireAnyAuth: MiddlewareHandler = async (context, next) => {
    const failure = await (auth.requireAnyAuth as MiddlewareHandler)(context, async () => {})
    if (failure instanceof Response) {
      let message = '请先登录'
      try {
        const body = (await failure.json()) as { error?: unknown }
        if (typeof body.error === 'string' && body.error.length > 0) message = body.error
      } catch {
        // 响应体无法解析时保留默认文案
      }
      const status = failure.status === 403 ? 403 : failure.status === 429 ? 429 : 401
      const code = status === 401 ? 'AUTH_REQUIRED' : 'AUTH_FORBIDDEN'
      return context.json({ error: { code, message } }, status)
    }
    const user = (context as unknown as { get(key: string): unknown }).get('currentUser') as PlatformAuthUser
    if (user.passwordChangeRequired && !PASSWORD_CHANGE_ALLOWED_PATHS.includes(context.req.path)) {
      return context.json(
        { error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Change your temporary password before continuing' } },
        403,
      )
    }
    await next()
  }

  // 契约 2.1 登录：username 登录名（本系统登录名为邮箱），成功返回业务档案 AuthUser。
  // 档案缺失按认证失败处理，不向客户端泄漏账号存在性。
  const loginRoute: MiddlewareHandler = async (context: Context) => {
    const body = (await context.req.json().catch(() => ({}))) as Record<string, unknown>
    const username = typeof body.username === 'string' ? body.username.trim() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const unauthorized = context.json({ error: { code: 'AUTH_INVALID', message: '用户名或密码错误' } }, 401)
    if (username.length === 0 || password.length === 0) return unauthorized
    const user = await userStore.findByCredential(username, 'email')
    if (!user || !user.enabled || !auth.verifyPassword(password, user.passwordHash)) return unauthorized
    const profile = await findAuthProfile(db, user.id)
    if (!profile) return unauthorized
    return context.json({ token: auth.signToken(user.id), user: toAuthUser(profile) })
  }

  return { ...auth, requireAnyAuth, userStore, userResolver, loginRoute }
}
