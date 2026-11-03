import { randomUUID } from 'node:crypto'
import type { DbClient } from '@commonapp/dbkit'
import type { EmailClient } from '@commonapp/emailkit'
import type { createAuditKit } from '@commonapp/auditkit'
import {
  TICKET_STATUS,
  AUDIT_EVENT_TYPES,
  isSlaPriority,
  type TicketDTO,
  type TicketReplyDTO,
  type TicketEvaluationDTO,
  type SubmitterInfoDTO,
  type TicketListResponse,
} from '../../shared/types'

type AuditKit = ReturnType<typeof createAuditKit>

interface TicketRow {
  id: string
  company_id: string
  subject: string
  description: string
  category: string
  sla_priority: string
  status: string
  submitter_user_id: string
  submitter_name: string
  assigned_group_id: string | null
  assigned_group_name: string | null
  assigned_user_id: string | null
  handler_user_id: string | null
  created_at: number
  processed_at: number | null
}

const mapTicket = (row: TicketRow): TicketDTO => ({
  id: row.id,
  companyId: row.company_id,
  subject: row.subject,
  description: row.description,
  category: row.category,
  slaPriority: row.sla_priority,
  status: row.status,
  submitterUserId: row.submitter_user_id,
  submitterName: row.submitter_name,
  assignedGroupId: row.assigned_group_id,
  assignedGroupName: row.assigned_group_name,
  assignedUserId: row.assigned_user_id,
  handlerUserId: row.handler_user_id,
  createdAt: row.created_at,
  processedAt: row.processed_at,
})

const TICKET_SELECT = `
  SELECT t.id, t.company_id, t.subject, t.description, t.category, t.sla_priority, t.status,
    t.submitter_user_id, COALESCE(up.full_name, u.name) AS submitter_name,
    t.assigned_group_id, bg.name AS assigned_group_name,
    t.assigned_user_id, t.handler_user_id, t.created_at, t.processed_at
  FROM tickets t
  LEFT JOIN users u ON u.id = t.submitter_user_id
  LEFT JOIN user_profiles up ON up.user_id = t.submitter_user_id
  LEFT JOIN business_groups bg ON bg.id = t.assigned_group_id
`

