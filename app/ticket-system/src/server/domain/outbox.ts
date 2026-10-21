import type { Context, Hono } from 'hono'
import type { DbClient } from '@commonapp/dbkit'
import { currentAuthUser, parsePagination, requireCompanyContext } from './support'

// 通知域只读查询端点（契约第 5 节）：发件箱按本公司工单过滤，时间倒序。

export type OutboxItem = {
  outboxId: number
  ticketId: number | null
  ticketNo: string
  toEmail: string
  subject: string
  body: string
  channel: string
  status: string
  error: string | null
  createdAt: string
  sentAt: string | null
}

export type OutboxDeps = { db: DbClient }

type OutboxRow = {
  outbox_id: number
  ticket_id: number | null
  ticket_no: string
  to_email: string
  subject: string
  body: string
  channel: string
  status: string
  error: string | null
  created_at: string
  sent_at: string | null
}

const toOutboxItem = (row: OutboxRow): OutboxItem => ({
  outboxId: row.outbox_id,
  ticketId: row.ticket_id ?? null,
  ticketNo: row.ticket_no,
  toEmail: row.to_email,
  subject: row.subject,
  body: row.body,
  channel: row.channel,
  status: row.status,
  error: row.error ?? null,
  createdAt: row.created_at,
  sentAt: row.sent_at ?? null,
})

export function registerOutboxRoutes(app: Hono, deps: OutboxDeps) {
  app.get('/api/outbox', async (context: Context) => {
    const company = await requireCompanyContext(deps.db, currentAuthUser(context))
    const query = context.req.query()
    const { page, pageSize, offset } = parsePagination(query)

    const conditions = ['t.company_id = ?']
    const values: unknown[] = [company.companyId]
    const ticketFilter = query.ticketId
    if (ticketFilter !== undefined && ticketFilter !== '') {
      const ticketId = Number(ticketFilter)
      // 跨公司工单过滤返回空结果集（列表天然过滤）。
      if (!Number.isInteger(ticketId) || ticketId <= 0) {
        return context.json({ items: [] as OutboxItem[], total: 0, page, pageSize })
      }
      conditions.push('o.ticket_id = ?')
      values.push(ticketId)
    }
    const where = conditions.join(' AND ')
    const [rows, totalRow] = await Promise.all([
      deps.db.queryAll<OutboxRow>({
        text: `SELECT o.id AS outbox_id, o.ticket_id, o.ticket_no, o.to_email, o.subject, o.body,
                      o.channel, o.status, o.error, o.created_at, o.sent_at
               FROM email_outbox o JOIN tickets t ON t.id = o.ticket_id
               WHERE ${where}
               ORDER BY o.created_at DESC, o.id DESC LIMIT ? OFFSET ?`,
        params: [...values, pageSize, offset],
      }),
      deps.db.queryOne<{ total: number }>({
        text: `SELECT COUNT(*) AS total FROM email_outbox o JOIN tickets t ON t.id = o.ticket_id WHERE ${where}`,
        params: values,
      }),
    ])
    return context.json({ items: rows.map(toOutboxItem), total: Number(totalRow?.total ?? 0), page, pageSize })
  })
}
