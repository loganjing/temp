import type { DbClient } from '@commonapp/dbkit'

export const now = (): string => new Date().toISOString()

export const formatTicketNo = (id: number): string => `TKT-${String(id).padStart(6, '0')}`

// SQLite last_insert_rowid() 是连接级状态；在事务内、同连接插入后立即读取可拿到自增主键。
export async function lastInsertId(db: DbClient): Promise<number> {
  const row = await db.queryOne<{ id: number }>({ text: 'SELECT last_insert_rowid() AS id' })
  return row?.id ?? 0
}

export function boundedString(value: unknown, name: string, min: number, max: number): string {
  if (typeof value !== 'string' || value.length < min || value.length > max) {
    throw new TypeError(`${name} must be ${min}-${max} characters`)
  }
  return value
}

export function positiveInt(value: unknown, name: string): number {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) throw new TypeError(`${name} must be a positive integer`)
  return n
}
