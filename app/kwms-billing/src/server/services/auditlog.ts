import type { DbClient } from '@commonapp/dbkit'
import { newId, nowIso } from '../common/billno'

// audit 域公开服务：各业务域经本模块写入业务变更日志（change_logs）与审计事件（auditkit）。
// 变更类日志含前后值与原因；合同修改日志含前后单价、优惠区间、计费规则。

export type ChangeType = '编辑' | '重算' | '调整' | '审核' | '开票' | '核销'
export type AuditAction = '新增' | '编辑' | '审核' | '重算' | '开票' | '核销' | '终止'

export interface ChangeLogEntry {
  entityType: string
  entityId: string
  changeType: ChangeType
  before?: unknown
  after?: unknown
  reason?: string | null
  operatorId: string
}

export async function writeChangeLog(db: DbClient, entry: ChangeLogEntry): Promise<void> {
  await db.run({
    text: 'INSERT INTO change_logs (id, entity_type, entity_id, change_type, before_json, after_json, reason, operator_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    params: [
      newId(),
      entry.entityType,
      entry.entityId,
      entry.changeType,
      entry.before === undefined ? null : JSON.stringify(entry.before),
      entry.after === undefined ? null : JSON.stringify(entry.after),
      entry.reason ?? null,
      entry.operatorId,
      nowIso(),
    ],
  })
}

export interface ChangeLogRow {
  id: string
  changeType: ChangeType
  before: unknown
  after: unknown
  reason: string | null
  operatorName: string | null
  operatedAt: string
  entityType: string
  entityId: string
}

export async function queryChangeLogs(db: DbClient, options: { entityType?: string; entityId?: string; limit: number; offset: number }): Promise<{ items: ChangeLogRow[]; total: number }> {
  const conditions: string[] = []
  const params: unknown[] = []
  if (options.entityType) {
    conditions.push('cl.entity_type = ?')
    params.push(options.entityType)
  }
  if (options.entityId) {
    conditions.push('cl.entity_id = ?')
    params.push(options.entityId)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const total = await db.queryOne<{ total: number }>({
    text: `SELECT COUNT(*) AS total FROM change_logs cl ${where}`,
    params,
  })
  const rows = await db.queryAll<{
    id: string
    entity_type: string
    entity_id: string
    change_type: string
    before_json: string | null
    after_json: string | null
    reason: string | null
    operator_name: string | null
    created_at: string
  }>({
    text: `SELECT cl.id, cl.entity_type, cl.entity_id, cl.change_type, cl.before_json, cl.after_json, cl.reason, cl.operator_id, cl.created_at, u.name AS operator_name
           FROM change_logs cl LEFT JOIN users u ON u.id = cl.operator_id
           ${where}
           ORDER BY cl.created_at DESC, cl.id DESC
           LIMIT ? OFFSET ?`,
    params: [...params, options.limit, options.offset],
  })
  return {
    items: rows.map((row) => ({
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      changeType: row.change_type as ChangeType,
      before: row.before_json ? JSON.parse(row.before_json) : null,
      after: row.after_json ? JSON.parse(row.after_json) : null,
      reason: row.reason ?? null,
      operatorName: row.operator_name ?? null,
      operatedAt: row.created_at,
    })),
    total: Number(total?.total ?? 0),
  }
}

// 业务审计事件（auditkit 承载）：type 统一 business.<entityType>.<action>，metadata 携带查询字段
export interface AuditEventKit {
  record(event: { type: string; actorUserId?: string; metadata?: Record<string, unknown> }): Promise<void>
}

export async function recordAuditEvent(auditKit: AuditEventKit, entry: {
  action: AuditAction
  entityType: string
  entityId: string
  actorUserId: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  await auditKit.record({
    type: `business.${entry.entityType}.${entry.action}`,
    actorUserId: entry.actorUserId,
    metadata: { action: entry.action, entityType: entry.entityType, entityId: entry.entityId, ...entry.metadata },
  })
}

export interface AuditEventRow {
  id: string
  operatorName: string | null
  operatedAt: string
  action: string
  entityType: string
  entityId: string
}

export async function queryAuditEvents(db: DbClient, options: { entityType?: string; entityId?: string; limit: number; offset: number }): Promise<{ items: AuditEventRow[]; total: number }> {
  const conditions = ["event_type LIKE 'business.%'"]
  const params: unknown[] = []
  if (options.entityType) {
    conditions.push("json_extract(metadata_json, '$.entityType') = ?")
    params.push(options.entityType)
  }
  if (options.entityId) {
    conditions.push("json_extract(metadata_json, '$.entityId') = ?")
    params.push(options.entityId)
  }
  const where = `WHERE ${conditions.join(' AND ')}`
  const total = await db.queryOne<{ total: number }>({ text: `SELECT COUNT(*) AS total FROM audit_events ${where}`, params })
  const rows = await db.queryAll<{
    id: string
    occurred_at: string
    actor_user_id: string | null
    metadata_json: string | null
    operator_name: string | null
  }>({
    text: `SELECT e.id, e.occurred_at, e.actor_user_id, e.metadata_json, u.name AS operator_name
           FROM audit_events e LEFT JOIN users u ON u.id = e.actor_user_id
           ${where}
           ORDER BY e.occurred_at DESC, e.id DESC
           LIMIT ? OFFSET ?`,
    params: [...params, options.limit, options.offset],
  })
  return {
    items: rows.map((row) => {
      const metadata = JSON.parse(row.metadata_json ?? '{}') as { action?: string; entityType?: string; entityId?: string }
      return {
        id: row.id,
        operatorName: row.operator_name ?? null,
        operatedAt: row.occurred_at,
        action: metadata.action ?? '',
        entityType: metadata.entityType ?? '',
        entityId: metadata.entityId ?? '',
      }
    }),
    total: Number(total?.total ?? 0),
  }
}
