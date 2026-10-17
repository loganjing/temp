import type { Hono } from 'hono'
import type { DbClient } from '@commonapp/dbkit'
import type { TicketTransfer } from '../../shared/contract'
import { apiError } from '../api-error'
import { newId } from '../ids'
import { optionalString, readJson, requireString } from '../request'
import { findMemberGroupId, requireGroup, requireUser } from './organizations'
import { requireTicket, requireTicketRow } from './ticket-store'

// collaboration：待处理工单的转派（架构基线 2.2）。
// 独占 ticket_transfers 表；转派后 tickets.assigned_group_id 的归属变更由本模块写入。

interface TransferRow {
  id: string
  ticket_id: string
  from_group_id: string | null
  to_group_id: string | null
  to_user_id: string | null
  operator_id: string
  note: string | null
  created_at: string
}

function toTransfer(row: TransferRow): TicketTransfer {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    fromGroupId: row.from_group_id,
    toGroupId: row.to_group_id,
    toUserId: row.to_user_id,
    operatorId: row.operator_id,
    note: row.note,
    createdAt: row.created_at,
  }
}

export async function listTicketTransfers(db: DbClient, ticketId: string): Promise<TicketTransfer[]> {
  const rows = await db.queryAll<TransferRow>({
    text: 'SELECT id, ticket_id, from_group_id, to_group_id, to_user_id, operator_id, note, created_at FROM ticket_transfers WHERE ticket_id = ? ORDER BY created_at ASC',
    params: [ticketId],
  })
  return rows.map(toTransfer)
}

export function registerCollaborationRoutes(app: Hono, db: DbClient) {
  app.post('/api/tickets/:id/transfer', async (c) => {
    const body = await readJson(c)
    const operatorId = requireString(body, 'operatorId')
    const toGroupId = optionalString(body, 'toGroupId')
    const toUserId = optionalString(body, 'toUserId')
    const note = optionalString(body, 'note')
    const operator = await requireUser(db, operatorId, '操作者')
    const ticket = await requireTicketRow(db, c.req.param('id'))
    if (ticket.status !== 'pending_handling') throw apiError.invalidState('仅待处理工单可以转派')

    let targetGroupId: string | null = null
    if (toGroupId) {
      const group = await requireGroup(db, toGroupId)
      if (group.company_id !== ticket.company_id) throw apiError.validation('转派目标业务组须属于工单所属公司')
      targetGroupId = group.id
    }
    if (toUserId) {
      const user = await requireUser(db, toUserId, '转派目标成员')
      if (user.company_id !== ticket.company_id) throw apiError.validation('转派目标成员须属于工单所属公司')
      // 转派给成员时以其所属业务组为归属组。
      if (!targetGroupId) {
        const memberGroupId = await findMemberGroupId(db, user.id, ticket.company_id)
        if (!memberGroupId) throw apiError.validation('转派目标成员不属于该公司任何业务组')
        targetGroupId = memberGroupId
      }
    }
    if (!targetGroupId) throw apiError.validation('转派目标业务组或成员至少填写一项')

    const transferId = newId()
    const createdAt = new Date().toISOString()
    await db.transaction(async (tx) => {
      await tx.run({
        text: 'INSERT INTO ticket_transfers (id, ticket_id, from_group_id, to_group_id, to_user_id, operator_id, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        params: [transferId, ticket.id, ticket.assigned_group_id, targetGroupId, toUserId, operator.id, note, createdAt],
      })
      await tx.run({
        text: 'UPDATE tickets SET assigned_group_id = ?, updated_at = ? WHERE id = ?',
        params: [targetGroupId, createdAt, ticket.id],
      })
    })
    const transfer: TicketTransfer = {
      id: transferId,
      ticketId: ticket.id,
      fromGroupId: ticket.assigned_group_id,
      toGroupId: targetGroupId,
      toUserId,
      operatorId: operator.id,
      note,
      createdAt,
    }
    return c.json({ ticket: await requireTicket(db, ticket.id), transfer })
  })
}
