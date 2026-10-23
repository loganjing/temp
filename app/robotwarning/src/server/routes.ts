import type { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { randomUUID } from 'node:crypto'
import type { initializePlatform } from './platform/bootstrap'
import type { PatrolRoute, VideoEvent, AlertListItem, AlertDetail, AuditTrailItem } from '../shared/types'

type Platform = Awaited<ReturnType<typeof initializePlatform>>

function toCamel<T>(row: Record<string, unknown>): T {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    result[key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] = value
  }
  return result as T
}

function parseRoute(row: Record<string, unknown>): PatrolRoute {
  return {
    id: row.id as string,
    name: row.name as string,
    waypoints: JSON.parse(row.waypoints as string),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

async function buildAlertDetail(db: Platform['db'], alertId: string): Promise<AlertDetail | null> {
  const row = await db.queryOne<Record<string, unknown>>({
    text: `SELECT a.id, a.event_id, a.alert_time, a.status, a.handler_name, a.handling_result,
           a.handling_note, a.handled_at, e.id AS e_id, e.event_type AS e_event_type,
           e.occurred_at AS e_occurred_at, e.route_id AS e_route_id, e.location AS e_location,
           e.video_segment_ref AS e_video_segment_ref, e.created_at AS e_created_at,
           r.name AS route_name
           FROM alerts a
           JOIN video_events e ON a.event_id = e.id
           JOIN patrol_routes r ON e.route_id = r.id
           WHERE a.id = ?`,
    params: [alertId],
  })
  if (!row) return null
  return {
    id: row.id as string,
    eventId: row.event_id as string,
    alertTime: row.alert_time as string,
    status: row.status as 'pending' | 'handled',
    handlerName: row.handler_name as string | null,
    handlingResult: row.handling_result as string | null,
    handlingNote: row.handling_note as string | null,
    handledAt: row.handled_at as string | null,
    event: {
      id: row.e_id as string,
      eventType: row.e_event_type as string,
      occurredAt: row.e_occurred_at as string,
      routeId: row.e_route_id as string,
      location: row.e_location as string,
      videoSegmentRef: row.e_video_segment_ref as string | null,
      createdAt: row.e_created_at as string,
    },
    routeName: row.route_name as string,
  }
}

// 登录/SSO 等公开端点只在此注册；不得加入业务读写路由。
export function registerPublicRoutes(_app: Hono, _platform: Platform) {}

// 业务路由在认证边界后注册；platform 包含已选模块的运行时资源。
export function registerProtectedRoutes(app: Hono, platform: Platform) {
  const { db, auditKit } = platform

  // === 巡逻路线管理 ===
  app.get('/api/patrol-routes', async (c) => {
    const rows = await db.queryAll<Record<string, unknown>>({
      text: 'SELECT id, name, waypoints, created_at, updated_at FROM patrol_routes ORDER BY created_at DESC',
    })
    return c.json({ items: rows.map(parseRoute) })
  })

  app.get('/api/patrol-routes/:id', async (c) => {
    const row = await db.queryOne<Record<string, unknown>>({
      text: 'SELECT id, name, waypoints, created_at, updated_at FROM patrol_routes WHERE id = ?',
      params: [c.req.param('id')],
    })
    if (!row) throw new HTTPException(404, { message: '巡逻路线不存在' })
    return c.json(parseRoute(row))
  })

  app.post('/api/patrol-routes', async (c) => {
    const body = await c.req.json()
    if (!body.name?.trim()) throw new HTTPException(400, { message: '路线名称不能为空' })
    if (!Array.isArray(body.waypoints) || body.waypoints.length === 0)
      throw new HTTPException(400, { message: '路径点不能为空' })
    const id = randomUUID()
    await db.run({
      text: 'INSERT INTO patrol_routes (id, name, waypoints) VALUES (?, ?, ?)',
      params: [id, body.name, JSON.stringify(body.waypoints)],
    })
    const row = await db.queryOne<Record<string, unknown>>({
      text: 'SELECT id, name, waypoints, created_at, updated_at FROM patrol_routes WHERE id = ?',
      params: [id],
    })
    return c.json(parseRoute(row!), 201)
  })

  app.put('/api/patrol-routes/:id', async (c) => {
    const id = c.req.param('id')
    const existing = await db.queryOne({ text: 'SELECT id FROM patrol_routes WHERE id = ?', params: [id] })
    if (!existing) throw new HTTPException(404, { message: '巡逻路线不存在' })
    const body = await c.req.json()
    if (!body.name?.trim()) throw new HTTPException(400, { message: '路线名称不能为空' })
    if (!Array.isArray(body.waypoints) || body.waypoints.length === 0)
      throw new HTTPException(400, { message: '路径点不能为空' })
    await db.run({
      text: "UPDATE patrol_routes SET name = ?, waypoints = ?, updated_at = datetime('now') WHERE id = ?",
      params: [body.name, JSON.stringify(body.waypoints), id],
    })
    const row = await db.queryOne<Record<string, unknown>>({
      text: 'SELECT id, name, waypoints, created_at, updated_at FROM patrol_routes WHERE id = ?',
      params: [id],
    })
    return c.json(parseRoute(row!))
  })

  app.delete('/api/patrol-routes/:id', async (c) => {
    const id = c.req.param('id')
    const existing = await db.queryOne({ text: 'SELECT id FROM patrol_routes WHERE id = ?', params: [id] })
    if (!existing) throw new HTTPException(404, { message: '巡逻路线不存在' })
    await db.run({ text: 'DELETE FROM patrol_routes WHERE id = ?', params: [id] })
    return c.body(null, 204)
  })

  // === 视频事件 ===
  app.get('/api/video-events', async (c) => {
    const routeId = c.req.query('routeId')
    const eventType = c.req.query('eventType')
    let sql = 'SELECT id, event_type, occurred_at, route_id, location, video_segment_ref, created_at FROM video_events'
    const conditions: string[] = []
    const params: unknown[] = []
    if (routeId) { conditions.push('route_id = ?'); params.push(routeId) }
    if (eventType) { conditions.push('event_type = ?'); params.push(eventType) }
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ')
    sql += ' ORDER BY occurred_at DESC'
    const rows = await db.queryAll<Record<string, unknown>>({ text: sql, params })
    return c.json({ items: rows.map((r) => toCamel<VideoEvent>(r)) })
  })

  // === 告警管理 ===
  app.get('/api/alerts', async (c) => {
    const status = c.req.query('status')
    let sql = `SELECT a.id, a.event_id, a.alert_time, a.status, a.handler_name, a.handled_at,
               e.event_type, e.location, r.name AS route_name
               FROM alerts a JOIN video_events e ON a.event_id = e.id
               JOIN patrol_routes r ON e.route_id = r.id`
    const params: unknown[] = []
    if (status) { sql += ' WHERE a.status = ?'; params.push(status) }
    sql += ' ORDER BY a.alert_time DESC'
    const rows = await db.queryAll<Record<string, unknown>>({ text: sql, params })
    return c.json({ items: rows.map((r) => toCamel<AlertListItem>(r)) })
  })

  app.get('/api/alerts/:id', async (c) => {
    const detail = await buildAlertDetail(db, c.req.param('id'))
    if (!detail) throw new HTTPException(404, { message: '告警不存在' })
    return c.json(detail)
  })

  app.patch('/api/alerts/:id/handle', async (c) => {
    const id = c.req.param('id')
    const alert = await db.queryOne<Record<string, unknown>>({
      text: 'SELECT id, status FROM alerts WHERE id = ?',
      params: [id],
    })
    if (!alert) throw new HTTPException(404, { message: '告警不存在' })
    if (alert.status === 'handled') throw new HTTPException(409, { message: '告警已被处置' })
    const body = await c.req.json()
    if (!body.handlerName?.trim() || !body.handlingResult?.trim() || !body.handlingNote?.trim())
      throw new HTTPException(400, { message: '处置人、处置结果和处置说明均不能为空' })
    const now = new Date().toISOString()
    await db.run({
      text: "UPDATE alerts SET status = 'handled', handler_name = ?, handling_result = ?, handling_note = ?, handled_at = ? WHERE id = ?",
      params: [body.handlerName, body.handlingResult, body.handlingNote, now, id],
    })
    await auditKit.record({
      type: 'alert_handled',
      occurredAt: now,
      metadata: {
        entityId: id,
        summary: `Alert handled by ${body.handlerName}: ${body.handlingResult}`,
        alertId: id,
        handlerName: body.handlerName,
        handlingResult: body.handlingResult,
        handlingNote: body.handlingNote,
      },
    })
    const detail = await buildAlertDetail(db, id)
    return c.json(detail!)
  })

  // === 事件留痕 ===
  app.get('/api/audit-trail', async (c) => {
    const startTime = c.req.query('startTime')
    const endTime = c.req.query('endTime')
    const eventType = c.req.query('eventType')
    let sql = 'SELECT id, occurred_at, event_type, metadata_json FROM audit_events'
    const conditions: string[] = []
    const params: unknown[] = []
    if (startTime) { conditions.push('occurred_at >= ?'); params.push(startTime) }
    if (endTime) { conditions.push('occurred_at <= ?'); params.push(endTime) }
    if (eventType) { conditions.push('event_type = ?'); params.push(eventType) }
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ')
    sql += ' ORDER BY occurred_at DESC, id DESC'
    const rows = await db.queryAll<Record<string, unknown>>({ text: sql, params })
    return c.json({
      items: rows.map((r) => {
        const meta = JSON.parse((r.metadata_json as string) ?? '{}')
        return {
          id: r.id as string,
          eventType: r.event_type as string,
          timestamp: r.occurred_at as string,
          entityId: (meta.entityId as string) ?? null,
          summary: (meta.summary as string) ?? (r.event_type as string),
          details: meta,
        } as AuditTrailItem
      }),
    })
  })

  app.get('/api/audit-trail/:id', async (c) => {
    const row = await db.queryOne<Record<string, unknown>>({
      text: 'SELECT id, occurred_at, event_type, metadata_json FROM audit_events WHERE id = ?',
      params: [c.req.param('id')],
    })
    if (!row) throw new HTTPException(404, { message: '留痕记录不存在' })
    const meta = JSON.parse((row.metadata_json as string) ?? '{}')
    return c.json({
      id: row.id as string,
      eventType: row.event_type as string,
      timestamp: row.occurred_at as string,
      entityId: (meta.entityId as string) ?? null,
      summary: (meta.summary as string) ?? (row.event_type as string),
      details: meta,
    } as AuditTrailItem)
  })
}
