import 'dotenv/config'
import { serve } from '@hono/node-server'
import { createApp } from './app'
import { authBoundary } from './platform/auth'
import { initializePlatform } from './platform/bootstrap'
import { registerPublicRoutes, registerProtectedRoutes } from './routes'
import { VIDEO_EVENT_TYPES, AUDIT_EVENT_TYPES } from '../shared/types'
import { randomUUID } from 'node:crypto'

const platform = await initializePlatform()
const app = createApp({
  registerPublicRoutes: (routes) => registerPublicRoutes(routes, platform),
  registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
  protect: authBoundary,
})
const port = Number(process.env.PORT ?? 3000)
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer from 0 to 65535')
const server = serve({ fetch: app.fetch, port }, () => {
  const address = server.address()
  console.log(`[robotwarning] server listening on :${typeof address === 'string' ? address : address?.port ?? port}`)
})

// WebSocket upgrade handler for /ws/alerts
server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url || '', `http://${request.headers.host}`)
  if (url.pathname === '/ws/alerts') {
    platform.wsHub.handleUpgrade(request, socket, head)
  } else {
    socket.destroy()
  }
})

// Background video event detection task (simulates patrol video analysis)
const EVENT_INTERVAL_MS = 15_000
const eventTimer = setInterval(async () => {
  try {
    const routes = await platform.db.queryAll<{ id: string; name: string; waypoints: string }>({
      text: 'SELECT id, name, waypoints FROM patrol_routes ORDER BY RANDOM() LIMIT 1',
    })
    if (routes.length === 0) return
    const route = routes[0]
    const waypoints = JSON.parse(route.waypoints) as { name: string; lat: number; lng: number }[]
    const waypoint = waypoints[Math.floor(Math.random() * waypoints.length)]
    const eventType = VIDEO_EVENT_TYPES[Math.floor(Math.random() * VIDEO_EVENT_TYPES.length)]
    const eventId = randomUUID()
    const now = new Date().toISOString()
    const videoSegmentRef = `segment_${Date.now()}.mp4`

    // Create video event
    await platform.db.run({
      text: 'INSERT INTO video_events (id, event_type, occurred_at, route_id, location, video_segment_ref) VALUES (?, ?, ?, ?, ?, ?)',
      params: [eventId, eventType, now, route.id, waypoint.name, videoSegmentRef],
    })
    // Audit: video_event_detected
    await platform.auditKit.record({
      type: AUDIT_EVENT_TYPES.VIDEO_EVENT_DETECTED,
      occurredAt: now,
      metadata: { entityId: eventId, summary: `Video event detected: ${eventType} at ${waypoint.name}`, eventId, eventType, routeId: route.id, location: waypoint.name },
    })

    // Create alert
    const alertId = randomUUID()
    const alertTime = new Date().toISOString()
    await platform.db.run({
      text: 'INSERT INTO alerts (id, event_id, alert_time, status) VALUES (?, ?, ?, ?)',
      params: [alertId, eventId, alertTime, 'pending'],
    })
    // Audit: alert_created
    await platform.auditKit.record({
      type: AUDIT_EVENT_TYPES.ALERT_CREATED,
      occurredAt: alertTime,
      metadata: { entityId: alertId, summary: `Alert created for ${eventType} event`, alertId, eventId, routeId: route.id, routeName: route.name },
    })

    // Broadcast via WebSocket
    platform.wsHub.broadcast({
      type: 'alert:new',
      data: { id: alertId, eventId, alertTime, status: 'pending', eventType, location: waypoint.name, routeName: route.name },
    })
  } catch (error) {
    console.error('[background] video event task error', error)
  }
}, EVENT_INTERVAL_MS)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    clearInterval(eventTimer)
    server.close(() => { void platform.close() })
  })
}
