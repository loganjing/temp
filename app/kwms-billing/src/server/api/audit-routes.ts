import type { Hono } from 'hono'
import { paginated, paginationOf, route } from '../common/http'
import { requirePermission, type Platform } from '../common/scope'
import { authorizationRegistry } from '../platform/authorization'
import { queryAuditEvents, queryChangeLogs } from '../services/auditlog'

// audit 域路由：业务审计事件与变更日志查询（audit:view）。
// GET /api/audit/events、GET /api/audit/change-logs，支持 entityType/entityId 过滤与分页。

export function registerAuditRoutes(app: Hono, platform: Platform) {
  app.get('/api/audit/events', requirePermission(platform, authorizationRegistry.permissions.auditView.key), route(async (context) => {
    const pagination = paginationOf(context)
    const result = await queryAuditEvents(platform.db, {
      entityType: context.req.query('entityType') || undefined,
      entityId: context.req.query('entityId') || undefined,
      limit: pagination.pageSize,
      offset: pagination.offset,
    })
    return context.json(paginated(result.items, result.total, pagination))
  }))

  app.get('/api/audit/change-logs', requirePermission(platform, authorizationRegistry.permissions.auditView.key), route(async (context) => {
    const pagination = paginationOf(context)
    const result = await queryChangeLogs(platform.db, {
      entityType: context.req.query('entityType') || undefined,
      entityId: context.req.query('entityId') || undefined,
      limit: pagination.pageSize,
      offset: pagination.offset,
    })
    return context.json(paginated(result.items, result.total, pagination))
  }))
}
