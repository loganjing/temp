import type { DbClient } from '@commonapp/dbkit'
import type { AuditEventRecord, Page } from '../../shared/contracts'

export type AuditKit = { record(event: { type: string; occurredAt?: string; actorUserId?: string; metadata?: Record<string, unknown> }): Promise<void> }

export type AuditQuery = {
  companyId: string
  objectType?: string
  objectId?: string
  actorMemberId?: string
  action?: string
  from?: string
  to?: string
  limit: number
  offset: number
}

export type AuditEntry = {
  action: string
  actorMemberId: string
  objectType: string
  objectId: string
  companyId: string
  details?: Record<string, unknown>
}

function buildWhere(query: AuditQuery): { where: string; params: unknown[] } {
  const conditions = ["json_extract(a.metadata_json, '$.companyId') = ?"]
  const params: unknown[] = [query.companyId]
  if (query.action) { conditions.push('a.event_type = ?'); params.push(query.action) }
  if (query.actorMemberId) { conditions.push('a.actor_user_id = ?'); params.push(query.actorMemberId) }
  if (query.objectType) { conditions.push("json_extract(a.metadata_json, '$.objectType') = ?"); params.push(query.objectType) }
  if (query.objectId) { conditions.push("json_extract(a.metadata_json, '$.objectId') = ?"); params.push(query.objectId) }
  if (query.from) { conditions.push('a.occurred_at >= ?'); params.push(query.from) }
  if (query.to) { conditions.push('a.occurred_at <= ?'); params.push(query.to) }
  return { where: conditions.join(' AND '), params }
}

/**
 * audit-trail：业务事件经 auditkit 写入平台事件存储，读取时按公司范围与业务字段过滤。
 * 事件写入失败只记录可诊断错误，不影响业务写操作结果。
 */
export function createAuditTrail(db: DbClient, auditKit: AuditKit) {
  return {
    async record(entry: AuditEntry): Promise<void> {
      try {
        await auditKit.record({
          type: entry.action,
          occurredAt: new Date().toISOString(),
          actorUserId: entry.actorMemberId,
          metadata: { companyId: entry.companyId, objectType: entry.objectType, objectId: entry.objectId, details: entry.details ?? null },
        })
      } catch (error) {
        console.error(`[audit] failed to record ${entry.action} for ${entry.objectType}:${entry.objectId}`, error)
      }
    },

    async list(query: AuditQuery): Promise<Page<AuditEventRecord>> {
      const { where, params } = buildWhere(query)
      const [rows, count] = await Promise.all([
        db.queryAll<{ id: string; event_type: string; actor_user_id: string | null; occurred_at: string; metadata_json: string; actor_name: string | null }>({
          text: `SELECT a.id, a.event_type, a.actor_user_id, a.occurred_at, a.metadata_json, m.display_name AS actor_name
                 FROM audit_events a
                 LEFT JOIN company_members m ON m.id = a.actor_user_id
                 WHERE ${where}
                 ORDER BY a.occurred_at DESC, a.id DESC
                 LIMIT ? OFFSET ?`,
          params: [...params, query.limit, query.offset],
        }),
        db.queryOne<{ total: number }>({ text: `SELECT COUNT(*) AS total FROM audit_events a WHERE ${where}`, params }),
      ])
      const items = rows.map((row) => {
        let metadata: Record<string, unknown> = {}
        try { metadata = JSON.parse(row.metadata_json) as Record<string, unknown> } catch { metadata = {} }
        const details = metadata.details && typeof metadata.details === 'object' && !Array.isArray(metadata.details)
          ? metadata.details as Record<string, unknown>
          : {}
        return {
          id: row.id,
          action: row.event_type,
          objectType: typeof metadata.objectType === 'string' ? metadata.objectType : '',
          objectId: typeof metadata.objectId === 'string' ? metadata.objectId : '',
          actorMemberId: row.actor_user_id ?? '',
          actorName: row.actor_name,
          occurredAt: row.occurred_at,
          details,
        }
      })
      return { items, total: Number(count?.total ?? 0), page: Math.floor(query.offset / query.limit) + 1, pageSize: query.limit }
    },
  }
}

export type AuditTrail = ReturnType<typeof createAuditTrail>
