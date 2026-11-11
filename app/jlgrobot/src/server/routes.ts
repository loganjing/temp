import type { Hono } from 'hono'
import type { initializePlatform } from './platform/bootstrap'
import { registerEquipmentRoutes } from './routes/equipment'
import { registerStatusRoutes } from './routes/status'
import { registerFaultRoutes } from './routes/fault'
import { registerUpgradeRoutes } from './routes/upgrade'
import { registerWorkOrderRoutes } from './routes/workorder'

type Platform = Awaited<ReturnType<typeof initializePlatform>>

// 登录/SSO 等公开端点只在此注册；不得加入业务读写路由。
export function registerPublicRoutes(_app: Hono, _platform: Platform) {}

// 业务路由在认证边界后注册；platform 包含已选模块的运行时资源。
// 需求未规定权限策略，auth.ts 为 no-op 放行，业务路由可直接访问。
export function registerProtectedRoutes(app: Hono, platform: Platform) {
  const db = platform.db
  registerEquipmentRoutes(app, db)
  registerStatusRoutes(app, db)
  registerFaultRoutes(app, db)
  registerUpgradeRoutes(app, db)
  registerWorkOrderRoutes(app, db)
}
