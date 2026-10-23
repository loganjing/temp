import type { DbClient } from '@commonapp/dbkit'

interface AuditEventRow {
  id: string
  occurred_at: string
  event_type: string
  actor_user_id: string | null
  metadata_json: string
}

export async function listAuditLogs(
  db: DbClient,
  params: {
    ticketId?: string
    action?: string
    page: number
    pageSize: number
  },
): Promise<{
  items: {
    id: string
    actorId: string
    actorName: string
    action: string
    entityType: string
    entityId: string
    metadata: Record<string, unknown>
    createdAt: string
  }[]
  total: number
  page: number
  pageSize: number
}> {
  const conditions: string[] = []
  const values: unknown[] = []

  if (params.action) {
    conditions.push('event_type = ?')
    values.push(params.action)
  }
  if (params.ticketId) {
    // Filter by ticketId stored in metadata_json
    conditions.push("json_extract(metadata_json, '$.entityId') = ?")
    values.push(params.ticketId)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const offset = (params.page - 1) * params.pageSize

  const countRow = await db.queryOne<{ count: number }>({
    text: `SELECT COUNT(*) AS count FROM audit_events ${where}`,
    params: values,
  })
  const total = countRow?.count ?? 0

  const rows = await db.queryAll<AuditEventRow>({
    text: `SELECT id, occurred_at, event_type, actor_user_id, metadata_json
           FROM audit_events ${where}
           ORDER BY occurred_at DESC, id DESC
           LIMIT ? OFFSET ?`,
    params: [...values, params.pageSize, offset],
  })

  const items = rows.map((r) => {
    let metadata: Record<string, unknown> = {}
    try {
      metadata = JSON.parse(r.metadata_json)
    } catch {
      metadata = {}
    }
    return {
      id: r.id,
      actorId: r.actor_user_id ?? '',
      actorName: String(metadata.actorName ?? ''),
      action: r.event_type,
      entityType: String(metadata.entityType ?? ''),
      entityId: String(metadata.entityId ?? ''),
      metadata,
      createdAt: r.occurred_at,
    }
  })

  return { items, total, page: params.page, pageSize: params.pageSize }
}
