import { message } from 'antd'

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

function camelCaseResponse(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelCaseResponse)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
    key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase()),
    camelCaseResponse(nested),
  ]))
}

/**
 * Low-level request boundary. Unwraps the unified `{ data: ... }` success
 * envelope and decodes `{ error: { code, message } }` failures into
 * ApiRequestError. Response keys are normalised from snake_case to camelCase.
 */
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, options)
  const raw: unknown = response.status === 204 ? undefined : await response.json().catch(() => undefined)
  const body = raw && typeof raw === 'object' ? camelCaseResponse(raw) as Record<string, unknown> : undefined

  if (response.ok) {
    return (body?.data ?? undefined) as T
  }

  const error = body?.error
  const detail = error && typeof error === 'object' ? error as Record<string, unknown> : undefined
  throw new ApiRequestError(
    typeof detail?.message === 'string' ? detail.message : typeof error === 'string' ? error : `HTTP ${response.status}`,
    response.status,
    typeof detail?.code === 'string' ? detail.code : undefined,
  )
}

function jsonOptions(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }
}

// ---------------------------------------------------------------------------
// Contract types — derived from technical-contract.md
// Response types use camelCase (after response normalisation).
// Request payload types use snake_case (matching the wire format).
// ---------------------------------------------------------------------------

export interface PatrolPoint {
  id: string
  name: string
  sequenceOrder: number
}

export interface PatrolRoute {
  id: string
  name: string
  points: PatrolPoint[]
  createdAt: string
  updatedAt: string
}

export interface VideoSource {
  id: string
  name: string
  sourceUrl: string
  createdAt: string
}

export interface EventRecord {
  id: string
  videoSourceId: string
  videoSourceName: string
  eventType: string
  occurredAt: string
  createdAt: string
}

export interface RecognizedEvent extends EventRecord {
  alertId: string
}

export type AlertStatus = 'pending' | 'handling' | 'handled'

export interface Alert {
  id: string
  eventId: string
  eventType: string
  videoSourceName: string
  status: AlertStatus
  alertTime: string
  createdAt: string
  updatedAt: string
}

export interface HandlingRecord {
  id: string
  handler: string
  action: 'confirm' | 'complete'
  handlingResult: string | null
  handledAt: string
  createdAt: string
}

export interface AlertDetail extends Alert {
  occurredAt: string
  handlingRecords: HandlingRecord[]
}

export interface HandlingResponse {
  id: string
  alertId: string
  handler: string
  action: 'confirm' | 'complete'
  handlingResult: string | null
  handledAt: string
  createdAt: string
  alertStatus: AlertStatus
}

export type TrailOperationType = 'event_created' | 'alert_created' | 'alert_confirmed' | 'alert_completed'

export interface EventTrail {
  id: string
  operationType: TrailOperationType
  businessObjectType: string
  businessObjectId: string
  operationTime: string
  detail: string | null
  createdAt: string
}

// Request payloads (snake_case, matching wire format)
export interface PatrolRouteInput {
  name: string
  points: { name: string; sequence_order: number }[]
}

export interface HandlingInput {
  handler: string
  action: 'confirm' | 'complete'
  handling_result?: string
}

// ---------------------------------------------------------------------------
// Typed API functions
// ---------------------------------------------------------------------------

export async function listPatrolRoutes(): Promise<PatrolRoute[]> {
  return request<PatrolRoute[]>('/api/patrol-routes')
}

export async function getPatrolRoute(id: string): Promise<PatrolRoute> {
  return request<PatrolRoute>(`/api/patrol-routes/${encodeURIComponent(id)}`)
}

export async function createPatrolRoute(input: PatrolRouteInput): Promise<PatrolRoute> {
  return request<PatrolRoute>('/api/patrol-routes', jsonOptions('POST', input))
}

export async function updatePatrolRoute(id: string, input: PatrolRouteInput): Promise<PatrolRoute> {
  return request<PatrolRoute>(`/api/patrol-routes/${encodeURIComponent(id)}`, jsonOptions('PUT', input))
}

export async function deletePatrolRoute(id: string): Promise<void> {
  await request<{ deleted: boolean }>(`/api/patrol-routes/${encodeURIComponent(id)}`, jsonOptions('DELETE'))
}

export async function listVideoSources(): Promise<VideoSource[]> {
  return request<VideoSource[]>('/api/video-sources')
}

export async function recognizeEvent(): Promise<RecognizedEvent> {
  return request<RecognizedEvent>('/api/events/recognize', jsonOptions('POST'))
}

export async function listEvents(videoSourceId?: string): Promise<EventRecord[]> {
  const qs = videoSourceId ? `?video_source_id=${encodeURIComponent(videoSourceId)}` : ''
  return request<EventRecord[]>(`/api/events${qs}`)
}

export async function listAlerts(status?: AlertStatus): Promise<Alert[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : ''
  return request<Alert[]>(`/api/alerts${qs}`)
}

export async function getAlert(id: string): Promise<AlertDetail> {
  return request<AlertDetail>(`/api/alerts/${encodeURIComponent(id)}`)
}

export async function handleAlert(id: string, input: HandlingInput): Promise<HandlingResponse> {
  return request<HandlingResponse>(`/api/alerts/${encodeURIComponent(id)}/handling`, jsonOptions('POST', input))
}

export async function listTrails(operationType?: TrailOperationType): Promise<EventTrail[]> {
  const qs = operationType ? `?operation_type=${encodeURIComponent(operationType)}` : ''
  return request<EventTrail[]>(`/api/trails${qs}`)
}

// ---------------------------------------------------------------------------
// Error helper for pages
// ---------------------------------------------------------------------------

export function reportError(error: unknown, fallback: string): void {
  const msg = error instanceof ApiRequestError ? error.message : fallback
  message.error(msg)
}
