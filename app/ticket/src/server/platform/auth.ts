import { createAuth } from '@commonapp/authkit'
import type { MiddlewareHandler } from 'hono'
import { createUserResolver, createUserStore } from '@commonapp/userkit'
import type { DbClient } from '@commonapp/dbkit'

export function createApplicationAuth(db: DbClient) {
  const userStore = createUserStore(db)
  const userResolver = createUserResolver(userStore)
  const auth = createAuth({ userResolver })
  const loginRoute = auth.createLoginRoute({
    loginField: 'email',
    findByCredential: async (email) => {
      const user = await userStore.findByCredential(email, 'email')
      if (!user) return null
      return {
        id: user.id,
        role: 'user',
        status: user.enabled ? 'active' : 'disabled',
        passwordHash: user.passwordHash,
        name: user.name,
        email: user.email,
        phone: user.phone,
        companyId: user.companyId,
        roles: ['user'],
        passwordChangeRequired: user.passwordChangeRequired,
      }
    },
    responseTransform: (user, token) => ({
      token,
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone, companyId: user.companyId, roles: user.roles, passwordChangeRequired: user.passwordChangeRequired },
    }),
  })
  const requireAnyAuth: MiddlewareHandler = (context, next) =>
    (auth.requireAnyAuth as MiddlewareHandler)(context, async () => {
      const user = (context as unknown as { get(key: string): { passwordChangeRequired?: boolean } }).get('currentUser')
      if (user.passwordChangeRequired && !['/api/auth/me', '/api/me', '/api/auth/password'].includes(context.req.path)) {
        context.res = context.json({ error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Change your temporary password before continuing' } }, 403)
        return
      }
      await next()
    })

  const requireAppAuth: MiddlewareHandler = async (context, next) => {
    let blocked: Response | undefined
    const continuation = async () => {
      const user = (context as unknown as { get(key: string): { passwordChangeRequired?: boolean } }).get('currentUser')
      if (user.passwordChangeRequired && !['/api/auth/me', '/api/me', '/api/auth/password'].includes(context.req.path)) {
        blocked = context.json({ error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Change your temporary password before continuing' } }, 403)
        return
      }
      await next()
    }
    const result = await (auth.requireAnyAuth as MiddlewareHandler)(context, continuation)
    if (result instanceof Response) {
      const body = await result.clone().json().catch(() => null) as { error?: unknown } | null
      if (body?.error === 'Account disabled') {
        return context.json({ error: { code: 'ACCOUNT_DISABLED', message: '账号已停用，请联系管理员' } }, 403)
      }
      return context.json({ error: { code: 'UNAUTHENTICATED', message: '登录已过期，请重新登录' } }, 401)
    }
    return blocked
  }

  const loginRateLimit: MiddlewareHandler = async (context, next) => {
    const result = await (auth.loginRateLimit as MiddlewareHandler)(context, next)
    if (result instanceof Response) {
      return context.json({ error: { code: 'RATE_LIMITED', message: '登录尝试过于频繁，请稍后再试' } }, 429)
    }
    return result
  }

  return { ...auth, requireAnyAuth, requireAppAuth, loginRateLimit, userStore, userResolver, loginRoute }
}
