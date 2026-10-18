import { createAuth } from '@commonapp/authkit'
import type { MiddlewareHandler } from 'hono'
import { createUserResolver, createUserStore } from '@commonapp/userkit'
import type { DbClient } from '@commonapp/dbkit'

/** 已撤销的 Bearer token（进程内会话撤销表；契约 POST /api/auth/logout）。 */
const revokedTokens = new Set<string>()

export function createApplicationAuth(
  db: DbClient,
  permissionKit: ReturnType<typeof import('@commonapp/permissionkit').createPermissionKit>,
  auditKit: ReturnType<typeof import('@commonapp/auditkit').createAuditKit>
) {
  const userStore = createUserStore(db)
  const userResolver = createUserResolver(userStore, {
    getRoles: (userId) => permissionKit.getRoles(userId),
  })
  const auth = createAuth({ userResolver, auditLogger: auditKit })
  const loginRoute = auth.createLoginRoute({
    loginField: 'username',
    findByCredential: async (username) => {
      const user = await userStore.findByCredential(String(username).toLowerCase(), 'email')
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
      user: { id: user.id, username: user.email, displayName: user.name, roles: user.roles },
    }),
  })
  const requireAnyAuth: MiddlewareHandler = async (context, next) => {
    const header = context.req.header('Authorization')
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null
    if (!token || revokedTokens.has(token)) {
      return context.json({ error: { code: 'UNAUTHENTICATED', message: token ? 'Token has been revoked' : 'Authentication required' } }, 401)
    }
    // authkit 原中间件拒绝（token 无效/过期/账号禁用）时返回非契约错误形状；统一改写为 401 UNAUTHENTICATED。
    const response = (await (auth.requireAnyAuth as MiddlewareHandler)(context, async () => { await Promise.resolve() })) as Response | undefined
    if (response) {
      return context.json({ error: { code: 'UNAUTHENTICATED', message: 'Invalid or expired token' } }, 401)
    }
    const user = (context as unknown as { get(key: string): { passwordChangeRequired?: boolean } | undefined }).get('currentUser')
    if (user?.passwordChangeRequired && !['/api/auth/me', '/api/auth/password'].includes(context.req.path)) {
      return context.json({ error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Change your temporary password before continuing' } }, 403)
    }
    await next()
  }
  const revokeToken = (token: string) => {
    revokedTokens.add(token)
    if (revokedTokens.size > 10000) revokedTokens.clear()
  }
  const permissionsOf = (userId: string) => permissionKit.loadAuthorizationContext(userId).then((context) => context.permissions)
  return { ...auth, requireAnyAuth, userStore, userResolver, loginRoute, revokeToken, permissionsOf }
}
