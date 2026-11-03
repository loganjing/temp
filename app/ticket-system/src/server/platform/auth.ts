import { createAuth } from '@commonapp/authkit'
import type { MiddlewareHandler } from 'hono'
import { createUserResolver, createUserStore, type AuthUser } from '@commonapp/userkit'
import type { DbClient } from '@commonapp/dbkit'

function resolvePrimaryRole(roles: string[]): string {
  if (roles.includes('admin')) return 'admin'
  if (roles.includes('handler')) return 'handler'
  if (roles.includes('submitter')) return 'submitter'
  return 'submitter'
}

export function createApplicationAuth(db: DbClient, permissionKit: { getRoles: (userId: string) => Promise<string[]> }) {
  const userStore = createUserStore(db)
  const userResolver = createUserResolver(userStore, {
    getRoles: (userId) => permissionKit.getRoles(userId),
  })
  const auth = createAuth({ userResolver })
  const loginRoute = auth.createLoginRoute({
    loginField: 'username',
    findByCredential: async (identifier) => {
      const user = await userStore.findByCredential(identifier, 'email')
      if (!user) return null
      const roles = await permissionKit.getRoles(user.id)
      const businessRole = resolvePrimaryRole(roles)
      return {
        id: user.id,
        role: businessRole,
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
      user: { id: user.id, name: user.name, role: user.role, companyId: user.companyId, email: user.email, phone: user.phone, roles: user.roles, passwordChangeRequired: user.passwordChangeRequired },
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

export function createEnrichContext(db: DbClient, permissionKit: { getRoles: (userId: string) => Promise<string[]> }): MiddlewareHandler {
  return async (context, next) => {
    const user = (context as unknown as { get(key: string): AuthUser }).get('currentUser')
    if (user) {
      const profile = await db.queryOne<{ id: string; user_id: string; company_id: string; department_id: string | null; name: string; email: string }>(
        { text: 'SELECT id, user_id, company_id, department_id, name, email FROM user_profiles WHERE user_id = ?', params: [user.id] },
      )
      if (profile) {
        (context as unknown as { set(key: string, value: unknown): void }).set('profile', {
          profileId: profile.id,
          userId: profile.user_id,
          companyId: profile.company_id,
          departmentId: profile.department_id,
          name: profile.name,
          email: profile.email,
        })
      }
      const roles = await permissionKit.getRoles(user.id)
      const role = resolvePrimaryRole(roles)
      ;(context as unknown as { set(key: string, value: unknown): void }).set('role', role)
    }
    await next()
  }
}
