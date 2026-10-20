import { createAuth } from '@commonapp/authkit'
import type { MiddlewareHandler } from 'hono'
import { createUserResolver, createUserStore } from '@commonapp/userkit'
import type { DbClient } from '@commonapp/dbkit'
import { loadTicketUser } from '../context'

export function createApplicationAuth(db: DbClient) {
  const userStore = createUserStore(db)
  const userResolver = createUserResolver(userStore)
  const auth = createAuth({ userResolver })
  const requireAnyAuth: MiddlewareHandler = async (context, next) => {
    const result = await (auth.requireAnyAuth as MiddlewareHandler)(context, async () => {
      const user = (context as unknown as { get(key: string): { passwordChangeRequired?: boolean } }).get('currentUser')
      if (user.passwordChangeRequired && !['/api/auth/me', '/api/auth/password'].includes(context.req.path)) {
        // 必须赋给 context.res（而非仅调用 json）：中间件内丢弃 json() 的返回值会让
        // compose 认为 Context 未 finalized，进而把 Context 对象当作响应传播，在
        // node-server 的 Response 构造中抛出 RangeError。经 res setter 赋值还能让
        // authkit 在 next() 之后读到真实的 403 状态用于审计。
        context.res = context.json({ error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Change your temporary password before continuing' } }, 403)
        return
      }
      await next()
    })
    // 统一 Bearer 认证失败的错误结构为契约格式 { error: { code, message } }。
    if (result instanceof Response && result.status === 401) {
      return context.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401)
    }
    if (result instanceof Response && result.status === 403) {
      return context.json({ error: { code: 'FORBIDDEN', message: 'Account is disabled' } }, 403)
    }
    return result
  }
  // 工单系统登录（契约 §4.1）：请求体 { username, password }，username 为登录邮箱。
  // 直接基于 authkit 的凭证存储与 token 签发实现，以返回契约 UserProfile 并统一错误结构。
  const login = async (username: string, password: string): Promise<{ token: string; profile: NonNullable<Awaited<ReturnType<typeof loadTicketUser>>> } | null> => {
    const user = await userStore.findByCredential(username, 'email')
    if (!user || !user.enabled) return null
    if (!auth.verifyPassword(password, user.passwordHash)) return null
    const profile = await loadTicketUser(db, user.id)
    if (!profile) return null
    return { token: auth.signToken(user.id), profile }
  }
  return { ...auth, requireAnyAuth, login, userStore, userResolver }
}
