// Dashboard routes (contract §8): role-scoped summary KPIs and breakdown.
import type { Hono } from 'hono'
import { requestLocale, requireSession, type AppEnv } from '../core/session'
import { dashboardBreakdown, dashboardSummary } from '../core/stats'
import type { Platform } from '../platform/bootstrap'

export function registerDashboardRoutes(app: Hono<AppEnv>, platform: Platform): void {
  const db = platform.db

  app.get('/api/dashboard/summary', async (c) => {
    const user = requireSession(c)
    return c.json(await dashboardSummary(db, user))
  })

  app.get('/api/dashboard/breakdown', async (c) => {
    const user = requireSession(c)
    return c.json(await dashboardBreakdown(db, user, c.req.query('dimension'), requestLocale(c)))
  })
}
