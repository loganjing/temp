import { createAuth } from '@commonapp/authkit'
import type { MiddlewareHandler } from 'hono'
import { createUserResolver, createUserStore } from '@commonapp/userkit'
import type { DbClient } from '@commonapp/dbkit'
import type { AuthUser } from '@commonapp/userkit'

const PASSWORD_CHANGE_EXEMPT_PATHS = new Set(['/api/auth/me', '/api/auth/password'])

export function createApplicationAuth(db: DbClient, options: { getRoles: (userId: string) => Promise<string[]> }) {
  const userStore = createUserStore(db)
  const userResolver = createUserResolver(userStore, { getRoles: options.getRoles })
  const auth = createAuth({ userResolver })
  const loginRoute = auth.createLoginRoute({
    loginField: 'email',
    findByCredential: async (email) => {
      const user = await userStore.findByCredential(email, 'email')
      if (!user) return null
      const roles = await options.getRoles(user.id)
      const deptRow = await db.queryOne<{ department: string | null }>({ text: 'SELECT department FROM users WHERE id = ?', params: [user.id] })
      return {
        id: user.id,
        role: roles.includes('admin') ? 'admin' : (roles[0] ?? 'user'),
        status: user.enabled ? 'active' : 'disabled',
        passwordHash: user.passwordHash,
        name: user.name,
        email: user.email,
        phone: user.phone,
        companyId: user.companyId,
        department: deptRow?.department ?? null,
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
        role: user.role,
        roles: user.roles,
        phone: user.phone,
        passwordChangeRequired: user.passwordChangeRequired,
      },
    }),
  })
  const requireAnyAuth: MiddlewareHandler = async (context, next) => {
    let authSucceeded = false
    await (auth.requireAnyAuth as MiddlewareHandler)(context, async () => { authSucceeded = true })
    if (!authSucceeded) return
    const user = (context as unknown as { get(name: string): AuthUser }).get('currentUser')
    if (user?.passwordChangeRequired && !PASSWORD_CHANGE_EXEMPT_PATHS.has(context.req.path)) {
      return context.json({ error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Change your temporary password before continuing' } }, 403)
    }
    await next()
  }
  return { ...auth, requireAnyAuth, userStore, userResolver, loginRoute }
}
