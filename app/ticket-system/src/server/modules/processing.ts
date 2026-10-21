/**
 * processing 模块：接单、转派、完成处理（契约第 5 节）。
 * 完成事务提交后同步发送提交人邮箱通知；发送失败不回滚完成状态（架构基线第 4 节）。
 */
import type { Hono } from 'hono'
import type { PlatformResources } from '../platform/bootstrap'
import { recordTicketAudit } from '../audit-log'
import { sendTicketCompletionEmail } from '../notification'
import { ApiError, currentProfile, pathId, route } from '../http'
import { assembleTickets, TICKET_COLUMNS, type TicketRow } from '../views'

async function loadTicket(db: PlatformResources['db'], ticketId: number): Promise<TicketRow> {
  const row = await db.queryOne<TicketRow>({
    text: `SELECT ${TICKET_COLUMNS} FROM tickets WHERE id = ?`,
    params: [ticketId],
  })
  if (!row) throw new ApiError(404, 'NOT_FOUND', '工单不存在')
  return row
}

function assertTicketCompany(ticket: TicketRow, companyId: number): void {
  if (ticket.company_id !== companyId) throw new ApiError(403, 'COMPANY_FORBIDDEN', '无权访问其他公司的工单')
}

export function registerProcessingRoutes(app: Hono, platform: PlatformResources): void {
  const { db, audit, email } = platform

  // 契约 5.1：接单（确立处理责任）。
  app.post(
    '/api/tickets/:id/claim',
    route(async (context) => {
      const me = await currentProfile(db, context)
      const ticket = await loadTicket(db, pathId(context.req.param('id')))
      assertTicketCompany(ticket, me.companyId)
      if (ticket.status !== 'pending_processing') throw new ApiError(409, 'STATE_CONFLICT', '工单状态不允许接单')
      if (ticket.current_assignee_id !== null) throw new ApiError(409, 'STATE_CONFLICT', '工单已被处理人接单')
      const claimed = await db.transaction(async (tx) => {
        const row = await tx.queryOne<TicketRow>({
          text: `UPDATE tickets SET current_assignee_id = ?, updated_at = ? WHERE id = ? AND current_assignee_id IS NULL AND status = 'pending_processing' RETURNING ${TICKET_COLUMNS}`,
          params: [me.profileId, new Date().toISOString(), ticket.id],
        })
        if (!row) throw new ApiError(409, 'STATE_CONFLICT', '工单已被处理人接单')
        return row
      })
      const [dto] = await assembleTickets(db, [claimed])
      return context.json(dto)
    }),
  )

  // 契约 5.2：转派（处理责任转移；仅当前处理人可操作）。
  app.post(
    '/api/tickets/:id/transfer',
    route(async (context) => {
      const me = await currentProfile(db, context)
      const ticket = await loadTicket(db, pathId(context.req.param('id')))
      assertTicketCompany(ticket, me.companyId)
      if (ticket.status !== 'pending_processing') throw new ApiError(409, 'STATE_CONFLICT', '工单状态不允许转派')
      if (ticket.current_assignee_id !== me.profileId) {
        throw new ApiError(403, 'NOT_ASSIGNEE', '仅当前处理人可转派')
      }
      const body = (await context.req.json().catch(() => ({}))) as Record<string, unknown>
      const targetUserId =
        typeof body.targetUserId === 'number' && Number.isInteger(body.targetUserId) && body.targetUserId > 0
          ? body.targetUserId
          : null
      if (targetUserId === null) throw new ApiError(400, 'VALIDATION_ERROR', 'targetUserId 需为正整数')
      if (targetUserId === me.profileId) throw new ApiError(400, 'VALIDATION_ERROR', '转派目标不能是当前处理人本人')
      const target = await db.queryOne<{ id: number; display_name: string }>({
        text: 'SELECT id, display_name FROM user_profiles WHERE id = ? AND company_id = ?',
        params: [targetUserId, me.companyId],
      })
      if (!target) throw new ApiError(400, 'VALIDATION_ERROR', '转派目标必须是本公司其他用户')
      const transferred = await db.transaction(async (tx) => {
        const row = await tx.queryOne<TicketRow>({
          text: `UPDATE tickets SET current_assignee_id = ?, updated_at = ? WHERE id = ? AND current_assignee_id = ? AND status = 'pending_processing' RETURNING ${TICKET_COLUMNS}`,
          params: [targetUserId, new Date().toISOString(), ticket.id, me.profileId],
        })
        if (!row) throw new ApiError(409, 'STATE_CONFLICT', '工单状态不允许转派')
        await recordTicketAudit(audit, {
          action: 'ticket_transferred',
          actorPlatformUserId: me.platformUserId,
          ticketId: ticket.id,
          companyId: ticket.company_id,
          detail: `将工单 #${ticket.id} 转派给 ${target.display_name}`,
          extra: { fromUserId: me.profileId, toUserId: targetUserId },
        })
        return row
      })
      const [dto] = await assembleTickets(db, [transferred])
      return context.json(dto)
    }),
  )

  // 契约 5.3：完成处理（未接单时完成隐含接单；事务提交后发送通知）。
  app.post(
    '/api/tickets/:id/complete',
    route(async (context) => {
      const me = await currentProfile(db, context)
      const ticket = await loadTicket(db, pathId(context.req.param('id')))
      assertTicketCompany(ticket, me.companyId)
      if (ticket.status !== 'pending_processing') throw new ApiError(409, 'STATE_CONFLICT', '工单状态不允许完成')
      if (ticket.current_assignee_id !== null && ticket.current_assignee_id !== me.profileId) {
        throw new ApiError(403, 'NOT_ASSIGNEE', '仅当前处理人可完成')
      }
      const body = (await context.req.json().catch(() => ({}))) as Record<string, unknown>
      let resolution: string | null = null
      if (body.resolution !== undefined && body.resolution !== null) {
        if (typeof body.resolution !== 'string' || body.resolution.length > 5000) {
          throw new ApiError(400, 'VALIDATION_ERROR', '处理说明需为不超过 5000 字符的文本')
        }
        resolution = body.resolution.trim() === '' ? null : body.resolution
      }
      const completed = await db.transaction(async (tx) => {
        const now = new Date().toISOString()
        const row = await tx.queryOne<TicketRow>({
          text: `UPDATE tickets SET current_assignee_id = COALESCE(current_assignee_id, ?), completed_by = ?, completed_at = ?, status = 'completed', updated_at = ?
                 WHERE id = ? AND status = 'pending_processing' RETURNING ${TICKET_COLUMNS}`,
          params: [me.profileId, me.profileId, now, now, ticket.id],
        })
        if (!row) throw new ApiError(409, 'STATE_CONFLICT', '工单状态不允许完成')
        await recordTicketAudit(audit, {
          action: 'ticket_completed',
          actorPlatformUserId: me.platformUserId,
          ticketId: ticket.id,
          companyId: ticket.company_id,
          detail: `完成工单 #${ticket.id}${resolution ? `：${resolution}` : ''}`,
          extra: resolution ? { resolution } : undefined,
        })
        return row
      })
      const [dto] = await assembleTickets(db, [completed])
      // 通知是尽力而为的外部动作：失败不回滚完成状态，记录审计事件。
      const notification = dto.submitter
        ? await sendTicketCompletionEmail(email, audit, completed, dto.submitter)
        : { sent: false, error: '提交人档案缺失，无法发送通知' }
      return context.json({ ticket: dto, notification })
    }),
  )
}
