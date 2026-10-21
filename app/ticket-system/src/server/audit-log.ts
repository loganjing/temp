/**
 * 工单关键操作审计：写入经 auditkit.record，载荷携带工单 ID、公司与中文操作摘要；
 * 查询按 metadata 聚合过滤（auditkit list 不支持按实体过滤，由本层补充，见架构基线 2.3）。
 */
import type { DbClient } from '@commonapp/dbkit'
import { loadUserBriefsByPlatformIds, type UserBrief } from './views'

/** auditkit record 的最小接口。 */
export interface AuditRecorder {
  record(event: {
    type: string
    occurredAt?: string
    actorUserId?: string
    metadata?: Record<string, unknown>
  }): Promise<void>
}

/** 契约 1.2 LogEntry.action 取值。 */
export type TicketAuditAction =
  | 'ticket_created'
  | 'ticket_assigned'
  | 'ticket_replied'
  | 'ticket_transferred'
  | 'ticket_completed'
  | 'ticket_cancelled'
  | 'ticket_rated'
  | 'notification_failed'

export interface TicketAuditEvent {
  action: TicketAuditAction
  actorPlatformUserId?: string | null
  ticketId?: number | null
  companyId?: number | null
  /** 中文操作摘要（契约 LogEntry.detail）。 */
  detail: string
  extra?: Record<string, unknown>
}

export async function recordTicketAudit(audit: AuditRecorder, event: TicketAuditEvent): Promise<void> {
  await audit.record({
    type: event.action,
    actorUserId: event.actorPlatformUserId ?? undefined,
    metadata: {
      ticketId: event.ticketId ?? null,
      companyId: event.companyId ?? null,
      detail: event.detail,
      ...(event.extra ?? {}),
    },
  })
}

/** 契约 1.2 LogEntry。 */
export interface LogEntryDto {
  id: number
  action: string
  actor: UserBrief | 'system'
  createdAt: string
  ticketId: number | null
  detail: string
}

interface AuditEventRow {
  row_id: number
  occurred_at: string
  event_type: string
  actor_user_id: string | null
  metadata_json: string
}

export interface TicketLogQuery {
  ticketId?: number
  companyId?: number
  action?: string
  limit: number
  offset: number
}

export async function queryTicketLogs(db: DbClient, query: TicketLogQuery): Promise<{ items: LogEntryDto[]; total: number }> {
  const conditions: string[] = []
  const params: unknown[] = []
  if (query.ticketId !== undefined) {
    conditions.push("json_extract(metadata_json, '$.ticketId') = ?")
    params.push(query.ticketId)
  }
  if (query.companyId !== undefined) {
    conditions.push("json_extract(metadata_json, '$.companyId') = ?")
    params.push(query.companyId)
  }
  if (query.action) {
    conditions.push('event_type = ?')
    params.push(query.action)
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const total = await db.queryOne<{ total: number }>({
    text: `SELECT COUNT(*) AS total FROM audit_events ${where}`,
    params,
  })
  const rows = await db.queryAll<AuditEventRow>({
    text: `SELECT rowid AS row_id, occurred_at, event_type, actor_user_id, metadata_json FROM audit_events ${where} ORDER BY occurred_at ASC, rowid ASC LIMIT ? OFFSET ?`,
    params: [...params, query.limit, query.offset],
  })
  const actorIds = [...new Set(rows.map((row) => row.actor_user_id).filter((id): id is string => id !== null))]
  const actors = await loadUserBriefsByPlatformIds(db, actorIds)
  const items = rows.map((row) => {
    const metadata = JSON.parse(row.metadata_json ?? '{}') as {
      ticketId?: number | null
      detail?: string
    }
    const actor = row.actor_user_id === null ? undefined : actors.get(row.actor_user_id)
    return {
      id: row.row_id,
      action: row.event_type,
      actor: actor ?? ('system' as const),
      createdAt: row.occurred_at,
      ticketId: metadata.ticketId ?? null,
      detail: metadata.detail ?? '',
    }
  })
  return { items, total: Number(total?.total ?? 0) }
}
