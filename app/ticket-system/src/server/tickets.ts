import type { DbClient } from '@commonapp/dbkit'
import { forbidden, notFound, stateConflict, validation } from './http'
import { type TicketUser, isHandler } from './context'
import { findRuleByCategory, getGroup, isGroupMember } from './assignment'
import { type NotificationEntry, type NotificationService } from './notifications'

// ticket：工单创建、列表查询、详情、多轮回复、状态推进（dispatch/transfer/complete/cancel）、评价。
// 公司隔离为第一边界：所有查询强制 company_id 过滤；跨公司资源一律 404。
export type TicketStatus = 'created' | 'pending_assignment' | 'processing' | 'completed' | 'cancelled'
export const TICKET_STATUSES: TicketStatus[] = ['created', 'pending_assignment', 'processing', 'completed', 'cancelled']
export const PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'P4'] as const
export type Priority = (typeof PRIORITIES)[number]

export type TicketSummary = {
  id: number
  ticketNo: string
  subject: string
  category: string
  priority: string
  status: string
  submitterName: string
  groupName: string | null
  createdAt: string
  completedAt: string | null
}

export type Ticket = TicketSummary & {
  description: string
  submitterEmail: string
  submitterDepartment: string | null
  groupId: number | null
  assigneeUserId: string | null
  handlerName: string | null
  dispatchedAt: string | null
  assignedAt: string | null
  firstReplyAt: string | null
  cancelledAt: string | null
}

export type Reply = { id: number; authorName: string; authorKind: 'submitter' | 'agent'; content: string; createdAt: string }
export type ActivityEntry = { id: number; action: string; operatorName: string; detail: string | null; occurredAt: string }
export type Rating = { score: number; comment: string | null; createdAt: string }

export type TicketDetail = {
  ticket: Ticket
  replies: Reply[]
  activity: ActivityEntry[]
  notifications: NotificationEntry[]
  rating: Rating | null
  submitter: {
    userId: string
    displayName: string
    email: string
    companyName: string
    department: string | null
    historyTickets: TicketSummary[]
  }
}

export type ListQuery = {
  view: 'mine' | 'workbench' | 'company'
  statuses: string[]
  category: string | null
  priority: string | null
  group: number | null
  q: string
  sort: 'created_at' | 'priority' | 'status'
  order: 'asc' | 'desc'
  page: number
  pageSize: number
}

type TicketRow = {
  id: number
  ticket_no: string
  company_id: number
  subject: string
  description: string
  category: string
  priority: string
  status: string
  submitter_user_id: string
  submitter_name: string
  submitter_email: string
  submitter_department: string | null
  group_id: number | null
  group_name: string | null
  assignee_user_id: string | null
  handler_user_id: string | null
  handler_name: string | null
  created_at: string
  dispatched_at: string | null
  assigned_at: string | null
  first_reply_at: string | null
  completed_at: string | null
  cancelled_at: string | null
}

type SummaryRow = {
  id: number
  ticket_no: string
  subject: string
  category: string
  priority: string
  status: string
  submitter_name: string
  group_name: string | null
  created_at: string
  completed_at: string | null
}

const now = () => new Date().toISOString()

const toTicket = (row: TicketRow): Ticket => ({
  id: row.id,
  ticketNo: row.ticket_no,
  subject: row.subject,
  category: row.category,
  priority: row.priority,
  status: row.status,
  submitterName: row.submitter_name,
  groupName: row.group_name,
  createdAt: row.created_at,
  completedAt: row.completed_at,
  description: row.description,
  submitterEmail: row.submitter_email,
  submitterDepartment: row.submitter_department,
  groupId: row.group_id,
  assigneeUserId: row.assignee_user_id,
  handlerName: row.handler_name,
  dispatchedAt: row.dispatched_at,
  assignedAt: row.assigned_at,
  firstReplyAt: row.first_reply_at,
  cancelledAt: row.cancelled_at,
})

const toSummary = (row: SummaryRow): TicketSummary => ({
  id: row.id,
  ticketNo: row.ticket_no,
  subject: row.subject,
  category: row.category,
  priority: row.priority,
  status: row.status,
  submitterName: row.submitter_name,
  groupName: row.group_name,
  createdAt: row.created_at,
  completedAt: row.completed_at,
})

