import type { Hono } from 'hono'
import type { DbClient } from '@commonapp/dbkit'
import { isUpgradeStatus, type UpgradeRecord } from '../../shared/types'
import { parseId, nowIso, validationError, notFound, equipmentExists } from './helpers'

const UPGRADE_COLUMNS = 'id, equipment_id, status, started_at, completed_at, created_at'

export function registerUpgradeRoutes(app: Hono, db: DbClient) {
  app.get('/api/equipment/:id/upgrades', async (c) => {
    const id = parseId(c.req.param('id'))
    if (!id) return notFound(c, '设备不存在')
    if (!(await equipmentExists(db, id))) return notFound(c, '设备不存在')
    const items = await db.queryAll<UpgradeRecord>({
      text: `SELECT ${UPGRADE_COLUMNS} FROM upgrade_records WHERE equipment_id = ? ORDER BY id`,
      params: [id],
    })
    return c.json({ items })
  })

  app.post('/api/equipment/:id/upgrades', async (c) => {
    const id = parseId(c.req.param('id'))
    if (!id) return notFound(c, '设备不存在')
    if (!(await equipmentExists(db, id))) return notFound(c, '设备不存在')
    const ts = nowIso()
    await db.run({
      text: 'INSERT INTO upgrade_records (equipment_id, status, started_at, created_at) VALUES (?, ?, ?, ?)',
      params: [id, 'in_progress', ts, ts],
    })
    const item = await db.queryOne<UpgradeRecord>({
      text: `SELECT ${UPGRADE_COLUMNS} FROM upgrade_records WHERE id = last_insert_rowid()`,
    })
    return c.json(item, 201)
  })

  app.patch('/api/upgrades/:id', async (c) => {
    const id = parseId(c.req.param('id'))
    if (!id) return notFound(c, '升级记录不存在')
    const body = await c.req.json().catch(() => null)
    if (!body || typeof body.status !== 'string') {
      return validationError(c, '字段缺失')
    }
    if (!isUpgradeStatus(body.status)) return validationError(c, 'status 值非法')
    let result
    if (body.status === 'success' || body.status === 'failed') {
      result = await db.run({
        text: 'UPDATE upgrade_records SET status = ?, completed_at = ? WHERE id = ?',
        params: [body.status, nowIso(), id],
      })
    } else {
      result = await db.run({
        text: 'UPDATE upgrade_records SET status = ? WHERE id = ?',
        params: [body.status, id],
      })
    }
    if (result.changes === 0) return notFound(c, '升级记录不存在')
    const item = await db.queryOne<UpgradeRecord>({
      text: `SELECT ${UPGRADE_COLUMNS} FROM upgrade_records WHERE id = ?`,
      params: [id],
    })
    return c.json(item)
  })
}
