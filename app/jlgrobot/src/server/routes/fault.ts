import type { Hono } from 'hono'
import type { DbClient } from '@commonapp/dbkit'
import { randomUUID } from 'node:crypto'
import {
  FAULT_TARGET_STATUSES,
  FAULT_TRANSITIONS,
  type Fault,
  type FaultStatusLog,
} from '../../shared/contracts'
import { badRequest, notFound, readJsonBody, trimmedString } from './_helpers'

interface FaultRow extends Fault {}

interface FaultLogRow extends FaultStatusLog {}

async function fetchFault(db: DbClient, id: string) {
  return db.queryOne<FaultRow>({
    text: 'SELECT id, equipment_id, description, status, diagnosis, suggestion, created_at, updated_at, closed_at FROM faults WHERE id = ?',
    params: [id],
  })
}

export function registerFaultRoutes(app: Hono, db: DbClient) {
  app.get('/api/faults', async (c) => {
    const equipmentId = trimmedString(c.req.query('equipment_id'))
    const status = trimmedString(c.req.query('status'))
    let text = 'SELECT id, equipment_id, description, status, diagnosis, suggestion, created_at, updated_at, closed_at FROM faults'
    const params: string[] = []
    const where: string[] = []
    if (equipmentId) {
      where.push('equipment_id = ?')
      params.push(equipmentId)
    }
    if (status) {
      where.push('status = ?')
      params.push(status)
    }
    if (where.length) text += ' WHERE ' + where.join(' AND ')
    text += ' ORDER BY created_at DESC'
    const items = await db.queryAll<FaultRow>({ text, params })
    return c.json({ items })
  })

  app.post('/api/faults', async (c) => {
    const body = await readJsonBody(c)
    if (!body || typeof body !== 'object') return badRequest(c, '请求体必须是合法 JSON 对象')
    const record = body as Record<string, unknown>
    const equipmentId = trimmedString(record.equipment_id)
    const description = trimmedString(record.description)
    if (!equipmentId || !description) return badRequest(c, 'equipment_id 和 description 为必填项')

    const exists = await db.queryOne<{ id: string }>({
      text: 'SELECT id FROM equipment WHERE id = ?',
      params: [equipmentId],
    })
    if (!exists) return notFound(c, '设备不存在')

    const id = randomUUID()
    const now = new Date().toISOString()
    await db.transaction(async (tx) => {
      await tx.run({
        text: 'INSERT INTO faults (id, equipment_id, description, status, diagnosis, suggestion, created_at, updated_at, closed_at) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, NULL)',
        params: [id, equipmentId, description, 'recorded', now, now],
      })
      await tx.run({
        text: 'INSERT INTO fault_status_logs (id, fault_id, from_status, to_status, changed_at) VALUES (?, ?, NULL, ?, ?)',
        params: [randomUUID(), id, 'recorded', now],
      })
    })
    return c.json(
      {
        id,
        equipment_id: equipmentId,
        description,
        status: 'recorded',
        diagnosis: null,
        suggestion: null,
        created_at: now,
        updated_at: now,
        closed_at: null,
      },
      201,
    )
  })

  app.get('/api/faults/:id', async (c) => {
    const fault = await fetchFault(db, c.req.param('id'))
    if (!fault) return notFound(c, '故障不存在')
    const status_logs = await db.queryAll<FaultLogRow>({
      text: 'SELECT id, fault_id, from_status, to_status, changed_at FROM fault_status_logs WHERE fault_id = ? ORDER BY changed_at ASC',
      params: [fault.id],
    })
    return c.json({ ...fault, status_logs })
  })

  app.patch('/api/faults/:id', async (c) => {
    const fault = await fetchFault(db, c.req.param('id'))
    if (!fault) return notFound(c, '故障不存在')

    const body = await readJsonBody(c)
    if (!body || typeof body !== 'object') return badRequest(c, '请求体必须是合法 JSON 对象')
    const record = body as Record<string, unknown>
    const hasDiagnosis = 'diagnosis' in record
    const hasSuggestion = 'suggestion' in record
    if (!hasDiagnosis && !hasSuggestion) return badRequest(c, '至少需要提供 diagnosis 或 suggestion')
    const diagnosis =
      record.diagnosis === null || record.diagnosis === undefined
        ? null
        : typeof record.diagnosis === 'string'
          ? record.diagnosis
          : null
    const suggestion =
      record.suggestion === null || record.suggestion === undefined
        ? null
        : typeof record.suggestion === 'string'
          ? record.suggestion
          : null

    const now = new Date().toISOString()
    await db.run({
      text: 'UPDATE faults SET diagnosis = ?, suggestion = ?, updated_at = ? WHERE id = ?',
      params: [diagnosis, suggestion, now, fault.id],
    })
    return c.json({ ...fault, diagnosis, suggestion, updated_at: now })
  })

  app.post('/api/faults/:id/status', async (c) => {
    const fault = await fetchFault(db, c.req.param('id'))
    if (!fault) return notFound(c, '故障不存在')

    const body = await readJsonBody(c)
    if (!body || typeof body !== 'object') return badRequest(c, '请求体必须是合法 JSON 对象')
    const record = body as Record<string, unknown>
    const target = trimmedString(record.status)
    if (!target) return badRequest(c, 'status 为必填项')
    if (!FAULT_TARGET_STATUSES.includes(target as (typeof FAULT_TARGET_STATUSES)[number])) {
      return badRequest(c, '目标状态非法')
    }
    const allowed = FAULT_TRANSITIONS[fault.status]
    if (!allowed.includes(target as (typeof allowed)[number])) {
      return badRequest(c, `非法状态流转：${fault.status} → ${target}`)
    }

    const now = new Date().toISOString()
    const closedAt = target === 'closed' ? now : fault.closed_at
    await db.transaction(async (tx) => {
      await tx.run({
        text: 'UPDATE faults SET status = ?, updated_at = ?, closed_at = ? WHERE id = ?',
        params: [target, now, closedAt, fault.id],
      })
      await tx.run({
        text: 'INSERT INTO fault_status_logs (id, fault_id, from_status, to_status, changed_at) VALUES (?, ?, ?, ?, ?)',
        params: [randomUUID(), fault.id, fault.status, target, now],
      })
    })
    return c.json({ ...fault, status: target, updated_at: now, closed_at: closedAt })
  })
}
