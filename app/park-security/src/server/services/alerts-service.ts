import { randomUUID } from 'node:crypto'
import type { DbClient } from '@commonapp/dbkit'
import { ApiError } from '../../shared/errors'
import {
  ALERT_STATUS,
  HANDLING_ACTION,
  TRAIL_OPERATION,
  type Alert,
  type AlertDetail,
  type AlertStatus,
  type HandlingInput,
  type HandlingRecord,
  type HandlingResult,
} from '../../shared/types'

interface AlertRow extends Alert {}

interface HandlingRow {
  id: string
  handler: string
  action: HandlingRecord['action']
  handling_result: string | null
  handled_at: string
  created_at: string
}

interface AlertDetailRow {
  id: string
  event_id: string
  event_type: string
  video_source_name: string
  occurred_at: string
  status: AlertStatus
  alert_time: string
  created_at: string
  updated_at: string
}

export async function listAlerts(db: DbClient, status?: string): Promise<AlertRow[]> {
  const sql = `SELECT a.id, a.event_id, e.event_type, v.name AS video_source_name,
                      a.status, a.alert_time, a.created_at, a.updated_at
               FROM alerts a
               JOIN events e ON e.id = a.event_id
               JOIN video_sources v ON v.id = e.video_source_id`
  if (status) {
    return db.queryAll<AlertRow>({
      text: `${sql} WHERE a.status = ? ORDER BY a.alert_time DESC, a.id`,
      params: [status],
    })
  }
  return db.queryAll<AlertRow>({ text: `${sql} ORDER BY a.alert_time DESC, a.id` })
}

export async function getAlertDetail(db: DbClient, id: string): Promise<AlertDetail> {
  const row = await db.queryOne<AlertDetailRow>({
    text: `SELECT a.id, a.event_id, e.event_type, v.name AS video_source_name, e.occurred_at,
                  a.status, a.alert_time, a.created_at, a.updated_at
           FROM alerts a
           JOIN events e ON e.id = a.event_id
           JOIN video_sources v ON v.id = e.video_source_id
           WHERE a.id = ?`,
    params: [id],
  })
  if (!row) throw new ApiError(404, 'not_found', '告警不存在')
  const handlingRecords = await db.queryAll<HandlingRow>({
    text: 'SELECT id, handler, action, handling_result, handled_at, created_at FROM handling_records WHERE alert_id = ? ORDER BY handled_at, id',
    params: [id],
  })
  return {
    id: row.id,
    event_id: row.event_id,
    event_type: row.event_type,
    video_source_name: row.video_source_name,
    occurred_at: row.occurred_at,
    status: row.status,
    alert_time: row.alert_time,
    created_at: row.created_at,
    updated_at: row.updated_at,
    handling_records: handlingRecords.map((r) => ({
      id: r.id,
      handler: r.handler,
      action: r.action,
      handling_result: r.handling_result,
      handled_at: r.handled_at,
      created_at: r.created_at,
    })),
  }
}

function validateHandlingInput(body: unknown): HandlingInput {
  if (!body || typeof body !== 'object') throw new ApiError(400, 'validation_error', '请求体不能为空')
  const { handler, action, handling_result } = body as { handler?: unknown; action?: unknown; handling_result?: unknown }
  if (typeof handler !== 'string' || handler.trim() === '') {
    throw new ApiError(400, 'validation_error', '处置人不能为空')
  }
  if (action !== HANDLING_ACTION.CONFIRM && action !== HANDLING_ACTION.COMPLETE) {
    throw new ApiError(400, 'validation_error', '处置操作类型必须为 confirm 或 complete')
  }
  const result = typeof handling_result === 'string' ? handling_result : null
  if (action === HANDLING_ACTION.COMPLETE && (result === null || result.trim() === '')) {
    throw new ApiError(400, 'validation_error', '完成处置时处置结果说明必填')
  }
  return {
    handler: handler.trim(),
    action,
    handling_result: result && result.trim() !== '' ? result.trim() : null,
  }
}

// 状态流转规则：
//   pending  + confirm  → handling (留痕 alert_confirmed)
//   handling + complete → handled   (留痕 alert_completed)
// 其他转换返回 400 invalid_state_transition
export async function handleAlert(db: DbClient, alertId: string, body: unknown): Promise<HandlingResult> {
  const input = validateHandlingInput(body)
  const now = new Date().toISOString()
  return db.transaction(async (tx) => {
    const alert = await tx.queryOne<{ id: string; status: AlertStatus }>({
      text: 'SELECT id, status FROM alerts WHERE id = ?',
      params: [alertId],
    })
    if (!alert) throw new ApiError(404, 'not_found', '告警不存在')

    let targetStatus: AlertStatus
    let trailOperation: string
    if (input.action === HANDLING_ACTION.CONFIRM) {
      if (alert.status !== ALERT_STATUS.PENDING) {
        throw new ApiError(400, 'invalid_state_transition', '当前状态不允许 confirm 操作')
      }
      targetStatus = ALERT_STATUS.HANDLING
      trailOperation = TRAIL_OPERATION.ALERT_CONFIRMED
    } else {
      if (alert.status !== ALERT_STATUS.HANDLING) {
        throw new ApiError(400, 'invalid_state_transition', '当前状态不允许 complete 操作')
      }
      targetStatus = ALERT_STATUS.HANDLED
      trailOperation = TRAIL_OPERATION.ALERT_COMPLETED
    }

    const recordId = randomUUID()
    await tx.run({
      text: 'UPDATE alerts SET status = ?, updated_at = ? WHERE id = ?',
      params: [targetStatus, now, alertId],
    })
    await tx.run({
      text: `INSERT INTO handling_records (id, alert_id, handler, action, handling_result, handled_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
      params: [recordId, alertId, input.handler, input.action, input.handling_result, now, now],
    })
    await tx.run({
      text: 'INSERT INTO event_trails (id, operation_type, business_object_type, business_object_id, operation_time, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      params: [randomUUID(), trailOperation, 'handling_record', recordId, now, `${input.handler} 对告警执行 ${input.action}，状态流转至 ${targetStatus}`, now],
    })

    return {
      id: recordId,
      alert_id: alertId,
      handler: input.handler,
      action: input.action,
      handling_result: input.handling_result ?? null,
      handled_at: now,
      created_at: now,
      alert_status: targetStatus,
    }
  })
}
