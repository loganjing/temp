import { randomUUID } from 'node:crypto'
import type { DbClient } from '@commonapp/dbkit'
import type { createAuditKit } from '@commonapp/auditkit'
import type { createEmailClient } from '@commonapp/emailkit'
import { SLA_PRIORITIES, isCancellable, isTransferable } from '../../shared/types'
import { ServiceError } from './errors'

type AuditKit = ReturnType<typeof createAuditKit>
type EmailClient = ReturnType<typeof createEmailClient>

interface Deps {
  db: DbClient
  auditKit: AuditKit
  emailClient: EmailClient
}

export function createTicketService(deps: Deps) {
  const { db, auditKit, emailClient } = deps

  async function recordAudit(type: string, actorUserId: string, metadata: Record<string, unknown>) {
    await auditKit.record({ type, occurredAt: new Date().toISOString(), actorUserId, metadata })
  }

  async function createTicket(params: {
    title: string; description: string; categoryId: string; slaPriority: string
    submitterId: string; companyId: string
  }) {
    if (!SLA_PRIORITIES.includes(params.slaPriority as never))
      throw new ServiceError(400, 'invalid_input', `slaPriority must be one of: ${SLA_PRIORITIES.join(', ')}`)

    const category = await db.queryOne<{ id: string }>({
      text: 'SELECT id FROM ticket_categories WHERE id = ? AND company_id = ?',
      params: [params.categoryId, params.companyId],
    })
    if (!category) throw new ServiceError(400, 'invalid_input', 'Category not found in your company')

    const now = new Date().toISOString()
    const id = randomUUID()

    const rule = await db.queryOne<{ business_group_id: string }>({
      text: 'SELECT business_group_id FROM category_assignment_rules WHERE category_id = ? AND company_id = ?',
      params: [params.categoryId, params.companyId],
    })

    const status = rule ? 'pending_processing' : 'pending_assignment'
    const businessGroupId = rule?.business_group_id ?? null
    const assignedAt = rule ? now : null

    await db.run({
      text: 'INSERT INTO tickets (id, title, description, category_id, company_id, submitter_id, sla_priority, status, business_group_id, created_at, assigned_at, processed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      params: [id, params.title, params.description, params.categoryId, params.companyId, params.submitterId, params.slaPriority, status, businessGroupId, now, assignedAt, assignedAt],
    })

    await recordAudit('ticket_created', params.submitterId, { ticketId: id, title: params.title, categoryId: params.categoryId })
    if (rule) {
      await recordAudit('ticket_assigned', params.submitterId, { ticketId: id, businessGroupId: rule.business_group_id })
    }

    return {
      id, title: params.title, description: params.description, categoryId: params.categoryId,
      slaPriority: params.slaPriority, status, businessGroupId, createdAt: now,
    }
  }

  async function listTickets(params: {
    companyId: string; status?: string; slaPriority?: string; categoryId?: string
    search?: string; sortBy?: string; sortOrder?: string; page?: number; pageSize?: number
  }) {
    const conditions: string[] = ['t.company_id = ?']
    const sqlParams: unknown[] = [params.companyId]

    if (params.status) { conditions.push('t.status = ?'); sqlParams.push(params.status) }
    if (params.slaPriority) { conditions.push('t.sla_priority = ?'); sqlParams.push(params.slaPriority) }
    if (params.categoryId) { conditions.push('t.category_id = ?'); sqlParams.push(params.categoryId) }
    if (params.search) {
      conditions.push('(t.title LIKE ? OR t.description LIKE ?)')
      sqlParams.push(`%${params.search}%`, `%${params.search}%`)
    }

    const where = conditions.join(' AND ')
    const validSort: Record<string, string> = { createdAt: 't.created_at', slaPriority: 't.sla_priority', status: 't.status' }
    const sortBy = validSort[params.sortBy ?? ''] ?? 't.created_at'
    const sortOrder = params.sortOrder === 'asc' ? 'ASC' : 'DESC'
    const page = Math.max(1, Number(params.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20))
    const offset = (page - 1) * pageSize

    const [rows, countResult] = await Promise.all([
      db.queryAll<{ id: string; title: string; status: string; sla_priority: string; created_at: string; category_name: string; submitter_name: string }>({
        text: `SELECT t.id, t.title, t.status, t.sla_priority, t.created_at, tc.name AS category_name, u.name AS submitter_name FROM tickets t LEFT JOIN ticket_categories tc ON tc.id = t.category_id LEFT JOIN users u ON u.id = t.submitter_id WHERE ${where} ORDER BY ${sortBy} ${sortOrder} LIMIT ? OFFSET ?`,
        params: [...sqlParams, pageSize, offset],
      }),
      db.queryOne<{ total: number }>({ text: `SELECT COUNT(*) AS total FROM tickets t WHERE ${where}`, params: sqlParams }),
    ])

    return {
      items: rows.map(r => ({ id: r.id, title: r.title, status: r.status, slaPriority: r.sla_priority, categoryName: r.category_name, submitterName: r.submitter_name, createdAt: r.created_at })),
      total: Number(countResult?.total ?? 0),
    }
  }

  async function getTicket(ticketId: string, companyId: string) {
    const t = await db.queryOne<{
      id: string; title: string; description: string; category_id: string; category_name: string
      sla_priority: string; status: string; company_id: string
      submitter_id: string; submitter_name: string; submitter_email: string
      company_name: string; department_name: string | null
      business_group_id: string | null; handler_id: string | null; handler_name: string | null
      created_at: string; assigned_at: string | null; processed_at: string | null
      completed_at: string | null; cancelled_at: string | null
      sat_rating: number | null; sat_comment: string | null; sat_created_at: string | null
    }>({
      text: `SELECT t.id, t.title, t.description, t.category_id, tc.name AS category_name, t.sla_priority, t.status, t.company_id, t.submitter_id, u.name AS submitter_name, u.email AS submitter_email, c.name AS company_name, d.name AS department_name, t.business_group_id, t.handler_id, h.name AS handler_name, t.created_at, t.assigned_at, t.processed_at, t.completed_at, t.cancelled_at, ts.rating AS sat_rating, ts.comment AS sat_comment, ts.created_at AS sat_created_at FROM tickets t LEFT JOIN ticket_categories tc ON tc.id = t.category_id LEFT JOIN companies c ON c.id = t.company_id LEFT JOIN users u ON u.id = t.submitter_id LEFT JOIN departments d ON d.id = u.department_id LEFT JOIN users h ON h.id = t.handler_id LEFT JOIN ticket_satisfactions ts ON ts.ticket_id = t.id WHERE t.id = ? AND t.company_id = ?`,
      params: [ticketId, companyId],
    })
    if (!t) throw new ServiceError(404, 'not_found', 'Ticket not found')

    const replies = await db.queryAll<{ id: string; replier_id: string; replier_name: string; content: string; created_at: string }>({
      text: `SELECT tr.id, tr.replier_id, tr.content, tr.created_at, u.name AS replier_name FROM ticket_replies tr LEFT JOIN users u ON u.id = tr.replier_id WHERE tr.ticket_id = ? ORDER BY tr.created_at ASC`,
      params: [ticketId],
    })

    return {
      id: t.id, title: t.title, description: t.description, categoryId: t.category_id, categoryName: t.category_name,
      slaPriority: t.sla_priority, status: t.status, companyId: t.company_id,
      submitter: { id: t.submitter_id, displayName: t.submitter_name, email: t.submitter_email, companyName: t.company_name, departmentName: t.department_name },
      businessGroupId: t.business_group_id, handlerId: t.handler_id, handlerName: t.handler_name,
      replies: replies.map(r => ({ id: r.id, replierId: r.replier_id, replierName: r.replier_name, content: r.content, createdAt: r.created_at })),
      createdAt: t.created_at, assignedAt: t.assigned_at, processedAt: t.processed_at, completedAt: t.completed_at, cancelledAt: t.cancelled_at,
      satisfaction: t.sat_rating != null ? { rating: t.sat_rating, comment: t.sat_comment, createdAt: t.sat_created_at! } : null,
    }
  }

  async function addReply(ticketId: string, content: string, replierId: string, companyId: string) {
    const ticket = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM tickets WHERE id = ? AND company_id = ?', params: [ticketId, companyId] })
    if (!ticket) throw new ServiceError(404, 'not_found', 'Ticket not found')

    const now = new Date().toISOString()
    const id = randomUUID()
    await db.run({ text: 'INSERT INTO ticket_replies (id, ticket_id, replier_id, content, created_at) VALUES (?, ?, ?, ?, ?)', params: [id, ticketId, replierId, content, now] })

    const user = await db.queryOne<{ name: string }>({ text: 'SELECT name FROM users WHERE id = ?', params: [replierId] })
    await recordAudit('ticket_replied', replierId, { ticketId, replyId: id })

    return { id, replierId, replierName: user?.name ?? '', content, createdAt: now }
  }

  async function transferTicket(ticketId: string, toBusinessGroupId: string, reason: string | undefined, transferredBy: string, companyId: string) {
    const ticket = await db.queryOne<{ id: string; status: string; business_group_id: string | null }>({ text: 'SELECT id, status, business_group_id FROM tickets WHERE id = ? AND company_id = ?', params: [ticketId, companyId] })
    if (!ticket) throw new ServiceError(404, 'not_found', 'Ticket not found')
    if (!isTransferable(ticket.status as never)) throw new ServiceError(409, 'invalid_status', 'Ticket cannot be transferred in its current state')

    const target = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM business_groups WHERE id = ? AND company_id = ?', params: [toBusinessGroupId, companyId] })
    if (!target) throw new ServiceError(400, 'invalid_input', 'Target business group not found in your company')

    const now = new Date().toISOString()
    const transferId = randomUUID()
    await db.transaction(async (tx) => {
      await tx.run({ text: 'INSERT INTO ticket_transfers (id, ticket_id, from_business_group_id, to_business_group_id, transferred_by, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', params: [transferId, ticketId, ticket.business_group_id, toBusinessGroupId, transferredBy, reason ?? null, now] })
      await tx.run({ text: 'UPDATE tickets SET business_group_id = ?, handler_id = NULL, status = ? WHERE id = ?', params: [toBusinessGroupId, 'pending_assignment', ticketId] })
    })

    await recordAudit('ticket_transferred', transferredBy, { ticketId, fromBusinessGroupId: ticket.business_group_id, toBusinessGroupId })
    return getTicket(ticketId, companyId)
  }

  async function completeTicket(ticketId: string, summary: string | undefined, handlerId: string, companyId: string) {
    const ticket = await db.queryOne<{ id: string; status: string; submitter_id: string }>({ text: 'SELECT id, status, submitter_id FROM tickets WHERE id = ? AND company_id = ?', params: [ticketId, companyId] })
    if (!ticket) throw new ServiceError(404, 'not_found', 'Ticket not found')
    if (ticket.status === 'completed') throw new ServiceError(409, 'invalid_status', 'Ticket is already completed')
    if (ticket.status === 'cancelled') throw new ServiceError(409, 'invalid_status', 'Ticket is cancelled')

    const now = new Date().toISOString()
    await db.run({ text: 'UPDATE tickets SET status = ?, handler_id = ?, completed_at = ? WHERE id = ?', params: ['completed', handlerId, now, ticketId] })

    const submitter = await db.queryOne<{ email: string }>({ text: 'SELECT email FROM users WHERE id = ?', params: [ticket.submitter_id] })
    const handler = await db.queryOne<{ name: string }>({ text: 'SELECT name FROM users WHERE id = ?', params: [handlerId] })
    if (submitter?.email) {
      emailClient.send({
        to: submitter.email,
        subject: `工单已完成: ${ticketId}`,
        text: `您的工单已处理完成。\n工单ID: ${ticketId}\n完成时间: ${now}\n处理人: ${handler?.name ?? '未知'}${summary ? `\n处理摘要: ${summary}` : ''}`,
      }).then(r => { if (r.status === 'failed') console.error('[email] completion notification failed', r.message) })
    }

    await recordAudit('ticket_completed', handlerId, { ticketId, summary })
    return getTicket(ticketId, companyId)
  }

  async function cancelTicket(ticketId: string, reason: string | undefined, cancelledBy: string, companyId: string) {
    const ticket = await db.queryOne<{ id: string; status: string }>({ text: 'SELECT id, status FROM tickets WHERE id = ? AND company_id = ?', params: [ticketId, companyId] })
    if (!ticket) throw new ServiceError(404, 'not_found', 'Ticket not found')
    if (!isCancellable(ticket.status as never)) throw new ServiceError(409, 'invalid_status', ticket.status === 'completed' ? 'Completed tickets cannot be cancelled' : 'Ticket is already cancelled')

    const now = new Date().toISOString()
    await db.run({ text: 'UPDATE tickets SET status = ?, cancelled_at = ? WHERE id = ?', params: ['cancelled', now, ticketId] })
    await recordAudit('ticket_cancelled', cancelledBy, { ticketId, reason })
    return getTicket(ticketId, companyId)
  }

  async function addSatisfaction(ticketId: string, rating: number, comment: string | undefined, submitterId: string, companyId: string) {
    const ticket = await db.queryOne<{ id: string; status: string; submitter_id: string }>({ text: 'SELECT id, status, submitter_id FROM tickets WHERE id = ? AND company_id = ?', params: [ticketId, companyId] })
    if (!ticket) throw new ServiceError(404, 'not_found', 'Ticket not found')
    if (ticket.submitter_id !== submitterId) throw new ServiceError(403, 'forbidden', 'Only the submitter can rate this ticket')
    if (ticket.status !== 'completed') throw new ServiceError(409, 'invalid_status', 'Ticket must be completed to rate')

    const existing = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM ticket_satisfactions WHERE ticket_id = ?', params: [ticketId] })
    if (existing) throw new ServiceError(409, 'already_rated', 'Ticket has already been rated')

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new ServiceError(400, 'invalid_input', 'rating must be an integer between 1 and 5')

    const now = new Date().toISOString()
    const id = randomUUID()
    await db.run({ text: 'INSERT INTO ticket_satisfactions (id, ticket_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?)', params: [id, ticketId, rating, comment ?? null, now] })
    await recordAudit('ticket_rated', submitterId, { ticketId, rating, comment })
    return { rating, comment: comment ?? null, createdAt: now }
  }

  return { createTicket, listTickets, getTicket, addReply, transferTicket, completeTicket, cancelTicket, addSatisfaction }
}
