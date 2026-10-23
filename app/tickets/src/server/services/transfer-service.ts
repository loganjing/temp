import type { DbClient } from '@commonapp/dbkit'
import type { AuditEvent } from '@commonapp/auditkit'

const now = () => new Date().toISOString()

export async function transferTicket(
  db: DbClient,
  auditKit: { record: (e: AuditEvent) => Promise<void> },
  params: {
    ticketId: number
    companyId: string
    fromUserId: number
    toGroupId?: number | null
    toUserId?: number | null
    reason: string
    actorId: string
    actorName: string
  },
): Promise<{ error?: string; result?: { ticketId: string; fromUserId: string; toGroupId: string | null; toUserId: string | null; reason: string; createdAt: string } }> {
  // Verify ticket exists and belongs to company
  const ticket = await db.queryOne<{ id: number; status: string; company_id: string }>({
    text: 'SELECT id, status, company_id FROM tickets WHERE id = ? AND company_id = ?',
    params: [params.ticketId, params.companyId],
  })
  if (!ticket) return { error: 'ticket_not_found' }

  // Validate targets: exactly one of toGroupId / toUserId
  const hasGroup = params.toGroupId != null
  const hasUser = params.toUserId != null
  if (hasGroup === hasUser) return { error: 'invalid_target' }

  // Verify target group belongs to company
  if (params.toGroupId) {
    const group = await db.queryOne<{ id: number }>({
      text: 'SELECT id FROM business_groups WHERE id = ? AND company_id = ?',
      params: [params.toGroupId, params.companyId],
    })
    if (!group) return { error: 'invalid_target' }
  }

  // Verify target user belongs to company
  if (params.toUserId) {
    const user = await db.queryOne<{ id: number }>({
      text: 'SELECT id FROM users WHERE id = ? AND company_id = ?',
      params: [params.toUserId, params.companyId],
    })
    if (!user) return { error: 'invalid_target' }
  }

  const ts = now()
  await db.run({
    text: `INSERT INTO ticket_transfers (ticket_id, from_user_id, to_group_id, to_user_id, reason, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
    params: [
      params.ticketId,
      params.fromUserId,
      params.toGroupId ?? null,
      params.toUserId ?? null,
      params.reason,
      ts,
    ],
  })

  // Update ticket: assign to new group/user if specified, keep status pending_processing
  if (params.toGroupId) {
    await db.run({ text: 'UPDATE tickets SET group_id = ? WHERE id = ?', params: [params.toGroupId, params.ticketId] })
  }
  if (params.toUserId) {
    await db.run({ text: 'UPDATE tickets SET handler_id = ? WHERE id = ?', params: [params.toUserId, params.ticketId] })
  }

  await auditKit.record({
    type: 'ticket:transfer',
    occurredAt: ts,
    actorUserId: params.actorId,
    metadata: {
      actorName: params.actorName,
      entityType: 'ticket',
      entityId: String(params.ticketId),
      fromUserId: String(params.fromUserId),
      toGroupId: params.toGroupId != null ? String(params.toGroupId) : null,
      toUserId: params.toUserId != null ? String(params.toUserId) : null,
      reason: params.reason,
    },
  })

  return {
    result: {
      ticketId: String(params.ticketId),
      fromUserId: String(params.fromUserId),
      toGroupId: params.toGroupId != null ? String(params.toGroupId) : null,
      toUserId: params.toUserId != null ? String(params.toUserId) : null,
      reason: params.reason,
      createdAt: ts,
    },
  }
}
