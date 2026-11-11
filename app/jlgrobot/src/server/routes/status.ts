import type { Hono } from 'hono'
import type { DbClient } from '@commonapp/dbkit'
import { randomUUID } from 'node:crypto'
import { EQUIPMENT_STATUS_VALUES, type EquipmentStatus } from '../../shared/contracts'
import { badRequest, notFound, readJsonBody, trimmedString } from './_helpers'

interface StatusRow {
  id: string
  equipment_id: string
  status: string
  params: string | null
  recorded_at: string
}

async function ensureEquipment(db: DbClient, equipmentId: string) {
  return db.queryOne<{ id: string }>({
    text: 'SELECT id FROM equipment WHERE id = ?',
    params: [equipmentId],
  })
}

export function registerStatusRoutes(app: Hono, db: DbClient) {
  app.post('/api/equipment/:equipmentId/status', async (c) => {
    const equipmentId = c.req.param('equipmentId')
    if (!(await ensureEquipment(db, equipmentId))) return notFound(c, '设备不存在')

    const body = await readJsonBody(c)
    if (!body || typeof body !== 'object') return badRequest(c, '请求体必须是合法 JSON 对象')
    const record = body as Record<string, unknown>
    const status = trimmedString(record.status)
    if (!status || !EQUIPMENT_STATUS_VALUES.includes(status as EquipmentStatus['status'])) {
      return badRequest(c, 'status 值非法')
    }
    const paramsRaw = record.params
    const params =
      paramsRaw && typeof paramsRaw === 'object' && !Array.isArray(paramsRaw)
        ? JSON.stringify(paramsRaw)
        : null

    const id = randomUUID()
    const recordedAt = new Date().toISOString()
    await db.run({
      text: 'INSERT INTO equipment_status (id, equipment_id, status, params, recorded_at) VALUES (?, ?, ?, ?, ?)',
      params: [id, equipmentId, status, params, recordedAt],
    })
    return c.json(
      {
        id,
        equipment_id: equipmentId,
        status,
        params: params ? JSON.parse(params) : null,
        recorded_at: recordedAt,
      },
      201,
    )
  })

  app.get('/api/equipment/:equipmentId/status', async (c) => {
    const equipmentId = c.req.param('equipmentId')
    if (!(await ensureEquipment(db, equipmentId))) return notFound(c, '设备不存在')

    const limitRaw = trimmedString(c.req.query('limit'))
    let limit = 50
    if (limitRaw) {
      const n = Number(limitRaw)
      if (!Number.isFinite(n) || n <= 0) return badRequest(c, 'limit 必须为正整数')
      limit = Math.floor(n)
    }

    const rows = await db.queryAll<StatusRow>({
      text: 'SELECT id, equipment_id, status, params, recorded_at FROM equipment_status WHERE equipment_id = ? ORDER BY recorded_at DESC LIMIT ?',
      params: [equipmentId, limit],
    })
    const items = rows.map((r) => ({
      id: r.id,
      equipment_id: r.equipment_id,
      status: r.status,
      params: r.params ? JSON.parse(r.params) : null,
      recorded_at: r.recorded_at,
    }))
    return c.json({ items })
  })
}
