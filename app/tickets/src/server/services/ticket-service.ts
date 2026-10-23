import type { DbClient } from '@commonapp/dbkit'
import type { AuditEvent } from '@commonapp/auditkit'
import type { EmailClient } from '@commonapp/emailkit'
import type { TicketResponse, TicketListItem } from '../../shared/types'

const now = () => new Date().toISOString()

interface TicketRow {
  id: number
  title: string
  description: string
  category: string
  sla_priority: string
  company_id: string
  submitter_id: number
  status: string
  handler_id: number | null
  group_id: number | null
  handled_at: string | null
  created_at: string
}

interface UserRow {
  id: number
  name: string
  email: string
  company_id: string
  department: string | null
}

interface ReplyRow {
  id: number
  ticket_id: number
  replier_id: number
  content: string
  created_at: string
}

interface GroupRow {
  id: number
  company_id: string
  name: string
}

async function getUserName(db: DbClient, userId: number | null): Promise<string | null> {
  if (!userId) return null
  const row = await db.queryOne<{ name: string }>({
    text: 'SELECT name FROM users WHERE id = ?',
    params: [userId],
  })
  return row?.name ?? null
}

async function getGroupName(db: DbClient, groupId: number | null): Promise<string | null> {
  if (!groupId) return null
  const row = await db.queryOne<{ name: string }>({
    text: 'SELECT name FROM business_groups WHERE id = ?',
    params: [groupId],
  })
  return row?.name ?? null
}

async function getTicketById(db: DbClient, ticketId: number, companyId?: string): Promise<TicketRow | null> {
  return db.queryOne<TicketRow>({
    text: companyId
      ? 'SELECT * FROM tickets WHERE id = ? AND company_id = ?'
      : 'SELECT * FROM tickets WHERE id = ?',
    params: companyId ? [ticketId, companyId] : [ticketId],
  })
}

async function buildTicketResponse(db: DbClient, ticket: TicketRow, includeReplies: boolean): Promise<TicketResponse> {
  const submitter = await db.queryOne<UserRow>({
    text: 'SELECT * FROM users WHERE id = ?',
    params: [ticket.submitter_id],
  })
  const handlerName = await getUserName(db, ticket.handler_id)
  const groupName = await getGroupName(db, ticket.group_id)

  const response: TicketResponse = {
    id: String(ticket.id),
    title: ticket.title,
    description: ticket.description,
    category: ticket.category,
    slaPriority: ticket.sla_priority,
    status: ticket.status as TicketResponse['status'],
    companyId: ticket.company_id,
    submitterId: String(ticket.submitter_id),
    submitterName: submitter?.name ?? '',
    submitterEmail: submitter?.email ?? '',
    submitterDepartment: submitter?.department ?? null,
    handlerId: ticket.handler_id != null ? String(ticket.handler_id) : null,
    handlerName: handlerName ?? null,
    assignedGroupName: groupName ?? null,
    createdAt: ticket.created_at,
    handledAt: ticket.handled_at ?? null,
  }

  if (includeReplies) {
    const replies = await db.queryAll<ReplyRow>({
      text: 'SELECT * FROM ticket_replies WHERE ticket_id = ? ORDER BY created_at ASC',
      params: [ticket.id],
    })
    response.replies = await Promise.all(
      replies.map(async (r) => {
        const name = await getUserName(db, r.replier_id)
        return {
          id: String(r.id),
          ticketId: String(r.ticket_id),
          replierId: String(r.replier_id),
          replierName: name ?? '',
          content: r.content,
          createdAt: r.created_at,
        }
      }),
    )
  }

  return response
}

// ---- Public service functions ----

export async function createTicket(
  db: DbClient,
  auditKit: { record: (e: AuditEvent) => Promise<void> },
  params: {
    title: string
    description: string
    category: string
    slaPriority: string
    companyId: string
    submitterId: number
    submitterName: string
    actorEmail: string
  },
): Promise<TicketResponse> {
  const ts = now()
  // Insert ticket with status 'created'
  await db.run({
    text: `INSERT INTO tickets (title, description, category, sla_priority, company_id, submitter_id, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'created', ?)`,
    params: [params.title, params.description, params.category, params.slaPriority, params.companyId, params.submitterId, ts],
  })
  const row = await db.queryOne<{ id: number }>({ text: 'SELECT last_insert_rowid() AS id' })
  const ticketId = row?.id ?? 0

  // Audit: ticket:create
  await auditKit.record({
    type: 'ticket:create',
    occurredAt: ts,
    actorUserId: String(params.submitterId),
    metadata: { actorName: params.submitterName, entityType: 'ticket', entityId: String(ticketId), title: params.title, category: params.category },
  })

  // Transition to pending_assignment
  await db.run({
    text: "UPDATE tickets SET status = 'pending_assignment' WHERE id = ?",
    params: [ticketId],
  })
  await auditKit.record({
    type: 'ticket:status-change',
    occurredAt: now(),
    actorUserId: String(params.submitterId),
    metadata: { actorName: params.submitterName, entityType: 'ticket', entityId: String(ticketId), from: 'created', to: 'pending_assignment' },
  })

  // Check auto-assignment rules
  const rule = await db.queryOne<{ group_id: number }>({
    text: 'SELECT group_id FROM auto_assignment_rules WHERE company_id = ? AND category = ?',
    params: [params.companyId, params.category],
  })
  if (rule) {
    const assignTs = now()
    await db.run({
      text: "UPDATE tickets SET status = 'pending_processing', group_id = ? WHERE id = ?",
      params: [rule.group_id, ticketId],
    })
    await auditKit.record({
      type: 'ticket:assign',
      occurredAt: assignTs,
      actorUserId: String(params.submitterId),
      metadata: { actorName: params.submitterName, entityType: 'ticket', entityId: String(ticketId), groupId: String(rule.group_id), autoAssigned: true },
    })
    await auditKit.record({
      type: 'ticket:status-change',
      occurredAt: assignTs,
      actorUserId: String(params.submitterId),
      metadata: { actorName: params.submitterName, entityType: 'ticket', entityId: String(ticketId), from: 'pending_assignment', to: 'pending_processing' },
    })
  }

  const ticket = await getTicketById(db, ticketId)
  return buildTicketResponse(db, ticket!, false)
}

