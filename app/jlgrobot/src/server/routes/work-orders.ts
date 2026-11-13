import type { Hono } from 'hono'
import type { DbClient } from '@commonapp/dbkit'
import { isMaintenanceOrderStatus, type MaintenanceOrder } from '../../shared/types'
import { parseId, nowIso, validationError, notFound, equipmentExists } from './helpers'

const ORDER_COLUMNS = 'id, equipment_id, status, result, created_at, updated_at'

export function registerWorkOrderRoutes(app: Hono, db: DbClient) {
  app.get('/api/work-orders', async (c) => {
    const equipmentId = c.req.query('equipment_id')
    if (equipmentId !== undefined) {
      const id = parseId(equipmentId)
      if (!id) return validationError(c, 'equipment_id 值非法')
      const items = await db.queryAll<MaintenanceOrder>({
        text: `SELECT ${ORDER_COLUMNS} FROM maintenance_orders WHERE equipment_id = ? ORDER BY id`,
        params: [id],
      })
      return c.json({ items })
    }
    const items = await db.queryAll<MaintenanceOrder>({
      text: `SELECT ${ORDER_COLUMNS} FROM maintenance_orders ORDER BY id`,
    })
    return c.json({ items })
  })

  app.get('/api/work-orders/:id', async (c) => {
    const id = parseId(c.req.param('id'))
    if (!id) return notFound(c, '工单不存在')
    const item = await db.queryOne<MaintenanceOrder>({
      text: `SELECT ${ORDER_COLUMNS} FROM maintenance_orders WHERE id = ?`,
      params: [id],
    })
    if (!item) return notFound(c, '工单不存在')
    return c.json(item)
  })

  app.post('/api/equipment/:id/work-orders', async (c) => {
    const id = parseId(c.req.param('id'))
    if (!id) return notFound(c, '设备不存在')
    if (!(await equipmentExists(db, id))) return notFound(c, '设备不存在')
    const ts = nowIso()
    await db.run({
      text: 'INSERT INTO maintenance_orders (equipment_id, status, created_at, updated_at) VALUES (?, ?, ?, ?)',
      params: [id, 'pending', ts, ts],
    })
    const item = await db.queryOne<MaintenanceOrder>({
      text: `SELECT ${ORDER_COLUMNS} FROM maintenance_orders WHERE id = last_insert_rowid()`,
    })
    return c.json(item, 201)
  })

  app.patch('/api/work-orders/:id', async (c) => {
    const id = parseId(c.req.param('id'))
    if (!id) return notFound(c, '工单不存在')
    const body = await c.req.json().catch(() => null)
    if (!body) return validationError(c, '字段均为空')
    const sets: string[] = []
    const params: unknown[] = []
    if (typeof body.status === 'string') {
      if (!isMaintenanceOrderStatus(body.status)) return validationError(c, 'status 值非法')
      sets.push('status = ?')
      params.push(body.status)
    }
    if (body.result !== undefined) {
      if (body.result !== null && typeof body.result !== 'string') return validationError(c, 'result 值非法')
      sets.push('result = ?')
      params.push(body.result)
    }
    if (sets.length === 0) return validationError(c, '字段均为空')
    sets.push('updated_at = ?')
    params.push(nowIso())
    params.push(id)
    const result = await db.run({
      text: `UPDATE maintenance_orders SET ${sets.join(', ')} WHERE id = ?`,
      params,
    })
    if (result.changes === 0) return notFound(c, '工单不存在')
    const item = await db.queryOne<MaintenanceOrder>({
      text: `SELECT ${ORDER_COLUMNS} FROM maintenance_orders WHERE id = ?`,
      params: [id],
    })
    return c.json(item)
  })
}
