import { createAuditKit } from '@commonapp/auditkit'
import type { DbClient } from '@commonapp/dbkit'

// 工单操作事件类型（日志与时间线共用，技术契约 §2）。
export const OPERATION_EVENT_TYPES = [
  'TICKET_CREATED',
  'TICKET_ASSIGNMENT_ENTERED',
  'TICKET_ASSIGNED',
  'TICKET_TRANSFERRED',
  'TICKET_REPLIED',
  'TICKET_COMPLETED',
  'TICKET_CANCELLED',
  'TICKET_RATED',
] as const
export type OperationEventType = (typeof OPERATION_EVENT_TYPES)[number]

export type TimelineItem = {
  type: string
  operator: { id: number; fullName: string } | 'system'
  payload: Record<string, unknown>
  occurredAt: string
}

// OperationLog 端口：统一经 auditkit record 写入事件（传入业务事务 tx，与业务写同事务提交）。
export async function recordOperationEvent(
  db: DbClient,
  event: { type: OperationEventType; ticketId: number; actorUserId?: number; payload?: Record<string, unknown>; occurredAt: string },
): Promise<void> {
  await createAuditKit(db).record({
    type: event.type,
    occurredAt: event.occurredAt,
    actorUserId: event.actorUserId === undefined ? undefined : String(event.actorUserId),
    metadata: { ticketId: event.ticketId, ...(event.payload ?? {}) },
  })
}

// 工单时间线：按 metadata_json.ticketId 过滤、按 occurred_at 升序读取；回复类事件在 replies 展示，不进时间线。
export async function listTicketTimeline(db: DbClient, ticketId: number): Promise<TimelineItem[]> {
  const rows = await db.queryAll<{ occurredAt: string; type: string; actorUserId: string | null; metadataJson: string }>({
    text: `SELECT e.occurred_at AS occurredAt, e.event_type AS type, e.actor_user_id AS actorUserId, e.metadata_json AS metadataJson
      FROM audit_events e
      WHERE json_extract(e.metadata_json, '$.ticketId') = ? AND e.event_type <> 'TICKET_REPLIED'
      ORDER BY e.occurred_at ASC, e.rowid ASC`,
    params: [ticketId],
  })
  const operators = new Map<string, { id: number; fullName: string }>()
  for (const row of rows) {
    if (row.actorUserId !== null && !operators.has(row.actorUserId)) {
      const user = await db.queryOne<{ id: number; fullName: string }>({
        text: 'SELECT id, full_name AS fullName FROM users WHERE id = ?',
        params: [Number(row.actorUserId)],
      })
      operators.set(row.actorUserId, user ?? { id: Number(row.actorUserId), fullName: row.actorUserId })
    }
  }
  return rows.map((row) => ({
    type: row.type,
    operator: row.actorUserId === null ? 'system' : (operators.get(row.actorUserId) ?? 'system'),
    payload: JSON.parse(row.metadataJson) as Record<string, unknown>,
    occurredAt: row.occurredAt,
  }))
}
