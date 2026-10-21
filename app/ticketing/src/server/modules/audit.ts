import { randomUUID } from 'node:crypto'
import type { DbClient } from '@commonapp/dbkit'
import type { AuditAction, AuditEntry } from '../../shared/contracts'

interface AuditRow {
  id: string
  event_type: string
  occurred_at: string
  actor_user_id: string | null
  metadata_json: string
}

interface AuditMeta {
  ticketNo?: string
  operatorName?: string
  detail?: string | null
}

function parseMeta(json: string): AuditMeta {
  try {
    return JSON.parse(json) as AuditMeta
  } catch {
    return {}
  }
}

function mapAudit(row: AuditRow): AuditEntry {
  const meta = parseMeta(row.metadata_json)
  return {
    id: row.id,
    action: row.event_type as AuditAction,
    operator: { id: row.actor_user_id ?? '', name: meta.operatorName ?? '' },
    ticketNo: meta.ticketNo ?? '',
    detail: meta.detail ?? null,
    createdAt: row.occurred_at,
  }
}

export interface AuditEventInput {
  action: AuditAction
  actorId: string
  actorName: string
  ticketNo: string
  detail?: string | null
}

// 在业务事务内写入审计事件，与业务变更同事务提交（契约 §6）。
// 直接写 auditkit 管理的 audit_events 表，不修改其 schema。
export async function recordAudit(tx: DbClient, event: AuditEventInput): Promise<void> {
  await tx.run({
    text: 'INSERT INTO audit_events (id, occurred_at, event_type, actor_user_id, metadata_json) VALUES (?, ?, ?, ?, ?)',
    params: [
      randomUUID(),
      new Date().toISOString(),
      event.action,
      event.actorId,
      JSON.stringify({ ticketNo: event.ticketNo, operatorName: event.actorName, detail: event.detail ?? null }),
    ],
  })
}

export async function listTicketAudit(db: DbClient, ticketNo: string): Promise<AuditEntry[]> {
  const rows = await db.queryAll<AuditRow>({
    text: `SELECT id, event_type, occurred_at, actor_user_id, metadata_json
           FROM audit_events
           WHERE json_extract(metadata_json, '$.ticketNo') = ?
           ORDER BY occurred_at ASC, id ASC`,
    params: [ticketNo],
  })
  return rows.map(mapAudit)
}

export async function listCompanyAudit(
  db: DbClient,
  companyId: number,
  opts: { action?: string; ticketNo?: string; from?: string; to?: string } = {},
): Promise<AuditEntry[]> {
  const conditions = [
    'json_extract(a.metadata_json, \'$.ticketNo\') IN (SELECT ticket_no FROM tickets WHERE company_id = ?)',
  ]
  const params: unknown[] = [companyId]
  if (opts.action) {
    conditions.push('a.event_type = ?')
    params.push(opts.action)
  }
  if (opts.ticketNo) {
    conditions.push('json_extract(a.metadata_json, \'$.ticketNo\') = ?')
    params.push(opts.ticketNo)
  }
  if (opts.from) {
    conditions.push('a.occurred_at >= ?')
    params.push(opts.from)
  }
  if (opts.to) {
    conditions.push('a.occurred_at <= ?')
    params.push(opts.to)
  }
  const rows = await db.queryAll<AuditRow>({
    text: `SELECT a.id, a.event_type, a.occurred_at, a.actor_user_id, a.metadata_json
           FROM audit_events a
           WHERE ${conditions.join(' AND ')}
           ORDER BY a.occurred_at DESC, a.id DESC`,
    params,
  })
  return rows.map(mapAudit)
}
