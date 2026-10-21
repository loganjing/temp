import type { MiddlewareHandler } from 'hono'
import type { DbClient } from '@commonapp/dbkit'
import { unauthenticated } from '../errors'
import { resolveSessionUser, type SessionUser } from '../services/identity'

export type AppEnv = { Variables: { user: SessionUser; token: string } }

// 认证边界：解析 Bearer 会话令牌（令牌哈希落库，7 天有效期），有效会话注入当前用户。
export function createAuthBoundary(db: DbClient): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const header = c.req.header('authorization') ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
    if (!/^[0-9a-f]{64}$/.test(token)) throw unauthenticated()
    const user = await resolveSessionUser(db, token)
    if (!user) throw unauthenticated()
    c.set('user', user)
    c.set('token', token)
    return next()
  }
}
