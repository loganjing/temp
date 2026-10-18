/**
 * market 域：土地交易参考与竞品分表（契约第 5 节 / AC-01、M04）。
 */
import type { Hono } from 'hono'
import type { Platform } from '../platform/bootstrap'
import { newId } from '../platform/authorization'
import { errors, readJsonBody, requiredString, optionalString, decimalInput, optionalInt, optionalEnum, currentActor, pagination, pagedResponse } from '../lib/api'
import { auditEvent, loadParcel, nowIso, requirePermission, type DomainRoutes, type Row } from '../lib/db'
import { SOURCE_TYPES } from '../engine/plan-engine'

export const LISTING_STATUSES = ['transacted', 'listing', 'unknown'] as const
export const CONFIDENCE_LEVELS = ['verified', 'probable', 'unverified'] as const
export const COMP_FORMATS = ['residential', 'apartment', 'service-apartment', 'hotel', 'office', 'retail', 'other'] as const

function requireSourceType(value: unknown): string {
  const parsed = optionalEnum(value, 'sourceType', SOURCE_TYPES)
  if (!parsed) throw errors.validationFailed([{ field: 'sourceType', reason: 'is required' }])
  return parsed
}

function mapLandRef(row: Row) {
  return {
    id: String(row.id),
    parcelId: String(row.parcel_id),
    projectName: String(row.project_name),
    distanceKm: row.distance_km === null ? null : String(row.distance_km),
    dealPrice: row.deal_price === null ? null : String(row.deal_price),
    pricePerSqft: row.price_per_sqft === null ? null : String(row.price_per_sqft),
    priceToRevenueRatio: row.price_to_revenue_ratio === null ? null : String(row.price_to_revenue_ratio),
    transactedAt: row.transacted_at === null ? null : String(row.transacted_at),
    dealCondition: row.deal_condition === null ? null : String(row.deal_condition),
    listingStatus: String(row.listing_status),
    source: String(row.source),
    sourceType: String(row.source_type),
    collectedAt: String(row.collected_at),
    confidence: String(row.confidence),
    note: row.note === null ? null : String(row.note),
  }
}

function mapComp(row: Row) {
  return {
    id: String(row.id),
    parcelId: String(row.parcel_id),
    projectName: String(row.project_name),
    distanceKm: row.distance_km === null ? null : String(row.distance_km),
    format: String(row.format),
    typeTier: row.type_tier === null ? null : String(row.type_tier),
    unitAreaFrom: row.unit_area_from === null ? null : String(row.unit_area_from),
    unitAreaTo: row.unit_area_to === null ? null : String(row.unit_area_to),
    askingPrice: row.asking_price === null ? null : String(row.asking_price),
    pricePerSqft: row.price_per_sqft === null ? null : String(row.price_per_sqft),
    totalUnits: row.total_units === null ? null : Number(row.total_units),
    soldUnits: row.sold_units === null ? null : Number(row.sold_units),
    absorptionRate: row.absorption_rate === null ? null : String(row.absorption_rate),
    positioning: row.positioning === null ? null : String(row.positioning),
    incentives: row.incentives === null ? null : String(row.incentives),
    affordableFlag: Boolean(row.affordable_flag),
    projectStatus: row.project_status === null || row.project_status === undefined ? null : String(row.project_status),
    source: String(row.source),
    sourceType: String(row.source_type),
    collectedAt: String(row.collected_at),
    confidence: String(row.confidence),
    note: row.note === null ? null : String(row.note),
  }
}

