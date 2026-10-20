import { createAuth } from '@commonapp/authkit'
import type { AuthEnv } from '@commonapp/authkit'
import { createUserResolver, createUserStore } from '@commonapp/userkit'
import type { AuthUser } from '@commonapp/userkit'
import type { DbClient } from '@commonapp/dbkit'
import type { Context, MiddlewareHandler } from 'hono'
import type { LoginResponse } from '../../shared/contracts'

/** 请求级当前用户：authkit requireAnyAuth 写入 Variables.currentUser。 */
export type CurrentUser = AuthUser

/** 业务路由使用的 Hono 环境类型（提供 currentUser）。 */
export type AppEnv = AuthEnv<CurrentUser>

export interface ApplicationAuth {
  requireAnyAuth: MiddlewareHandler<AppEnv>
  loginRateLimit: MiddlewareHandler<AppEnv>
  signToken: (userId: string) => string
  verifyPassword: (password: string, stored: string) => boolean
  loginHandler: (c: Context<AppEnv>) => Promise<Response>
}

// 固定哑哈希：用户不存在时执行同代价密码校验，避免用户存在性时序差异。
const DUMMY_HASH =
  '08f03a74ece3123f46ff06e53bc995e1:d7e814da5f31ac7203e0f7a9222b7dab549cd02ac1bcd3670821abee2a4e1516ba3b5c65d38668f119cd11818553e3740b1b18a697ecd3fb12569ccc73f69c36'

/**
 * 装配认证边界：authkit（token 签发/校验、登录限流、密码哈希）+ userkit
 * （用户表）+ 项目 user_profiles（角色/部门）。
 * 登录错误码按契约 §2.1：401 invalid_credentials / 401 account_disabled。
 */
export function createApplicationAuth(db: DbClient): ApplicationAuth {
  const userStore = createUserStore(db)
  const userResolver = createUserResolver(userStore, {
    getRoles: async (userId) => {
      const profile = await db.queryOne<{ role: string }>({
        text: 'SELECT role FROM user_profiles WHERE user_id = ?',
        params: [userId],
      })
      return profile ? [profile.role] : []
    },
  })
  const auth = createAuth({ userResolver })

  const loginHandler = async (c: Context<AppEnv>): Promise<Response> => {
    const body: unknown = await c.req.json().catch(() => null)
    const email =
      typeof (body as { email?: unknown } | null)?.email === 'string'
        ? (body as { email: string }).email.trim().toLowerCase()
        : ''
    const password =
      typeof (body as { password?: unknown } | null)?.password === 'string'
        ? (body as { password: string }).password
        : ''
    if (!email || !password) {
      return c.json({ error: 'invalid_request' }, 400)
    }
    const record = await userStore.findByField('email', email)
    if (!record) {
      auth.verifyPassword(password, DUMMY_HASH)
      return c.json({ error: 'invalid_credentials' }, 401)
    }
    if (!auth.verifyPassword(password, record.passwordHash)) {
      return c.json({ error: 'invalid_credentials' }, 401)
    }
    if (!record.enabled) {
      return c.json({ error: 'account_disabled' }, 401)
    }
    const profile = await db.queryOne<{ role: string; department: string | null }>({
      text: 'SELECT role, department FROM user_profiles WHERE user_id = ?',
      params: [record.id],
    })
    const response: LoginResponse = {
      token: auth.signToken(record.id),
      user: {
        id: record.id,
        name: record.name,
        email: record.email,
        role: profile?.role ?? 'user',
        companyId: record.companyId,
        department: profile?.department ?? null,
        status: record.enabled ? 'active' : 'disabled',
      },
    }
    return c.json(response, 200)
  }

  return {
    requireAnyAuth: auth.requireAnyAuth,
    loginRateLimit: auth.loginRateLimit,
    signToken: auth.signToken,
    verifyPassword: auth.verifyPassword,
    loginHandler,
  }
}
