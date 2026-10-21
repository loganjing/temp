import type { DbClient } from '@commonapp/dbkit'
import type { createAuditKit } from '@commonapp/auditkit'

// 审计域：经 auditkit.record 记录工单关键操作与配置变更（契约第 6 节事件集合）。
// 事件公共字段放在 metadata：ticketId、ticketNo、operatorId、operatorName、detail。

export type AuditKit = ReturnType<typeof createAuditKit>

export type AuditActor = { userId: string; userNo: number; userName: string }

export type AuditEventInput = {
  type: string
  ticketId?: number | null
  ticketNo?: string | null
  detail: string
  extra?: Record<string, unknown>
}

export type AuditRecorder = (event: AuditEventInput) => Promise<void>

export function createAuditRecorder(audit: AuditKit, actor: AuditActor, now: () => string): AuditRecorder {
  return async (event) => {
    const metadata: Record<string, unknown> = {
      ticketId: event.ticketId ?? null,
      ticketNo: event.ticketNo ?? null,
      operatorId: actor.userNo,
      operatorName: actor.userName,
      detail: event.detail,
      ...event.extra,
    }
    await audit.record({
      type: event.type,
      occurredAt: now(),
      actorUserId: actor.userId,
      channel: 'web',
      metadata,
    })
  }
}

export type AuditEventView = {
  eventId: number
  action: string
  ticketId: number | null
  ticketNo: string | null
  operatorId: number | null
  operatorName: string
  detail: string
  occurredAt: string
}

type AuditRow = { event_id: number; event_type: string; occurred_at: string; metadata_json: string }

const toNumber = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)
const toString = (value: unknown): string | null => (typeof value === 'string' ? value : null)

export function mapAuditEvent(row: AuditRow): AuditEventView {
  const meta = JSON.parse(row.metadata_json ?? '{}') as Record<string, unknown>
  return {
    eventId: row.event_id,
    action: row.event_type,
    ticketId: toNumber(meta.ticketId),
    ticketNo: toString(meta.ticketNo),
    operatorId: toNumber(meta.operatorId),
    operatorName: typeof meta.operatorName === 'string' ? meta.operatorName : '',
    detail: typeof meta.detail === 'string' ? meta.detail : '',
    occurredAt: row.occurred_at,
  }
}

// 单工单操作日志：时间正序。
export async function queryTicketAuditEvents(db: DbClient, ticketId: number): Promise<AuditEventView[]> {
  const rows = await db.queryAll<AuditRow>({
    text: `SELECT rowid AS event_id, event_type, occurred_at, metadata_json
           FROM audit_events
           WHERE CAST(json_extract(metadata_json, '$.ticketId') AS INTEGER) = ?
           ORDER BY occurred_at ASC, rowid ASC`,
    params: [ticketId],
  })
  return rows.map(mapAuditEvent)
}

// 本公司操作日志：按操作人所属公司过滤，时间倒序。
export async function queryCompanyAuditEvents(
  db: DbClient,
  companyId: number,
  limit: number,
  offset: number,
): Promise<{ items: AuditEventView[]; total: number }> {
  const join = 'JOIN users u ON u.id = a.actor_user_id'
  const filter = `WHERE CAST(u.company_id AS INTEGER) = ?`
  const [rows, totalRow] = await Promise.all([
    db.queryAll<AuditRow>({
      text: `SELECT a.rowid AS event_id, a.event_type, a.occurred_at, a.metadata_json
             FROM audit_events a ${join} ${filter}
             ORDER BY a.occurred_at DESC, a.rowid DESC LIMIT ? OFFSET ?`,
      params: [companyId, limit, offset],
    }),
    db.queryOne<{ total: number }>({
      text: `SELECT COUNT(*) AS total FROM audit_events a ${join} ${filter}`,
      params: [companyId],
    }),
  ])
  return { items: rows.map(mapAuditEvent), total: Number(totalRow?.total ?? 0) }
}
