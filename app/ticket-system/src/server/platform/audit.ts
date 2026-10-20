import { createAuditKit } from '@commonapp/auditkit'
import type { DbClient } from '@commonapp/dbkit'
import { validationFailed } from '../api-error'

// 契约第 9.1 节动作枚举（写入侧统一）。
export const AUDIT_ACTIONS = [
  'ticket.created',
  'ticket.auto_assigned',
  'ticket.assigned',
  'ticket.transferred',
  'ticket.replied',
  'ticket.completed',
  'ticket.cancelled',
  'ticket.rated',
  'email.notification_sent',
  'email.notification_failed',
] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number]

export type AuditEventInput = {
  action: AuditAction
  actorUserId: string
  actorName: string
  ticketId?: number | null
  companyId?: number | null
  details?: Record<string, unknown>
}

export type AuditListQuery = {
  ticketId?: number | null
  companyId?: number | null
  action?: string | null
  page: number
  pageSize: number
}

type AuditRow = {
  id: string
  occurred_at: string
  event_type: string
  actor_user_id: string | null
  metadata_json: string
}

type AuditMetadata = {
  actor_name?: unknown
  ticket_id?: unknown
  company_id?: unknown
  details?: unknown
}

// 审计写入经 auditkit；业务事务内传 tx（与主连接同库同事务），
// 事务外传 db。检索按 metadata 中记录的 ticket_id/company_id 过滤。
export function createAuditService(db: DbClient) {
  const record = async (executor: DbClient, event: AuditEventInput): Promise<void> => {
    await createAuditKit(executor).record({
      type: event.action,
      actorUserId: event.actorUserId,
      occurredAt: new Date().toISOString(),
      metadata: {
        actor_name: event.actorName,
        ticket_id: event.ticketId ?? null,
        company_id: event.companyId ?? null,
        details: event.details ?? {},
      },
    })
  }

  const list = async (query: AuditListQuery) => {
    const conditions: string[] = []
    const params: unknown[] = []
    if (query.action != null && query.action !== '') {
      conditions.push('event_type = ?')
      params.push(query.action)
    }
    if (query.ticketId != null) {
      conditions.push("json_extract(metadata_json, '$.ticket_id') = ?")
      params.push(query.ticketId)
    }
    if (query.companyId != null) {
      conditions.push("json_extract(metadata_json, '$.company_id') = ?")
      params.push(query.companyId)
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const offset = (query.page - 1) * query.pageSize
    const [rows, totalRow] = await Promise.all([
      db.queryAll<AuditRow>({
        text: `SELECT id, occurred_at, event_type, actor_user_id, metadata_json FROM audit_events ${where} ORDER BY occurred_at DESC, id DESC LIMIT ? OFFSET ?`,
        params: [...params, query.pageSize, offset],
      }),
      db.queryOne<{ total: number }>({ text: `SELECT COUNT(*) AS total FROM audit_events ${where}`, params }),
    ])
    const items = rows.map((row) => {
      const metadata: AuditMetadata = JSON.parse(row.metadata_json ?? '{}')
      const toId = (value: unknown): number | null => (typeof value === 'number' ? value : null)
      return {
        id: row.id,
        action: row.event_type,
        actor_user_id: row.actor_user_id,
        actor_name: typeof metadata.actor_name === 'string' ? metadata.actor_name : null,
        occurred_at: row.occurred_at,
        ticket_id: toId(metadata.ticket_id),
        company_id: toId(metadata.company_id),
        details: (metadata.details && typeof metadata.details === 'object' ? metadata.details : {}) as Record<string, unknown>,
      }
    })
    return { items, page: query.page, page_size: query.pageSize, total: totalRow?.total ?? 0 }
  }

  return { record, list }
}

export type AuditService = ReturnType<typeof createAuditService>

// 审计检索的分页参数解析（复用列表分页约定）。
// 参数源兼容 URLSearchParams 与 Hono req.query() 的 Record 形态。
type QuerySource = { get(name: string): string | undefined | null }
export const parseAuditPagination = (query: QuerySource) => {
  const page = Math.max(1, Math.trunc(Number(query.get('page') ?? '1')) || 1)
  const pageSize = Math.min(100, Math.max(1, Math.trunc(Number(query.get('page_size') ?? '20')) || 20))
  return { page, pageSize }
}

export const parseOptionalId = (query: QuerySource, name: string): number | null => {
  const raw = query.get(name)
  if (raw == null || raw === '') return null
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1) throw validationFailed(`${name} 必须为正整数`)
  return value
}
