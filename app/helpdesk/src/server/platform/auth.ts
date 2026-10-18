import { createAuth } from '@commonapp/authkit'
import { createUserResolver, createUserStore } from '@commonapp/userkit'
import type { DbClient } from '@commonapp/dbkit'
import type { MiddlewareHandler } from 'hono'

// Fail closed until the application binds the approved resolver and routes.
export const authBoundary: MiddlewareHandler = async (context) => context.json({
  error: { code: 'AUTH_NOT_CONFIGURED', message: 'Authentication is not configured' },
}, 503)

export function createApplicationAuth(db: DbClient) {
  const userStore = createUserStore(db)
  const userResolver = createUserResolver(userStore)
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
        passwordChangeRequired: user.passwordChangeRequired,
      }
    },
    responseTransform: (user, token) => ({
      token,
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone, passwordChangeRequired: user.passwordChangeRequired },
    }),
  })
  return { ...auth, userStore, userResolver, loginRoute }
}
