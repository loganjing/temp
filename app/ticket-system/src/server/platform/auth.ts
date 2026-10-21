import { createAuth } from '@commonapp/authkit'
import type { MiddlewareHandler } from 'hono'
import { createUserResolver, createUserStore } from '@commonapp/userkit'
import type { DbClient } from '@commonapp/dbkit'

export function createApplicationAuth(db: DbClient) {
  const userStore = createUserStore(db)
  const userResolver = createUserResolver(userStore)
  const auth = createAuth({ userResolver })
  // authkit 的 HMAC token 无状态（sign/verify 不存吊销状态），logout 契约要求
  // 服务端吊销 token，因此在应用层维护吊销表：token -> 失效时刻（取 JWT exp）。
  const revokedTokens = new Map<string, number>()
  const sweeper = setInterval(() => {
    const now = Date.now()
    for (const [token, expiresAt] of revokedTokens) {
      if (expiresAt <= now) revokedTokens.delete(token)
    }
  }, 60_000)
  sweeper.unref?.()
  function tokenExpiry(token: string): number {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[0] ?? '', 'base64url').toString()) as { exp?: unknown }
      return typeof payload.exp === 'number' ? payload.exp : Date.now() + 7 * 24 * 60 * 60 * 1000
    } catch {
      return Date.now() + 7 * 24 * 60 * 60 * 1000
    }
  }
  function revokeToken(token: string) {
    revokedTokens.set(token, tokenExpiry(token))
  }
  // 透传内层结果：认证失败时 authkit 返回的 401 Response 必须继续向上返回，
  // 否则 hono 会把中间件链的 context 误当作响应体。
  // authkit 的错误体是 {error: string}，此处统一改写为契约的 {error:{code,message}}。
  const requireAnyAuth: MiddlewareHandler = async (context, next) => {
    const bearer = context.req.header('authorization')?.match(/^Bearer\s+(.+)$/)?.[1] ?? null
    const expiresAt = bearer ? revokedTokens.get(bearer) : undefined
    if (expiresAt !== undefined) {
      if (expiresAt <= Date.now()) {
        revokedTokens.delete(bearer as string)
      } else {
        return context.json({ error: { code: 'UNAUTHORIZED', message: 'Token revoked or expired' } }, 401)
      }
    }
    const inner = await (auth.requireAnyAuth as MiddlewareHandler)(context, async () => {
      const user = (context as unknown as { get(key: string): { passwordChangeRequired?: boolean } }).get('currentUser')
      if (user.passwordChangeRequired && !['/api/me', '/api/auth/password'].includes(context.req.path)) {
        context.res = context.json(
          { error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Change your temporary password before continuing' } },
          403,
        )
        return
      }
      await next()
    })
    if (inner instanceof Response && inner.status === 401) {
      const body = (await inner.clone().json().catch(() => null)) as { error?: unknown } | null
      if (body && typeof body.error === 'string') {
        return context.json({ error: { code: 'UNAUTHORIZED', message: body.error } }, 401)
      }
    }
    return inner
  }
  return { ...auth, requireAnyAuth, revokeToken, userStore, userResolver }
}
