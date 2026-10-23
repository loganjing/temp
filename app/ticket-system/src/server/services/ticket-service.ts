import { randomUUID } from 'node:crypto'
import type { DbClient } from '@commonapp/dbkit'
import type { EmailClient } from '@commonapp/emailkit'
import { sendTicketCompletionEmail } from '../platform/email'
import type { AuditService } from '../platform/audit'
import { TicketStatus, VALID_PRIORITIES } from '../../shared/enums'
import type {
  Ticket, TicketDetail, TicketReply, BusinessGroup, AssignmentRule,
  TicketEvaluation, SubmitterInfo, WorkbenchTicket, DistributionItem,
  DashboardData, LogEntry, PaginatedResult,
} from '../../shared/types'

type TicketRow = {
  id: string; company_id: string; subject: string; description: string
  category: string; priority: string; status: string; submitter_id: string
  business_group_id: string | null; handler_id: string | null
  created_at: string; updated_at: string; handled_at: string | null; completed_at: string | null
}

function mapTicket(row: TicketRow): Ticket {
  return {
    id: row.id, companyId: row.company_id, subject: row.subject,
    description: row.description, category: row.category, priority: row.priority,
    status: row.status, submitterId: row.submitter_id,
    businessGroupId: row.business_group_id ?? null,
    handlerId: row.handler_id ?? null,
    createdAt: row.created_at, updatedAt: row.updated_at,
    handledAt: row.handled_at ?? null, completedAt: row.completed_at ?? null,
  }
}

export type ServiceUser = { id: string; companyId: string | null }

