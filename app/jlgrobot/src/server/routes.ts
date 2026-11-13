import type { Hono } from 'hono'
import type { initializePlatform } from './platform/bootstrap'
import { registerEquipmentRoutes } from './routes/equipment'
import { registerFaultRoutes } from './routes/faults'
import { registerUpgradeRoutes } from './routes/upgrades'
import { registerWorkOrderRoutes } from './routes/work-orders'
import { registerHistoryRoutes } from './routes/history'

// 登录/SSO 等公开端点只在此注册；不得加入业务读写路由。
export function registerPublicRoutes(_app: Hono, _platform: Awaited<ReturnType<typeof initializePlatform>>) {}

// 业务路由在认证边界后注册；platform 包含已选模块的运行时资源。
export function registerProtectedRoutes(app: Hono, platform: Awaited<ReturnType<typeof initializePlatform>>) {
  registerEquipmentRoutes(app, platform.db)
  registerFaultRoutes(app, platform.db)
  registerUpgradeRoutes(app, platform.db)
  registerWorkOrderRoutes(app, platform.db)
  registerHistoryRoutes(app, platform.db)
}
