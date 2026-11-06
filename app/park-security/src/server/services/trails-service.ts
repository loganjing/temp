import type { DbClient } from '@commonapp/dbkit'
import type { Trail } from '../../shared/types'

export async function listTrails(db: DbClient, operationType?: string): Promise<Trail[]> {
  const sql = `SELECT id, operation_type, business_object_type, business_object_id, operation_time, detail, created_at
               FROM event_trails`
  if (operationType) {
    return db.queryAll<Trail>({
      text: `${sql} WHERE operation_type = ? ORDER BY operation_time DESC, id`,
      params: [operationType],
    })
  }
  return db.queryAll<Trail>({ text: `${sql} ORDER BY operation_time DESC, id` })
}
