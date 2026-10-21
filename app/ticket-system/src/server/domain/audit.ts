import { createAuditKit } from '@commonapp/auditkit'
import type { DbClient } from '@commonapp/dbkit'
import type { TicketAuditEvent } from './types'

// 工单域审计接线（契约第 8 节）：全部事件经 auditkit 持久化。
// 事件字段映射：type → event_type，actor_user_id → actor_user_id，created_at → occurred_at，
// ticket_id 与 detail 写入 metadata（audit_events 表由 auditkit 拥有，无工单列）。
// 事务内调用时传入 tx（createAuditKit 为无状态闭包，绑定 tx 即在当前事务内写入）。

export type TicketAuditEventType =
  | 'ticket_created'
  | 'ticket_auto_assigned'
  | 'ticket_manually_assigned'
  | 'ticket_transferred'
  | 'ticket_replied'
  | 'ticket_completed'
  | 'ticket_email_sent'
  | 'ticket_email_failed'
  | 'ticket_cancelled'
  | 'ticket_rated'

/** 邮箱脱敏：保留本地部分前两字符与域名（auditkit 仅按敏感键名脱敏，邮箱值需调用方处理）。 */
export function maskEmail(email: string): string {
  const at = email.indexOf('@')
  if (at <= 0) return '***'
  return `${email.slice(0, 2)}***${email.slice(at)}`
}

export async function recordTicketEvent(
  client: DbClient,
  event: { type: TicketAuditEventType; actorUserId: string; ticketId: number; detail?: Record<string, unknown> | null; occurredAt: string },
): Promise<void> {
  const audit = createAuditKit(client)
  await audit.record({
    type: event.type,
    actorUserId: event.actorUserId,
    occurredAt: event.occurredAt,
    metadata: { ticketId: event.ticketId, detail: event.detail ?? null },
  })
}

/** 工单操作日志（3.11）：按发生时间升序返回该工单的全部事件。 */
export async function listTicketEvents(client: DbClient, ticketId: number): Promise<TicketAuditEvent[]> {
  const rows = await client.queryAll<{
    id: number
    type: string
    actor_id: string | null
    actor_name: string | null
    created_at: string
    metadata_json: string
  }>({
    text: `SELECT e.rowid AS id, e.event_type AS type, e.actor_user_id AS actor_id, u.name AS actor_name,
                  e.occurred_at AS created_at, e.metadata_json AS metadata_json
           FROM audit_events e
           LEFT JOIN users u ON u.id = e.actor_user_id
           WHERE json_extract(e.metadata_json, '$.ticketId') = ?
           ORDER BY e.occurred_at ASC, e.rowid ASC`,
    params: [ticketId],
  })
  return rows.map((row) => {
    let metadata: { ticketId?: number; detail?: Record<string, unknown> | null } = {}
    try {
      metadata = JSON.parse(row.metadata_json ?? '{}')
    } catch {
      metadata = {}
    }
    return {
      id: Number(row.id),
      type: row.type,
      actor: row.actor_id ? { id: row.actor_id, name: row.actor_name ?? row.actor_id } : null,
      createdAt: row.created_at,
      ticketId: Number(metadata.ticketId ?? ticketId),
      detail: metadata.detail ?? null,
    }
  })
}
