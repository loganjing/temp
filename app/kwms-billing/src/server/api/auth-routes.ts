import type { Hono } from 'hono'
import { errors } from '../common/errors'
import { jsonBody, route } from '../common/http'
import { currentUserOf, type Platform } from '../common/scope'

// auth 域路由（技术契约第 3 节）：登录 / 登出 / 当前会话。
// 登录在路由层自实现（authkit loginRoute 失败响应形状 {error:"message"} 与契约 {error:{code,message}} 不一致）。

export function registerPublicAuthRoutes(app: Hono, platform: Platform) {
  // POST /api/auth/login {username,password} → {token,user:{id,username,name,orgId,roles}}
  // username 即登录名（本地身份存储于 users.email）；兼容脚手架 client 的 email 字段名。
  app.post('/api/auth/login', platform.auth.loginRateLimit, route(async (context) => {
    const body = await jsonBody(context)
    const identifierRaw = body.username ?? body.email
    if (typeof identifierRaw !== 'string' || !identifierRaw.trim()) throw errors.required('username')
    const identifier = identifierRaw.trim().toLowerCase()
    if (identifier.length > 320) throw errors.invalidInput('username 长度超限', 'username')
    if (typeof body.password !== 'string' || !body.password) throw errors.required('password')
    if (body.password.length > 256) throw errors.invalidInput('password 长度超限', 'password')

    const user = await platform.auth.userStore.findByCredential(identifier, 'email')
    if (!user) throw errors.unauthenticated()
    if (!user.enabled) throw errors.unauthenticated('账号已停用，请联系系统管理员')
    if (!platform.auth.verifyPassword(body.password, user.passwordHash)) throw errors.unauthenticated()

    const roles = await platform.permissionKit.getRoles(user.id)
    await platform.auditKit.record({ type: 'platform.user.login', actorUserId: user.id, metadata: { channel: 'web', username: identifier } })
    return context.json({
      token: platform.auth.signToken(user.id),
      user: {
        id: user.id,
        username: user.email,
        name: user.name,
        orgId: user.companyId,
        roles,
        passwordChangeRequired: user.passwordChangeRequired,
      },
    })
  }))
}

export function registerProtectedAuthRoutes(app: Hono, platform: Platform) {
  // GET /api/auth/me → {user:{...}, permissions:[...]}
  app.get('/api/auth/me', route(async (context) => {
    const user = currentUserOf(context)
    const authorizationContext = await platform.permissionKit.loadAuthorizationContext(user.id)
    return context.json({
      user: {
        id: user.id,
        username: user.email,
        name: user.name,
        orgId: user.companyId,
        roles: user.roles,
        passwordChangeRequired: user.passwordChangeRequired,
      },
      permissions: authorizationContext.permissions,
    })
  }))

  // POST /api/auth/logout：幂等 200。JWT 无状态令牌，服务端不设黑名单表（策略点），
  // 客户端丢弃令牌即登出；审计记录退出事件。
  app.post('/api/auth/logout', route(async (context) => {
    const user = currentUserOf(context)
    await platform.auditKit.record({ type: 'platform.user.logout', actorUserId: user.id })
    return context.json({ ok: true })
  }))
}
