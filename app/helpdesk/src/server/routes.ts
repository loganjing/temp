import type { Hono } from 'hono'
import type { AppEnv } from './core/session'
import type { Platform } from './platform/bootstrap'
import { registerAuthPublicRoutes, registerAuthRoutes } from './routes/auth'
import { registerAttachmentRoutes } from './routes/attachments'
import { registerAuditRoutes } from './routes/audit'
import { registerCatalogRoutes } from './routes/catalog'
import { registerDashboardRoutes } from './routes/dashboard'
import { registerEmbedRoutes } from './routes/embed'
import { registerMcpRoutes } from './routes/mcp'
import { registerOrgRoutes } from './routes/org'
import { registerSlaRoutes } from './routes/sla'
import { registerTicketRoutes } from './routes/tickets'

// 公开区只注册浏览器登录与 MCP 端点；MCP 自带 x-lingee-code 认证，不复用 Bearer。
export function registerPublicRoutes(app: Hono<AppEnv>, platform: Platform): void {
  registerAuthPublicRoutes(app, platform)
  registerMcpRoutes(app, platform)
}

// 认证边界之后的全部业务路由。
export function registerProtectedRoutes(app: Hono<AppEnv>, platform: Platform): void {
  registerAuthRoutes(app, platform)
  registerTicketRoutes(app, platform)
  registerOrgRoutes(app, platform)
  registerCatalogRoutes(app, platform)
  registerSlaRoutes(app, platform)
  registerDashboardRoutes(app, platform)
  registerAuditRoutes(app, platform)
  registerEmbedRoutes(app, platform)
  registerAttachmentRoutes(app, platform)
}
