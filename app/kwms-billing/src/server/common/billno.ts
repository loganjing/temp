import { randomUUID } from 'node:crypto'
import type { DbClient } from '@commonapp/dbkit'

// 单据编码：前缀-YYYYMMDD-NNNNN，当日序号在事务内分配，保证并发唯一；页面只读。
// 必须在 transaction 回调内调用（依赖 SQLite 单写者 + 事务隔离）。
export async function nextBillNo(db: DbClient, prefix: string, date: string): Promise<string> {
  const seqDate = date.replace(/-/g, '')
  await db.run({
    text: 'INSERT INTO bill_sequences (prefix, seq_date, last_no) VALUES (?, ?, 0) ON CONFLICT(prefix, seq_date) DO NOTHING',
    params: [prefix, seqDate],
  })
  await db.run({
    text: 'UPDATE bill_sequences SET last_no = last_no + 1 WHERE prefix = ? AND seq_date = ?',
    params: [prefix, seqDate],
  })
  const row = await db.queryOne<{ last_no: number }>({
    text: 'SELECT last_no FROM bill_sequences WHERE prefix = ? AND seq_date = ?',
    params: [prefix, seqDate],
  })
  const sequence = Number(row?.last_no ?? 0)
  return `${prefix}-${seqDate}-${String(sequence).padStart(5, '0')}`
}

export function today(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function newId(): string {
  return randomUUID()
}
