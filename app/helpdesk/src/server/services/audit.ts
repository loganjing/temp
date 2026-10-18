// Audit service: ticket activity log (project table) + configuration audit
// events (auditkit). Ticket activities follow the ticket visibility rules;
// config audit is admin-only (requirements §6.12 / AC-18).
import type { DbClient } from '@commonapp/dbkit'
import { createAuditKit } from '@commonapp/auditkit'
import type { ActivitySource, TicketStatus } from '../../shared/domain'
import type { ActivityRow } from '../core/rows'

export interface FieldChange {
  field: string
  oldValue: string
  newValue: string
}

export interface ActivityInput {
  ticketId: number
  actorId: number | null
  action: string
  fromStatus?: TicketStatus | null
  toStatus?: TicketStatus | null
  fieldChanges?: FieldChange[]
  remarkZh: string
  remarkEn: string
  source: ActivitySource
}

export function insertActivity(db: DbClient, input: ActivityInput, now: string): Promise<void> {
  return db
    .run({
      text: `INSERT INTO ticket_activities
        (ticket_id, actor_id, action, from_status, to_status, field_changes, remark_zh, remark_en, source, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        input.ticketId,
        input.actorId,
        input.action,
        input.fromStatus ?? null,
        input.toStatus ?? null,
        input.fieldChanges ? JSON.stringify(input.fieldChanges) : null,
        input.remarkZh,
        input.remarkEn,
        input.source,
        now,
      ],
    })
    .then(() => undefined)
}

export async function listActivities(db: DbClient, ticketId: number): Promise<ActivityRow[]> {
  return db.queryAll<ActivityRow>({
    text: 'SELECT * FROM ticket_activities WHERE ticket_id = ? ORDER BY created_at DESC, id DESC',
    params: [ticketId],
  })
}

export interface ConfigAuditInput {
  type: string
  actorId: number
  summaryZh: string
  summaryEn: string
  detail?: string
}

export function createConfigAudit(db: DbClient) {
  const kit = createAuditKit(db)
  return {
    async record(input: ConfigAuditInput): Promise<void> {
      await kit.record({
        type: input.type,
        actorUserId: String(input.actorId),
        channel: 'web',
        metadata: {
          summaryZh: input.summaryZh,
          summaryEn: input.summaryEn,
          detail: input.detail ?? '',
        },
      })
    },
    async list(options: { page: number; pageSize: number }): Promise<{
      items: Array<{
        id: string
        category: string
        actor: string
        summaryZh: string
        summaryEn: string
        detail: string
        createdAt: string
      }>
      total: number
    }> {
      const totalRow = await db.queryOne<{ total: number }>({
        text: 'SELECT COUNT(*) AS total FROM audit_events',
      })
      const events = await kit.list({
        limit: options.pageSize,
        offset: (options.page - 1) * options.pageSize,
      })
      return {
        items: events.map((event) => {
          const metadata = (event.metadata ?? {}) as Record<string, unknown>
          return {
            id: event.id,
            category: event.type,
            actor: event.actorUserId ?? '',
            summaryZh: String(metadata.summaryZh ?? ''),
            summaryEn: String(metadata.summaryEn ?? ''),
            detail: String(metadata.detail ?? ''),
            createdAt: event.occurredAt ?? '',
          }
        }),
        total: Number(totalRow?.total ?? 0),
      }
    },
  }
}

export type ConfigAudit = ReturnType<typeof createConfigAudit>