export function createTicketService(db: DbClient, emailClient: EmailClient, auditKit: AuditKit) {
  async function recordAudit(type: string, actorUserId: string, ticketId: string, companyId: string, metadata: Record<string, unknown>) {
    await auditKit.record({
      type,
      actorUserId,
      occurredAt: new Date().toISOString(),
      metadata: { ticketId, companyId, targetType: 'ticket', targetId: ticketId, ...metadata },
    })
  }

  async function createTicket(params: {
    companyId: string
    submitterUserId: string
    subject: string
    description: string
    category: string
    slaPriority: string
  }): Promise<TicketDTO> {
    const id = randomUUID()
    const now = Date.now()

    // Check for auto-assignment rule matching this category
    const rule = await db.queryOne<{ group_id: string }>({
      text: 'SELECT group_id FROM category_assignment_rules WHERE company_id = ? AND category = ?',
      params: [params.companyId, params.category],
    })

    const status = rule ? TICKET_STATUS.PENDING_PROCESS : TICKET_STATUS.PENDING_ASSIGN
    const assignedGroupId = rule?.group_id ?? null

    await db.run({
      text: `INSERT INTO tickets (id, company_id, subject, description, category, sla_priority, status, submitter_user_id, assigned_group_id, assigned_user_id, handler_user_id, created_at, processed_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, NULL)`,
      params: [id, params.companyId, params.subject, params.description, params.category, params.slaPriority, status, params.submitterUserId, assignedGroupId, now],
    })

    await recordAudit(AUDIT_EVENT_TYPES.TICKET_CREATED, params.submitterUserId, id, params.companyId, {
      subject: params.subject, category: params.category, slaPriority: params.slaPriority,
    })

    if (rule) {
      await recordAudit(AUDIT_EVENT_TYPES.TICKET_ASSIGNED, params.submitterUserId, id, params.companyId, {
        groupId: rule.group_id, userId: null, auto: true,
      })
    }

    const row = await db.queryOne<TicketRow>({ text: `${TICKET_SELECT} WHERE t.id = ?`, params: [id] })
    return mapTicket(row!)
  }

  async function getTicket(ticketId: string, companyId: string): Promise<TicketDTO | null> {
    const row = await db.queryOne<TicketRow>({
      text: `${TICKET_SELECT} WHERE t.id = ? AND t.company_id = ?`,
      params: [ticketId, companyId],
    })
    return row ? mapTicket(row) : null
  }

  async function listTickets(params: {
    companyId: string
    status?: string
    category?: string
    slaPriority?: string
    search?: string
    sort?: string
    order?: string
    page: number
    pageSize: number
  }): Promise<TicketListResponse> {
    const conditions: string[] = ['t.company_id = ?']
    const values: unknown[] = [params.companyId]

    if (params.status) { conditions.push('t.status = ?'); values.push(params.status) }
    if (params.category) { conditions.push('t.category = ?'); values.push(params.category) }
    if (params.slaPriority) { conditions.push('t.sla_priority = ?'); values.push(params.slaPriority) }
    if (params.search) { conditions.push('t.subject LIKE ?'); values.push(`%${params.search}%`) }

    const where = conditions.join(' AND ')
    const sortField = params.sort === 'sla_priority' ? 't.sla_priority' : 't.created_at'
    const orderDir = params.order === 'asc' ? 'ASC' : 'DESC'
    const offset = (params.page - 1) * params.pageSize

    const countRow = await db.queryOne<{ total: number }>({
      text: `SELECT COUNT(*) AS total FROM tickets t WHERE ${where}`,
      params: values,
    })

    const rows = await db.queryAll<TicketRow>({
      text: `${TICKET_SELECT} WHERE ${where} ORDER BY ${sortField} ${orderDir}, t.id DESC LIMIT ? OFFSET ?`,
      params: [...values, params.pageSize, offset],
    })

    return {
      items: rows.map(mapTicket),
      total: Number(countRow?.total ?? 0),
      page: params.page,
      pageSize: params.pageSize,
    }
  }

  async function updateTicket(params: {
    ticketId: string
    companyId: string
    userId: string
    status?: string
    assignedGroupId?: string | null
    assignedUserId?: string | null
  }): Promise<TicketDTO | null> {
    const ticket = await getTicket(params.ticketId, params.companyId)
    if (!ticket) return null

    const now = Date.now()
    const updates: string[] = []
    const values: unknown[] = []

    if (params.status === TICKET_STATUS.PENDING_PROCESS && ticket.status === TICKET_STATUS.PENDING_ASSIGN) {
      updates.push('status = ?'); values.push(TICKET_STATUS.PENDING_PROCESS)
      if (params.assignedGroupId !== undefined) { updates.push('assigned_group_id = ?'); values.push(params.assignedGroupId) }
      if (params.assignedUserId !== undefined) { updates.push('assigned_user_id = ?'); values.push(params.assignedUserId) }
      await db.run({ text: `UPDATE tickets SET ${updates.join(', ')} WHERE id = ?`, params: [...values, params.ticketId] })
      await recordAudit(AUDIT_EVENT_TYPES.TICKET_ASSIGNED, params.userId, params.ticketId, params.companyId, {
        groupId: params.assignedGroupId ?? null, userId: params.assignedUserId ?? null, auto: false,
      })
    } else if (params.status === TICKET_STATUS.COMPLETED) {
      updates.push('status = ?'); values.push(TICKET_STATUS.COMPLETED)
      updates.push('handler_user_id = ?'); values.push(params.userId)
      updates.push('processed_at = ?'); values.push(now)
      await db.run({ text: `UPDATE tickets SET ${updates.join(', ')} WHERE id = ?`, params: [...values, params.ticketId] })
      await recordAudit(AUDIT_EVENT_TYPES.TICKET_COMPLETED, params.userId, params.ticketId, params.companyId, {
        handlerUserId: params.userId, processedAt: now,
      })
      // Send email notification to submitter
      await sendCompletionEmail(params.ticketId, params.companyId)
    } else if (params.status === TICKET_STATUS.CANCELLED) {
      updates.push('status = ?'); values.push(TICKET_STATUS.CANCELLED)
      await db.run({ text: `UPDATE tickets SET ${updates.join(', ')} WHERE id = ?`, params: [...values, params.ticketId] })
      await recordAudit(AUDIT_EVENT_TYPES.TICKET_CANCELLED, params.userId, params.ticketId, params.companyId, {
        reason: 'cancelled by user',
      })
    }

    return getTicket(params.ticketId, params.companyId)
  }

  async function sendCompletionEmail(ticketId: string, companyId: string) {
    try {
      const row = await db.queryOne<{ email: string; full_name: string | null; name: string; subject: string }>({
        text: `SELECT u.email, up.full_name, u.name, t.subject
               FROM tickets t
               JOIN users u ON u.id = t.submitter_user_id
               LEFT JOIN user_profiles up ON up.user_id = t.submitter_user_id
               WHERE t.id = ? AND t.company_id = ?`,
        params: [ticketId, companyId],
      })
      if (!row?.email) return
      const result = await emailClient.send({
        to: row.email,
        subject: `工单完成通知: ${row.subject}`,
        text: `您好 ${row.full_name ?? row.name}，\n\n您的工单「${row.subject}」已完成处理。\n\n工单ID: ${ticketId}`,
      })
      if (result.status === 'skipped') {
        console.log(`[email] SMTP not configured — would notify ${row.email} about ticket ${ticketId} completion`)
      } else if (result.status === 'failed') {
        console.error(`[email] Failed to send completion notification to ${row.email}: ${result.message}`)
      }
    } catch (error) {
      console.error(`[email] Completion notification error for ticket ${ticketId}:`, error)
    }
  }

  async function transferTicket(params: {
    ticketId: string
    companyId: string
    userId: string
    toGroupId: string | null
    toUserId: string | null
  }): Promise<TicketDTO | null> {
    const ticket = await getTicket(params.ticketId, params.companyId)
    if (!ticket) return null
    if (ticket.status !== TICKET_STATUS.PENDING_PROCESS) return null

    const fromGroupId = ticket.assignedGroupId
    const fromUserId = ticket.assignedUserId
    const now = Date.now()

    const updates: string[] = []
    const values: unknown[] = []
    if (params.toGroupId !== undefined && params.toGroupId !== null) { updates.push('assigned_group_id = ?'); values.push(params.toGroupId) }
    if (params.toUserId !== undefined && params.toUserId !== null) { updates.push('assigned_user_id = ?'); values.push(params.toUserId) }
    if (updates.length === 0) return ticket

    await db.run({ text: `UPDATE tickets SET ${updates.join(', ')} WHERE id = ?`, params: [...values, params.ticketId] })
    await recordAudit(AUDIT_EVENT_TYPES.TICKET_TRANSFERRED, params.userId, params.ticketId, params.companyId, {
      fromGroupId, fromUserId, toGroupId: params.toGroupId, toUserId: params.toUserId,
    })

    return getTicket(params.ticketId, params.companyId)
  }

  async function addReply(params: {
    ticketId: string
    companyId: string
    userId: string
    content: string
  }): Promise<TicketReplyDTO> {
    const id = randomUUID()
    const now = Date.now()
    await db.run({
      text: 'INSERT INTO ticket_replies (id, ticket_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)',
      params: [id, params.ticketId, params.userId, params.content, now],
    })
    const row = await db.queryOne<{ id: string; ticket_id: string; user_id: string; full_name: string | null; name: string; content: string; created_at: number }>({
      text: `SELECT tr.id, tr.ticket_id, tr.user_id, COALESCE(up.full_name, u.name) AS full_name, u.name, tr.content, tr.created_at
             FROM ticket_replies tr
             JOIN users u ON u.id = tr.user_id
             LEFT JOIN user_profiles up ON up.user_id = tr.user_id
             WHERE tr.id = ?`,
      params: [id],
    })
    return {
      id: row!.id, ticketId: row!.ticket_id, userId: row!.user_id,
      userFullName: row!.full_name ?? row!.name, content: row!.content, createdAt: row!.created_at,
    }
  }

  async function listReplies(ticketId: string, companyId: string): Promise<TicketReplyDTO[]> {
    const rows = await db.queryAll<{ id: string; ticket_id: string; user_id: string; full_name: string | null; name: string; content: string; created_at: number }>({
      text: `SELECT tr.id, tr.ticket_id, tr.user_id, COALESCE(up.full_name, u.name) AS full_name, u.name, tr.content, tr.created_at
             FROM ticket_replies tr
             JOIN tickets t ON t.id = tr.ticket_id
             JOIN users u ON u.id = tr.user_id
             LEFT JOIN user_profiles up ON up.user_id = tr.user_id
             WHERE tr.ticket_id = ? AND t.company_id = ?
             ORDER BY tr.created_at ASC`,
      params: [ticketId, companyId],
    })
    return rows.map((r) => ({
      id: r.id, ticketId: r.ticket_id, userId: r.user_id,
      userFullName: r.full_name ?? r.name, content: r.content, createdAt: r.created_at,
    }))
  }

  async function getSubmitterInfo(ticketId: string, companyId: string): Promise<SubmitterInfoDTO | null> {
    const ticket = await getTicket(ticketId, companyId)
    if (!ticket) return null

    const user = await db.queryOne<{ id: string; full_name: string | null; name: string; email: string; company_id: string; company_name: string; department_id: string | null; department_name: string | null }>({
      text: `SELECT u.id, COALESCE(up.full_name, u.name) AS full_name, u.name, u.email,
               up.company_id, c.name AS company_name,
               up.department_id, d.name AS department_name
             FROM users u
             LEFT JOIN user_profiles up ON up.user_id = u.id
             LEFT JOIN companies c ON c.id = up.company_id
             LEFT JOIN departments d ON d.id = up.department_id
             WHERE u.id = ?`,
      params: [ticket.submitterUserId],
    })
    if (!user) return null

    const historyTickets = await db.queryAll<{ id: string; subject: string; status: string; category: string; created_at: number }>({
      text: `SELECT id, subject, status, category, created_at FROM tickets WHERE submitter_user_id = ? AND company_id = ? ORDER BY created_at DESC`,
      params: [ticket.submitterUserId, companyId],
    })

    return {
      user: {
        id: user.id,
        fullName: user.full_name ?? user.name,
        email: user.email,
        companyId: user.company_id ?? ticket.companyId,
        companyName: user.company_name ?? '',
        departmentId: user.department_id,
        departmentName: user.department_name,
      },
      historyTickets: historyTickets.map((t) => ({
        id: t.id, subject: t.subject, status: t.status, category: t.category, createdAt: t.created_at,
      })),
    }
  }

  async function addEvaluation(params: {
    ticketId: string
    companyId: string
    userId: string
    rating: number
  }): Promise<TicketEvaluationDTO> {
    const id = randomUUID()
    const now = Date.now()
    await db.run({
      text: 'INSERT INTO ticket_evaluations (id, ticket_id, user_id, rating, created_at) VALUES (?, ?, ?, ?, ?)',
      params: [id, params.ticketId, params.userId, params.rating, now],
    })
    return { id, ticketId: params.ticketId, userId: params.userId, rating: params.rating, createdAt: now }
  }

  async function hasEvaluation(ticketId: string, userId: string): Promise<boolean> {
    const row = await db.queryOne<{ id: string }>({
      text: 'SELECT id FROM ticket_evaluations WHERE ticket_id = ? AND user_id = ?',
      params: [ticketId, userId],
    })
    return !!row
  }

  return { createTicket, getTicket, listTickets, updateTicket, transferTicket, addReply, listReplies, getSubmitterInfo, addEvaluation, hasEvaluation, isSlaPriority }
}
