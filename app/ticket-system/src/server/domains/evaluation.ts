import type { Hono } from 'hono'
import type { DbClient } from '@commonapp/dbkit'
import type { TicketEvaluation } from '../../shared/contract'
import { apiError } from '../api-error'
import { newId } from '../ids'
import { optionalString, readJson, requireRating, requireString } from '../request'
import { requireUser } from './organizations'
import { requireTicketRow } from './ticket-store'

// evaluation：工单完成后的满意度评价（架构基线 2.2）。
// 独占 ticket_evaluations 表；每工单一条（UNIQUE），允许覆盖更新（AD-4）。

interface EvaluationRow {
  id: string
  ticket_id: string
  rating: number
  comment: string | null
  created_at: string
  updated_at: string
}

function toEvaluation(row: EvaluationRow): TicketEvaluation {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function findTicketEvaluation(db: DbClient, ticketId: string): Promise<TicketEvaluation | null> {
  const row = await db.queryOne<EvaluationRow>({
    text: 'SELECT id, ticket_id, rating, comment, created_at, updated_at FROM ticket_evaluations WHERE ticket_id = ?',
    params: [ticketId],
  })
  return row ? toEvaluation(row) : null
}

export function registerEvaluationRoutes(app: Hono, db: DbClient) {
  app.put('/api/tickets/:id/evaluation', async (c) => {
    const body = await readJson(c)
    const operatorId = requireString(body, 'operatorId')
    const rating = requireRating(body)
    const comment = optionalString(body, 'comment')
    const operator = await requireUser(db, operatorId, '操作者')
    const ticket = await requireTicketRow(db, c.req.param('id'))
    if (ticket.status !== 'completed') throw apiError.invalidState('工单完成后才能评价')
    if (ticket.submitter_id !== operator.id) throw apiError.conflict('仅工单提交人可以评价')
    const existing = await db.queryOne<{ id: string; created_at: string }>({
      text: 'SELECT id, created_at FROM ticket_evaluations WHERE ticket_id = ?',
      params: [ticket.id],
    })
    const updatedAt = new Date().toISOString()
    if (existing) {
      await db.run({
        text: 'UPDATE ticket_evaluations SET rating = ?, comment = ?, updated_at = ? WHERE id = ?',
        params: [rating, comment, updatedAt, existing.id],
      })
      return c.json({ id: existing.id, ticketId: ticket.id, rating, comment, createdAt: existing.created_at, updatedAt })
    }
    const id = newId()
    await db.run({
      text: 'INSERT INTO ticket_evaluations (id, ticket_id, rating, comment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      params: [id, ticket.id, rating, comment, updatedAt, updatedAt],
    })
    return c.json({ id, ticketId: ticket.id, rating, comment, createdAt: updatedAt, updatedAt })
  })
}
