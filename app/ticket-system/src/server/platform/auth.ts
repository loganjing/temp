import { createAuth } from '@commonapp/authkit'
import type { MiddlewareHandler } from 'hono'
import { createUserResolver, createUserStore, type AuthUser } from '@commonapp/userkit'
import type { DbClient } from '@commonapp/dbkit'
import type { createPermissionKit } from '@commonapp/permissionkit'

type PermissionKit = ReturnType<typeof createPermissionKit>

const PASSWORD_CHANGE_EXEMPT_PATHS = ['/api/auth/me', '/api/auth/password']

export function createApplicationAuth(db: DbClient, permissionKit: PermissionKit) {
  const userStore = createUserStore(db)
  const userResolver = createUserResolver(userStore, {
    getRoles: (userId: string) => permissionKit.getRoles(userId),
  })
  const auth = createAuth({ userResolver })
  const loginRoute = auth.createLoginRoute({
    loginField: 'email',
    findByCredential: async (email) => {
      const user = await userStore.findByCredential(email, 'email')
      if (!user) return null
      const roles = await permissionKit.getRoles(user.id)
      return {
        id: user.id,
        role: roles.includes('admin') ? 'admin' : roles[0] ?? 'user',
        status: user.enabled ? 'active' : 'disabled',
        passwordHash: user.passwordHash,
        name: user.name,
        email: user.email,
        phone: user.phone,
        companyId: user.companyId,
        roles,
        passwordChangeRequired: user.passwordChangeRequired,
      }
    },
    responseTransform: (user, token) => ({
      token,
      user: {
        id: user.id, name: user.name, email: user.email, phone: user.phone,
        companyId: user.companyId, roles: user.roles,
        passwordChangeRequired: user.passwordChangeRequired,
      },
    }),
  })

  const requireAnyAuth: MiddlewareHandler = async (context, next) => {
    const authResult: unknown = await (auth.requireAnyAuth as MiddlewareHandler)(context, async () => {})
    if (authResult instanceof Response) return authResult
    const user = (context as unknown as { get(key: string): AuthUser }).get('currentUser')
    if (user?.passwordChangeRequired && !PASSWORD_CHANGE_EXEMPT_PATHS.includes(context.req.path)) {
      return context.json(
        { error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Change your temporary password before continuing' } },
        403,
      )
    }
    await next()
  }

  return { ...auth, requireAnyAuth, userStore, userResolver, loginRoute }
}
