import { randomUUID } from 'node:crypto'
import type { DbClient } from '@commonapp/dbkit'
import { ApiError } from '../../shared/errors'
import { EVENT_TYPES, type EventRecord, type RecognizedEvent } from '../../shared/types'

interface VideoSourceRow {
  id: string
  name: string
}

interface EventRow extends EventRecord {}

// 触发视频事件识别：随机选取预置视频源，模拟识别一个事件，
// 在同一事务中创建事件、关联告警和两条留痕（event_created、alert_created）。
export async function recognizeEvent(db: DbClient): Promise<RecognizedEvent> {
  const sources = await db.queryAll<VideoSourceRow>({
    text: 'SELECT id, name FROM video_sources ORDER BY id',
  })
  if (sources.length === 0) throw new ApiError(500, 'recognition_failed', '没有可用的视频源')
  const source = sources[Math.floor(Math.random() * sources.length)]
  const eventType = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)]
  const now = new Date().toISOString()
  const eventId = randomUUID()
  const alertId = randomUUID()
  return db.transaction(async (tx) => {
    await tx.run({
      text: 'INSERT INTO events (id, video_source_id, event_type, occurred_at, created_at) VALUES (?, ?, ?, ?, ?)',
      params: [eventId, source.id, eventType, now, now],
    })
    await tx.run({
      text: 'INSERT INTO alerts (id, event_id, status, alert_time, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      params: [alertId, eventId, 'pending', now, now, now],
    })
    await tx.run({
      text: 'INSERT INTO event_trails (id, operation_type, business_object_type, business_object_id, operation_time, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      params: [randomUUID(), 'event_created', 'event', eventId, now, `识别到事件 ${eventType}，来源 ${source.name}`, now],
    })
    await tx.run({
      text: 'INSERT INTO event_trails (id, operation_type, business_object_type, business_object_id, operation_time, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      params: [randomUUID(), 'alert_created', 'alert', alertId, now, `生成告警，关联事件 ${eventId}`, now],
    })
    return {
      id: eventId,
      video_source_id: source.id,
      video_source_name: source.name,
      event_type: eventType,
      occurred_at: now,
      created_at: now,
      alert_id: alertId,
    }
  })
}

export async function listEvents(db: DbClient, videoSourceId?: string): Promise<EventRow[]> {
  const sql = `SELECT e.id, e.video_source_id, v.name AS video_source_name, e.event_type, e.occurred_at, e.created_at
               FROM events e JOIN video_sources v ON v.id = e.video_source_id`
  if (videoSourceId) {
    return db.queryAll<EventRow>({
      text: `${sql} WHERE e.video_source_id = ? ORDER BY e.occurred_at DESC, e.id`,
      params: [videoSourceId],
    })
  }
  return db.queryAll<EventRow>({ text: `${sql} ORDER BY e.occurred_at DESC, e.id` })
}
