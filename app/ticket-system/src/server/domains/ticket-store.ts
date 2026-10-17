import type { DbClient } from '@commonapp/dbkit'
import type { Priority, Ticket, TicketStatus } from '../../shared/contract'
import { apiError } from '../api-error'
import { findUserById, toUser } from './organizations'

// tickets 表的数据访问与线路映射，归属 ticketing 模块（架构基线 2.2）。
// collaboration / resolution / evaluation 经此处读取工单，不直读 tickets 表；
// 各模块只写自己负责的列（分配归属、转派归属、处理记录、状态流转）。

export interface TicketRow {
  id: string
  subject: string
  description: string
  category: string
  priority: string
  status: string
  submitter_id: string
  company_id: string
  assigned_group_id: string | null
  handler_id: string | null
  handled_at: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string
}

const TICKET_COLUMNS = 'id, subject, description, category, priority, status, submitter_id, company_id, assigned_group_id, handler_id, handled_at, cancelled_at, created_at, updated_at'

export async function findTicketRow(db: DbClient, id: string): Promise<TicketRow | null> {
  return db.queryOne<TicketRow>({ text: `SELECT ${TICKET_COLUMNS} FROM tickets WHERE id = ?`, params: [id] })
}

export async function requireTicketRow(db: DbClient, id: string): Promise<TicketRow> {
  const row = await findTicketRow(db, id)
  if (!row) throw apiError.notFound('工单不存在')
  return row
}

export function toTicket(row: TicketRow, submitter: ReturnType<typeof toUser>): Ticket {
  return {
    id: row.id,
    subject: row.subject,
    description: row.description,
    category: row.category,
    priority: row.priority as Priority,
    status: row.status as TicketStatus,
    submitter,
    assignedGroupId: row.assigned_group_id,
    createdAt: row.created_at,
    handlerId: row.handler_id,
    handledAt: row.handled_at,
    cancelledAt: row.cancelled_at,
  }
}

export async function findTicket(db: DbClient, id: string): Promise<Ticket | null> {
  const row = await findTicketRow(db, id)
  if (!row) return null
  const submitter = await findUserById(db, row.submitter_id)
  if (!submitter) throw apiError.internal('工单提交人记录缺失')
  return toTicket(row, toUser(submitter))
}

export async function requireTicket(db: DbClient, id: string): Promise<Ticket> {
  const ticket = await findTicket(db, id)
  if (!ticket) throw apiError.notFound('工单不存在')
  return ticket
}
