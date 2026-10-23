import { createAuth } from '@commonapp/authkit'
import type { MiddlewareHandler } from 'hono'
import { createUserResolver, createUserStore } from '@commonapp/userkit'
import type { DbClient } from '@commonapp/dbkit'

interface AuthOptions {
  permissionKit?: {
    getRoles: (userId: string) => Promise<string[]>
  }
}

export function createApplicationAuth(db: DbClient, options?: AuthOptions) {
  const userStore = createUserStore(db)
  const userResolver = createUserResolver(userStore, {
    getRoles: options?.permissionKit?.getRoles,
  })
  const auth = createAuth({ userResolver })
  const loginRoute = auth.createLoginRoute({
    loginField: 'email',
    findByCredential: async (email) => {
      const user = await userStore.findByCredential(email, 'email')
      if (!user) return null
      const departmentRow = await db.queryOne<{ department: string | null }>({ text: 'SELECT department FROM users WHERE id = ?', params: [user.id] })
      const roles = options?.permissionKit ? await options.permissionKit.getRoles(user.id) : ['user']
      return {
        id: user.id,
        role: roles.includes('admin') ? 'admin' : (roles[0] ?? 'user'),
        status: user.enabled ? 'active' : 'disabled',
        passwordHash: user.passwordHash,
        name: user.name,
        email: user.email,
        phone: user.phone,
        companyId: user.companyId,
        department: departmentRow?.department ?? null,
        roles,
        passwordChangeRequired: user.passwordChangeRequired,
      }
    },
    responseTransform: (user, token) => ({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        companyId: user.companyId,
        department: (user as { department?: string | null }).department ?? null,
      },
    }),
  })
  const requireAnyAuth: MiddlewareHandler = async (context, next) => {
    await (auth.requireAnyAuth as MiddlewareHandler)(context, async () => {
      const user = (context as unknown as { get(key: string): { passwordChangeRequired?: boolean; id: string; department?: string | null } }).get('currentUser')
      if (user.department === undefined) {
        const row = await db.queryOne<{ department: string | null }>({ text: 'SELECT department FROM users WHERE id = ?', params: [user.id] })
        ;(user as { department: string | null }).department = row?.department ?? null
      }
      if (user.passwordChangeRequired && !['/api/auth/me', '/api/auth/password'].includes(context.req.path)) {
        context.json({ error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Change your temporary password before continuing' } }, 403)
        return
      }
      await next()
    })
  }
  return { ...auth, requireAnyAuth, userStore, userResolver, loginRoute }
}