const TICKET_SELECT = `SELECT t.id, t.ticket_no, t.company_id, t.subject, t.description, t.category, t.priority, t.status,
  t.submitter_user_id, t.submitter_name, t.submitter_email, t.submitter_department,
  t.group_id, g.name AS group_name, t.assignee_user_id, t.handler_user_id, t.handler_name,
  t.created_at, t.dispatched_at, t.assigned_at, t.first_reply_at, t.completed_at, t.cancelled_at
  FROM tickets t LEFT JOIN groups g ON g.id = t.group_id`

async function requireTicket(db: DbClient, ticketId: number, companyId: number): Promise<TicketRow> {
  const row = await db.queryOne<TicketRow>({
    text: `${TICKET_SELECT} WHERE t.id = ? AND t.company_id = ?`,
    params: [ticketId, companyId],
  })
  if (!row) throw notFound('Ticket not found')
  return row
}

async function insertActivity(db: DbClient, input: {
  ticketId: number; companyId: number; action: string; operatorUserId: string | null; operatorName: string; detail: unknown; at: string
}): Promise<void> {
  await db.run({
    text: `INSERT INTO ticket_activity (ticket_id, company_id, action, operator_user_id, operator_name, detail, occurred_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
    params: [input.ticketId, input.companyId, input.action, input.operatorUserId, input.operatorName, input.detail === null ? null : JSON.stringify(input.detail), input.at],
  })
}

export function createTicketService(db: DbClient, notifications: NotificationService) {
  // POST /api/tickets：落库 created 态，不做分配（由前端随后调用 dispatch）。
  async function createTicket(user: TicketUser, input: { subject: string; description: string; category: string; priority: string }): Promise<Ticket> {
    const subject = requireTrimmed(input.subject, 'subject', 200)
    const description = requireTrimmed(input.description, 'description', 5000)
    const priority = input.priority
    if (!PRIORITIES.includes(priority as Priority)) throw validation('priority must be one of P0, P1, P2, P3, P4')
    const category = requireTrimmed(input.category, 'category', 50)
    const inList = await db.queryOne<{ category: string }>({
      text: 'SELECT category FROM company_categories WHERE company_id = ? AND category = ?',
      params: [user.companyId, category],
    })
    if (!inList) throw validation('category is not in the company category list')
    const createdAt = now()
    const row = await db.transaction(async (tx) => {
      const next = await tx.queryOne<{ next: number }>({ text: 'SELECT COALESCE(MAX(id), 0) + 1 AS next FROM tickets' })
      const ticketNo = `TK-${String(Number(next?.next ?? 1)).padStart(6, '0')}`
      const inserted = await tx.queryOne<TicketRow>({
        text: `INSERT INTO tickets (ticket_no, company_id, subject, description, category, priority, status,
               submitter_user_id, submitter_name, submitter_email, submitter_department, created_at)
               VALUES (?, ?, ?, ?, ?, ?, 'created', ?, ?, ?, ?, ?)
               RETURNING id`,
        params: [ticketNo, user.companyId, subject, description, category, priority, user.userId, user.displayName, user.email, user.department, createdAt],
      })
      if (!inserted) throw new Error('Failed to create ticket')
      await insertActivity(tx, {
        ticketId: inserted.id,
        companyId: user.companyId,
        action: 'created',
        operatorUserId: user.userId,
        operatorName: user.displayName,
        detail: null,
        at: createdAt,
      })
      return tx.queryOne<TicketRow>({ text: `${TICKET_SELECT} WHERE t.id = ? AND t.company_id = ?`, params: [inserted.id, user.companyId] })
    })
    if (!row) throw new Error('Failed to load created ticket')
    return toTicket(row)
  }

  // POST /api/tickets/:id/dispatch：created → pending_assignment，随后执行公司级规则匹配。
  // 幂等：仅 created 态可执行，重复 dispatch 返回 409。
  async function dispatchTicket(user: TicketUser, ticketId: number): Promise<Ticket> {
    return db.transaction(async (tx) => {
      const row = await requireTicket(tx, ticketId, user.companyId)
      if (row.status !== 'created') throw stateConflict(row.status, 'Only a ticket in created state can be dispatched')
      const at = now()
      await tx.run({
        text: `UPDATE tickets SET status = 'pending_assignment', dispatched_at = ? WHERE id = ? AND company_id = ?`,
        params: [at, ticketId, user.companyId],
      })
      await insertActivity(tx, {
        ticketId, companyId: user.companyId, action: 'dispatched', operatorUserId: user.userId, operatorName: user.displayName, detail: null, at,
      })
      const rule = await findRuleByCategory(tx, user.companyId, row.category)
      if (rule) {
        const assignedAt = now()
        await tx.run({
          text: `UPDATE tickets SET status = 'processing', group_id = ?, assigned_at = ? WHERE id = ? AND company_id = ?`,
          params: [rule.group_id, assignedAt, ticketId, user.companyId],
        })
        await insertActivity(tx, {
          ticketId, companyId: user.companyId, action: 'assigned', operatorUserId: user.userId, operatorName: user.displayName,
          detail: { groupId: rule.group_id, groupName: rule.group_name }, at: assignedAt,
        })
      }
      const updated = await requireTicket(tx, ticketId, user.companyId)
      return toTicket(updated)
    })
  }

  // GET /api/tickets：筛选/搜索/排序/分页；范围恒为登录用户公司（隔离边界）。
  async function listTickets(user: TicketUser, query: ListQuery): Promise<{ items: TicketSummary[]; total: number }> {
    const conditions: string[] = ['t.company_id = ?']
    const params: unknown[] = [user.companyId]
    if (query.view === 'mine') {
      conditions.push('t.submitter_user_id = ?')
      params.push(user.userId)
    }
    if (query.statuses.length > 0) {
      conditions.push(`t.status IN (${query.statuses.map(() => '?').join(', ')})`)
      params.push(...query.statuses)
    }
    if (query.category) {
      conditions.push('t.category = ?')
      params.push(query.category)
    }
    if (query.priority) {
      conditions.push('t.priority = ?')
      params.push(query.priority)
    }
    if (query.group !== null) {
      conditions.push('t.group_id = ?')
      params.push(query.group)
    }
    if (query.q) {
      conditions.push('(t.ticket_no LIKE ? OR lower(t.subject) LIKE ?)')
      params.push(`${query.q}%`, `%${query.q.toLowerCase()}%`)
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const direction = query.order === 'asc' ? 'ASC' : 'DESC'
    let sortColumn: string
    if (query.sort === 'priority') {
      sortColumn = `CASE t.priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 ELSE 4 END`
    } else if (query.sort === 'status') {
      sortColumn = `CASE t.status WHEN 'created' THEN 0 WHEN 'pending_assignment' THEN 1 WHEN 'processing' THEN 2 WHEN 'completed' THEN 3 ELSE 4 END`
    } else {
      sortColumn = 't.created_at'
    }
    const total = await db.queryOne<{ total: number }>({
      text: `SELECT COUNT(*) AS total FROM tickets t ${where}`,
      params,
    })
    const rows = await db.queryAll<SummaryRow>({
      text: `SELECT t.id, t.ticket_no, t.subject, t.category, t.priority, t.status, t.submitter_name, g.name AS group_name, t.created_at, t.completed_at
             FROM tickets t LEFT JOIN groups g ON g.id = t.group_id
             ${where}
             ORDER BY ${sortColumn} ${direction}, t.id ${direction}
             LIMIT ? OFFSET ?`,
      params: [...params, query.pageSize, (query.page - 1) * query.pageSize],
    })
    return { items: rows.map(toSummary), total: Number(total?.total ?? 0) }
  }

  // GET /api/tickets/:id：详情 + 提交人完整信息与历史工单（限本公司范围）。
  async function getTicketDetail(user: TicketUser, ticketId: number): Promise<TicketDetail> {
    const row = await requireTicket(db, ticketId, user.companyId)
    const ticket = toTicket(row)
    const replies = await db.queryAll<{ id: number; author_name: string; author_kind: string; content: string; created_at: string }>({
      text: 'SELECT id, author_name, author_kind, content, created_at FROM ticket_replies WHERE ticket_id = ? AND company_id = ? ORDER BY created_at ASC, id ASC',
      params: [ticketId, user.companyId],
    })
    const activity = await db.queryAll<{ id: number; action: string; operator_name: string; detail: string | null; occurred_at: string }>({
      text: 'SELECT id, action, operator_name, detail, occurred_at FROM ticket_activity WHERE ticket_id = ? AND company_id = ? ORDER BY occurred_at ASC, id ASC',
      params: [ticketId, user.companyId],
    })
    const ratingRow = await db.queryOne<{ score: number; comment: string | null; created_at: string }>({
      text: 'SELECT score, comment, created_at FROM ratings WHERE ticket_id = ? AND company_id = ?',
      params: [ticketId, user.companyId],
    })
    const notificationEntries = await notifications.listByTicket(ticketId, user.companyId)
    const profile = await db.queryOne<{ display_name: string; email: string; department: string | null; company_name: string }>({
      text: `SELECT p.display_name, p.email, p.department, c.name AS company_name
             FROM user_profiles p JOIN companies c ON c.id = p.company_id
             WHERE p.user_id = ? AND p.company_id = ?`,
      params: [row.submitter_user_id, user.companyId],
    })
    const historyRows = await db.queryAll<SummaryRow>({
      text: `SELECT t.id, t.ticket_no, t.subject, t.category, t.priority, t.status, t.submitter_name, g.name AS group_name, t.created_at, t.completed_at
             FROM tickets t LEFT JOIN groups g ON g.id = t.group_id
             WHERE t.company_id = ? AND t.submitter_user_id = ? AND t.id <> ?
             ORDER BY t.created_at DESC, t.id DESC
             LIMIT 20`,
      params: [user.companyId, row.submitter_user_id, ticketId],
    })
    return {
      ticket,
      replies: replies.map((reply) => ({ id: reply.id, authorName: reply.author_name, authorKind: reply.author_kind as Reply['authorKind'], content: reply.content, createdAt: reply.created_at })),
      activity: activity.map((entry) => ({ id: entry.id, action: entry.action, operatorName: entry.operator_name, detail: entry.detail, occurredAt: entry.occurred_at })),
      notifications: notificationEntries,
      rating: ratingRow ? { score: ratingRow.score, comment: ratingRow.comment, createdAt: ratingRow.created_at } : null,
      submitter: {
        userId: row.submitter_user_id,
        displayName: profile?.display_name ?? row.submitter_name,
        email: profile?.email ?? row.submitter_email,
        companyName: profile?.company_name ?? user.companyName,
        department: profile?.department ?? row.submitter_department,
        historyTickets: historyRows.map(toSummary),
      },
    }
  }

  // POST /api/tickets/:id/replies：提交人本人=submitter，agent/company_admin=agent；首次回复更新 first_reply_at。
  async function addReply(user: TicketUser, ticketId: number, content: string): Promise<Reply> {
    const authorKind = await db.transaction(async (tx) => {
      const row = await requireTicket(tx, ticketId, user.companyId)
      let kind: 'submitter' | 'agent'
      if (row.submitter_user_id === user.userId) kind = 'submitter'
      else if (isHandler(user)) kind = 'agent'
      else throw forbidden('Only the ticket submitter or a handler can reply to this ticket')
      const text = requireTrimmed(content, 'content', 5000)
      const createdAt = now()
      const inserted = await tx.queryOne<{ id: number }>({
        text: `INSERT INTO ticket_replies (ticket_id, company_id, author_user_id, author_name, author_kind, content, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        params: [ticketId, user.companyId, user.userId, user.displayName, kind, text, createdAt],
      })
      if (!inserted) throw new Error('Failed to create reply')
      await tx.run({ text: 'UPDATE tickets SET first_reply_at = ? WHERE id = ? AND company_id = ? AND first_reply_at IS NULL', params: [createdAt, ticketId, user.companyId] })
      await insertActivity(tx, { ticketId, companyId: user.companyId, action: 'replied', operatorUserId: user.userId, operatorName: user.displayName, detail: null, at: createdAt })
      return { kind, createdAt, id: inserted.id }
    })
    return { id: authorKind.id, authorName: user.displayName, authorKind: authorKind.kind, content: content.trim(), createdAt: authorKind.createdAt }
  }

  // POST /api/tickets/:id/transfer：pending_assignment（人工归属）或 processing 态转派，转派后仍为 processing。
  async function transferTicket(user: TicketUser, ticketId: number, input: { targetGroupId: number; targetUserId: string | null; reason: string | null }): Promise<Ticket> {
    if (!isHandler(user)) throw forbidden('Only a handler can transfer a ticket')
    const targetGroupId = input.targetGroupId
    if (!Number.isInteger(targetGroupId)) throw validation('targetGroupId must be an integer')
    if (input.reason !== null && input.reason !== undefined && typeof input.reason !== 'string') throw validation('reason must be a string')
    if (typeof input.reason === 'string' && input.reason.length > 500) throw validation('reason must be at most 500 characters')
    if (input.targetUserId !== null && input.targetUserId !== undefined && (typeof input.targetUserId !== 'string' || !input.targetUserId.trim())) {
      throw validation('targetUserId must be a non-empty string or null')
    }
    return db.transaction(async (tx) => {
      const row = await requireTicket(tx, ticketId, user.companyId)
      if (row.status !== 'pending_assignment' && row.status !== 'processing') {
        throw stateConflict(row.status, 'Only a ticket in pending_assignment or processing state can be transferred')
      }
      const group = await getGroup(tx, targetGroupId, user.companyId)
      if (!group) throw validation('Target group does not exist or does not belong to this company')
      const targetUserId = typeof input.targetUserId === 'string' ? input.targetUserId.trim() : null
      if (targetUserId) {
        const member = await isGroupMember(tx, targetGroupId, targetUserId)
        if (!member) throw validation('targetUserId is not a member of the target group')
      }
      const at = now()
      await tx.run({
        text: `UPDATE tickets SET status = 'processing', group_id = ?, assignee_user_id = ?, assigned_at = COALESCE(assigned_at, ?) WHERE id = ? AND company_id = ?`,
        params: [targetGroupId, targetUserId, at, ticketId, user.companyId],
      })
      await insertActivity(tx, {
        ticketId, companyId: user.companyId, action: 'transferred', operatorUserId: user.userId, operatorName: user.displayName,
        detail: { targetGroupId, targetGroupName: group.name, ...(targetUserId ? { targetUserId } : {}), ...(input.reason ? { reason: input.reason } : {}) }, at,
      })
      const updated = await requireTicket(tx, ticketId, user.companyId)
      return toTicket(updated)
    })
  }

  // POST /api/tickets/:id/complete：processing → completed，随后同步发送完成通知邮件（失败不回滚完成）。
  async function completeTicket(user: TicketUser, ticketId: number, resolution: string | null): Promise<{ ticket: Ticket; notification: NotificationEntry }> {
    if (!isHandler(user)) throw forbidden('Only a handler can complete a ticket')
    if (resolution !== null && resolution !== undefined && typeof resolution !== 'string') throw validation('resolution must be a string')
    if (typeof resolution === 'string' && resolution.length > 2000) throw validation('resolution must be at most 2000 characters')
    const row = await db.transaction(async (tx) => {
      const current = await requireTicket(tx, ticketId, user.companyId)
      if (current.status !== 'processing') throw stateConflict(current.status, 'Only a processing ticket can be completed')
      const completedAt = now()
      await tx.run({
        text: `UPDATE tickets SET status = 'completed', handler_user_id = ?, handler_name = ?, completed_at = ? WHERE id = ? AND company_id = ?`,
        params: [user.userId, user.displayName, completedAt, ticketId, user.companyId],
      })
      await insertActivity(tx, {
        ticketId, companyId: user.companyId, action: 'completed', operatorUserId: user.userId, operatorName: user.displayName,
        detail: resolution ? { resolution } : null, at: completedAt,
      })
      return requireTicket(tx, ticketId, user.companyId)
    })
    const ticket = toTicket(row)
    const notification = await notifications.sendCompletionNotification({
      companyId: user.companyId,
      ticketId,
      ticketNo: ticket.ticketNo,
      subject: ticket.subject,
      submitterName: ticket.submitterName,
      submitterEmail: ticket.submitterEmail,
      handlerName: user.displayName,
      completedAt: ticket.completedAt ?? now(),
    })
    return { ticket, notification }
  }

  // POST /api/tickets/:id/cancel：提交人本人或 agent/company_admin；完成前任意状态可取消。
  async function cancelTicket(user: TicketUser, ticketId: number, reason: string | null): Promise<Ticket> {
    if (reason !== null && reason !== undefined && typeof reason !== 'string') throw validation('reason must be a string')
    if (typeof reason === 'string' && reason.length > 500) throw validation('reason must be at most 500 characters')
    const row = await db.transaction(async (tx) => {
      const current = await requireTicket(tx, ticketId, user.companyId)
      if (current.submitter_user_id !== user.userId && !isHandler(user)) throw forbidden('Only the ticket submitter or a handler can cancel this ticket')
      if (current.status === 'completed' || current.status === 'cancelled') {
        throw stateConflict(current.status, 'A completed or cancelled ticket cannot be cancelled')
      }
      const cancelledAt = now()
      await tx.run({
        text: `UPDATE tickets SET status = 'cancelled', cancelled_at = ? WHERE id = ? AND company_id = ?`,
        params: [cancelledAt, ticketId, user.companyId],
      })
      await insertActivity(tx, {
        ticketId, companyId: user.companyId, action: 'cancelled', operatorUserId: user.userId, operatorName: user.displayName,
        detail: reason ? { reason } : null, at: cancelledAt,
      })
      return requireTicket(tx, ticketId, user.companyId)
    })
    return toTicket(row)
  }

  // POST /api/tickets/:id/rating：仅提交人本人，工单完成后；一工单一条评价。
  async function rateTicket(user: TicketUser, ticketId: number, score: number, comment: string | null): Promise<Rating> {
    if (!Number.isInteger(score) || score < 1 || score > 5) throw validation('score must be an integer between 1 and 5')
    if (comment !== null && comment !== undefined && typeof comment !== 'string') throw validation('comment must be a string')
    if (typeof comment === 'string' && comment.length > 1000) throw validation('comment must be at most 1000 characters')
    return db.transaction(async (tx) => {
      const current = await requireTicket(tx, ticketId, user.companyId)
      if (current.submitter_user_id !== user.userId) throw forbidden('Only the ticket submitter can rate this ticket')
      if (current.status !== 'completed') throw stateConflict(current.status, 'Only a completed ticket can be rated')
      const existing = await tx.queryOne<{ id: number }>({ text: 'SELECT id FROM ratings WHERE ticket_id = ?', params: [ticketId] })
      if (existing) throw stateConflict(current.status, 'This ticket has already been rated')
      const createdAt = now()
      const inserted = await tx.queryOne<{ id: number }>({
        text: `INSERT INTO ratings (ticket_id, company_id, rater_user_id, score, comment, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
        params: [ticketId, user.companyId, user.userId, score, typeof comment === 'string' ? comment : null, createdAt],
      })
      if (!inserted) throw new Error('Failed to create rating')
      await insertActivity(tx, {
        ticketId, companyId: user.companyId, action: 'rated', operatorUserId: user.userId, operatorName: user.displayName,
        detail: { score }, at: createdAt,
      })
      return { score, comment: typeof comment === 'string' ? comment : null, createdAt }
    })
  }

  // GET /api/tickets/:id/activity：按 occurred_at 升序。
  async function listActivity(user: TicketUser, ticketId: number): Promise<ActivityEntry[]> {
    await requireTicket(db, ticketId, user.companyId)
    const rows = await db.queryAll<{ id: number; action: string; operator_name: string; detail: string | null; occurred_at: string }>({
      text: 'SELECT id, action, operator_name, detail, occurred_at FROM ticket_activity WHERE ticket_id = ? AND company_id = ? ORDER BY occurred_at ASC, id ASC',
      params: [ticketId, user.companyId],
    })
    return rows.map((entry) => ({ id: entry.id, action: entry.action, operatorName: entry.operator_name, detail: entry.detail, occurredAt: entry.occurred_at }))
  }

  return { createTicket, dispatchTicket, listTickets, getTicketDetail, addReply, transferTicket, completeTicket, cancelTicket, rateTicket, listActivity }
}

export type TicketService = ReturnType<typeof createTicketService>

function requireTrimmed(value: unknown, name: string, maxLength: number): string {
  if (typeof value !== 'string') throw validation(`${name} is required`)
  const trimmed = value.trim()
  if (!trimmed) throw validation(`${name} must not be empty`)
  if (trimmed.length > maxLength) throw validation(`${name} must be at most ${maxLength} characters`)
  return trimmed
}
