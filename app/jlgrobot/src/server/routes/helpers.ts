import type { Context } from 'hono'
import type { DbClient } from '@commonapp/dbkit'

export function parseId(raw: string): number | null {
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

export function nowIso(): string {
  return new Date().toISOString().slice(0, 19)
}

export function validationError(c: Context, message: string) {
  return c.json({ error: { code: 'VALIDATION_ERROR', message } }, 400)
}

export function notFound(c: Context, message: string) {
  return c.json({ error: { code: 'NOT_FOUND', message } }, 404)
}

export async function equipmentExists(db: DbClient, id: number): Promise<boolean> {
  const row = await db.queryOne<{ id: number }>({ text: 'SELECT id FROM equipment WHERE id = ?', params: [id] })
  return row !== null
}
