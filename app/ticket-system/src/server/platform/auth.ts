import { createAuth } from '@commonapp/authkit'
import type { MiddlewareHandler } from 'hono'
import { createUserResolver, createUserStore } from '@commonapp/userkit'
import type { DbClient } from '@commonapp/dbkit'
import type { createPermissionKit } from '@commonapp/permissionkit'
import type { AuthUser } from '@commonapp/userkit'

type PermissionKit = ReturnType<typeof createPermissionKit>

export type AppAuthUser = AuthUser & { department: string; companyName: string }

export function createApplicationAuth(db: DbClient, permission: PermissionKit) {
  const userStore = createUserStore(db)
  const userResolver = createUserResolver(userStore, {
    // Read business role from the users table column; default to submitter
    getRoles: async (userId) => {
      const row = await db.queryOne<{ role: string | null }>({
        text: 'SELECT role FROM users WHERE id = ?',
        params: [userId],
      })
      return row?.role ? [row.role] : ['submitter']
    },
  })
  const auth = createAuth({ userResolver })
  const loginRoute = auth.createLoginRoute({
    loginField: 'email',
    findByCredential: async (email) => {
      const user = await userStore.findByCredential(email, 'email')
      if (!user) return null
      const roleRow = await db.queryOne<{ role: string | null; department: string | null }>({
        text: 'SELECT role, department FROM users WHERE id = ?',
        params: [user.id],
      })
      const company = user.companyId
        ? await db.queryOne<{ name: string }>({ text: 'SELECT name FROM companies WHERE id = ?', params: [user.companyId] })
        : null
      const role = roleRow?.role ?? 'submitter'
      return {
        id: user.id,
        role,
        status: user.enabled ? 'active' : 'disabled',
        passwordHash: user.passwordHash,
        name: user.name,
        email: user.email,
        phone: user.phone,
        companyId: user.companyId,
        roles: [role],
        passwordChangeRequired: user.passwordChangeRequired,
        department: roleRow?.department ?? '',
        companyName: company?.name ?? '',
      }
    },
    responseTransform: (user, token) => ({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        companyId: user.companyId,
        companyName: user.companyName,
        department: user.department,
        role: user.role,
      },
    }),
  })
  const requireAnyAuth: MiddlewareHandler = async (context, next) => {
    await (auth.requireAnyAuth as MiddlewareHandler)(context, async () => {
      const user = (context as unknown as { get(name: string): AuthUser }).get('currentUser')
      // Enrich auth context with department and company name from trusted DB
      const roleRow = await db.queryOne<{ department: string | null }>({
        text: 'SELECT department FROM users WHERE id = ?',
        params: [user.id],
      })
      const company = user.companyId
        ? await db.queryOne<{ name: string }>({ text: 'SELECT name FROM companies WHERE id = ?', params: [user.companyId] })
        : null
      ;(context as unknown as { set(name: string, value: unknown): void }).set('currentUser', {
        ...user,
        department: roleRow?.department ?? '',
        companyName: company?.name ?? '',
      })
      if (user.passwordChangeRequired && !['/api/auth/me', '/api/auth/password'].includes(context.req.path)) {
        context.json({ error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Change your temporary password before continuing' } }, 403)
        return
      }
      await next()
    })
  }
  return { ...auth, requireAnyAuth, userStore, userResolver, loginRoute }
}
