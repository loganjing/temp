import type { Hono } from 'hono'
import type { initializePlatform } from './platform/bootstrap'
import { registerProtectedAuthRoutes, registerPublicAuthRoutes } from './routes/auth'
import { registerOrgRoutes } from './routes/org'
import { registerStatsRoutes } from './routes/stats'
import { registerTicketRoutes } from './routes/tickets'
import { registerUserRoutes } from './routes/users'

type Platform = Awaited<ReturnType<typeof initializePlatform>>

/** 公开路由：登录、冷启动引导与平台 SSO 入口。 */
export function registerPublicRoutes(app: Hono, platform: Platform) {
  registerPublicAuthRoutes(app, platform)
}

/** 受保护路由：认证（index.ts 的 protect 中间件）之后按领域注册。 */
export function registerProtectedRoutes(app: Hono, platform: Platform) {
  registerProtectedAuthRoutes(app, platform)
  registerUserRoutes(app, platform)
  registerOrgRoutes(app, platform)
  registerTicketRoutes(app, platform)
  registerStatsRoutes(app, platform)
}
