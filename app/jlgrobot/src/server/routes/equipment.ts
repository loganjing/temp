import type { Hono } from 'hono'
import type { DbClient } from '@commonapp/dbkit'
import { isEquipmentStatus, type Equipment } from '../../shared/types'
import { parseId, nowIso, validationError, notFound } from './helpers'

const EQUIPMENT_COLUMNS = 'id, code, name, status, created_at, updated_at'

export function registerEquipmentRoutes(app: Hono, db: DbClient) {
  app.get('/api/equipment', async (c) => {
    const items = await db.queryAll<Equipment>({
      text: `SELECT ${EQUIPMENT_COLUMNS} FROM equipment ORDER BY id`,
    })
    return c.json({ items })
  })

  app.get('/api/equipment/:id', async (c) => {
    const id = parseId(c.req.param('id'))
    if (!id) return notFound(c, '设备不存在')
    const item = await db.queryOne<Equipment>({
      text: `SELECT ${EQUIPMENT_COLUMNS} FROM equipment WHERE id = ?`,
      params: [id],
    })
    if (!item) return notFound(c, '设备不存在')
    return c.json(item)
  })

  app.post('/api/equipment', async (c) => {
    const body = await c.req.json().catch(() => null)
    if (!body || typeof body.code !== 'string' || !body.code || typeof body.name !== 'string' || !body.name) {
      return validationError(c, '字段缺失')
    }
    const status = typeof body.status === 'string' ? body.status : 'standby'
    if (!isEquipmentStatus(status)) return validationError(c, 'status 值非法')
    const ts = nowIso()
    try {
      await db.run({
        text: 'INSERT INTO equipment (code, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        params: [body.code, body.name, status, ts, ts],
      })
    } catch (error) {
      if (String(error).includes('UNIQUE constraint')) return validationError(c, 'code 重复')
      throw error
    }
    const item = await db.queryOne<Equipment>({
      text: `SELECT ${EQUIPMENT_COLUMNS} FROM equipment WHERE id = last_insert_rowid()`,
    })
    return c.json(item, 201)
  })

  app.patch('/api/equipment/:id', async (c) => {
    const id = parseId(c.req.param('id'))
    if (!id) return notFound(c, '设备不存在')
    const body = await c.req.json().catch(() => null)
    if (!body || typeof body.status !== 'string') {
      return validationError(c, '字段缺失')
    }
    if (!isEquipmentStatus(body.status)) return validationError(c, 'status 值非法')
    const result = await db.run({
      text: 'UPDATE equipment SET status = ?, updated_at = ? WHERE id = ?',
      params: [body.status, nowIso(), id],
    })
    if (result.changes === 0) return notFound(c, '设备不存在')
    const item = await db.queryOne<Equipment>({
      text: `SELECT ${EQUIPMENT_COLUMNS} FROM equipment WHERE id = ?`,
      params: [id],
    })
    return c.json(item)
  })
}
