import type { Hono } from 'hono'
import type { DbClient } from '@commonapp/dbkit'
import { randomUUID } from 'node:crypto'
import type { Equipment } from '../../shared/contracts'
import { badRequest, notFound, readJsonBody, trimmedString } from './_helpers'
import { getEquipmentHistory } from '../services/history'

interface EquipmentRow extends Equipment {}

export function registerEquipmentRoutes(app: Hono, db: DbClient) {
  app.get('/api/equipment', async (c) => {
    const keyword = c.req.query('keyword')?.trim()
    const items = keyword
      ? await db.queryAll<EquipmentRow>({
          text: 'SELECT id, name, identifier, type, created_at FROM equipment WHERE name LIKE ? OR identifier LIKE ? ORDER BY created_at DESC',
          params: [`%${keyword}%`, `%${keyword}%`],
        })
      : await db.queryAll<EquipmentRow>({
          text: 'SELECT id, name, identifier, type, created_at FROM equipment ORDER BY created_at DESC',
        })
    return c.json({ items })
  })

  app.post('/api/equipment', async (c) => {
    const body = await readJsonBody(c)
    if (!body || typeof body !== 'object') return badRequest(c, '请求体必须是合法 JSON 对象')
    const record = body as Record<string, unknown>
    const name = trimmedString(record.name)
    const identifier = trimmedString(record.identifier)
    const typeRaw = record.type
    const type = typeof typeRaw === 'string' && typeRaw.trim() ? typeRaw.trim() : null
    if (!name || !identifier) return badRequest(c, 'name 和 identifier 为必填项')

    const id = randomUUID()
    const createdAt = new Date().toISOString()
    try {
      await db.run({
        text: 'INSERT INTO equipment (id, name, identifier, type, created_at) VALUES (?, ?, ?, ?, ?)',
        params: [id, name, identifier, type, createdAt],
      })
    } catch (error) {
      const message = (error as { message?: string })?.message ?? ''
      if (/UNIQUE/i.test(message)) return badRequest(c, 'identifier 已存在')
      throw error
    }
    return c.json({ id, name, identifier, type, created_at: createdAt }, 201)
  })

  app.get('/api/equipment/:id', async (c) => {
    const row = await db.queryOne<EquipmentRow>({
      text: 'SELECT id, name, identifier, type, created_at FROM equipment WHERE id = ?',
      params: [c.req.param('id')],
    })
    if (!row) return notFound(c, '设备不存在')
    return c.json(row)
  })

  app.get('/api/equipment/:equipmentId/history', async (c) => {
    const equipmentId = c.req.param('equipmentId')
    const exists = await db.queryOne<{ id: string }>({
      text: 'SELECT id FROM equipment WHERE id = ?',
      params: [equipmentId],
    })
    if (!exists) return notFound(c, '设备不存在')
    const events = await getEquipmentHistory(db, equipmentId)
    return c.json({ equipment_id: equipmentId, events })
  })
}
