import type { Hono } from 'hono'
import type { DbClient } from '@commonapp/dbkit'
import { apiError } from '../api-error'
import { optionalString, readJson, requireString } from '../request'
import { requireUser } from './organizations'
import { requireTicket, requireTicketRow } from './ticket-store'

// resolution：工单完成（记录处理人、处理时间）与取消（架构基线 2.2）。
// tickets.handler_id / handled_at / cancelled_at / status 的流转结果由本模块写入。

export function registerResolutionRoutes(app: Hono, db: DbClient) {
  app.post('/api/tickets/:id/complete', async (c) => {
    const body = await readJson(c)
    const operatorId = requireString(body, 'operatorId')
    const operator = await requireUser(db, operatorId, '操作者')
    const ticket = await requireTicketRow(db, c.req.param('id'))
    if (ticket.status !== 'pending_handling') throw apiError.invalidState('仅待处理工单可以完成')
    const handledAt = new Date().toISOString()
    await db.run({
      text: 'UPDATE tickets SET status = ?, handler_id = ?, handled_at = ?, updated_at = ? WHERE id = ?',
      params: ['completed', operator.id, handledAt, handledAt, ticket.id],
    })
    return c.json(await requireTicket(db, ticket.id))
  })

  app.post('/api/tickets/:id/cancel', async (c) => {
    const body = await readJson(c)
    const operatorId = requireString(body, 'operatorId')
    // 取消原因不必填；当前 schema 无取消原因列，仅校验类型，不持久化。
    optionalString(body, 'note')
    await requireUser(db, operatorId, '操作者')
    const ticket = await requireTicketRow(db, c.req.param('id'))
    if (ticket.status === 'completed' || ticket.status === 'cancelled') {
      throw apiError.invalidState('已完成或已取消的工单不能取消')
    }
    const cancelledAt = new Date().toISOString()
    await db.run({
      text: 'UPDATE tickets SET status = ?, cancelled_at = ?, updated_at = ? WHERE id = ?',
      params: ['cancelled', cancelledAt, cancelledAt, ticket.id],
    })
    return c.json(await requireTicket(db, ticket.id))
  })
}
