import type { Context, Hono } from 'hono'
import type { DbClient } from '@commonapp/dbkit'
import { queryCompanyAuditEvents, queryTicketAuditEvents } from './audit'
import {
  currentAuthUser,
  forbiddenCompany,
  parsePagination,
  requireCompanyContext,
  ticketNotFound,
} from './support'

export type LogDeps = { db: DbClient }

// 审计域查询端点（契约第 6 节）。
export function registerLogRoutes(app: Hono, deps: LogDeps) {
  // 单工单操作日志：时间正序。跨公司日志明细按契约第 0 节返回 403。
  app.get('/api/tickets/:ticketId/logs', async (context: Context) => {
    const company = await requireCompanyContext(deps.db, currentAuthUser(context))
    const ticketId = Number(context.req.param('ticketId'))
    if (!Number.isInteger(ticketId) || ticketId <= 0) throw ticketNotFound()
    const ticket = await deps.db.queryOne<{ id: number; company_id: number }>({
      text: 'SELECT id, company_id FROM tickets WHERE id = ?',
      params: [ticketId],
    })
    if (!ticket) throw ticketNotFound()
    if (ticket.company_id !== company.companyId) throw forbiddenCompany()
    const events = await queryTicketAuditEvents(deps.db, ticketId)
    return context.json({ items: events })
  })

  // 本公司操作日志：按操作人所属公司过滤，时间倒序。
  app.get('/api/logs', async (context: Context) => {
    const company = await requireCompanyContext(deps.db, currentAuthUser(context))
    const { page, pageSize, offset } = parsePagination(context.req.query())
    const { items, total } = await queryCompanyAuditEvents(deps.db, company.companyId, pageSize, offset)
    return context.json({ items, total, page, pageSize })
  })
}
