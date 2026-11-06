// 前后端共享的 API 类型与常量。平台中立，不依赖 Node/Hono/React/数据库驱动。

export const ALERT_STATUS = {
  PENDING: 'pending',
  HANDLING: 'handling',
  HANDLED: 'handled',
} as const
export type AlertStatus = (typeof ALERT_STATUS)[keyof typeof ALERT_STATUS]

export const HANDLING_ACTION = {
  CONFIRM: 'confirm',
  COMPLETE: 'complete',
} as const
export type HandlingAction = (typeof HANDLING_ACTION)[keyof typeof HANDLING_ACTION]

export const TRAIL_OPERATION = {
  EVENT_CREATED: 'event_created',
  ALERT_CREATED: 'alert_created',
  ALERT_CONFIRMED: 'alert_confirmed',
  ALERT_COMPLETED: 'alert_completed',
} as const
export type TrailOperationType = (typeof TRAIL_OPERATION)[keyof typeof TRAIL_OPERATION]

export const BUSINESS_OBJECT_TYPE = {
  EVENT: 'event',
  ALERT: 'alert',
  HANDLING_RECORD: 'handling_record',
} as const
export type BusinessObjectType = (typeof BUSINESS_OBJECT_TYPE)[keyof typeof BUSINESS_OBJECT_TYPE]

// 模拟识别的事件类型
export const EVENT_TYPES = ['intrusion', 'loitering', 'vehicle_violation'] as const
export type EventType = (typeof EVENT_TYPES)[number]

// --- 巡逻路线 ---
export interface PatrolPointInput {
  name: string
  sequence_order: number
}
export interface PatrolRouteInput {
  name: string
  points: PatrolPointInput[]
}
export interface PatrolPoint {
  id: string
  name: string
  sequence_order: number
}
export interface PatrolRoute {
  id: string
  name: string
  points: PatrolPoint[]
  created_at: string
  updated_at: string
}

// --- 视频源 ---
export interface VideoSource {
  id: string
  name: string
  source_url: string
  created_at: string
}

// --- 事件 ---
export interface EventRecord {
  id: string
  video_source_id: string
  video_source_name: string
  event_type: string
  occurred_at: string
  created_at: string
}
export interface RecognizedEvent extends EventRecord {
  alert_id: string
}

// --- 告警 ---
export interface Alert {
  id: string
  event_id: string
  event_type: string
  video_source_name: string
  status: AlertStatus
  alert_time: string
  created_at: string
  updated_at: string
}
export interface HandlingRecord {
  id: string
  handler: string
  action: HandlingAction
  handling_result: string | null
  handled_at: string
  created_at: string
}
export interface AlertDetail extends Alert {
  occurred_at: string
  handling_records: HandlingRecord[]
}

// --- 告警处置 ---
export interface HandlingInput {
  handler: string
  action: HandlingAction
  handling_result?: string | null
}
export interface HandlingResult {
  id: string
  alert_id: string
  handler: string
  action: HandlingAction
  handling_result: string | null
  handled_at: string
  created_at: string
  alert_status: AlertStatus
}

// --- 留痕 ---
export interface Trail {
  id: string
  operation_type: TrailOperationType
  business_object_type: string
  business_object_id: string
  operation_time: string
  detail: string | null
  created_at: string
}
