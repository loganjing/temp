/**
 * parcel 域：台账列表/新建/详情/更新、状态机留痕、受限删除、审计查询（契约第 2 节）。
 */
import type { Hono } from 'hono'
import type { Platform } from '../platform/bootstrap'
import { newId } from '../platform/authorization'
import { errors, readJsonBody, requiredString, optionalString, decimalInput, optionalEnum, optionalInt, currentActor, pagination, pagedResponse } from '../lib/api'
import { auditEvent, loadParcel, loadPlan, nowIso, parseJsonColumn, requirePermission, type DomainRoutes, type Row } from '../lib/db'
import { dec } from '../engine/decimal'

export const PARCEL_STATUSES = ['processing', 'in_review', 'completed', 'abandoned'] as const
type ParcelStatus = (typeof PARCEL_STATUSES)[number]

/** 契约状态机：processing→in_review|abandoned；in_review→processing|completed；completed→processing；abandoned 终态。 */
const ALLOWED_TRANSITIONS: Record<ParcelStatus, readonly ParcelStatus[]> = {
  processing: ['in_review', 'abandoned'],
  in_review: ['processing', 'completed'],
  completed: ['processing'],
  abandoned: [],
}

type SummaryRow = { gdv: string | null; tdc: string | null; pbt: string | null; pm: string | null; sourcePlanId: string | null }

async function parcelSummary(db: Platform['db'], parcelId: string, adoptedPlanId: string | null): Promise<SummaryRow> {
  const planRow = adoptedPlanId
    ? await db.queryOne<Row>({ text: 'SELECT id, results_json FROM plans WHERE id = ?', params: [adoptedPlanId] })
    : await db.queryOne<Row>({
        text: "SELECT id, results_json FROM plans WHERE parcel_id = ? AND results_json IS NOT NULL ORDER BY CASE WHEN status IN ('formalized','in_review','adopted') THEN 0 ELSE 1 END, updated_at DESC LIMIT 1",
        params: [parcelId],
      })
  if (!planRow) return { gdv: null, tdc: null, pbt: null, pm: null, sourcePlanId: null }
  const results = parseJsonColumn<{ revenue?: { gdv?: string }; costs?: { tdc?: string }; profit?: { pbt?: string; pm?: string } } | null>(planRow.results_json, null)
  if (!results) return { gdv: null, tdc: null, pbt: null, pm: null, sourcePlanId: null }
  return {
    gdv: results.revenue?.gdv ?? null,
    tdc: results.costs?.tdc ?? null,
    pbt: results.profit?.pbt ?? null,
    pm: results.profit?.pm ?? null,
    sourcePlanId: String(planRow.id),
  }
}

async function ownerName(db: Platform['db'], ownerId: string | null): Promise<string | null> {
  if (!ownerId) return null
  const user = await db.queryOne<Row>({ text: 'SELECT name FROM users WHERE id = ?', params: [ownerId] })
  return user ? String(user.name) : null
}

function mapParcelList(row: Row, summary: SummaryRow, owner: string | null) {
  return {
    id: String(row.id),
    name: String(row.name),
    internalNo: row.internal_no === null ? null : String(row.internal_no),
    state: row.state === null ? null : String(row.state),
    city: row.city === null ? null : String(row.city),
    district: row.district === null ? null : String(row.district),
    areaSqft: row.area_sqft === null ? null : String(row.area_sqft),
    status: String(row.status),
    currentStageNote: row.current_stage_note === null ? null : String(row.current_stage_note),
    adoptedPlanId: row.adopted_plan_id === null ? null : String(row.adopted_plan_id),
    summary,
    summaryIncomplete: summary.gdv === null,
    ownerName: owner,
    ownerId: row.owner_id === null ? null : String(row.owner_id),
    updatedAt: String(row.updated_at),
  }
}

