import type { Hono } from 'hono'
import type { initializePlatform } from './platform/bootstrap'
import { registerAssignmentRoutes } from './domains/assignment'
import { registerCollaborationRoutes } from './domains/collaboration'
import { registerEvaluationRoutes } from './domains/evaluation'
import { registerOrganizationsRoutes } from './domains/organizations'
import { registerResolutionRoutes } from './domains/resolution'
import { registerTicketingRoutes } from './domains/ticketing'

// 登录/SSO 等公开端点只在此注册；不得加入业务读写路由。
export function registerPublicRoutes(_app: Hono, _platform: Awaited<ReturnType<typeof initializePlatform>>) {}

// 业务路由在认证边界后注册；platform 包含已选模块的运行时资源。
// 工单系统不引入认证基础设施（AD-1），全部 /api/* 业务端点按 technical-contract.md 注册。
export function registerProtectedRoutes(app: Hono, platform: Awaited<ReturnType<typeof initializePlatform>>) {
  const db = platform.db
  registerOrganizationsRoutes(app, db)
  registerAssignmentRoutes(app, db)
  registerTicketingRoutes(app, db)
  registerCollaborationRoutes(app, db)
  registerResolutionRoutes(app, db)
  registerEvaluationRoutes(app, db)
}
