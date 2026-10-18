/**
 * parameters 域：版本化参数（面积口径/成本套餐/政策/费用项/选项列表）（契约第 11 节 / AC-14）。
 */
import type { Hono } from 'hono'
import type { Platform } from '../platform/bootstrap'
import { newId } from '../platform/authorization'
import { errors, readJsonBody, requiredString, optionalString, optionalJsonObject, optionalEnum, currentActor, pagination, pagedResponse } from '../lib/api'
import { auditEvent, nowIso, requirePermission, type DomainRoutes, type Row } from '../lib/db'

export const PARAMETER_KINDS = ['area-convention', 'cost-package', 'policy', 'fee-item', 'option-list'] as const

function mapParameter(row: Row) {
  return {
    id: String(row.id),
    kind: String(row.kind),
    region: row.region === null ? null : String(row.region),
    version: Number(row.version),
    effectiveAt: String(row.effective_at),
    createdBy: String(row.created_by),
    scope: row.scope_json === null ? null : JSON.parse(String(row.scope_json)),
    content: row.content_json === null ? null : JSON.parse(String(row.content_json)),
    changeNote: String(row.change_note),
    createdAt: String(row.created_at),
  }
}

/** 默认取当前生效版本（effectiveAt <= now 的最新 version）；传 effectiveAt 返回该时点版本。 */
export async function currentParameter(db: Platform['db'], kind: string, region: string | null, effectiveAt: string): Promise<Row | null> {
  if (region) {
    const byState = await db.queryOne<Row>({
      text: 'SELECT * FROM parameter_sets WHERE kind = ? AND region = ? AND effective_at <= ? ORDER BY effective_at DESC, version DESC LIMIT 1',
      params: [kind, region, effectiveAt],
    })
    if (byState) return byState
  }
  return db.queryOne<Row>({
    text: 'SELECT * FROM parameter_sets WHERE kind = ? AND region IS NULL AND effective_at <= ? ORDER BY effective_at DESC, version DESC LIMIT 1',
    params: [kind, effectiveAt],
  })
}

export const registerParameterRoutes: DomainRoutes = (app, platform) => {
  app.get('/api/parameters', async (context) => {
    const { page, pageSize, offset } = pagination(context)
    const filters: string[] = ['1 = 1']
    const params: unknown[] = []
    const kind = context.req.query('kind')
    const region = context.req.query('region')
    const effectiveAt = context.req.query('effectiveAt')
    if (kind) {
      filters.push('kind = ?')
      params.push(kind)
    }
    if (region) {
      filters.push('region = ?')
      params.push(region)
    }
    const at = effectiveAt ?? nowIso()
    filters.push('effective_at <= ?')
    params.push(at)
    const rows = await platform.db.queryAll<Row>({
      text: `SELECT * FROM parameter_sets WHERE ${filters.join(' AND ')} ORDER BY kind, COALESCE(region, ''), effective_at DESC, version DESC LIMIT ? OFFSET ?`,
      params: [...params, pageSize, offset],
    })
    const total = await platform.db.queryOne<Row>({ text: `SELECT COUNT(*) AS total FROM parameter_sets WHERE ${filters.join(' AND ')}`, params })
    return context.json(pagedResponse(rows.map(mapParameter), Number(total?.total ?? 0), page, pageSize))
  })

  app.get('/api/parameters/:id', async (context) => {
    const row = await platform.db.queryOne<Row>({ text: 'SELECT * FROM parameter_sets WHERE id = ?', params: [context.req.param('id')] })
    if (!row) throw errors.notFound('Parameter not found')
    return context.json(mapParameter(row))
  })

  app.post('/api/parameters', async (context) => {
    await requirePermission(context, platform, 'parameters:manage')
    const actor = currentActor(context)
    const body = await readJsonBody(context)
    const kind = requiredString(body.kind, 'kind', 60)
    if (!(PARAMETER_KINDS as readonly string[]).includes(kind)) {
      throw errors.validationFailed([{ field: 'kind', reason: `must be one of ${PARAMETER_KINDS.join(' | ')}` }])
    }
    const region = optionalString(body.region, 'region', 100)
    const effectiveAt = requiredString(body.effectiveAt, 'effectiveAt', 40)
    if (Number.isNaN(Date.parse(effectiveAt))) {
      throw errors.validationFailed([{ field: 'effectiveAt', reason: 'must be an ISO 8601 datetime' }])
    }
    const changeNote = requiredString(body.changeNote, 'changeNote')
    const scope = optionalJsonObject(body.scope, 'scope')
    const content = optionalJsonObject(body.content, 'content')
    if (!content) throw errors.validationFailed([{ field: 'content', reason: 'is required' }])
    const versionRow = await platform.db.queryOne<Row>({
      text: 'SELECT MAX(version) AS version FROM parameter_sets WHERE kind = ? AND (region = ? OR (region IS NULL AND ? IS NULL))',
      params: [kind, region, region],
    })
    const version = Number(versionRow?.version ?? 0) + 1
    const id = newId('prm')
    const timestamp = nowIso()
    await platform.db.run({
      text: 'INSERT INTO parameter_sets (id, kind, region, version, effective_at, created_by, scope_json, content_json, change_note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      params: [id, kind, region, version, effectiveAt, actor.id, scope === null ? '{}' : JSON.stringify(scope), JSON.stringify(content), changeNote, timestamp],
    })
    await auditEvent(platform, {
      type: 'parameter.published',
      actorUserId: actor.id,
      objectType: 'parameter',
      objectId: id,
      summary: `发布 ${kind}${region ? `@${region}` : ''} v${version}（生效 ${effectiveAt}）：${changeNote}`,
      metadata: { kind, region, version, effectiveAt, scope },
    })
    const row = await platform.db.queryOne<Row>({ text: 'SELECT * FROM parameter_sets WHERE id = ?', params: [id] })
    return context.json(mapParameter(row!), 201)
  })
}
