import { createAuth } from '@commonapp/authkit'
import type { MiddlewareHandler } from 'hono'
import { createUserResolver, createUserStore } from '@commonapp/userkit'
import type { DbClient } from '@commonapp/dbkit'

export function createApplicationAuth(db: DbClient, permissionKit: ReturnType<typeof import('@commonapp/permissionkit').createPermissionKit>, auditKit: ReturnType<typeof import('@commonapp/auditkit').createAuditKit>) {
  const userStore = createUserStore(db)
  const userResolver = createUserResolver(userStore, {
    getRoles: (userId) => permissionKit.getRoles(userId),
  })
  const auth = createAuth({ userResolver, auditLogger: auditKit })
  const loginRoute = auth.createLoginRoute({
    loginField: 'email',
    findByCredential: async (email) => {
      const user = await userStore.findByCredential(email, 'email')
      if (!user) return null
      const roles = await permissionKit.getRoles(user.id)
      return {
        id: user.id,
        role: roles.includes('admin') ? 'admin' : (roles[0] ?? 'user'),
        status: user.enabled ? 'active' : 'disabled',
        passwordHash: user.passwordHash,
        name: user.name,
        email: user.email,
        phone: user.phone,
        roles,
        passwordChangeRequired: user.passwordChangeRequired,
      }
    },
    responseTransform: (user, token) => ({
      token,
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone, roles: user.roles, passwordChangeRequired: user.passwordChangeRequired },
    }),
  })
  const requireAnyAuth: MiddlewareHandler = async (context, next) => {
    // 必须 return vendor 中间件的 Response：丢弃返回值会导致 Hono compose 无法确定响应（fetch 泄漏 Context）
    let callbackResponse: Response | undefined
    const response = await (auth.requireAnyAuth as MiddlewareHandler)(context, async () => {
      const user = (context as unknown as { get(key: string): { passwordChangeRequired?: boolean } }).get('currentUser')
      if (user.passwordChangeRequired && !['/api/auth/me', '/api/auth/password'].includes(context.req.path)) {
        callbackResponse = context.json({ error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Change your temporary password before continuing' } }, 403)
        return
      }
      await next()
    })
    if (callbackResponse) return callbackResponse
    // vendor 未认证响应体为 { error: string }（非契约结构）；统一转换为技术契约第 13 节错误结构
    if (response instanceof Response && response.status === 401) {
      const body = (await response.json().catch(() => null)) as { error?: unknown } | null
      const message = body && typeof body.error === 'string' ? body.error : '用户名或密码错误'
      return context.json({ error: { code: 'UNAUTHENTICATED', message } }, 401)
    }
    return response
  }
  return { ...auth, requireAnyAuth, userStore, userResolver, loginRoute }
}
