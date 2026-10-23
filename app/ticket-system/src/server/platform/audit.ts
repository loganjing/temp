import { createAuditKit, type AuditEvent } from '@commonapp/auditkit'
import type { DbClient } from '@commonapp/dbkit'
import { randomUUID } from 'node:crypto'

export function createAuditService(db: DbClient) {
  const kit = createAuditKit(db, { createId: () => randomUUID() })

  async function record(event: AuditEvent): Promise<void> {
    try {
      await kit.record(event)
    } catch (error) {
      console.error('[audit] record failed', error)
    }
  }

  async function recordTicketEvent(
    ticketId: string,
    action: string,
    actorId: string,
    actorName: string,
    details?: string | null,
  ): Promise<void> {
    await record({
      type: `ticket.${action}`,
      actorUserId: actorId,
      metadata: { ticketId, actorName, details: details ?? null },
    })
  }

  async function listByTicket(ticketId: string): Promise<Array<{
    id: string
    action: string
    actorId: string
    actorName: string
    details: string | null
    createdAt: string
  }>> {
    const rows = await db.queryAll<{
      id: string
      event_type: string
      actor_user_id: string
      occurred_at: string
      metadata_json: string
    }>({
      text: `SELECT id, event_type, actor_user_id, occurred_at, metadata_json
             FROM audit_events
             WHERE metadata_json LIKE ?
             ORDER BY occurred_at DESC, id DESC`,
      params: [`%"ticketId":"${ticketId}"%`],
    })
    return rows.map((row) => {
      const meta = safeParseJson(row.metadata_json)
      return {
        id: row.id,
        action: row.event_type,
        actorId: row.actor_user_id ?? '',
        actorName: (meta?.actorName as string) ?? '',
        details: (meta?.details as string | null) ?? null,
        createdAt: row.occurred_at,
      }
    })
  }

  return { record, recordTicketEvent, listByTicket }
}

function safeParseJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export type AuditService = ReturnType<typeof createAuditService>