export function createTicketService(db: DbClient, audit: AuditService, email: EmailClient | null) {
  const now = () => new Date().toISOString()
  const uuid = () => randomUUID()

  async function getTicketRow(id: string): Promise<TicketRow | null> {
    return db.queryOne<TicketRow>({ text: 'SELECT * FROM tickets WHERE id = ?', params: [id] })
  }

  async function getTicketWithCompanyCheck(ticketId: string, companyId: string): Promise<TicketRow | null> {
    return db.queryOne<TicketRow>({
      text: 'SELECT * FROM tickets WHERE id = ? AND company_id = ?',
      params: [ticketId, companyId],
    })
  }

  async function tryAutoAssign(ticketId: string, companyId: string, category: string, actorId: string): Promise<void> {
    const rule = await db.queryOne<{ business_group_id: string }>({
      text: 'SELECT business_group_id FROM assignment_rules WHERE company_id = ? AND category = ?',
      params: [companyId, category],
    })
    if (!rule) return
    const ts = now()
    await db.run({
      text: 'UPDATE tickets SET business_group_id = ?, status = ?, updated_at = ? WHERE id = ?',
      params: [rule.business_group_id, TicketStatus.PendingHandle, ts, ticketId],
    })
    await audit.recordTicketEvent(ticketId, 'assigned', actorId, actorId, `business_group_id=${rule.business_group_id}`)
  }

  return {
    async createTicket(user: ServiceUser, input: { subject: string; description: string; category: string; priority: string }): Promise<Ticket> {
      if (!user.companyId) throw new ServiceError('NO_COMPANY', 'User has no company', 400)
      const id = uuid()
      const ts = now()
      await db.run({
        text: `INSERT INTO tickets (id, company_id, subject, description, category, priority, status, submitter_id, business_group_id, handler_id, created_at, updated_at, handled_at, completed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL, NULL)`,
        params: [id, user.companyId, input.subject, input.description, input.category, input.priority, TicketStatus.PendingAssign, user.id, ts, ts],
      })
      await audit.recordTicketEvent(id, 'created', user.id, user.id)
      await tryAutoAssign(id, user.companyId, input.category, user.id)
      const row = await getTicketRow(id)
      if (!row) throw new ServiceError('INTERNAL', 'Ticket not found after insert', 500)
      return mapTicket(row)
    },

    async listTickets(companyId: string | null, filters: { status?: string; priority?: string; category?: string; page: number; pageSize: number }): Promise<PaginatedResult<Ticket>> {
      if (!companyId) return { items: [], total: 0, page: filters.page, pageSize: filters.pageSize }
      const conditions = ['company_id = ?']
      const params: unknown[] = [companyId]
      if (filters.status) { conditions.push('status = ?'); params.push(filters.status) }
      if (filters.priority) { conditions.push('priority = ?'); params.push(filters.priority) }
      if (filters.category) { conditions.push('category = ?'); params.push(filters.category) }
      const where = conditions.join(' AND ')
      const total = Number((await db.queryOne<{ total: number }>({ text: `SELECT COUNT(*) AS total FROM tickets WHERE ${where}`, params }))?.total ?? 0)
      const rows = await db.queryAll<TicketRow>({
        text: `SELECT * FROM tickets WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        params: [...params, filters.pageSize, (filters.page - 1) * filters.pageSize],
      })
      return { items: rows.map(mapTicket), total, page: filters.page, pageSize: filters.pageSize }
    },

    async getTicketDetail(companyId: string | null, ticketId: string): Promise<TicketDetail | null> {
      if (!companyId) return null
      const row = await getTicketWithCompanyCheck(ticketId, companyId)
      if (!row) return null
      const replyRows = await db.queryAll<{ id: string; ticket_id: string; replier_id: string; name: string; content: string; created_at: string }>({
        text: `SELECT r.id, r.ticket_id, r.replier_id, u.name, r.content, r.created_at
               FROM ticket_replies r JOIN users u ON u.id = r.replier_id
               WHERE r.ticket_id = ? ORDER BY r.created_at ASC`,
        params: [ticketId],
      })
      const replies: TicketReply[] = replyRows.map((r) => ({
        id: r.id, ticketId: r.ticket_id, replierId: r.replier_id,
        replierName: r.name, content: r.content, createdAt: r.created_at,
      }))
      return { ...mapTicket(row), replies }
    },

    async cancelTicket(user: ServiceUser, ticketId: string): Promise<Ticket | null> {
      if (!user.companyId) return null
      const row = await getTicketWithCompanyCheck(ticketId, user.companyId)
      if (!row) return null
      if (row.status !== TicketStatus.PendingAssign && row.status !== TicketStatus.PendingHandle) {
        throw new ServiceError('INVALID_STATUS', 'Ticket cannot be cancelled from current status', 400)
      }
      const ts = now()
      await db.run({ text: 'UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?', params: [TicketStatus.Cancelled, ts, ticketId] })
      await audit.recordTicketEvent(ticketId, 'cancelled', user.id, user.id)
      const updated = await getTicketRow(ticketId)
      return updated ? mapTicket(updated) : null
    },

    async addReply(user: ServiceUser, userName: string, ticketId: string, content: string): Promise<TicketReply | null> {
      if (!user.companyId) return null
      const row = await getTicketWithCompanyCheck(ticketId, user.companyId)
      if (!row) return null
      const id = uuid()
      const ts = now()
      await db.run({
        text: 'INSERT INTO ticket_replies (id, ticket_id, replier_id, content, created_at) VALUES (?, ?, ?, ?, ?)',
        params: [id, ticketId, user.id, content, ts],
      })
      return { id, ticketId, replierId: user.id, replierName: userName, content, createdAt: ts }
    },

    async transferTicket(user: ServiceUser, ticketId: string, toHandlerId: string, reason: string): Promise<Ticket | null> {
      if (!user.companyId) return null
      const row = await getTicketWithCompanyCheck(ticketId, user.companyId)
      if (!row) return null
      const id = uuid()
      const ts = now()
      await db.transaction(async (tx) => {
        await tx.run({
          text: 'INSERT INTO ticket_transfers (id, ticket_id, from_handler_id, to_handler_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          params: [id, ticketId, row.handler_id, toHandlerId, reason || null, ts],
        })
        await tx.run({ text: 'UPDATE tickets SET handler_id = ?, updated_at = ? WHERE id = ?', params: [toHandlerId, ts, ticketId] })
      })
      await audit.recordTicketEvent(ticketId, 'transferred', user.id, user.id, `to=${toHandlerId}`)
      const updated = await getTicketRow(ticketId)
      return updated ? mapTicket(updated) : null
    },

    async getSubmitterInfo(companyId: string | null, ticketId: string): Promise<SubmitterInfo | null> {
      if (!companyId) return null
      const ticket = await getTicketWithCompanyCheck(ticketId, companyId)
      if (!ticket) return null
      const user = await db.queryOne<{ id: string; name: string; email: string; company_id: string; department: string | null }>({
        text: 'SELECT id, name, email, company_id, department FROM users WHERE id = ?',
        params: [ticket.submitter_id],
      })
      if (!user) return null
      const company = await db.queryOne<{ name: string }>({ text: 'SELECT name FROM companies WHERE id = ?', params: [user.company_id] })
      const history = await db.queryAll<{ id: string; subject: string; status: string; priority: string; created_at: string }>({
        text: 'SELECT id, subject, status, priority, created_at FROM tickets WHERE submitter_id = ? ORDER BY created_at DESC',
        params: [user.id],
      })
      return {
        id: user.id, name: user.name, email: user.email,
        companyId: user.company_id, companyName: company?.name ?? '',
        department: user.department ?? null,
        historyTickets: history.map((h) => ({ id: h.id, subject: h.subject, status: h.status, priority: h.priority, createdAt: h.created_at })),
      }
    },

    async completeTicket(user: ServiceUser, ticketId: string, _resolution: string): Promise<Ticket | null> {
      if (!user.companyId) return null
      const row = await getTicketWithCompanyCheck(ticketId, user.companyId)
      if (!row) return null
      if (row.status !== TicketStatus.PendingHandle) {
        throw new ServiceError('INVALID_STATUS', 'Ticket is not in pending_handle status', 400)
      }
      const ts = now()
      await db.run({
        text: 'UPDATE tickets SET status = ?, handler_id = ?, handled_at = ?, completed_at = ?, updated_at = ? WHERE id = ?',
        params: [TicketStatus.Completed, user.id, ts, ts, ts, ticketId],
      })
      await audit.recordTicketEvent(ticketId, 'completed', user.id, user.id, _resolution)

      // Email notification (degrade on failure)
      const submitter = await db.queryOne<{ email: string }>({ text: 'SELECT email FROM users WHERE id = ?', params: [row.submitter_id] })
      if (submitter?.email) {
        try {
          await sendTicketCompletionEmail(email, submitter.email, row.subject, ticketId)
        } catch (err) {
          console.error('[ticket] email notification failed', err)
        }
      }

      const updated = await getTicketRow(ticketId)
      return updated ? mapTicket(updated) : null
    },

    async createEvaluation(user: ServiceUser, ticketId: string, rating: number, comment: string | null): Promise<TicketEvaluation> {
      if (!user.companyId) throw new ServiceError('NO_COMPANY', 'User has no company', 400)
      const row = await getTicketWithCompanyCheck(ticketId, user.companyId)
      if (!row) throw new ServiceError('NOT_FOUND', 'Ticket not found', 404)
      if (row.status !== TicketStatus.Completed) throw new ServiceError('INVALID_STATUS', 'Ticket is not completed', 400)
      if (row.submitter_id !== user.id) throw new ServiceError('FORBIDDEN', 'Only the submitter can evaluate', 403)
      const existing = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM ticket_evaluations WHERE ticket_id = ?', params: [ticketId] })
      if (existing) throw new ServiceError('ALREADY_EVALUATED', 'Ticket already evaluated', 400)
      const id = uuid()
      const ts = now()
      await db.run({
        text: 'INSERT INTO ticket_evaluations (id, ticket_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?)',
        params: [id, ticketId, rating, comment, ts],
      })
      await audit.recordTicketEvent(ticketId, 'evaluated', user.id, user.id, `rating=${rating}`)
      return { id, ticketId, rating, comment, createdAt: ts }
    },

    async getEvaluation(companyId: string | null, ticketId: string): Promise<TicketEvaluation | null> {
      if (!companyId) return null
      const ticket = await getTicketWithCompanyCheck(ticketId, companyId)
      if (!ticket) return null
      const row = await db.queryOne<{ id: string; ticket_id: string; rating: number; comment: string | null; created_at: string }>({
        text: 'SELECT id, ticket_id, rating, comment, created_at FROM ticket_evaluations WHERE ticket_id = ?',
        params: [ticketId],
      })
      if (!row) return null
      return { id: row.id, ticketId: row.ticket_id, rating: row.rating, comment: row.comment, createdAt: row.created_at }
    },

    async getDistribution(companyId: string | null, dimension: string): Promise<{ dimension: string; items: DistributionItem[] }> {
      if (!companyId) return { dimension, items: [] }
      if (dimension === 'company') {
        const rows = await db.queryAll<{ key: string; count: number }>({
          text: `SELECT company_id AS key, COUNT(*) AS count FROM tickets WHERE company_id = ? GROUP BY company_id`,
          params: [companyId],
        })
        const names = await db.queryAll<{ id: string; name: string }>({ text: 'SELECT id, name FROM companies WHERE id = ?', params: [companyId] })
        const nameMap = new Map(names.map((n) => [n.id, n.name]))
        return { dimension, items: rows.map((r) => ({ key: r.key, label: nameMap.get(r.key) ?? r.key, count: r.count })) }
      }
      if (dimension === 'department') {
        const rows = await db.queryAll<{ key: string | null; count: number }>({
          text: `SELECT u.department AS key, COUNT(*) AS count FROM tickets t JOIN users u ON u.id = t.submitter_id WHERE t.company_id = ? GROUP BY u.department`,
          params: [companyId],
        })
        return { dimension, items: rows.map((r) => ({ key: r.key ?? '(无部门)', label: r.key ?? '(无部门)', count: r.count })) }
      }
      throw new ServiceError('INVALID_INPUT', 'dimension must be "company" or "department"', 400)
    },

    async getDashboard(companyId: string | null): Promise<DashboardData> {
      if (!companyId) return { ticketCount: 0, avgResponseTime: 0, satisfactionRate: 0, hotCategories: [] }
      const countRow = await db.queryOne<{ total: number }>({ text: 'SELECT COUNT(*) AS total FROM tickets WHERE company_id = ?', params: [companyId] })
      const avgRow = await db.queryOne<{ avg_hours: number | null }>({
        text: `SELECT AVG((julianday(handled_at) - julianday(created_at)) * 24) AS avg_hours FROM tickets WHERE company_id = ? AND handled_at IS NOT NULL`,
        params: [companyId],
      })
      const satRow = await db.queryOne<{ total: number; satisfied: number }>({
        text: `SELECT COUNT(*) AS total, SUM(CASE WHEN e.rating >= 4 THEN 1 ELSE 0 END) AS satisfied FROM ticket_evaluations e JOIN tickets t ON t.id = e.ticket_id WHERE t.company_id = ?`,
        params: [companyId],
      })
      const hotRows = await db.queryAll<{ category: string; count: number }>({
        text: `SELECT category, COUNT(*) AS count FROM tickets WHERE company_id = ? GROUP BY category ORDER BY count DESC LIMIT 5`,
        params: [companyId],
      })
      const total = Number(satRow?.total ?? 0)
      const satisfied = Number(satRow?.satisfied ?? 0)
      return {
        ticketCount: Number(countRow?.total ?? 0),
        avgResponseTime: Math.round(Number(avgRow?.avg_hours ?? 0) * 100) / 100,
        satisfactionRate: total > 0 ? Math.round((satisfied / total) * 100) : 0,
        hotCategories: hotRows.map((r) => ({ category: r.category, count: r.count })),
      }
    },

    async getWorkbenchTickets(companyId: string | null, filters: { search?: string; priority?: string; category?: string; sort: string; page: number; pageSize: number }): Promise<PaginatedResult<WorkbenchTicket>> {
      if (!companyId) return { items: [], total: 0, page: filters.page, pageSize: filters.pageSize }
      const conditions = ['t.company_id = ?']
      const params: unknown[] = [companyId]
      if (filters.priority) { conditions.push('t.priority = ?'); params.push(filters.priority) }
      if (filters.category) { conditions.push('t.category = ?'); params.push(filters.category) }
      if (filters.search) {
        conditions.push('(t.subject LIKE ? OR t.description LIKE ?)')
        const q = `%${filters.search}%`
        params.push(q, q)
      }
      const where = conditions.join(' AND ')
      const sortMap: Record<string, string> = {
        created_asc: 't.created_at ASC',
        created_desc: 't.created_at DESC',
        priority: 'CASE t.priority WHEN \'P0\' THEN 0 WHEN \'P1\' THEN 1 WHEN \'P2\' THEN 2 WHEN \'P3\' THEN 3 WHEN \'P4\' THEN 4 ELSE 5 END, t.created_at DESC',
      }
      const orderBy = sortMap[filters.sort] ?? sortMap.created_desc
      const total = Number((await db.queryOne<{ total: number }>({ text: `SELECT COUNT(*) AS total FROM tickets t WHERE ${where}`, params }))?.total ?? 0)
      const rows = await db.queryAll<{ id: string; subject: string; category: string; priority: string; status: string; submitter_name: string; handler_name: string | null; created_at: string }>({
        text: `SELECT t.id, t.subject, t.category, t.priority, t.status, u.name AS submitter_name, h.name AS handler_name, t.created_at
               FROM tickets t JOIN users u ON u.id = t.submitter_id LEFT JOIN users h ON h.id = t.handler_id
               WHERE ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
        params: [...params, filters.pageSize, (filters.page - 1) * filters.pageSize],
      })
      return {
        items: rows.map((r) => ({
          id: r.id, subject: r.subject, category: r.category, priority: r.priority,
          status: r.status, submitterName: r.submitter_name, handlerName: r.handler_name ?? null, createdAt: r.created_at,
        })),
        total, page: filters.page, pageSize: filters.pageSize,
      }
    },

    async getTicketLogs(companyId: string | null, ticketId: string): Promise<{ items: LogEntry[] } | null> {
      if (!companyId) return null
      const ticket = await getTicketWithCompanyCheck(ticketId, companyId)
      if (!ticket) return null
      const items = await audit.listByTicket(ticketId)
      return { items }
    },

    async createBusinessGroup(companyId: string, name: string): Promise<BusinessGroup> {
      const id = uuid()
      const ts = now()
      await db.run({
        text: 'INSERT INTO business_groups (id, company_id, name, created_at) VALUES (?, ?, ?, ?)',
        params: [id, companyId, name, ts],
      })
      return { id, companyId, name, members: [], createdAt: ts }
    },

    async listBusinessGroups(companyId: string): Promise<{ items: BusinessGroup[] }> {
      const groups = await db.queryAll<{ id: string; company_id: string; name: string; created_at: string }>({
        text: 'SELECT id, company_id, name, created_at FROM business_groups WHERE company_id = ? ORDER BY created_at ASC',
        params: [companyId],
      })
      const items: BusinessGroup[] = []
      for (const g of groups) {
        const members = await db.queryAll<{ id: string; name: string; email: string }>({
          text: `SELECT u.id, u.name, u.email FROM business_group_members m JOIN users u ON u.id = m.user_id WHERE m.business_group_id = ?`,
          params: [g.id],
        })
        items.push({ id: g.id, companyId: g.company_id, name: g.name, members, createdAt: g.created_at })
      }
      return { items }
    },

    async setBusinessGroupMembers(companyId: string, groupId: string, memberIds: string[]): Promise<BusinessGroup | null> {
      const group = await db.queryOne<{ id: string; company_id: string; name: string; created_at: string }>({
        text: 'SELECT id, company_id, name, created_at FROM business_groups WHERE id = ? AND company_id = ?',
        params: [groupId, companyId],
      })
      if (!group) return null
      const ts = now()
      await db.transaction(async (tx) => {
        await tx.run({ text: 'DELETE FROM business_group_members WHERE business_group_id = ?', params: [groupId] })
        for (const userId of memberIds) {
          await tx.run({
            text: 'INSERT INTO business_group_members (business_group_id, user_id, created_at) VALUES (?, ?, ?)',
            params: [groupId, userId, ts],
          })
        }
      })
      const members = await db.queryAll<{ id: string; name: string; email: string }>({
        text: `SELECT u.id, u.name, u.email FROM business_group_members m JOIN users u ON u.id = m.user_id WHERE m.business_group_id = ?`,
        params: [groupId],
      })
      return { id: group.id, companyId: group.company_id, name: group.name, members, createdAt: group.created_at }
    },

    async createAssignmentRule(companyId: string, category: string, businessGroupId: string): Promise<AssignmentRule | null> {
      const group = await db.queryOne<{ id: string }>({
        text: 'SELECT id FROM business_groups WHERE id = ? AND company_id = ?',
        params: [businessGroupId, companyId],
      })
      if (!group) return null
      const id = uuid()
      const ts = now()
      await db.run({
        text: 'INSERT INTO assignment_rules (id, company_id, category, business_group_id, created_at) VALUES (?, ?, ?, ?, ?)',
        params: [id, companyId, category, businessGroupId, ts],
      })
      return { id, companyId, category, businessGroupId, createdAt: ts }
    },

    async listAssignmentRules(companyId: string): Promise<{ items: AssignmentRule[] }> {
      const rows = await db.queryAll<{ id: string; company_id: string; category: string; business_group_id: string; created_at: string }>({
        text: 'SELECT id, company_id, category, business_group_id, created_at FROM assignment_rules WHERE company_id = ? ORDER BY created_at ASC',
        params: [companyId],
      })
      return { items: rows.map((r) => ({ id: r.id, companyId: r.company_id, category: r.category, businessGroupId: r.business_group_id, createdAt: r.created_at })) }
    },
  }
}

export class ServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: 400 | 403 | 404 | 500,
  ) {
    super(message)
  }
}

export type TicketService = ReturnType<typeof createTicketService>
export { VALID_PRIORITIES }
