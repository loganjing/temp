/**
 * map 域：位置/边界/标记保存、报告视图快照（不可变，AC-02）（契约第 4 节）。
 */
import type { Hono } from 'hono'
import type { Platform } from '../platform/bootstrap'
import { newId } from '../platform/authorization'
import { errors, readJsonBody, requiredString, optionalString, optionalJsonObject, optionalJsonArray, optionalInt, currentActor } from '../lib/api'
import { auditEvent, loadParcel, nowIso, parseJsonColumn, requirePermission, type DomainRoutes, type Row } from '../lib/db'

const MARKER_KINDS = ['parcel', 'competitor', 'land-deal', 'poi'] as const
const MAP_PROVIDERS = ['google-maps', 'other'] as const

type Marker = { id: string; kind: string; refId: string | null; label: string; color: string | null; note: string | null }

function parseMarkers(raw: unknown): Marker[] {
  const list = optionalJsonArray(raw, 'markers') ?? []
  return list.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null) throw errors.validationFailed([{ field: `markers[${index}]`, reason: 'must be an object' }])
    const record = entry as Record<string, unknown>
    const kind = optionalString(record.kind, `markers[${index}].kind`, 40)
    if (!kind || !(MARKER_KINDS as readonly string[]).includes(kind)) {
      throw errors.validationFailed([{ field: `markers[${index}].kind`, reason: `must be one of ${MARKER_KINDS.join(' | ')}` }])
    }
    const label = optionalString(record.label, `markers[${index}].label`, 200)
    if (!label) throw errors.validationFailed([{ field: `markers[${index}].label`, reason: 'is required' }])
    return {
      id: optionalString(record.id, `markers[${index}].id`, 100) ?? newId('mk'),
      kind,
      refId: optionalString(record.refId, `markers[${index}].refId`, 100),
      label,
      color: optionalString(record.color, `markers[${index}].color`, 40),
      note: optionalString(record.note, `markers[${index}].note`, 500),
    }
  })
}

function parseLinks(raw: unknown): Array<{ provider: string; url: string }> {
  const list = optionalJsonArray(raw, 'externalMapLinks') ?? []
  return list.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null) throw errors.validationFailed([{ field: `externalMapLinks[${index}]`, reason: 'must be an object' }])
    const record = entry as Record<string, unknown>
    const provider = optionalString(record.provider, `externalMapLinks[${index}].provider`, 40)
    if (!provider || !(MAP_PROVIDERS as readonly string[]).includes(provider)) {
      throw errors.validationFailed([{ field: `externalMapLinks[${index}].provider`, reason: 'must be one of google-maps | other' }])
    }
    const url = optionalString(record.url, `externalMapLinks[${index}].url`, 2000)
    if (!url) throw errors.validationFailed([{ field: `externalMapLinks[${index}].url`, reason: 'is required' }])
    return { provider, url }
  })
}

function mapResponse(parcelId: string, row: Row | null) {
  return {
    parcelId,
    location: row?.lat !== null && row?.lat !== undefined && row?.lng !== null && row?.lng !== undefined
      ? { lat: String(row.lat), lng: String(row.lng) }
      : null,
    boundaryGeojson: row?.boundary_geojson === null || row?.boundary_geojson === undefined ? null : parseJsonColumn<unknown>(row.boundary_geojson, null),
    markers: row ? parseJsonColumn<Marker[]>(row.markers_json, []) : [],
    externalMapLinks: row ? parseJsonColumn<Array<{ provider: string; url: string }>>(row.links_json, []) : [],
  }
}

