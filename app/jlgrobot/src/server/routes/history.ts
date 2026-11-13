import type { Hono } from 'hono'
import type { DbClient } from '@commonapp/dbkit'
import type { HistoryEvent, HistoryEquipment } from '../../shared/types'
import { parseId, notFound } from './helpers'

interface HistoryRow {
  type: 'fault' | 'upgrade' | 'work_order'
  id: number
  description: string | null
  status: string | null
  result: string | null
  timestamp: string
}

const HISTORY_SQL = [
  "SELECT 'fault' AS type, id, description, NULL AS status, NULL AS result, occurred_at AS timestamp",
  'FROM fault_records WHERE equipment_id = ?',
  "UNION ALL SELECT 'upgrade' AS type, id, NULL AS description, status, NULL AS result, started_at AS timestamp",
  'FROM upgrade_records WHERE equipment_id = ?',
  "UNION ALL SELECT 'work_order' AS type, id, NULL AS description, status, result, created_at AS timestamp",
  'FROM maintenance_orders WHERE equipment_id = ?',
  'ORDER BY timestamp DESC',
].join(' ')

export function registerHistoryRoutes(app: Hono, db: DbClient) {
  app.get('/api/equipment/:id/history', async (c) => {
    const id = parseId(c.req.param('id'))
    if (!id) return notFound(c, '设备不存在')
    const equipment = await db.queryOne<HistoryEquipment>({
      text: 'SELECT id, code, name, status FROM equipment WHERE id = ?',
      params: [id],
    })
    if (!equipment) return notFound(c, '设备不存在')
    const rows = await db.queryAll<HistoryRow>({
      text: HISTORY_SQL,
      params: [id, id, id],
    })
    const events: HistoryEvent[] = rows.map((row) => {
      const event: HistoryEvent = { type: row.type, id: row.id, timestamp: row.timestamp }
      if (row.type === 'fault' && row.description !== null) event.description = row.description
      if ((row.type === 'upgrade' || row.type === 'work_order') && row.status !== null) event.status = row.status
      if (row.type === 'work_order') event.result = row.result
      return event
    })
    return c.json({ equipment, events })
  })
}