export async function listTickets(
  db: DbClient,
  params: {
    companyId: string
    status?: string
    category?: string
    slaPriority?: string
    groupId?: string
    search?: string
    sortBy?: string
    page: number
    pageSize: number
  },
): Promise<{ items: TicketListItem[]; total: number; page: number; pageSize: number }> {
  const conditions: string[] = ['company_id = ?']
  const values: unknown[] = [params.companyId]

  if (params.status) {
    conditions.push('status = ?')
    values.push(params.status)
  }
  if (params.category) {
    conditions.push('category = ?')
    values.push(params.category)
  }
  if (params.slaPriority) {
    conditions.push('sla_priority = ?')
    values.push(params.slaPriority)
  }
  if (params.groupId) {
    conditions.push('group_id = ?')
    values.push(params.groupId)
  }
  if (params.search) {
    conditions.push('(title LIKE ? OR CAST(id AS TEXT) LIKE ?)')
    values.push(`%${params.search}%`, `%${params.search}%`)
  }

  const where = conditions.join(' AND ')
  const orderBy = params.sortBy === 'slaPriority' ? 'sla_priority DESC' : 'created_at DESC'
  const offset = (params.page - 1) * params.pageSize

  const countRow = await db.queryOne<{ count: number }>({
    text: `SELECT COUNT(*) AS count FROM tickets WHERE ${where}`,
    params: values,
  })
  const total = countRow?.count ?? 0

  const rows = await db.queryAll<TicketRow & { submitter_name: string | null; handler_name: string | null }>({
    text: `SELECT t.*, u.name AS submitter_name, hu.name AS handler_name
           FROM tickets t
           LEFT JOIN users u ON t.submitter_id = u.id
           LEFT JOIN users hu ON t.handler_id = hu.id
           WHERE ${where}
           ORDER BY ${orderBy}
           LIMIT ? OFFSET ?`,
    params: [...values, params.pageSize, offset],
  })

  const items: TicketListItem[] = rows.map((r) => ({
    id: String(r.id),
    title: r.title,
    category: r.category,
    slaPriority: r.sla_priority,
    status: r.status as TicketListItem['status'],
    submitterName: r.submitter_name ?? '',
    handlerName: r.handler_name ?? null,
    createdAt: r.created_at,
  }))

  return { items, total, page: params.page, pageSize: params.pageSize }
}

export async function getTicketDetail(db: DbClient, ticketId: number, companyId: string): Promise<TicketResponse | null> {
  const ticket = await getTicketById(db, ticketId, companyId)
  if (!ticket) return null
  return buildTicketResponse(db, ticket, true)
}

const VALID_TRANSITIONS: Record<string, Set<string>> = {
  created: new Set(['pending_assignment', 'cancelled']),
  pending_assignment: new Set(['pending_processing', 'cancelled']),
  pending_processing: new Set(['cancelled']),
  completed: new Set(),
  cancelled: new Set(),
}

export async function updateTicketStatus(
  db: DbClient,
  auditKit: { record: (e: AuditEvent) => Promise<void> },
  params: {
    ticketId: number
    companyId: string
    targetStatus: string
    actorId: string
    actorName: string
  },
): Promise<{ error?: string; ticket?: TicketResponse }> {
  const ticket = await getTicketById(db, params.ticketId, params.companyId)
  if (!ticket) return { error: 'ticket_not_found' }

  const allowed = VALID_TRANSITIONS[ticket.status]
  if (!allowed || !allowed.has(params.targetStatus)) {
    return { error: 'invalid_status_transition' }
  }

  const ts = now()
  await db.run({
    text: 'UPDATE tickets SET status = ? WHERE id = ?',
    params: [params.targetStatus, params.ticketId],
  })
  await auditKit.record({
    type: 'ticket:status-change',
    occurredAt: ts,
    actorUserId: params.actorId,
    metadata: { actorName: params.actorName, entityType: 'ticket', entityId: String(params.ticketId), from: ticket.status, to: params.targetStatus },
  })

  const updated = await getTicketById(db, params.ticketId)
  return { ticket: await buildTicketResponse(db, updated!, true) }
}

