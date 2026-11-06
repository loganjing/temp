import type { Hono } from 'hono'
import type { initializePlatform } from './platform/bootstrap'
import { registerPatrolRoutes } from './routes/patrol-routes'
import { registerVideoSourceRoutes } from './routes/video-sources'
import { registerEventRoutes } from './routes/events'
import { registerAlertRoutes } from './routes/alerts'
import { registerHandlingRoutes } from './routes/handling'
import { registerTrailRoutes } from './routes/trails'

type Platform = Awaited<ReturnType<typeof initializePlatform>>

// 登录/SSO 等公开端点只在此注册；不得加入业务读写路由。
export function registerPublicRoutes(app: Hono, platform: Platform) {
  registerPatrolRoutes(app, platform.db)
  registerVideoSourceRoutes(app, platform.db)
  registerEventRoutes(app, platform.db)
  registerAlertRoutes(app, platform.db)
  registerHandlingRoutes(app, platform.db)
  registerTrailRoutes(app, platform.db)
}

// 业务路由在认证边界后注册；platform 包含已选模块的运行时资源。
export function registerProtectedRoutes(_app: Hono, _platform: Platform) {}
