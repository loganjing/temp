import { createAuth } from '@commonapp/authkit'
import type { MiddlewareHandler } from 'hono'
import { createUserResolver, createUserStore } from '@commonapp/userkit'
import type { DbClient } from '@commonapp/dbkit'
import { createPermissionKit } from '@commonapp/permissionkit'

type PermissionKit = ReturnType<typeof createPermissionKit>

export function createApplicationAuth(db: DbClient, permission?: PermissionKit) {
  const userStore = createUserStore(db)
  // 通过 PermissionKit 解析用户角色，使 currentUser 携带公司维度角色，
  // 后续路由按 currentUser.companyId 做数据隔离、按角色权限做操作鉴权。
  const userResolver = createUserResolver(userStore, permission ? { getRoles: (userId) => permission.getRoles(userId) } : {})
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
      if (user.passwordChangeRequired && !['/api/auth/me', '/api/auth/password'].includes(context.req.path)) {
        context.res = context.json({ error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Change your temporary password before continuing' } }, 403)
        return
      }
      await next()
    })
  return { ...auth, requireAnyAuth, userStore, userResolver, loginRoute }
}
