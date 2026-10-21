/**
 * rating 模块：提交人对已完成工单的满意度评价（契约第 6 节，一单一条）。
 */
import type { Hono } from 'hono'
import { isTicketRatingScore } from '../../shared/domain'
import type { PlatformResources } from '../platform/bootstrap'
import { recordTicketAudit } from '../audit-log'
import { ApiError, currentProfile, isUniqueViolation, pathId, route } from '../http'
import { TICKET_COLUMNS, type TicketRow } from '../views'

interface RatingRow {
  ticket_id: number
  rater_user_id: number
  score: number
  created_at: string
}

export function registerRatingRoutes(app: Hono, platform: PlatformResources): void {
  const { db, audit } = platform

  // 契约 6.1：提交人评分（1-5；工单完成后且未评价）。
  app.post(
    '/api/tickets/:id/rating',
    route(async (context) => {
      const me = await currentProfile(db, context)
      const ticketId = pathId(context.req.param('id'))
      const ticket = await db.queryOne<TicketRow>({
        text: `SELECT ${TICKET_COLUMNS} FROM tickets WHERE id = ?`,
        params: [ticketId],
      })
      if (!ticket) throw new ApiError(404, 'NOT_FOUND', '工单不存在')
      if (ticket.company_id !== me.companyId) throw new ApiError(403, 'COMPANY_FORBIDDEN', '无权访问其他公司的工单')
      if (ticket.submitter_user_id !== me.profileId) throw new ApiError(403, 'NOT_SUBMITTER', '仅提交人可评价')
      if (ticket.status !== 'completed') throw new ApiError(409, 'STATE_CONFLICT', '工单完成后才能评价')
      const body = (await context.req.json().catch(() => ({}))) as Record<string, unknown>
      if (!isTicketRatingScore(body.score)) throw new ApiError(400, 'VALIDATION_ERROR', '评分需为 1-5 的整数')
      const existing = await db.queryOne<{ id: number }>({
        text: 'SELECT id FROM ticket_ratings WHERE ticket_id = ?',
        params: [ticketId],
      })
      if (existing) throw new ApiError(409, 'STATE_CONFLICT', '该工单已评价')
      const score = body.score
      let created: RatingRow
      try {
        created = await db.transaction(async (tx) => {
          const row = await tx.queryOne<RatingRow>({
            text: 'INSERT INTO ticket_ratings (ticket_id, rater_user_id, score, created_at) VALUES (?, ?, ?, ?) RETURNING ticket_id, rater_user_id, score, created_at',
            params: [ticketId, me.profileId, score, new Date().toISOString()],
          })
          if (!row) throw new ApiError(500, 'INTERNAL_ERROR', '评价写入失败')
          await recordTicketAudit(audit, {
            action: 'ticket_rated',
            actorPlatformUserId: me.platformUserId,
            ticketId,
            companyId: ticket.company_id,
            detail: `对工单 #${ticketId} 评分 ${score} 分`,
          })
          return row
        })
      } catch (error) {
        if (isUniqueViolation(error)) throw new ApiError(409, 'STATE_CONFLICT', '该工单已评价')
        throw error
      }
      return context.json({ ticketId: created.ticket_id, score: created.score, createdAt: created.created_at }, 201)
    }),
  )
}
