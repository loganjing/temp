import type { Hono } from 'hono'
import type { DbClient } from '@commonapp/dbkit'
import { randomUUID } from 'node:crypto'
import {
  WORK_ORDER_TARGET_STATUSES,
  WORK_ORDER_TRANSITIONS,
  type WorkOrder,
  type WorkOrderRecord,
  type WorkOrderStatusLog,
} from '../../shared/contracts'
import { badRequest, notFound, readJsonBody, trimmedString } from './_helpers'

interface WorkOrderRow extends WorkOrder {}

interface WorkOrderLogRow extends WorkOrderStatusLog {}

interface WorkOrderRecordRow extends WorkOrderRecord {}

async function fetchWorkOrder(db: DbClient, id: string) {
  return db.queryOne<WorkOrderRow>({
    text: 'SELECT id, equipment_id, fault_id, description, status, created_at, updated_at, closed_at FROM work_orders WHERE id = ?',
    params: [id],
  })
}

export function registerWorkOrderRoutes(app: Hono, db: DbClient) {
  app.get('/api/work-orders', async (c) => {
    const equipmentId = trimmedString(c.req.query('equipment_id'))
    const status = trimmedString(c.req.query('status'))
    let text = 'SELECT id, equipment_id, fault_id, description, status, created_at, updated_at, closed_at FROM work_orders'
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
    const items = await db.queryAll<WorkOrderRow>({ text, params })
    return c.json({ items })
  })

  app.post('/api/work-orders', async (c) => {
    const body = await readJsonBody(c)
    if (!body || typeof body !== 'object') return badRequest(c, '请求体必须是合法 JSON 对象')
    const record = body as Record<string, unknown>
    const equipmentId = trimmedString(record.equipment_id)
    const description = trimmedString(record.description)
    const faultIdRaw = record.fault_id
    const faultId =
      typeof faultIdRaw === 'string' && faultIdRaw.trim()
        ? faultIdRaw.trim()
        : typeof faultIdRaw === 'undefined' || faultIdRaw === null
          ? null
          : null
    if (!equipmentId || !description) return badRequest(c, 'equipment_id 和 description 为必填项')

    const equipment = await db.queryOne<{ id: string }>({
      text: 'SELECT id FROM equipment WHERE id = ?',
      params: [equipmentId],
    })
    if (!equipment) return notFound(c, '设备不存在')

    if (faultId) {
      const fault = await db.queryOne<{ id: string }>({
        text: 'SELECT id FROM faults WHERE id = ?',
        params: [faultId],
      })
      if (!fault) return notFound(c, '故障不存在')
    }

    const id = randomUUID()
    const now = new Date().toISOString()
    await db.transaction(async (tx) => {
      await tx.run({
        text: 'INSERT INTO work_orders (id, equipment_id, fault_id, description, status, created_at, updated_at, closed_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)',
        params: [id, equipmentId, faultId, description, 'pending', now, now],
      })
      await tx.run({
        text: 'INSERT INTO work_order_status_logs (id, order_id, from_status, to_status, changed_at) VALUES (?, ?, NULL, ?, ?)',
        params: [randomUUID(), id, 'pending', now],
      })
    })
    return c.json(
      {
        id,
        equipment_id: equipmentId,
        fault_id: faultId,
        description,
        status: 'pending',
        created_at: now,
        updated_at: now,
        closed_at: null,
      },
      201,
    )
  })

  app.get('/api/work-orders/:id', async (c) => {
    const order = await fetchWorkOrder(db, c.req.param('id'))
    if (!order) return notFound(c, '工单不存在')
    const [records, status_logs] = await Promise.all([
      db.queryAll<WorkOrderRecordRow>({
        text: 'SELECT id, order_id, content, created_at FROM work_order_records WHERE order_id = ? ORDER BY created_at ASC',
        params: [order.id],
      }),
      db.queryAll<WorkOrderLogRow>({
        text: 'SELECT id, order_id, from_status, to_status, changed_at FROM work_order_status_logs WHERE order_id = ? ORDER BY changed_at ASC',
        params: [order.id],
      }),
    ])
    return c.json({ ...order, records, status_logs })
  })

  app.post('/api/work-orders/:id/records', async (c) => {
    const order = await fetchWorkOrder(db, c.req.param('id'))
    if (!order) return notFound(c, '工单不存在')

    const body = await readJsonBody(c)
    if (!body || typeof body !== 'object') return badRequest(c, '请求体必须是合法 JSON 对象')
    const record = body as Record<string, unknown>
    const content = trimmedString(record.content)
    if (!content) return badRequest(c, 'content 为必填项')

    const id = randomUUID()
    const now = new Date().toISOString()
    await db.run({
      text: 'INSERT INTO work_order_records (id, order_id, content, created_at) VALUES (?, ?, ?, ?)',
      params: [id, order.id, content, now],
    })
    return c.json({ id, order_id: order.id, content, created_at: now }, 201)
  })

  app.post('/api/work-orders/:id/status', async (c) => {
    const order = await fetchWorkOrder(db, c.req.param('id'))
    if (!order) return notFound(c, '工单不存在')

    const body = await readJsonBody(c)
    if (!body || typeof body !== 'object') return badRequest(c, '请求体必须是合法 JSON 对象')
    const record = body as Record<string, unknown>
    const target = trimmedString(record.status)
    if (!target) return badRequest(c, 'status 为必填项')
    if (!WORK_ORDER_TARGET_STATUSES.includes(target as (typeof WORK_ORDER_TARGET_STATUSES)[number])) {
      return badRequest(c, '目标状态非法')
    }
    const allowed = WORK_ORDER_TRANSITIONS[order.status]
    if (!allowed.includes(target as (typeof allowed)[number])) {
      return badRequest(c, `非法状态流转：${order.status} → ${target}`)
    }

    const now = new Date().toISOString()
    const closedAt = target === 'closed' ? now : order.closed_at
    await db.transaction(async (tx) => {
      await tx.run({
        text: 'UPDATE work_orders SET status = ?, updated_at = ?, closed_at = ? WHERE id = ?',
        params: [target, now, closedAt, order.id],
      })
      await tx.run({
        text: 'INSERT INTO work_order_status_logs (id, order_id, from_status, to_status, changed_at) VALUES (?, ?, ?, ?, ?)',
        params: [randomUUID(), order.id, order.status, target, now],
      })
    })
    return c.json({ ...order, status: target, updated_at: now, closed_at: closedAt })
  })
}