async function progressOf(db: Platform['db'], parcelId: string): Promise<Record<string, boolean>> {
  const [profile, market, assessment, formalized, approval] = await Promise.all([
    db.queryOne<Row>({ text: 'SELECT address, total_land_area_sqft, zoning FROM parcel_profile WHERE parcel_id = ?', params: [parcelId] }),
    db.queryOne<Row>({ text: 'SELECT id FROM market_land_refs WHERE parcel_id = ? LIMIT 1', params: [parcelId] }).then((row) => row ?? db.queryOne<Row>({ text: 'SELECT id FROM market_comps WHERE parcel_id = ? LIMIT 1', params: [parcelId] })),
    db.queryOne<Row>({ text: 'SELECT id FROM quick_assessments WHERE parcel_id = ? AND results_json IS NOT NULL LIMIT 1', params: [parcelId] }),
    db.queryOne<Row>({ text: "SELECT id FROM plans WHERE parcel_id = ? AND status IN ('formalized','in_review','adopted','not_selected','returned') LIMIT 1", params: [parcelId] }),
    db.queryOne<Row>({ text: 'SELECT parcel_id FROM decision_records WHERE parcel_id = ?', params: [parcelId] }),
  ])
  return {
    profileCollected: Boolean(profile && (profile.address || profile.total_land_area_sqft || profile.zoning)),
    marketResearched: Boolean(market),
    assessmentDone: Boolean(assessment),
    planFormalized: Boolean(formalized),
    approvalDone: Boolean(approval),
  }
}

