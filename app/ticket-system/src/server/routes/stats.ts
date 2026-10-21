import type { Context, Hono } from 'hono'
import type { initializePlatform } from '../platform/bootstrap'
import { contextUser, wrap } from '../http'
import { loadSession, requireRole } from '../session'
import { dashboardStats, distributionStats } from '../services/stats'
import { requireEnum } from '../validation'

type Platform = Awaited<ReturnType<typeof initializePlatform>>

/** stats 域（契约 §7）：分布统计与运营仪表盘，仅 admin/viewer。 */

export function registerStatsRoutes(app: Hono, platform: Platform) {
  const viewerOf = async (c: Context) => requireRole(await loadSession(platform.db, contextUser(c)), 'admin', 'viewer')

  app.get('/api/stats/distribution', wrap(async (c) => {
    await viewerOf(c)
    const raw = c.req.query('dimension') ?? ''
    const dimension = raw === '' ? 'company' : requireEnum(raw, 'dimension', ['company', 'department'] as const)
    return c.json(await distributionStats(platform.db, dimension))
  }))

  app.get('/api/stats/dashboard', wrap(async (c) => {
    await viewerOf(c)
    return c.json(await dashboardStats(platform.db))
  }))
}
