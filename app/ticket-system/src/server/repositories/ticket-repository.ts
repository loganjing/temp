import { randomUUID } from 'node:crypto'
import type { DbClient } from '@commonapp/dbkit'
import type { TicketListItem, TicketPriority, TicketStatus } from '../../shared/types'

export interface TicketRow {
  id: string
  subject: string
  description: string | null
  category: string
  priority: TicketPriority
  status: TicketStatus
  company_id: string
  submitter_id: string
  business_group_id: string | null
  assignee_id: string | null
  handler_id: string | null
  created_at: string
  updated_at: string
  handled_at: string | null
}

export interface TicketDetailRow extends TicketRow {
  submitterName: string
  assigneeName: string | null
  businessGroupName: string | null
  handlerName: string | null
  submitterEmail: string
  companyName: string | null
}

export interface ReplyRow {
  id: string
  ticket_id: string
  replier_id: string
  replierName: string
  content: string
  replied_at: string
}

export interface EvaluationRow {
  id: string
  ticket_id: string
  rating: number
  comment: string | null
  evaluated_at: string
}

export interface TicketLogRow {
  id: string
  event_type: string
  actor_user_id: string | null
  occurred_at: string
  metadata_json: string
}

const SORT_COLUMNS: Record<string, string> = {
  created_at: 't.created_at',
  priority: 't.priority',
  status: 't.status',
}

interface ListFilters {
  companyId?: string
  status?: string
  priority?: string
  category?: string
  search?: string
  sort?: string
  page?: number
  pageSize?: number
  visibleToUserId?: string
  visibleToGroupIds?: string[]
}