export async function addReply(
  db: DbClient,
  auditKit: { record: (e: AuditEvent) => Promise<void> },
  params: {
    ticketId: number
    companyId: string
    replierId: number
    replierName: string
    content: string
  },
): Promise<{ error?: string; reply?: { id: string; ticketId: string; replierId: string; replierName: string; content: string; createdAt: string } }> {
  const ticket = await getTicketById(db, params.ticketId, params.companyId)
  if (!ticket) return { error: 'ticket_not_found' }

  const ts = now()
  await db.run({
    text: 'INSERT INTO ticket_replies (ticket_id, replier_id, content, created_at) VALUES (?, ?, ?, ?)',
    params: [params.ticketId, params.replierId, params.content, ts],
  })
  const row = await db.queryOne<{ id: number }>({ text: 'SELECT last_insert_rowid() AS id' })

  return {
    reply: {
      id: String(row?.id ?? 0),
      ticketId: String(params.ticketId),
      replierId: String(params.replierId),
      replierName: params.replierName,
      content: params.content,
      createdAt: ts,
    },
  }
}

export async function getSubmitterInfo(
  db: DbClient,
  ticketId: number,
  companyId: string,
): Promise<{
  userId: string
  name: string
  email: string
  companyName: string
  department: string | null
  historyTickets: { id: string; title: string; status: string; createdAt: string }[]
} | null> {
  const ticket = await getTicketById(db, ticketId, companyId)
  if (!ticket) return null

  const submitter = await db.queryOne<UserRow>({
    text: 'SELECT * FROM users WHERE id = ?',
    params: [ticket.submitter_id],
  })
  if (!submitter) return null

  const company = await db.queryOne<{ name: string }>({
    text: 'SELECT name FROM companies WHERE id = ?',
    params: [submitter.company_id],
  })

  const history = await db.queryAll<{ id: number; title: string; status: string; created_at: string }>({
    text: 'SELECT id, title, status, created_at FROM tickets WHERE submitter_id = ? ORDER BY created_at DESC LIMIT 20',
    params: [submitter.id],
  })

  return {
    userId: String(submitter.id),
    name: submitter.name,
    email: submitter.email,
    companyName: company?.name ?? '',
    department: submitter.department,
    historyTickets: history.map((h) => ({
      id: String(h.id),
      title: h.title,
      status: h.status,
      createdAt: h.created_at,
    })),
  }
}

export async function completeTicket(
  db: DbClient,
  auditKit: { record: (e: AuditEvent) => Promise<void> },
  emailClient: { send: (m: { to: string; subject: string; text: string }) => Promise<unknown> } | null,
  params: {
    ticketId: number
    companyId: string
    handlerId: number
    handlerName: string
  },
): Promise<{ error?: string; result?: { id: string; status: 'completed'; handlerId: string; handlerName: string; handledAt: string } }> {
  const ticket = await getTicketById(db, params.ticketId, params.companyId)
  if (!ticket) return { error: 'ticket_not_found' }
  if (ticket.status !== 'pending_processing') return { error: 'invalid_status_transition' }

  const ts = now()
  await db.run({
    text: "UPDATE tickets SET status = 'completed', handler_id = ?, handled_at = ? WHERE id = ?",
    params: [params.handlerId, ts, params.ticketId],
  })
  await auditKit.record({
    type: 'ticket:complete',
    occurredAt: ts,
    actorUserId: String(params.handlerId),
    metadata: { actorName: params.handlerName, entityType: 'ticket', entityId: String(params.ticketId) },
  })

  // Async email notification — failure only logs, does not block
  const submitter = await db.queryOne<{ email: string; name: string }>({
    text: 'SELECT email, name FROM users WHERE id = ?',
    params: [ticket.submitter_id],
  })
  if (submitter?.email) {
    void Promise.resolve().then(async () => {
      try {
        if (emailClient) {
          await emailClient.send({
            to: submitter.email,
            subject: `工单已完成: ${ticket.title}`,
            text: `您的工单「${ticket.title}」(ID: ${ticket.id}) 已由 ${params.handlerName} 处理完成。`,
          })
        } else {
          console.log(`[email] SMTP not configured, skipping completion notification to ${submitter.email} for ticket ${ticket.id}`)
        }
      } catch (err) {
        console.error(`[email] Failed to send completion notification for ticket ${ticket.id}:`, err)
      }
    })
  }

  return {
    result: {
      id: String(params.ticketId),
      status: 'completed',
      handlerId: String(params.handlerId),
      handlerName: params.handlerName,
      handledAt: ts,
    },
  }
}