export const registerMapRoutes: DomainRoutes = (app, platform) => {
  app.get('/api/parcels/:id/map', async (context) => {
    const parcelId = context.req.param('id')
    await loadParcel(platform.db, parcelId)
    const row = await platform.db.queryOne<Row>({ text: 'SELECT * FROM parcel_map WHERE parcel_id = ?', params: [parcelId] })
    return context.json(mapResponse(parcelId, row))
  })

  app.put('/api/parcels/:id/map', async (context) => {
    await requirePermission(context, platform, 'parcels:write')
    const actor = currentActor(context)
    const parcelId = context.req.param('id')
    await loadParcel(platform.db, parcelId)
    const body = await readJsonBody(context)
    const location = body.location === null || body.location === undefined
      ? null
      : (() => {
          const value = optionalJsonObject(body.location, 'location')
          if (!value) return null
          const lat = optionalString(value.lat, 'location.lat', 40)
          const lng = optionalString(value.lng, 'location.lng', 40)
          if (!lat || !lng) throw errors.validationFailed([{ field: 'location', reason: 'lat and lng are required' }])
          return { lat, lng }
        })()
    const boundary = body.boundaryGeojson === null || body.boundaryGeojson === undefined ? null : JSON.stringify(optionalJsonObject(body.boundaryGeojson, 'boundaryGeojson'))
    const markers = parseMarkers(body.markers)
    for (const marker of markers) {
      if (marker.refId) {
        const ref = await platform.db.queryOne<Row>({
          text: 'SELECT id FROM market_land_refs WHERE id = ? AND parcel_id = ? UNION ALL SELECT id FROM market_comps WHERE id = ? AND parcel_id = ?',
          params: [marker.refId, parcelId, marker.refId, parcelId],
        })
        if (!ref) {
          throw errors.validationFailed([{ field: `markers.refId (${marker.refId})`, reason: 'must reference a local market record for this parcel' }])
        }
      }
    }
    const links = parseLinks(body.externalMapLinks)
    const timestamp = nowIso()
    await platform.db.run({
      text: `INSERT INTO parcel_map (parcel_id, lat, lng, boundary_geojson, markers_json, links_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(parcel_id) DO UPDATE SET lat = excluded.lat, lng = excluded.lng, boundary_geojson = excluded.boundary_geojson, markers_json = excluded.markers_json, links_json = excluded.links_json, updated_at = excluded.updated_at`,
      params: [parcelId, location?.lat ?? null, location?.lng ?? null, boundary, JSON.stringify(markers), JSON.stringify(links), timestamp],
    })
    await auditEvent(platform, {
      type: 'parcel.map.updated',
      actorUserId: actor.id,
      objectType: 'parcel',
      objectId: parcelId,
      summary: `保存地图位置/边界/标记（${markers.length} 个标记）`,
    })
    const row = await platform.db.queryOne<Row>({ text: 'SELECT * FROM parcel_map WHERE parcel_id = ?', params: [parcelId] })
    return context.json(mapResponse(parcelId, row))
  })

  app.post('/api/parcels/:id/map/views', async (context) => {
    await requirePermission(context, platform, 'parcels:write')
    const actor = currentActor(context)
    const parcelId = context.req.param('id')
    await loadParcel(platform.db, parcelId)
    const body = await readJsonBody(context)
    const name = requiredString(body.name, 'name')
    const view = optionalJsonObject(body.view, 'view')
    if (!view) throw errors.validationFailed([{ field: 'view', reason: 'is required' }])
    if (optionalInt(view.zoom, 'view.zoom') === null) throw errors.validationFailed([{ field: 'view.zoom', reason: 'is required' }])
    const viewId = newId('mv')
    await platform.db.run({
      text: 'INSERT INTO parcel_map_views (id, parcel_id, name, view_json, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      params: [viewId, parcelId, name, JSON.stringify(view), nowIso(), actor.id],
    })
    await auditEvent(platform, { type: 'parcel.map.view_saved', actorUserId: actor.id, objectType: 'parcel', objectId: parcelId, summary: `保存报告地图视图 ${name}` })
    return context.json({ viewId }, 201)
  })

  app.get('/api/parcels/:id/map/views', async (context) => {
    const parcelId = context.req.param('id')
    await loadParcel(platform.db, parcelId)
    const rows = await platform.db.queryAll<Row>({ text: 'SELECT * FROM parcel_map_views WHERE parcel_id = ? ORDER BY created_at DESC', params: [parcelId] })
    return context.json({ items: rows.map((row) => ({ id: String(row.id), name: String(row.name), createdAt: String(row.created_at) })) })
  })

  app.get('/api/parcels/:id/map/views/:viewId', async (context) => {
    const parcelId = context.req.param('id')
    await loadParcel(platform.db, parcelId)
    const row = await platform.db.queryOne<Row>({ text: 'SELECT * FROM parcel_map_views WHERE id = ? AND parcel_id = ?', params: [context.req.param('viewId'), parcelId] })
    if (!row) throw errors.notFound('Map view not found')
    return context.json({ id: String(row.id), parcelId, name: String(row.name), view: parseJsonColumn<unknown>(row.view_json, null), createdAt: String(row.created_at) })
  })
}
