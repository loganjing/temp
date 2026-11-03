import { createAuth } from '@commonapp/authkit'
import type { MiddlewareHandler } from 'hono'
import { createUserResolver, createUserStore } from '@commonapp/userkit'
import type { DbClient } from '@commonapp/dbkit'

interface ProfileJoin {
  profile_id: string
  company_id: string
  department_id: string | null
  display_name: string
  email: string
  role: string
  company_name: string | null
  department_name: string | null
}

async function fetchProfile(db: DbClient, userId: string): Promise<ProfileJoin | null> {
  return db.queryOne<ProfileJoin>({
    text: `SELECT p.id AS profile_id, p.company_id, p.department_id, p.display_name, p.email, p.role,
                  c.name AS company_name, d.name AS department_name
           FROM user_profiles p
           LEFT JOIN companies c ON c.id = p.company_id
           LEFT JOIN departments d ON d.id = p.department_id
           WHERE p.user_id = ?`,
    params: [userId],
  })
}

export function createApplicationAuth(db: DbClient) {
  const userStore = createUserStore(db)
  const userResolver = createUserResolver(userStore)
  const auth = createAuth({ userResolver })
  const loginRoute = auth.createLoginRoute({
    loginField: 'email',
    findByCredential: async (email) => {
      const user = await userStore.findByCredential(email, 'email')
      if (!user) return null
      const profile = await fetchProfile(db, user.id)
      return {
        id: user.id,
        role: profile?.role ?? 'user',
        status: user.enabled ? 'active' : 'disabled',
        passwordHash: user.passwordHash,
        name: user.name,
        email: user.email,
        phone: user.phone,
        companyId: profile?.company_id ?? user.companyId,
        roles: [profile?.role ?? 'user'],
        passwordChangeRequired: user.passwordChangeRequired,
        profileId: profile?.profile_id ?? null,
        displayName: profile?.display_name ?? user.name,
        departmentId: profile?.department_id ?? null,
        companyName: profile?.company_name ?? null,
        departmentName: profile?.department_name ?? null,
      }
    },
    responseTransform: (user, token) => ({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        companyId: user.companyId,
        roles: user.roles,
        passwordChangeRequired: user.passwordChangeRequired,
        profileId: (user as Record<string, unknown>).profileId ?? null,
        userId: user.id,
        username: user.name,
        displayName: (user as Record<string, unknown>).displayName ?? user.name,
        companyName: (user as Record<string, unknown>).companyName ?? null,
        departmentId: (user as Record<string, unknown>).departmentId ?? null,
        departmentName: (user as Record<string, unknown>).departmentName ?? null,
        role: (user as Record<string, unknown>).role ?? 'user',
      },
    }),
  })
  const requireAnyAuth: MiddlewareHandler = (context, next) =>
    (auth.requireAnyAuth as MiddlewareHandler)(context, async () => {
      const user = (context as unknown as { get(name: string): Record<string, unknown> }).get('currentUser')
      if (user.passwordChangeRequired && !['/api/auth/me', '/api/auth/password'].includes(context.req.path)) {
        context.res = context.json({ error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Change your temporary password before continuing' } }, 403)
        return
      }
      const profile = await fetchProfile(db, user.id as string)
      if (profile) {
        Object.assign(user, {
          profileId: profile.profile_id,
          companyId: profile.company_id,
          role: profile.role,
          displayName: profile.display_name,
          email: profile.email,
          departmentId: profile.department_id,
          companyName: profile.company_name,
          departmentName: profile.department_name,
        })
      }
      await next()
    })
  return { ...auth, requireAnyAuth, userStore, userResolver, loginRoute }
}
