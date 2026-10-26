import { createAuth } from '@commonapp/authkit'
import type { MiddlewareHandler } from 'hono'
import { createUserResolver, createUserStore } from '@commonapp/userkit'
import type { DbClient } from '@commonapp/dbkit'
import type { PermissionKit } from './permission'

export type EnrichedUser = {
  id: string
  role: string
  status: string
  name: string
  email: string
  phone: string | null
  companyId: string | null
  roles: string[]
  passwordChangeRequired: boolean
  passwordHash: string
  company: string | null
  department: string | null
}

export function createApplicationAuth(db: DbClient, permissionKit: PermissionKit) {
  const userStore = createUserStore(db)
  const userResolver = createUserResolver(userStore, {
    getRoles: (userId: string) => permissionKit.getRoles(userId),
  })
  const auth = createAuth({ userResolver })

  const fetchProfile = async (userId: string): Promise<{ company: string | null; department: string | null }> => {
    const row = await db.queryOne<{ company: string | null; department: string | null }>({
      text: 'SELECT company, department FROM users WHERE id = ?',
      params: [userId],
    })
    return { company: row?.company ?? null, department: row?.department ?? null }
  }

  const loginRoute = auth.createLoginRoute({
    loginField: 'email',
    findByCredential: async (email) => {
      const user = await userStore.findByCredential(email, 'email')
      if (!user) return null
      const roles = await permissionKit.getRoles(user.id)
      const role = roles[0] ?? 'submitter'
      const profile = await fetchProfile(user.id)
      return {
        id: user.id,
        role,
        status: user.enabled ? 'active' : 'disabled',
        passwordHash: user.passwordHash,
        name: user.name,
        email: user.email,
        phone: user.phone,
        companyId: user.companyId,
        roles,
        passwordChangeRequired: user.passwordChangeRequired,
        company: profile.company,
        department: profile.department,
      } satisfies EnrichedUser
    },
    responseTransform: (user, token) => {
      const u = user as EnrichedUser
      return {
        token,
        user: {
          id: u.id,
          name: u.name,
          email: u.email,
          phone: u.phone,
          companyId: u.companyId,
          roles: u.roles,
          role: u.roles[0] ?? 'submitter',
          company: u.company,
          department: u.department,
          passwordChangeRequired: u.passwordChangeRequired,
        },
      }
    },
  })

  const requireAnyAuth: MiddlewareHandler = async (context, next) => {
    let blocked = false
    await (auth.requireAnyAuth as MiddlewareHandler)(context, async () => {
      const user = (context as unknown as { get(name: string): EnrichedUser }).get('currentUser')
      if (user.passwordChangeRequired && !['/api/auth/me', '/api/auth/password'].includes(context.req.path)) {
        blocked = true
        return
      }
      // Enrich currentUser with role and profile fields
      const roles = await permissionKit.getRoles(user.id)
      const profile = await fetchProfile(user.id)
      ;(context as unknown as { set: (k: string, v: unknown) => void }).set('currentUser', {
        ...user,
        role: roles[0] ?? 'submitter',
        roles,
        company: profile.company,
        department: profile.department,
      })
      await next()
    })
    if (blocked) return context.json({ error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Change your temporary password before continuing' } }, 403)
  }

  return { ...auth, requireAnyAuth, userStore, userResolver, loginRoute, permissionKit }
}

export type ApplicationAuth = ReturnType<typeof createApplicationAuth>
