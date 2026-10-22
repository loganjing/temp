import { createAuth } from '@commonapp/authkit'
import type { CredentialUser } from '@commonapp/authkit'
import type { MiddlewareHandler } from 'hono'
import { createUserResolver, createUserStore } from '@commonapp/userkit'
import type { DbClient } from '@commonapp/dbkit'
import { loadUserProfile, toProfileDto, type UserProfileRow } from '../tickets/repository'

/** 密码登录用户：在 authkit 凭证用户上附加项目用户业务属性 */
type CredentialLoginUser = CredentialUser & {
  name: string
  email: string
  phone: string | null
  roles: string[]
  passwordChangeRequired: boolean
  profile: UserProfileRow | null
}

export function createApplicationAuth(db: DbClient) {
  const userStore = createUserStore(db)
  const userResolver = createUserResolver(userStore)
  const auth = createAuth({ userResolver })
  const loginRoute = auth.createLoginRoute<CredentialLoginUser>({
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
        roles: ['user'],
        passwordChangeRequired: user.passwordChangeRequired,
        profile: await loadUserProfile(db, user.id),
      }
    },
    responseTransform: (user, token) => ({
      token,
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone, roles: user.roles, passwordChangeRequired: user.passwordChangeRequired },
      profile: user.profile ? toProfileDto(user.profile) : null,
    }),
  })
  const requireAnyAuth: MiddlewareHandler = async (context, next) => {
    // 必须回传内层认证中间件的响应，否则认证拒绝（401/403）会被丢弃并退化为空响应。
    return await (auth.requireAnyAuth as MiddlewareHandler)(context, async () => {
      const user = (context as unknown as { get(key: string): { passwordChangeRequired?: boolean } }).get('currentUser')
      if (user.passwordChangeRequired && !['/api/auth/me', '/api/auth/password'].includes(context.req.path)) {
        context.json({ error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Change your temporary password before continuing' } }, 403)
        return
      }
      await next()
    })
  }
  return { ...auth, requireAnyAuth, userStore, userResolver, loginRoute }
}
