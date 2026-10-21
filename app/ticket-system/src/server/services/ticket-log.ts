import type { DbClient } from '@commonapp/dbkit'

/** 契约 §6 日志动作枚举（tickets/ticket_logs CHECK 约束同源）。 */
export type TicketAction =
  | 'created'
  | 'queued'
  | 'auto_assigned'
  | 'transferred'
  | 'replied'
  | 'completed'
  | 'cancelled'
  | 'rated'

export const SYSTEM_OPERATOR = '系统'

export interface LogOperator {
  id: string | null
  name: string
}

/**
 * 在业务事务内写入工单日志（架构基线第 3 节：日志随业务变更同事务写入）。
 * 只接受事务 tx，不接受外部 client。
 */
export function writeTicketLog(
  tx: DbClient,
  ticketId: number,
  action: TicketAction,
  operator: LogOperator,
  detail: string | null,
  at: string,
): Promise<unknown> {
  return tx.run({
    text: 'INSERT INTO ticket_logs (ticket_id, action, operator_id, operator_name, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    params: [ticketId, action, operator.id, operator.name, detail, at],
  })
}

export interface TicketLogEntry {
  id: number
  action: TicketAction
  operatorName: string
  detail: string | null
  createdAt: string
}

export async function listTicketLogs(
  db: DbClient,
  ticketId: number,
  page: number,
  pageSize: number,
): Promise<{ items: TicketLogEntry[]; total: number; page: number; pageSize: number }> {
  const [rows, total] = await Promise.all([
    db.queryAll<TicketLogEntry>({
      text: 'SELECT id, action, operator_name AS operatorName, detail, created_at AS createdAt FROM ticket_logs WHERE ticket_id = ? ORDER BY created_at, id LIMIT ? OFFSET ?',
      params: [ticketId, pageSize, (page - 1) * pageSize],
    }),
    db.queryOne<{ total: number }>({ text: 'SELECT COUNT(*) AS total FROM ticket_logs WHERE ticket_id = ?', params: [ticketId] }),
  ])
  return { items: rows, total: Number(total?.total ?? 0), page, pageSize }
}
