import type { Hono } from 'hono'
import type { DbClient } from '@commonapp/dbkit'
import type { FaultRecord } from '../../shared/types'
import { parseId, nowIso, validationError, notFound, equipmentExists } from './helpers'

const FAULT_COLUMNS = 'id, equipment_id, description, occurred_at, created_at'

export function registerFaultRoutes(app: Hono, db: DbClient) {
  app.get('/api/equipment/:id/faults', async (c) => {
    const id = parseId(c.req.param('id'))
    if (!id) return notFound(c, '设备不存在')
    if (!(await equipmentExists(db, id))) return notFound(c, '设备不存在')
    const items = await db.queryAll<FaultRecord>({
      text: `SELECT ${FAULT_COLUMNS} FROM fault_records WHERE equipment_id = ? ORDER BY id`,
      params: [id],
    })
    return c.json({ items })
  })

  app.post('/api/equipment/:id/faults', async (c) => {
    const id = parseId(c.req.param('id'))
    if (!id) return notFound(c, '设备不存在')
    if (!(await equipmentExists(db, id))) return notFound(c, '设备不存在')
    const body = await c.req.json().catch(() => null)
    if (!body || typeof body.description !== 'string' || !body.description || typeof body.occurred_at !== 'string' || !body.occurred_at) {
      return validationError(c, '字段缺失')
    }
    const ts = nowIso()
    await db.run({
      text: 'INSERT INTO fault_records (equipment_id, description, occurred_at, created_at) VALUES (?, ?, ?, ?)',
      params: [id, body.description, body.occurred_at, ts],
    })
    const item = await db.queryOne<FaultRecord>({
      text: `SELECT ${FAULT_COLUMNS} FROM fault_records WHERE id = last_insert_rowid()`,
    })
    return c.json(item, 201)
  })
}
