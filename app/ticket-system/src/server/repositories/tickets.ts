import type { DbClient } from '@commonapp/dbkit'
import { randomUUID } from 'node:crypto'
import type {
  TicketRecord,
  TicketReplyRecord,
  TicketTransferRecord,
  TicketEvaluationRecord,
  TicketPriority,
  TicketStatus,
} from '../../shared/types'

const now = () => new Date().toISOString()

export interface TicketListFilter {
  companyId: string
  status?: string
  category?: string
  priority?: string
  search?: string
  sort?: string
  order?: string
  page: number
  limit: number
}

const SORTABLE = new Set(['created_at', 'priority'])
const ORDERS = new Set(['asc', 'desc'])

export function createTicketRepository(db: DbClient) {
  return {
    async createTicket(input: {
      company_id: string
      subject: string
      description: string
      category: string
      priority: TicketPriority
      submitter_id: string
      status: TicketStatus
      assigned_group_id: string | null
      first_assigned_at: string | null
    }): Promise<TicketRecord> {
      const id = randomUUID()
      const created_at = now()
      await db.run({
        text: `INSERT INTO tickets (id, company_id, subject, description, category, priority, status, submitter_id, assigned_group_id, assigned_handler_id, completed_at, completed_by, first_assigned_at, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)`,
        params: [id, input.company_id, input.subject, input.description, input.category, input.priority, input.status, input.submitter_id, input.assigned_group_id, input.first_assigned_at, created_at],
      })
      return {
        id, company_id: input.company_id, subject: input.subject, description: input.description,
        category: input.category, priority: input.priority, status: input.status,
        submitter_id: input.submitter_id, assigned_group_id: input.assigned_group_id,
        assigned_handler_id: null, completed_at: null, completed_by: null,
        first_assigned_at: input.first_assigned_at, created_at,
      }
    },
    async getTicket(id: string): Promise<TicketRecord | null> {
      return db.queryOne({
        text: 'SELECT id, company_id, subject, description, category, priority, status, submitter_id, assigned_group_id, assigned_handler_id, completed_at, completed_by, first_assigned_at, created_at FROM tickets WHERE id = ?',
        params: [id],
      })
    },
    async getTicketInCompany(id: string, company_id: string): Promise<TicketRecord | null> {
      return db.queryOne({
        text: 'SELECT id, company_id, subject, description, category, priority, status, submitter_id, assigned_group_id, assigned_handler_id, completed_at, completed_by, first_assigned_at, created_at FROM tickets WHERE id = ? AND company_id = ?',
        params: [id, company_id],
      })
    },
    async updateTicket(id: string, fields: { subject?: string; description?: string; category?: string; priority?: TicketPriority }): Promise<void> {
      const sets: string[] = []
      const params: unknown[] = []
      if (fields.subject !== undefined) { sets.push('subject = ?'); params.push(fields.subject) }
      if (fields.description !== undefined) { sets.push('description = ?'); params.push(fields.description) }
      if (fields.category !== undefined) { sets.push('category = ?'); params.push(fields.category) }
      if (fields.priority !== undefined) { sets.push('priority = ?'); params.push(fields.priority) }
      if (sets.length === 0) return
      params.push(id)
      await db.run({ text: `UPDATE tickets SET ${sets.join(', ')} WHERE id = ?`, params })
    },
    async setStatus(id: string, status: TicketStatus, extra?: { assigned_group_id?: string | null; assigned_handler_id?: string | null; completed_at?: string | null; completed_by?: string | null; first_assigned_at?: string | null }): Promise<void> {
      const sets = ['status = ?']
      const params: unknown[] = [status]
      if (extra?.assigned_group_id !== undefined) { sets.push('assigned_group_id = ?'); params.push(extra.assigned_group_id) }
      if (extra?.assigned_handler_id !== undefined) { sets.push('assigned_handler_id = ?'); params.push(extra.assigned_handler_id) }
      if (extra?.completed_at !== undefined) { sets.push('completed_at = ?'); params.push(extra.completed_at) }
      if (extra?.completed_by !== undefined) { sets.push('completed_by = ?'); params.push(extra.completed_by) }
      if (extra?.first_assigned_at !== undefined) { sets.push('first_assigned_at = ?'); params.push(extra.first_assigned_at) }
      params.push(id)
      await db.run({ text: `UPDATE tickets SET ${sets.join(', ')} WHERE id = ?`, params })
    },
    async listTickets(filter: TicketListFilter): Promise<{ rows: TicketRecord[]; total: number }> {
      const where = ['company_id = ?']
      const params: unknown[] = [filter.companyId]
      if (filter.status) { where.push('status = ?'); params.push(filter.status) }
      if (filter.category) { where.push('category = ?'); params.push(filter.category) }
      if (filter.priority) { where.push('priority = ?'); params.push(filter.priority) }
      if (filter.search) { where.push('(subject LIKE ? OR description LIKE ?)'); const q = `%${filter.search}%`; params.push(q, q) }
      const sortColumn = SORTABLE.has(filter.sort ?? '') ? (filter.sort as string) : 'created_at'
      const order = ORDERS.has(filter.order ?? '') ? (filter.order as string) : 'desc'
      const totalRow = await db.queryOne<{ total: number }>({ text: `SELECT COUNT(*) AS total FROM tickets WHERE ${where.join(' AND ')}`, params })
      const total = Number(totalRow?.total ?? 0)
      const offset = (filter.page - 1) * filter.limit
      const rows = await db.queryAll<TicketRecord>({
        text: `SELECT id, company_id, subject, description, category, priority, status, submitter_id, assigned_group_id, assigned_handler_id, completed_at, completed_by, first_assigned_at, created_at FROM tickets WHERE ${where.join(' AND ')} ORDER BY ${sortColumn} ${order}, id ${order} LIMIT ? OFFSET ?`,
        params: [...params, filter.limit, offset],
      })
      return { rows, total }
    },
    async listTicketsByCompanyOrGroups(company_id: string, groupIds: string[], handler_id: string, filter: TicketListFilter): Promise<{ rows: TicketRecord[]; total: number }> {
      // Admin path uses listTickets (company-wide). Handler path: assigned to self or own groups.
      const where = ['company_id = ?']
      const params: unknown[] = [company_id]
      if (filter.status) { where.push('status = ?'); params.push(filter.status) }
      if (filter.category) { where.push('category = ?'); params.push(filter.category) }
      if (filter.priority) { where.push('priority = ?'); params.push(filter.priority) }
      if (filter.search) { where.push('(subject LIKE ? OR description LIKE ?)'); const q = `%${filter.search}%`; params.push(q, q) }
      const scopeClauses = ['assigned_handler_id = ?']
      const scopeParams: unknown[] = [handler_id]
      if (groupIds.length) {
        scopeClauses.push(`assigned_group_id IN (${groupIds.map(() => '?').join(', ')})`)
        scopeParams.push(...groupIds)
      }
      where.push(`(${scopeClauses.join(' OR ')})`)
      params.push(...scopeParams)
      const sortColumn = SORTABLE.has(filter.sort ?? '') ? (filter.sort as string) : 'priority'
      const order = ORDERS.has(filter.order ?? '') ? (filter.order as string) : 'desc'
      const totalRow = await db.queryOne<{ total: number }>({ text: `SELECT COUNT(*) AS total FROM tickets WHERE ${where.join(' AND ')}`, params })
      const total = Number(totalRow?.total ?? 0)
      const offset = (filter.page - 1) * filter.limit
      const rows = await db.queryAll<TicketRecord>({
        text: `SELECT id, company_id, subject, description, category, priority, status, submitter_id, assigned_group_id, assigned_handler_id, completed_at, completed_by, first_assigned_at, created_at FROM tickets WHERE ${where.join(' AND ')} ORDER BY ${sortColumn} ${order}, id ${order} LIMIT ? OFFSET ?`,
        params: [...params, filter.limit, offset],
      })
      return { rows, total }
    },

    async addReply(ticket_id: string, author_id: string, content: string): Promise<TicketReplyRecord> {
      const id = randomUUID()
      const created_at = now()
      await db.run({
        text: 'INSERT INTO ticket_replies (id, ticket_id, author_id, content, created_at) VALUES (?, ?, ?, ?, ?)',
        params: [id, ticket_id, author_id, content, created_at],
      })
      return { id, ticket_id, author_id, content, created_at }
    },
    async listReplies(ticket_id: string): Promise<TicketReplyRecord[]> {
      return db.queryAll({
        text: 'SELECT id, ticket_id, author_id, content, created_at FROM ticket_replies WHERE ticket_id = ? ORDER BY created_at ASC, rowid ASC',
        params: [ticket_id],
      })
    },

    async addTransfer(input: {
      ticket_id: string
      from_handler_id: string | null
      from_group_id: string | null
      to_handler_id: string | null
      to_group_id: string | null
      reason: string | null
    }): Promise<TicketTransferRecord> {
      const id = randomUUID()
      const created_at = now()
      await db.run({
        text: 'INSERT INTO ticket_transfers (id, ticket_id, from_handler_id, from_group_id, to_handler_id, to_group_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        params: [id, input.ticket_id, input.from_handler_id, input.from_group_id, input.to_handler_id, input.to_group_id, input.reason, created_at],
      })
      return { id, ...input, created_at }
    },

    async submitEvaluation(ticket_id: string, rating: number, comment: string | null): Promise<TicketEvaluationRecord> {
      const id = randomUUID()
      const created_at = now()
      await db.run({
        text: 'INSERT INTO ticket_evaluations (id, ticket_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?)',
        params: [id, ticket_id, rating, comment, created_at],
      })
      return { id, ticket_id, rating, comment, created_at }
    },
    async getEvaluation(ticket_id: string): Promise<TicketEvaluationRecord | null> {
      return db.queryOne({
        text: 'SELECT id, ticket_id, rating, comment, created_at FROM ticket_evaluations WHERE ticket_id = ?',
        params: [ticket_id],
      })
    },

    async listBySubmitter(submitter_id: string, company_id: string): Promise<Array<{ id: string; subject: string; status: string; priority: string; created_at: string }>> {
      return db.queryAll({
        text: 'SELECT id, subject, status, priority, created_at FROM tickets WHERE submitter_id = ? AND company_id = ? ORDER BY created_at DESC, rowid DESC',
        params: [submitter_id, company_id],
      })
    },

    // ---- Stats aggregation ----
    async countTickets(company_id: string, departmentId: string | null, startDate: string | null, endDate: string | null): Promise<number> {
      const where = ['company_id = ?']
      const params: unknown[] = [company_id]
      if (departmentId) { where.push('submitter_id IN (SELECT user_id FROM user_profiles WHERE department_id = ?)'); params.push(departmentId) }
      if (startDate) { where.push('created_at >= ?'); params.push(startDate) }
      if (endDate) { where.push('created_at <= ?'); params.push(endDate) }
      const row = await db.queryOne<{ total: number }>({ text: `SELECT COUNT(*) AS total FROM tickets WHERE ${where.join(' AND ')}`, params })
      return Number(row?.total ?? 0)
    },
    async avgResponseHours(company_id: string, startDate: string | null, endDate: string | null): Promise<number> {
      const where = ['company_id = ?', 'first_assigned_at IS NOT NULL', "first_assigned_at >= created_at"]
      const params: unknown[] = [company_id]
      if (startDate) { where.push('created_at >= ?'); params.push(startDate) }
      if (endDate) { where.push('created_at <= ?'); params.push(endDate) }
      const row = await db.queryOne<{ avg_ms: number | null }>({
        text: `SELECT AVG((julianday(first_assigned_at) - julianday(created_at)) * 24 * 3600 * 1000) AS avg_ms FROM tickets WHERE ${where.join(' AND ')}`,
        params,
      })
      const avgMs = row?.avg_ms
      if (avgMs == null || Number.isNaN(avgMs)) return 0
      return avgMs / 3600000
    },
    async avgSatisfaction(company_id: string, startDate: string | null, endDate: string | null): Promise<number> {
      const where = ['t.company_id = ?']
      const params: unknown[] = [company_id]
      if (startDate) { where.push('t.created_at >= ?'); params.push(startDate) }
      if (endDate) { where.push('t.created_at <= ?'); params.push(endDate) }
      const row = await db.queryOne<{ avg_rating: number | null }>({
        text: `SELECT AVG(e.rating) AS avg_rating FROM ticket_evaluations e JOIN tickets t ON t.id = e.ticket_id WHERE ${where.join(' AND ')}`,
        params,
      })
      const avg = row?.avg_rating
      if (avg == null || Number.isNaN(avg)) return 0
      return avg
    },
    async hotTopics(company_id: string, startDate: string | null, endDate: string | null, limit = 10): Promise<Array<{ category: string; count: number }>> {
      const where = ['company_id = ?']
      const params: unknown[] = [company_id]
      if (startDate) { where.push('created_at >= ?'); params.push(startDate) }
      if (endDate) { where.push('created_at <= ?'); params.push(endDate) }
      const rows = await db.queryAll<{ category: string; count: number }>({
        text: `SELECT category, COUNT(*) AS count FROM tickets WHERE ${where.join(' AND ')} GROUP BY category ORDER BY count DESC, category ASC LIMIT ?`,
        params: [...params, limit],
      })
      return rows.map((row) => ({ category: row.category, count: Number(row.count) }))
    },
    async distributionByCompany(): Promise<Array<{ dimension: string; count: number }>> {
      const rows = await db.queryAll<{ dimension: string; count: number }>({
        text: `SELECT COALESCE(c.name, t.company_id) AS dimension, COUNT(*) AS count FROM tickets t LEFT JOIN companies c ON c.id = t.company_id GROUP BY t.company_id ORDER BY count DESC`,
        params: [],
      })
      return rows.map((row) => ({ dimension: row.dimension, count: Number(row.count) }))
    },
    async distributionByDepartment(): Promise<Array<{ dimension: string; count: number }>> {
      const rows = await db.queryAll<{ dimension: string; count: number }>({
        text: `SELECT COALESCE(d.name, '未分配部门') AS dimension, COUNT(*) AS count FROM tickets t LEFT JOIN user_profiles up ON up.user_id = t.submitter_id LEFT JOIN departments d ON d.id = up.department_id GROUP BY d.id ORDER BY count DESC`,
        params: [],
      })
      return rows.map((row) => ({ dimension: row.dimension, count: Number(row.count) }))
    },
  }
}
