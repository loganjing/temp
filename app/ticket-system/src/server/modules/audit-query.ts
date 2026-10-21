/**
 * audit 模块对外查询：按工单与全局的日志查询（契约第 8 节）。
 * 事件写入在各业务模块经 auditkit.record 完成；本层只读 audit_events 并按公司过滤。
 */
import type { Hono } from 'hono'
import type { PlatformResources } from '../platform/bootstrap'
import { queryTicketLogs } from '../audit-log'
import { ApiError, currentProfile, optionalQueryInteger, pathId, resolveStatsScope, route } from '../http'
import { TICKET_COLUMNS, type TicketRow } from '../views'

export function registerAuditQueryRoutes(app: Hono, platform: PlatformResources): void {
  const { db } = platform

  // 契约 8.1：单工单日志（按时间升序）。
  app.get(
    '/api/tickets/:id/logs',
    route(async (context) => {
      const me = await currentProfile(db, context)
      const ticketId = pathId(context.req.param('id'))
      const ticket = await db.queryOne<TicketRow>({
        text: `SELECT ${TICKET_COLUMNS} FROM tickets WHERE id = ?`,
        params: [ticketId],
      })
      if (!ticket) throw new ApiError(404, 'NOT_FOUND', '工单不存在')
      if (ticket.company_id !== me.companyId && !me.crossCompanyView) {
        throw new ApiError(403, 'COMPANY_FORBIDDEN', '无权访问其他公司的工单')
      }
      const { items } = await queryTicketLogs(db, { ticketId, limit: 1000, offset: 0 })
      return context.json(items)
    }),
  )

  // 契约 8.2：全局日志查询（默认本公司事件；跨公司视角可跨公司查询）。
  app.get(
    '/api/logs',
    route(async (context) => {
      const me = await currentProfile(db, context)
      const scope = resolveStatsScope(context, me)
      const ticketId = optionalQueryInteger(context, 'ticketId') ?? undefined
      const action = context.req.query('action')
      const pageRaw = context.req.query('page')
      const pageSizeRaw = context.req.query('pageSize')
      const page = pageRaw === undefined || pageRaw === '' ? 1 : Number(pageRaw)
      const pageSize = pageSizeRaw === undefined || pageSizeRaw === '' ? 20 : Number(pageSizeRaw)
      if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'page 或 pageSize 取值不合法')
      }
      const companyId = scope === 'all' ? undefined : scope
      const { items, total } = await queryTicketLogs(db, {
        ticketId,
        companyId,
        action: action === '' || action === undefined ? undefined : action,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      })
      return context.json({ items, total, page, pageSize })
    }),
  )
}
