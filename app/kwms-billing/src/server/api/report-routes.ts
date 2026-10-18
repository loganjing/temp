import type { Hono } from 'hono'
import { errors } from '../common/errors'
import { route } from '../common/http'
import { currentUserOf, orgScopeOf, requirePermission, type Platform } from '../common/scope'
import { authorizationRegistry } from '../platform/authorization'
import { createReportsService } from '../services/reports'

// report 域路由：财务报表 xlsx 导出（report:export，finance 专属）。
// GET /api/reports/export?type=billing|recon|settlement&ownerId&warehouseId&periodStart&periodEnd

const REPORT_TYPES = ['billing', 'recon', 'settlement'] as const

export function registerReportRoutes(app: Hono, platform: Platform) {
  const reports = createReportsService(platform.db)

  app.get('/api/reports/export', requirePermission(platform, authorizationRegistry.permissions.reportExport.key), route(async (context) => {
    const user = currentUserOf(context)
    const type = context.req.query('type') ?? ''
    if (!REPORT_TYPES.includes(type as (typeof REPORT_TYPES)[number])) throw errors.invalidInput('报表类型不存在（billing|recon|settlement）', 'type')
    const result = await reports.exportReport(user, orgScopeOf(user), type, {
      ownerId: context.req.query('ownerId') || null,
      warehouseId: context.req.query('warehouseId') || null,
      periodStart: context.req.query('periodStart') || null,
      periodEnd: context.req.query('periodEnd') || null,
    })
    return new Response(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${result.filename}"`,
      },
    })
  }))
}
