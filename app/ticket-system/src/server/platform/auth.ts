import { createAuth } from '@commonapp/authkit'
import type { MiddlewareHandler } from 'hono'
import { createUserResolver, createUserStore } from '@commonapp/userkit'
import type { DbClient } from '@commonapp/dbkit'
import { getUserProfile } from '../domain/users'

// authkit 返回的登录用户额外携带工单域扩展资料（数字工号、公司、部门），
// 使 login 响应的 user 满足契约第 1 节 UserProfile（同时保留 starter 客户端兼容字段）。
type LoginUser = {
  id: string
  role: string
  status: string
  name: string
  email: string
  phone: string | null
  roles: string[]
  passwordChangeRequired: boolean
  passwordHash: string
  profile: { userNo: number; department: string; companyId: number | null; companyName: string }
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
      const profile = await getUserProfile(db, user.id)
      if (!profile) return null
      const loginUser: LoginUser = {
        id: user.id,
        role: 'user',
        status: user.enabled ? 'active' : 'disabled',
        name: user.name,
        email: user.email,
        phone: user.phone,
        roles: ['user'],
        passwordChangeRequired: user.passwordChangeRequired,
        passwordHash: user.passwordHash,
        profile: {
          userNo: profile.userId,
          department: profile.department,
          companyId: profile.companyId,
          companyName: profile.companyName,
        },
      }
      return loginUser
    },
    responseTransform: (user, token) => ({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        roles: user.roles,
        passwordChangeRequired: user.passwordChangeRequired,
        userId: user.profile.userNo,
        companyId: user.profile.companyId,
        companyName: user.profile.companyName,
        department: user.profile.department,
      },
    }),
  })
  const requireAnyAuth: MiddlewareHandler = async (context, next) => {
    let blocked: Response | undefined
    // authkit 认证失败时直接返回 {error: string} 形状的响应，这里统一为契约 0 的 401 形状。
    const result = await (auth.requireAnyAuth as MiddlewareHandler)(context, async () => {
      const user = (context as unknown as { get(key: string): { passwordChangeRequired?: boolean } | undefined }).get('currentUser')
      if (user?.passwordChangeRequired && !['/api/auth/me', '/api/auth/password'].includes(context.req.path)) {
        blocked = context.json(
          { error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Change your temporary password before continuing' } },
          403,
        )
        return
      }
      await next()
    })
    if (blocked) return blocked
    if (result) return context.json({ error: { code: 'UNAUTHENTICATED', message: '未登录或会话已过期' } }, 401)
  }
  return { ...auth, requireAnyAuth, userStore, userResolver, loginRoute }
}