export function createTicketRepository(db: DbClient) {
  async function list(filters: ListFilters): Promise<{ items: TicketListItem[]; total: number }> {
    const where: string[] = []
    const params: unknown[] = []
    if (filters.companyId) { where.push('t.company_id = ?'); params.push(filters.companyId) }
    if (filters.status) { where.push('t.status = ?'); params.push(filters.status) }
    if (filters.priority) { where.push('t.priority = ?'); params.push(filters.priority) }
    if (filters.category) { where.push('t.category = ?'); params.push(filters.category) }
    if (filters.search?.trim()) {
      where.push('(LOWER(t.subject) LIKE ? OR LOWER(COALESCE(t.description, \'\')) LIKE ?)')
      const q = `%${filters.search.trim().toLowerCase()}%`
      params.push(q, q)
    }
    if (filters.visibleToUserId) {
      const visibleParts: string[] = ['t.submitter_id = ?']
      params.push(filters.visibleToUserId)
      if (filters.visibleToGroupIds?.length) {
        const placeholders = filters.visibleToGroupIds.map(() => '?').join(',')
        visibleParts.push(`t.business_group_id IN (${placeholders})`)
        params.push(...filters.visibleToGroupIds)
        visibleParts.push('t.assignee_id = ?')
        params.push(filters.visibleToUserId)
      } else {
        visibleParts.push('t.assignee_id = ?')
        params.push(filters.visibleToUserId)
      }
      where.push(`(${visibleParts.join(' OR ')})`)
    }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const [sortField, sortDir] = (filters.sort ?? 'created_at').split(/\s+/)
    const column = SORT_COLUMNS[sortField] ?? 't.created_at'
    const direction = (sortDir ?? 'desc').toUpperCase() === 'ASC' ? 'ASC' : 'DESC'
    const page = Math.max(filters.page ?? 1, 1)
    const pageSize = Math.min(Math.max(filters.pageSize ?? 20, 1), 100)
    const offset = (page - 1) * pageSize
    const items = await db.queryAll<TicketListItem>({
      text: `SELECT t.id, t.subject, t.category, t.priority, t.status, t.company_id AS companyId,
                    s.name AS submitterName, a.name AS assigneeName, bg.name AS businessGroupName, t.created_at AS createdAt
             FROM tickets t
             LEFT JOIN users s ON t.submitter_id = s.id
             LEFT JOIN users a ON t.assignee_id = a.id
             LEFT JOIN business_groups bg ON t.business_group_id = bg.id
             ${whereClause}
             ORDER BY ${column} ${direction}, t.id DESC
             LIMIT ? OFFSET ?`,
      params: [...params, pageSize, offset],
    })
    const totalRow = await db.queryOne<{ total: number }>({
      text: `SELECT COUNT(*) AS total FROM tickets t ${whereClause}`,
      params,
    })
    return { items, total: Number(totalRow?.total ?? 0) }
  }

  async function findById(id: string): Promise<TicketRow | null> {
    return db.queryOne<TicketRow>({
      text: `SELECT id, subject, description, category, priority, status, company_id, submitter_id,
                    business_group_id, assignee_id, handler_id, created_at, updated_at, handled_at
             FROM tickets WHERE id = ?`,
      params: [id],
    })
  }

  async function findDetailById(id: string): Promise<TicketDetailRow | null> {
    return db.queryOne<TicketDetailRow>({
      text: `SELECT t.*, s.name AS submitterName, s.email AS submitterEmail,
                    a.name AS assigneeName, bg.name AS businessGroupName, h.name AS handlerName,
                    c.name AS companyName
             FROM tickets t
             LEFT JOIN users s ON t.submitter_id = s.id
             LEFT JOIN users a ON t.assignee_id = a.id
             LEFT JOIN users h ON t.handler_id = h.id
             LEFT JOIN business_groups bg ON t.business_group_id = bg.id
             LEFT JOIN companies c ON t.company_id = c.id
             WHERE t.id = ?`,
      params: [id],
    })
  }

  async function insert(data: {
    id: string; subject: string; description: string | null; category: string
    priority: TicketPriority; status: TicketStatus; companyId: string; submitterId: string
    businessGroupId: string | null; createdAt: string
  }): Promise<void> {
    await db.run({
      text: `INSERT INTO tickets (id, subject, description, category, priority, status, company_id, submitter_id, business_group_id, assignee_id, handler_id, created_at, updated_at, handled_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL)`,
      params: [data.id, data.subject, data.description, data.category, data.priority, data.status,
        data.companyId, data.submitterId, data.businessGroupId, data.createdAt, data.createdAt],
    })
  }

  async function updateStatus(id: string, status: TicketStatus, updatedAt: string): Promise<boolean> {
    const result = await db.run({ text: 'UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?', params: [status, updatedAt, id] })
    return result.changes === 1
  }

  async function updateTransfer(id: string, assigneeId: string | null, groupId: string | null, updatedAt: string): Promise<boolean> {
    const result = await db.run({
      text: 'UPDATE tickets SET assignee_id = ?, business_group_id = ?, updated_at = ? WHERE id = ?',
      params: [assigneeId, groupId, updatedAt, id],
    })
    return result.changes === 1
  }

  async function updateComplete(id: string, handlerId: string, handledAt: string): Promise<boolean> {
    const result = await db.run({
      text: 'UPDATE tickets SET status = ?, handler_id = ?, handled_at = ?, updated_at = ? WHERE id = ?',
      params: ['completed', handlerId, handledAt, handledAt, id],
    })
    return result.changes === 1
  }

  async function insertReply(data: { id: string; ticketId: string; replierId: string; content: string; repliedAt: string }): Promise<ReplyRow> {
    await db.run({
      text: 'INSERT INTO ticket_replies (id, ticket_id, replier_id, content, replied_at) VALUES (?, ?, ?, ?, ?)',
      params: [data.id, data.ticketId, data.replierId, data.content, data.repliedAt],
    })
    const row = await db.queryOne<ReplyRow>({
      text: `SELECT r.id, r.ticket_id, r.replier_id, u.name AS replierName, r.content, r.replied_at
             FROM ticket_replies r JOIN users u ON r.replier_id = u.id WHERE r.id = ?`,
      params: [data.id],
    })
    return row!
  }

  async function listReplies(ticketId: string): Promise<ReplyRow[]> {
    return db.queryAll<ReplyRow>({
      text: `SELECT r.id, r.ticket_id, r.replier_id, u.name AS replierName, r.content, r.replied_at
             FROM ticket_replies r JOIN users u ON r.replier_id = u.id
             WHERE r.ticket_id = ? ORDER BY r.replied_at ASC, r.id ASC`,
      params: [ticketId],
    })
  }

  async function insertEvaluation(data: { id: string; ticketId: string; rating: number; comment: string | null; evaluatedAt: string }): Promise<EvaluationRow> {
    await db.run({
      text: 'INSERT INTO ticket_evaluations (id, ticket_id, rating, comment, evaluated_at) VALUES (?, ?, ?, ?, ?)',
      params: [data.id, data.ticketId, data.rating, data.comment, data.evaluatedAt],
    })
    return (await db.queryOne<EvaluationRow>({
      text: 'SELECT id, ticket_id, rating, comment, evaluated_at FROM ticket_evaluations WHERE id = ?',
      params: [data.id],
    }))!
  }

  async function findEvaluation(ticketId: string): Promise<EvaluationRow | null> {
    return db.queryOne<EvaluationRow>({
      text: 'SELECT id, ticket_id, rating, comment, evaluated_at FROM ticket_evaluations WHERE ticket_id = ?',
      params: [ticketId],
    })
  }

  async function findHistoricalTickets(submitterId: string, excludeTicketId: string): Promise<Array<{ id: string; subject: string; status: TicketStatus; createdAt: string }>> {
    return db.queryAll({
      text: `SELECT id, subject, status, created_at AS createdAt FROM tickets
             WHERE submitter_id = ? AND id != ? ORDER BY created_at DESC LIMIT 10`,
      params: [submitterId, excludeTicketId],
    })
  }

  async function findUserBusinessGroupIds(userId: string): Promise<string[]> {
    const rows = await db.queryAll<{ group_id: string }>({
      text: 'SELECT group_id FROM business_group_members WHERE user_id = ?',
      params: [userId],
    })
    return rows.map((r) => r.group_id)
  }

  async function findTicketLogs(ticketId: string, limit = 20): Promise<TicketLogRow[]> {
    return db.queryAll<TicketLogRow>({
      text: `SELECT id, event_type, actor_user_id, occurred_at, metadata_json
             FROM audit_events
             WHERE event_type LIKE 'ticket.%' AND json_extract(metadata_json, '$.ticketId') = ?
             ORDER BY occurred_at DESC, id DESC LIMIT ?`,
      params: [ticketId, limit],
    })
  }

  return {
    list, findById, findDetailById, insert, updateStatus, updateTransfer, updateComplete,
    insertReply, listReplies, insertEvaluation, findEvaluation, findHistoricalTickets,
    findUserBusinessGroupIds, findTicketLogs, createId: randomUUID,
  }
}

export type TicketRepository = ReturnType<typeof createTicketRepository>
