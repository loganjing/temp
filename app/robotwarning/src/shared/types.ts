// Shared type definitions for the robot warning system.
// Platform-neutral — no Node, Hono, React, or database driver imports.

export interface Waypoint {
  name: string
  lat: number
  lng: number
}

export interface PatrolRoute {
  id: string
  name: string
  waypoints: Waypoint[]
  createdAt: string
  updatedAt: string
}

export interface VideoEvent {
  id: string
  eventType: string
  occurredAt: string
  routeId: string
  location: string
  videoSegmentRef: string | null
  createdAt: string
}

export interface AlertListItem {
  id: string
  eventId: string
  alertTime: string
  status: 'pending' | 'handled'
  eventType: string
  location: string
  routeName: string
  handlerName: string | null
  handledAt: string | null
}

export interface AlertDetail {
  id: string
  eventId: string
  alertTime: string
  status: 'pending' | 'handled'
  handlerName: string | null
  handlingResult: string | null
  handlingNote: string | null
  handledAt: string | null
  event: VideoEvent
  routeName: string
}

export interface AuditTrailItem {
  id: string
  eventType: string
  timestamp: string
  entityId: string
  summary: string
  details: Record<string, unknown> | null
}

export const VIDEO_EVENT_TYPES = ['intrusion', 'fire', 'obstacle', 'anomaly'] as const
export type VideoEventType = (typeof VIDEO_EVENT_TYPES)[number]

export const ALERT_STATUS = {
  PENDING: 'pending',
  HANDLED: 'handled',
} as const

export const AUDIT_EVENT_TYPES = {
  VIDEO_EVENT_DETECTED: 'video_event_detected',
  ALERT_CREATED: 'alert_created',
  ALERT_HANDLED: 'alert_handled',
} as const

export interface AlertNewMessage {
  type: 'alert:new'
  data: {
    id: string
    eventId: string
    alertTime: string
    status: 'pending'
    eventType: string
    location: string
    routeName: string
  }
}

export interface AlertSubscribeMessage {
  type: 'alert:subscribe'
}
