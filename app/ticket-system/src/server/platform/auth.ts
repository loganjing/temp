import { createAuth } from '@commonapp/authkit'
import type { MiddlewareHandler } from 'hono'
import { createUserResolver, createUserStore } from '@commonapp/userkit'
import type { DbClient } from '@commonapp/dbkit'

export function createApplicationAuth(db: DbClient) {
  const userStore = createUserStore(db)
  const userResolver = createUserResolver(userStore)
  const auth = createAuth({ userResolver })
  const requireAnyAuth: MiddlewareHandler = async (context, next) => {
    let authenticated = false
    const response = await (auth.requireAnyAuth as MiddlewareHandler)(context, async () => {
      authenticated = true
      const user = (context as unknown as { get(key: string): { passwordChangeRequired?: boolean } }).get('currentUser')
      if (user.passwordChangeRequired && !['/api/auth/me', '/api/auth/password'].includes(context.req.path)) {
        context.json({ error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Change your temporary password before continuing' } }, 403)
        return
      }
      await next()
    })
    // 认证失败时统一为契约错误格式 {error:{code,message}}（authkit 原生形状为 {error:string}）。
    if (authenticated || !response || (response.status !== 401 && response.status !== 403)) return response
    const payload = (await response.json().catch(() => null)) as { error?: unknown } | null
    const message = typeof payload?.error === 'string' ? payload.error : '请先登录'
    const code = response.status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN'
    return context.json({ error: { code, message } }, response.status as 401 | 403)
  }
  return { ...auth, requireAnyAuth, userStore, userResolver }
}