export const registerParcelRoutes: DomainRoutes = (app, platform) => {
  app.get('/api/parcels', async (context) => {
    await requirePermission(context, platform, 'parcels:read')
    const { page, pageSize, offset } = pagination(context)
    const filters: string[] = []
    const params: unknown[] = []
    const query = context.req.query('query')
    const status = context.req.query('status')
    const region = context.req.query('region')
    const ownerId = context.req.query('ownerId')
    const updatedAfter = context.req.query('updatedAfter')
    const completed = context.req.query('completed')
    if (query) {
      filters.push('name LIKE ?')
      params.push(`%${query}%`)
    }
    if (status && (PARCEL_STATUSES as readonly string[]).includes(status)) {
      filters.push('status = ?')
      params.push(status)
    }
    if (region) {
      filters.push("(state = ? OR city = ? OR district = ?)")
      params.push(region, region, region)
    }
    if (ownerId) {
      filters.push('owner_id = ?')
      params.push(ownerId)
    }
    if (updatedAfter) {
      filters.push('updated_at > ?')
      params.push(updatedAfter)
    }
    if (completed === 'true') {
      filters.push("status = 'completed'")
    } else if (completed === 'false') {
      filters.push("status <> 'completed'")
    }
    const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : ''
    const rows = await platform.db.queryAll<Row>({
      text: `SELECT * FROM parcels ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
      params: [...params, pageSize, offset],
    })
    const totalRow = await platform.db.queryOne<Row>({ text: `SELECT COUNT(*) AS total FROM parcels ${where}`, params })
    const items = await Promise.all(
      rows.map(async (row) => mapParcelList(row, await parcelSummary(platform.db, String(row.id), row.adopted_plan_id ? String(row.adopted_plan_id) : null), await ownerName(platform.db, row.owner_id ? String(row.owner_id) : null)))
    )
    return context.json(pagedResponse(items, Number(totalRow?.total ?? 0), page, pageSize))
  })

  app.post('/api/parcels', async (context) => {
    await requirePermission(context, platform, 'parcels:write')
    const actor = currentActor(context)
    const body = await readJsonBody(context)
    const name = requiredString(body.name, 'name')
    if (name.length === 0) throw errors.validationFailed([{ field: 'name', reason: 'is required' }])
    const state = optionalString(body.state, 'state', 100)
    const city = optionalString(body.city, 'city', 100)
    const district = optionalString(body.district, 'district', 100)
    const areaSqft = decimalInput(body.areaSqft)
    const ownerId = optionalString(body.ownerId, 'ownerId', 100) ?? actor.id
    const id = newId('par')
    const timestamp = nowIso()
    await platform.db.run({
      text: 'INSERT INTO parcels (id, name, state, city, district, area_sqft, status, adopted_plan_id, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      params: [id, name, state, city, district, areaSqft, 'processing', null, ownerId, timestamp, timestamp],
    })
    await auditEvent(platform, { type: 'parcel.created', actorUserId: actor.id, objectType: 'parcel', objectId: id, summary: `新建地块 ${name}` })
    const parcel = await loadParcel(platform.db, id)
    return context.json(mapParcelList(parcel, { gdv: null, tdc: null, pbt: null, pm: null, sourcePlanId: null }, await ownerName(platform.db, ownerId)), 201)
  })

  app.get('/api/parcels/:id', async (context) => {
    await requirePermission(context, platform, 'parcels:read')
    const parcel = await loadParcel(platform.db, context.req.param('id'))
    const row = mapParcelList(parcel, await parcelSummary(platform.db, String(parcel.id), parcel.adopted_plan_id ? String(parcel.adopted_plan_id) : null), await ownerName(platform.db, parcel.owner_id ? String(parcel.owner_id) : null))
    return context.json({ ...row, progress: await progressOf(platform.db, String(parcel.id)) })
  })

  app.patch('/api/parcels/:id', async (context) => {
    await requirePermission(context, platform, 'parcels:write')
    const actor = currentActor(context)
    const id = context.req.param('id')
    const before = await loadParcel(platform.db, id)
    const body = await readJsonBody(context)
    const updates: Record<string, unknown> = {}
    if (body.name !== undefined) updates.name = requiredString(body.name, 'name')
    if (body.internalNo !== undefined) updates.internal_no = optionalString(body.internalNo, 'internalNo', 100)
    if (body.state !== undefined) updates.state = optionalString(body.state, 'state', 100)
    if (body.city !== undefined) updates.city = optionalString(body.city, 'city', 100)
    if (body.district !== undefined) updates.district = optionalString(body.district, 'district', 100)
    if (body.areaSqft !== undefined) updates.area_sqft = decimalInput(body.areaSqft)
    if (body.ownerId !== undefined) updates.owner_id = optionalString(body.ownerId, 'ownerId', 100)
    if (Object.keys(updates).length === 0) throw errors.validationFailed([{ field: 'body', reason: 'no updatable fields provided' }])
    updates.updated_at = nowIso()
    const setSql = Object.keys(updates).map((key) => `${key} = ?`).join(', ')
    await platform.db.run({ text: `UPDATE parcels SET ${setSql} WHERE id = ?`, params: [...Object.values(updates), id] })
    await auditEvent(platform, {
      type: 'parcel.updated',
      actorUserId: actor.id,
      objectType: 'parcel',
      objectId: id,
      summary: `更新台账字段 ${Object.keys(updates).filter((key) => key !== 'updated_at').join(', ')}`,
      metadata: { before: { name: before.name, state: before.state, area_sqft: before.area_sqft } },
    })
    const parcel = await loadParcel(platform.db, id)
    return context.json(mapParcelList(parcel, await parcelSummary(platform.db, id, parcel.adopted_plan_id ? String(parcel.adopted_plan_id) : null), await ownerName(platform.db, parcel.owner_id ? String(parcel.owner_id) : null)))
  })

  app.post('/api/parcels/:id/status', async (context) => {
    await requirePermission(context, platform, 'parcels:write')
    const actor = currentActor(context)
    const id = context.req.param('id')
    const parcel = await loadParcel(platform.db, id)
    const body = await readJsonBody(context)
    const to = optionalEnum(body.to, 'to', PARCEL_STATUSES)
    if (!to) throw errors.validationFailed([{ field: 'to', reason: 'status is required' }])
    const reason = requiredString(body.reason, 'reason')
    const note = optionalString(body.note, 'note')
    const from = String(parcel.status) as ParcelStatus
    if (!ALLOWED_TRANSITIONS[from].includes(to)) {
      throw errors.statusConflict(`illegal transition ${from} → ${to}`)
    }
    if (to === 'completed' && !parcel.adopted_plan_id) {
      throw errors.adoptedPlanRequired()
    }
    const timestamp = nowIso()
    const historyId = newId('psh')
    await platform.db.transaction(async (tx) => {
      await tx.run({ text: 'UPDATE parcels SET status = ?, updated_at = ? WHERE id = ?', params: [to, timestamp, id] })
      await tx.run({
        text: 'INSERT INTO parcel_status_history (id, parcel_id, from_status, to_status, actor, reason, note, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        params: [historyId, id, from, to, actor.id, reason, note, timestamp],
      })
      if (to === 'abandoned') {
        await tx.run({
          text: `INSERT INTO decision_records (parcel_id, adopted_plan_id, action, reason, decided_at, decided_by, handoff_to) VALUES (?, ?, 'abandon', ?, ?, ?, NULL)
                 ON CONFLICT(parcel_id) DO UPDATE SET action = 'abandon', reason = excluded.reason, decided_at = excluded.decided_at, decided_by = excluded.decided_by`,
          params: [id, parcel.adopted_plan_id ?? null, reason, timestamp, actor.id],
        })
      }
    })
    await auditEvent(platform, {
      type: 'parcel.status_changed',
      actorUserId: actor.id,
      objectType: 'parcel',
      objectId: id,
      summary: `状态 ${from} → ${to}（${reason}）`,
    })
    return context.json({
      status: to,
      change: { id: historyId, fromStatus: from, toStatus: to, actor: actor.id, reason, note, at: timestamp },
    })
  })

  app.delete('/api/parcels/:id', async (context) => {
    await requirePermission(context, platform, 'parcels:write')
    const actor = currentActor(context)
    const id = context.req.param('id')
    const parcel = await loadParcel(platform.db, id)
    const status = String(parcel.status)
    if (status !== 'processing') {
      throw errors.deleteForbiddenStatus()
    }
    const formalized = await platform.db.queryOne<Row>({
      text: "SELECT id FROM plans WHERE parcel_id = ? AND status <> 'draft' AND status <> 'saved' LIMIT 1",
      params: [id],
    })
    if (formalized) {
      throw errors.deleteForbiddenStatus()
    }
    await platform.db.run({ text: 'DELETE FROM parcels WHERE id = ?', params: [id] })
    await auditEvent(platform, { type: 'parcel.deleted', actorUserId: actor.id, objectType: 'parcel', objectId: id, summary: `删除 processing 地块 ${String(parcel.name)}` })
    return context.json({ ok: true })
  })

  app.get('/api/parcels/:id/audit', async (context) => {
    const actor = currentActor(context)
    const id = context.req.param('id')
    const parcel = await loadParcel(platform.db, id)
    let allowed = false
    try {
      await platform.permissionKit.requirePermission(actor.id, 'audit:read')
      allowed = true
    } catch {
      allowed = parcel.owner_id === actor.id || await isPlanOwner(platform, id, actor.id)
    }
    if (!allowed) throw errors.forbidden()
    const filters: string[] = [
      // 地块相关事件聚合：对象为本地块或本地块下属方案（plan.* 事件的 objectId 为 planId）。
      "(json_extract(metadata_json, '$.objectId') = ? OR json_extract(metadata_json, '$.objectId') IN (SELECT id FROM plans WHERE parcel_id = ?))",
    ]
    const params: unknown[] = [id, id]
    const action = context.req.query('action')
    const after = context.req.query('after')
    const before = context.req.query('before')
    if (action) {
      filters.push('event_type = ?')
      params.push(action)
    }
    if (after) {
      filters.push('occurred_at > ?')
      params.push(after)
    }
    if (before) {
      filters.push('occurred_at < ?')
      params.push(before)
    }
    const events = await platform.db.queryAll<Row>({
      text: `SELECT id, actor_user_id, event_type, occurred_at, metadata_json FROM audit_events WHERE ${filters.join(' AND ')} ORDER BY occurred_at DESC LIMIT 200`,
      params,
    })
    return context.json({
      items: events.map((event) => {
        const metadata = parseJsonColumn<{ objectType?: string; objectId?: string; summary?: string }>(event.metadata_json, {})
        return {
          id: String(event.id),
          actor: event.actor_user_id === null ? null : String(event.actor_user_id),
          action: String(event.event_type),
          objectType: metadata.objectType ?? null,
          objectId: metadata.objectId ?? null,
          at: String(event.occurred_at),
          summary: metadata.summary ?? null,
        }
      }),
    })
  })

  void dec
  void loadPlan
  void optionalInt
}

async function isPlanOwner(platform: Platform, parcelId: string, userId: string): Promise<boolean> {
  const row = await platform.db.queryOne<Row>({ text: 'SELECT id FROM plans WHERE parcel_id = ? AND owner_id = ? LIMIT 1', params: [parcelId, userId] })
  return Boolean(row)
}
