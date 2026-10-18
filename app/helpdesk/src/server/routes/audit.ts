// Configuration audit log route (contract §10): admin only, paginated.
import type { Hono } from 'hono'
import type { AppEnv } from '../core/session'
import type { Platform } from '../platform/bootstrap'
import { pageParam, requireAdmin } from './helpers'

const AUDIT_PAGE_SIZE = 20

export function registerAuditRoutes(app: Hono<AppEnv>, platform: Platform): void {
  app.get('/api/admin/audit-logs', async (c) => {
    requireAdmin(c)
    const page = pageParam(c)
    const result = await platform.configAudit.list({ page, pageSize: AUDIT_PAGE_SIZE })
    return c.json({ items: result.items, page, pageSize: AUDIT_PAGE_SIZE, total: result.total })
  })
}