export const registerMarketRoutes: DomainRoutes = (app, platform) => {
  app.get('/api/parcels/:id/market/land-refs', async (context) => {
    const parcelId = context.req.param('id')
    await loadParcel(platform.db, parcelId)
    const { page, pageSize, offset } = pagination(context)
    const filters: string[] = ['parcel_id = ?']
    const params: unknown[] = [parcelId]
    const distanceKm = context.req.query('distanceKm')
    const from = context.req.query('from')
    const to = context.req.query('to')
    if (distanceKm) {
      filters.push('distance_km <= ?')
      params.push(distanceKm)
    }
    if (from) {
      filters.push('transacted_at >= ?')
      params.push(from)
    }
    if (to) {
      filters.push('transacted_at <= ?')
      params.push(to)
    }
    const rows = await platform.db.queryAll<Row>({ text: `SELECT * FROM market_land_refs WHERE ${filters.join(' AND ')} ORDER BY collected_at DESC LIMIT ? OFFSET ?`, params: [...params, pageSize, offset] })
    const total = await platform.db.queryOne<Row>({ text: `SELECT COUNT(*) AS total FROM market_land_refs WHERE ${filters.join(' AND ')}`, params })
    return context.json(pagedResponse(rows.map(mapLandRef), Number(total?.total ?? 0), page, pageSize))
  })

  app.post('/api/parcels/:id/market/land-refs', async (context) => {
    await requirePermission(context, platform, 'market:write')
    const actor = currentActor(context)
    const parcelId = context.req.param('id')
    await loadParcel(platform.db, parcelId)
    const body = await readJsonBody(context)
    const id = newId('mlr')
    await platform.db.run({
      text: `INSERT INTO market_land_refs (id, parcel_id, project_name, distance_km, deal_price, price_per_sqft, price_to_revenue_ratio, transacted_at, deal_condition, listing_status, source, source_type, collected_at, confidence, note)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        id, parcelId, requiredString(body.projectName, 'projectName'),
        decimalInput(body.distanceKm), decimalInput(body.dealPrice), decimalInput(body.pricePerSqft), decimalInput(body.priceToRevenueRatio),
        optionalString(body.transactedAt, 'transactedAt', 40), optionalString(body.dealCondition, 'dealCondition', 500),
        optionalEnum(body.listingStatus, 'listingStatus', LISTING_STATUSES) ?? 'unknown',
        requiredString(body.source, 'source', 500), requireSourceType(body.sourceType), nowIso(),
        optionalEnum(body.confidence, 'confidence', CONFIDENCE_LEVELS) ?? 'unverified',
        optionalString(body.note, 'note', 2000),
      ],
    })
    await auditEvent(platform, { type: 'market.land_ref.created', actorUserId: actor.id, objectType: 'parcel', objectId: parcelId, summary: `录入土地交易参考 ${String(body.projectName)}` })
    const row = await platform.db.queryOne<Row>({ text: 'SELECT * FROM market_land_refs WHERE id = ?', params: [id] })
    return context.json(mapLandRef(row!), 201)
  })

  app.get('/api/parcels/:id/market/comps', async (context) => {
    const parcelId = context.req.param('id')
    await loadParcel(platform.db, parcelId)
    const { page, pageSize, offset } = pagination(context)
    const filters: string[] = ['parcel_id = ?']
    const params: unknown[] = [parcelId]
    const distanceKm = context.req.query('distanceKm')
    const format = context.req.query('format')
    const priceRange = context.req.query('priceRange')
    const status = context.req.query('status')
    if (distanceKm) {
      filters.push('distance_km <= ?')
      params.push(distanceKm)
    }
    if (format) {
      filters.push('format = ?')
      params.push(format)
    }
    if (priceRange) {
      const [min, max] = priceRange.split(',')
      if (min) {
        filters.push('asking_price >= ?')
        params.push(min)
      }
      if (max) {
        filters.push('asking_price <= ?')
        params.push(max)
      }
    }
    if (status) {
      filters.push("project_status = ?")
      params.push(status)
    }
    const rows = await platform.db.queryAll<Row>({ text: `SELECT * FROM market_comps WHERE ${filters.join(' AND ')} ORDER BY collected_at DESC LIMIT ? OFFSET ?`, params: [...params, pageSize, offset] })
    const total = await platform.db.queryOne<Row>({ text: `SELECT COUNT(*) AS total FROM market_comps WHERE ${filters.join(' AND ')}`, params })
    return context.json(pagedResponse(rows.map(mapComp), Number(total?.total ?? 0), page, pageSize))
  })

  app.post('/api/parcels/:id/market/comps', async (context) => {
    await requirePermission(context, platform, 'market:write')
    const actor = currentActor(context)
    const parcelId = context.req.param('id')
    await loadParcel(platform.db, parcelId)
    const body = await readJsonBody(context)
    const format = optionalEnum(body.format, 'format', COMP_FORMATS)
    if (!format) throw errors.validationFailed([{ field: 'format', reason: 'is required' }])
    const id = newId('mc')
    await platform.db.run({
      text: `INSERT INTO market_comps (id, parcel_id, project_name, distance_km, format, type_tier, unit_area_from, unit_area_to, asking_price, price_per_sqft, total_units, sold_units, absorption_rate, positioning, incentives, affordable_flag, project_status, source, source_type, collected_at, confidence, note)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        id, parcelId, requiredString(body.projectName, 'projectName'), decimalInput(body.distanceKm), format,
        optionalString(body.typeTier, 'typeTier', 100), decimalInput(body.unitAreaFrom), decimalInput(body.unitAreaTo),
        decimalInput(body.askingPrice), decimalInput(body.pricePerSqft), optionalInt(body.totalUnits, 'totalUnits'), optionalInt(body.soldUnits, 'soldUnits'),
        decimalInput(body.absorptionRate), optionalString(body.positioning, 'positioning', 200), optionalString(body.incentives, 'incentives', 500),
        body.affordableFlag === true ? 1 : 0, optionalString(body.projectStatus, 'projectStatus', 40) ?? 'unknown',
        requiredString(body.source, 'source', 500), requireSourceType(body.sourceType), nowIso(),
        optionalEnum(body.confidence, 'confidence', CONFIDENCE_LEVELS) ?? 'unverified', optionalString(body.note, 'note', 2000),
      ],
    })
    await auditEvent(platform, { type: 'market.comp.created', actorUserId: actor.id, objectType: 'parcel', objectId: parcelId, summary: `录入竞品 ${String(body.projectName)}` })
    const row = await platform.db.queryOne<Row>({ text: 'SELECT * FROM market_comps WHERE id = ?', params: [id] })
    return context.json(mapComp(row!), 201)
  })
}
