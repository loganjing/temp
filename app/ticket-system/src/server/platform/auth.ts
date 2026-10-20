import { createAuth } from '@commonapp/authkit'
import type { MiddlewareHandler } from 'hono'
import { createUserStore } from '@commonapp/userkit'
import type { DbClient } from '@commonapp/dbkit'
import type { Role } from '../../shared/tickets'

// 已认证请求携带的平台用户：userkit 凭证 + 项目档案（user_profiles）。
// 角色与公司归属只来自服务端可信的 users JOIN user_profiles，
// 不接受请求头或请求体中的角色/公司声明。
export type PlatformUser = {
  id: string
  email: string
  name: string
  role: Role
  status: 'active' | 'disabled'
  companyId: number
  department: string | null
  displayName: string
  passwordHash: string
  passwordChangeRequired: boolean
}

type ProfileRow = {
  id: string
  email: string
  name: string
  enabled: number
  password_hash: string
  password_change_required: number
  company_id: number
  display_name: string
  department: string | null
  role: Role
}

const SELECT_USER_WITH_PROFILE = `
  SELECT u.id, u.email, u.name, u.enabled, u.password_hash, u.password_change_required,
         p.company_id, p.display_name, p.department, p.role
  FROM users u JOIN user_profiles p ON p.user_id = u.id
`

const toPlatformUser = (row: ProfileRow): PlatformUser => ({
  id: row.id,
  email: row.email,
  name: row.name,
  role: row.role,
  status: row.enabled ? 'active' : 'disabled',
  companyId: row.company_id,
  department: row.department,
  displayName: row.display_name,
  passwordHash: row.password_hash,
  passwordChangeRequired: Boolean(row.password_change_required),
})

export function createApplicationAuth(db: DbClient) {
  const userStore = createUserStore(db)

  // 登录凭证路径：保留 disabled 状态交给 authkit 登录路由返回账户停用；
  // 无业务档案的用户视为未注册，拒绝登录。
  const findByEmail = async (email: string): Promise<PlatformUser | null> => {
    const row = await db.queryOne<ProfileRow>({
      text: `${SELECT_USER_WITH_PROFILE} WHERE lower(u.email) = lower(?)`,
      params: [email],
    })
    return row ? toPlatformUser(row) : null
  }

  // Token 校验路径：仅活跃且具备业务档案的用户可通过。
  const findById = async (id: string): Promise<PlatformUser | null> => {
    const row = await db.queryOne<ProfileRow>({
      text: `${SELECT_USER_WITH_PROFILE} WHERE u.id = ? AND u.enabled = 1`,
      params: [id],
    })
    return row ? toPlatformUser(row) : null
  }

  const auth = createAuth<PlatformUser>({
    userResolver: { findById, findByField: (_field, value) => findByEmail(value) },
  })

  const loginRoute = auth.createLoginRoute({
    loginField: 'email',
    findByCredential: (email) => findByEmail(email),
    // 契约第 4 节：登录响应携带 CurrentUser（含公司/部门/角色档案）。
    responseTransform: (user, token) => ({
      token,
      user: {
        id: user.id,
        email: user.email,
        display_name: user.displayName,
        company_id: user.companyId,
        department: user.department,
        role: user.role,
      },
    }),
  })

  // 将 authkit 登录错误统一为契约错误模型 { error: { code, message } }。
  const loginHandler: MiddlewareHandler = async (context, next) => {
    const response = await loginRoute(context, next)
    if (response instanceof Response && response.status !== 200) {
      if (response.status === 400) {
        return context.json({ error: { code: 'VALIDATION_FAILED', message: '请输入邮箱与密码' } }, 400)
      }
      if (response.status === 401) {
        return context.json({ error: { code: 'INVALID_CREDENTIALS', message: '邮箱或密码不正确' } }, 401)
      }
      if (response.status === 403) {
        return context.json({ error: { code: 'FORBIDDEN', message: '账户已停用' } }, 403)
      }
    }
    return response
  }

  const requireAnyAuth: MiddlewareHandler = async (context, next) => {
    const result = await (auth.requireAnyAuth as MiddlewareHandler)(context, async () => {
      const user = (context as unknown as { get(key: string): { passwordChangeRequired?: boolean } }).get('currentUser')
      if (user.passwordChangeRequired && !['/api/auth/me', '/api/auth/password'].includes(context.req.path)) {
        context.json({ error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Change your temporary password before continuing' } }, 403)
        return
      }
      await next()
    })
    // 契约第 1 节：未认证或 Token 失效 → 401 UNAUTHENTICATED（统一错误模型）。
    // authkit 原生 401 为扁平形状，这里转换为契约错误模型；其余响应原样透传，
    // 保持 Hono compose 对中间件返回值的正常调度。
    if (result instanceof Response && result.status === 401) {
      return context.newResponse(JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: '未认证或凭证已失效' } }), 401)
    }
    return result
  }

  return { ...auth, requireAnyAuth, userStore, loginRoute: loginHandler }
}
