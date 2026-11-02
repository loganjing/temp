import { randomUUID } from 'node:crypto'
import type { DbClient } from '@commonapp/dbkit'
import { createAuditKit } from '@commonapp/auditkit'
import type { EmailClient } from '@commonapp/emailkit'
import type {
  AutoAssignRule,
  BusinessGroup,
  BusinessGroupMember,
  OperationLog,
  Paginated,
  SLAPriority,
  SubmitterInfo,
  Ticket,
  TicketCategory,
  TicketDetail,
  TicketEvaluation,
  TicketReply,
  TicketStatus,
  TicketTransfer,
  TransferTargetType,
  UserRole,
} from '../shared/types'
import type { TicketUser } from './middleware'

const SLA_ORDER: Record<SLAPriority, number> = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4 }
const now = () => new Date().toISOString()

export interface ServiceContext {
  db: DbClient
  audit: ReturnType<typeof createAuditKit>
  emailClient: EmailClient | null
}

/* ---------- 行映射辅助 ---------- */

interface TicketRow {
  id: string
  title: string
  description: string
  category_id: string
  category_name: string | null
  company_id: string
  submitter_id: string
  submitter_name: string | null
  sla_priority: string
  status: string
  assigned_group_id: string | null
  assigned_group_name: string | null
  assigned_handler_id: string | null
  assigned_handler_name: string | null
  handler_id: string | null
  handler_name: string | null
  handled_at: string | null
  created_at: string
  updated_at: string
}

const TICKET_SELECT = `
  SELECT t.id, t.title, t.description, t.category_id, tc.name AS category_name,
    t.company_id, t.submitter_id, u.name AS submitter_name, t.sla_priority, t.status,
    t.assigned_group_id, bg.name AS assigned_group_name,
    t.assigned_handler_id, uh.name AS assigned_handler_name,
    t.handler_id, uhd.name AS handler_name, t.handled_at, t.created_at, t.updated_at
  FROM tickets t
  LEFT JOIN ticket_categories tc ON tc.id = t.category_id
  LEFT JOIN users u ON u.id = t.submitter_id
  LEFT JOIN business_groups bg ON bg.id = t.assigned_group_id
  LEFT JOIN users uh ON uh.id = t.assigned_handler_id
  LEFT JOIN users uhd ON uhd.id = t.handler_id
`

function mapTicket(row: TicketRow): Ticket {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    categoryId: row.category_id,
    categoryName: row.category_name ?? '',
    companyId: row.company_id,
    submitterId: row.submitter_id,
    submitterName: row.submitter_name ?? '',
    slaPriority: row.sla_priority as SLAPriority,
    status: row.status as TicketStatus,
    assignedGroupId: row.assigned_group_id,
    assignedGroupName: row.assigned_group_name,
    assignedHandlerId: row.assigned_handler_id,
    assignedHandlerName: row.assigned_handler_name,
    handlerId: row.handler_id,
    handlerName: row.handler_name,
    handledAt: row.handled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/* ---------- 审计 ---------- */

async function recordAudit(
  ctx: ServiceContext,
  user: TicketUser,
  action: string,
  ticketId: string,
  detail: Record<string, unknown>,
) {
  await ctx.audit.record({
    type: action,
    occurredAt: now(),
    actorUserId: user.id,
    channel: 'web',
    metadata: { targetType: 'ticket', targetId: ticketId, actorName: user.name, ...detail },
  })
}

/* ---------- 工单服务 ---------- */

export async function createTicket(
  ctx: ServiceContext,
  user: TicketUser,
  input: { title: string; description: string; categoryId: string; slaPriority: SLAPriority },
): Promise<Ticket> {
  const companyId = user.companyId!
  const category = await ctx.db.queryOne<{ id: string }>({
    text: 'SELECT id FROM ticket_categories WHERE id = ? AND company_id = ?',
    params: [input.categoryId, companyId],
  })
  if (!category) throw new ServiceError('INVALID_INPUT', 'Category does not belong to your company', 400)
  const id = randomUUID()
  const ts = now()
  await ctx.db.run({
    text: `INSERT INTO tickets (id, title, description, category_id, company_id, submitter_id, sla_priority, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_assignment', ?, ?)`,
    params: [id, input.title, input.description, input.categoryId, companyId, user.id, input.slaPriority, ts, ts],
  })
  await recordAudit(ctx, user, 'ticket_create', id, { title: input.title, categoryId: input.categoryId, slaPriority: input.slaPriority })
  // 自动分配规则匹配
  const rule = await ctx.db.queryOne<{ target_group_id: string }>({
    text: 'SELECT target_group_id FROM auto_assign_rules WHERE company_id = ? AND category_id = ?',
    params: [companyId, input.categoryId],
  })
  if (rule) {
    const updated = now()
    await ctx.db.run({
      text: 'UPDATE tickets SET assigned_group_id = ?, status = ?, updated_at = ? WHERE id = ?',
      params: [rule.target_group_id, 'pending_processing', updated, id],
    })
    await recordAudit(ctx, user, 'ticket_auto_assign', id, { targetGroupId: rule.target_group_id })
  }
  const row = await ctx.db.queryOne<TicketRow>({ text: `${TICKET_SELECT} WHERE t.id = ?`, params: [id] })
  return mapTicket(row!)
}

export async function listTickets(
  ctx: ServiceContext,
  user: TicketUser,
  query: {
    page?: number
    pageSize?: number
    status?: string
    slaPriority?: string
    categoryId?: string
    keyword?: string
    sortBy?: string
    sortOrder?: string
  },
): Promise<Paginated<Ticket>> {
  const companyId = user.companyId!
  const page = Math.max(Number(query.page ?? 1), 1)
  const pageSize = Math.min(Math.max(Number(query.pageSize ?? 20), 1), 100)
  const offset = (page - 1) * pageSize
  const where: string[] = ['t.company_id = ?']
  const params: unknown[] = [companyId]
  if (query.status) { where.push('t.status = ?'); params.push(query.status) }
  if (query.slaPriority) { where.push('t.sla_priority = ?'); params.push(query.slaPriority) }
  if (query.categoryId) { where.push('t.category_id = ?'); params.push(query.categoryId) }
  if (query.keyword) { where.push('(t.title LIKE ? OR t.description LIKE ?)'); const kw = `%${query.keyword}%`; params.push(kw, kw) }
  const sortMap: Record<string, string> = { createdAt: 't.created_at', slaPriority: 't.sla_priority', status: 't.status', updatedAt: 't.updated_at' }
  const sortColumn = sortMap[query.sortBy ?? 'createdAt'] ?? 't.created_at'
  const sortOrder = query.sortOrder === 'asc' ? 'ASC' : 'DESC'
  const whereClause = where.join(' AND ')
  const totalRow = await ctx.db.queryOne<{ total: number }>({ text: `SELECT COUNT(*) AS total FROM tickets t WHERE ${whereClause}`, params })
  const total = Number(totalRow?.total ?? 0)
  const rows = await ctx.db.queryAll<TicketRow>({
    text: `${TICKET_SELECT} WHERE ${whereClause} ORDER BY ${sortColumn} ${sortOrder}, t.id DESC LIMIT ? OFFSET ?`,
    params: [...params, pageSize, offset],
  })
  return { items: rows.map(mapTicket), total, page, pageSize }
}

export async function getTicket(ctx: ServiceContext, user: TicketUser, id: string): Promise<TicketDetail | null> {
  const row = await ctx.db.queryOne<TicketRow>({ text: `${TICKET_SELECT} WHERE t.id = ? AND t.company_id = ?`, params: [id, user.companyId] })
  if (!row) return null
  const replies = await ctx.db.queryAll<{ id: string; ticket_id: string; replier_id: string; replier_name: string | null; content: string; created_at: string }>({
    text: `SELECT tr.id, tr.ticket_id, tr.replier_id, u.name AS replier_name, tr.content, tr.created_at
           FROM ticket_replies tr LEFT JOIN users u ON u.id = tr.replier_id
           WHERE tr.ticket_id = ? ORDER BY tr.created_at ASC`,
    params: [id],
  })
  const evaluation = await getEvaluationRow(ctx, id)
  return { ...mapTicket(row), replies: replies.map((r) => ({
    id: r.id, ticketId: r.ticket_id, replierId: r.replier_id, replierName: r.replier_name ?? '', content: r.content, createdAt: r.created_at,
  })), evaluation }
}

export async function updateTicket(
  ctx: ServiceContext,
  user: TicketUser,
  id: string,
  input: { title?: string; description?: string; categoryId?: string; slaPriority?: SLAPriority },
): Promise<Ticket> {
  const ticket = await ctx.db.queryOne<TicketRow>({ text: `${TICKET_SELECT} WHERE t.id = ? AND t.company_id = ?`, params: [id, user.companyId] })
  if (!ticket) throw new ServiceError('NOT_FOUND', 'Ticket not found', 404)
  if (user.role !== 'admin' && ticket.submitter_id !== user.id) throw new ServiceError('FORBIDDEN', 'Only submitter or admin can update', 403)
  if (!['pending_assignment', 'pending_processing'].includes(ticket.status)) throw new ServiceError('INVALID_STATE', 'Ticket cannot be updated in current state', 409)
  if (input.categoryId) {
    const cat = await ctx.db.queryOne<{ id: string }>({ text: 'SELECT id FROM ticket_categories WHERE id = ? AND company_id = ?', params: [input.categoryId, user.companyId] })
    if (!cat) throw new ServiceError('INVALID_INPUT', 'Category does not belong to your company', 400)
  }
  const fields: string[] = []
  const params: unknown[] = []
  if (input.title !== undefined) { fields.push('title = ?'); params.push(input.title) }
  if (input.description !== undefined) { fields.push('description = ?'); params.push(input.description) }
  if (input.categoryId !== undefined) { fields.push('category_id = ?'); params.push(input.categoryId) }
  if (input.slaPriority !== undefined) { fields.push('sla_priority = ?'); params.push(input.slaPriority) }
  if (fields.length === 0) return mapTicket(ticket)
  fields.push('updated_at = ?')
  params.push(now(), id)
  await ctx.db.run({ text: `UPDATE tickets SET ${fields.join(', ')} WHERE id = ?`, params })
  const row = await ctx.db.queryOne<TicketRow>({ text: `${TICKET_SELECT} WHERE t.id = ?`, params: [id] })
  return mapTicket(row!)
}

export async function addReply(ctx: ServiceContext, user: TicketUser, id: string, content: string): Promise<TicketReply> {
  const ticket = await ctx.db.queryOne<{ id: string }>({ text: 'SELECT id FROM tickets WHERE id = ? AND company_id = ?', params: [id, user.companyId] })
  if (!ticket) throw new ServiceError('NOT_FOUND', 'Ticket not found', 404)
  const replyId = randomUUID()
  const ts = now()
  await ctx.db.run({
    text: 'INSERT INTO ticket_replies (id, ticket_id, replier_id, content, created_at) VALUES (?, ?, ?, ?, ?)',
    params: [replyId, id, user.id, content, ts],
  })
  await recordAudit(ctx, user, 'ticket_reply', id, { replyId })
  return { id: replyId, ticketId: id, replierId: user.id, replierName: user.name, content, createdAt: ts }
}

export async function listReplies(ctx: ServiceContext, user: TicketUser, id: string): Promise<TicketReply[]> {
  const ticket = await ctx.db.queryOne<{ id: string }>({ text: 'SELECT id FROM tickets WHERE id = ? AND company_id = ?', params: [id, user.companyId] })
  if (!ticket) throw new ServiceError('NOT_FOUND', 'Ticket not found', 404)
  const rows = await ctx.db.queryAll<{ id: string; ticket_id: string; replier_id: string; replier_name: string | null; content: string; created_at: string }>({
    text: `SELECT tr.id, tr.ticket_id, tr.replier_id, u.name AS replier_name, tr.content, tr.created_at
           FROM ticket_replies tr LEFT JOIN users u ON u.id = tr.replier_id
           WHERE tr.ticket_id = ? ORDER BY tr.created_at ASC`,
    params: [id],
  })
  return rows.map((r) => ({ id: r.id, ticketId: r.ticket_id, replierId: r.replier_id, replierName: r.replier_name ?? '', content: r.content, createdAt: r.created_at }))
}

export async function assignTicket(
  ctx: ServiceContext,
  user: TicketUser,
  id: string,
  input: { targetType: TransferTargetType; targetUserId?: string; targetGroupId?: string },
): Promise<Ticket> {
  const ticket = await ctx.db.queryOne<TicketRow>({ text: `${TICKET_SELECT} WHERE t.id = ? AND t.company_id = ?`, params: [id, user.companyId] })
  if (!ticket) throw new ServiceError('NOT_FOUND', 'Ticket not found', 404)
  if (!['admin', 'handler'].includes(user.role)) throw new ServiceError('FORBIDDEN', 'Only admin or handler can assign', 403)
  let groupId: string | null = null
  let handlerId: string | null = null
  if (input.targetType === 'group') {
    groupId = input.targetGroupId ?? null
    if (groupId) {
      const g = await ctx.db.queryOne<{ id: string }>({ text: 'SELECT id FROM business_groups WHERE id = ? AND company_id = ?', params: [groupId, user.companyId] })
      if (!g) throw new ServiceError('INVALID_INPUT', 'Group does not belong to your company', 400)
    }
  } else {
    handlerId = input.targetUserId ?? null
    if (handlerId) {
      const u = await ctx.db.queryOne<{ id: string }>({ text: 'SELECT id FROM users WHERE id = ? AND company_id = ?', params: [handlerId, user.companyId] })
      if (!u) throw new ServiceError('INVALID_INPUT', 'User does not belong to your company', 400)
    }
  }
  const ts = now()
  await ctx.db.run({
    text: 'UPDATE tickets SET assigned_group_id = ?, assigned_handler_id = ?, status = ?, updated_at = ? WHERE id = ?',
    params: [groupId, handlerId, 'pending_processing', ts, id],
  })
  await recordAudit(ctx, user, 'ticket_assign', id, { targetType: input.targetType, targetUserId: handlerId, targetGroupId: groupId })
  const row = await ctx.db.queryOne<TicketRow>({ text: `${TICKET_SELECT} WHERE t.id = ?`, params: [id] })
  return mapTicket(row!)
}

export async function transferTicket(
  ctx: ServiceContext,
  user: TicketUser,
  id: string,
  input: { targetType: TransferTargetType; targetUserId?: string; targetGroupId?: string; reason?: string },
): Promise<Ticket> {
  const ticket = await ctx.db.queryOne<TicketRow>({ text: `${TICKET_SELECT} WHERE t.id = ? AND t.company_id = ?`, params: [id, user.companyId] })
  if (!ticket) throw new ServiceError('NOT_FOUND', 'Ticket not found', 404)
  if (user.role !== 'handler') throw new ServiceError('FORBIDDEN', 'Only handler can transfer', 403)
  if (ticket.assigned_handler_id !== user.id) throw new ServiceError('FORBIDDEN', 'Only the assigned handler can transfer', 403)
  let groupId: string | null = null
  let handlerId: string | null = null
  let targetUserName: string | null = null
  let targetGroupName: string | null = null
  if (input.targetType === 'group') {
    groupId = input.targetGroupId ?? null
    if (groupId) {
      const g = await ctx.db.queryOne<{ id: string; name: string }>({ text: 'SELECT id, name FROM business_groups WHERE id = ? AND company_id = ?', params: [groupId, user.companyId] })
      if (!g) throw new ServiceError('INVALID_INPUT', 'Group does not belong to your company', 400)
      targetGroupName = g.name
    }
  } else {
    handlerId = input.targetUserId ?? null
    if (handlerId) {
      const u = await ctx.db.queryOne<{ id: string; name: string }>({ text: 'SELECT id, name FROM users WHERE id = ? AND company_id = ?', params: [handlerId, user.companyId] })
      if (!u) throw new ServiceError('INVALID_INPUT', 'User does not belong to your company', 400)
      targetUserName = u.name
    }
  }
  const ts = now()
  const transferId = randomUUID()
  await ctx.db.transaction(async (tx) => {
    await tx.run({
      text: 'UPDATE tickets SET assigned_group_id = ?, assigned_handler_id = ?, updated_at = ? WHERE id = ?',
      params: [groupId, handlerId, ts, id],
    })
    await tx.run({
      text: `INSERT INTO ticket_transfers (id, ticket_id, transferred_by, target_type, target_user_id, target_group_id, reason, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [transferId, id, user.id, input.targetType, handlerId, groupId, input.reason ?? null, ts],
    })
  })
  await recordAudit(ctx, user, 'ticket_transfer', id, { targetType: input.targetType, targetUserId: handlerId, targetGroupId: groupId, transferId })
  const row = await ctx.db.queryOne<TicketRow>({ text: `${TICKET_SELECT} WHERE t.id = ?`, params: [id] })
  return mapTicket(row!)
}

export async function completeTicket(ctx: ServiceContext, user: TicketUser, id: string, summary?: string): Promise<Ticket> {
  const ticket = await ctx.db.queryOne<TicketRow>({ text: `${TICKET_SELECT} WHERE t.id = ? AND t.company_id = ?`, params: [id, user.companyId] })
  if (!ticket) throw new ServiceError('NOT_FOUND', 'Ticket not found', 404)
  if (user.role !== 'handler') throw new ServiceError('FORBIDDEN', 'Only handler can complete', 403)
  if (ticket.assigned_handler_id !== user.id) throw new ServiceError('FORBIDDEN', 'Only the assigned handler can complete', 403)
  if (ticket.status !== 'pending_processing') throw new ServiceError('INVALID_STATE', 'Ticket is not pending processing', 409)
  const ts = now()
  await ctx.db.run({
    text: 'UPDATE tickets SET status = ?, handler_id = ?, handled_at = ?, updated_at = ? WHERE id = ?',
    params: ['completed', user.id, ts, ts, id],
  })
  await recordAudit(ctx, user, 'ticket_complete', id, { summary })
  // 异步发送邮件到提交人邮箱
  void sendCompletionEmail(ctx, ticket.submitter_id, ticket.title)
  const row = await ctx.db.queryOne<TicketRow>({ text: `${TICKET_SELECT} WHERE t.id = ?`, params: [id] })
  return mapTicket(row!)
}

export async function cancelTicket(ctx: ServiceContext, user: TicketUser, id: string, reason?: string): Promise<Ticket> {
  const ticket = await ctx.db.queryOne<TicketRow>({ text: `${TICKET_SELECT} WHERE t.id = ? AND t.company_id = ?`, params: [id, user.companyId] })
  if (!ticket) throw new ServiceError('NOT_FOUND', 'Ticket not found', 404)
  if (user.role !== 'admin' && ticket.submitter_id !== user.id) throw new ServiceError('FORBIDDEN', 'Only submitter or admin can cancel', 403)
  if (!['pending_assignment', 'pending_processing'].includes(ticket.status)) throw new ServiceError('INVALID_STATE', 'Ticket cannot be cancelled in current state', 409)
  const ts = now()
  await ctx.db.run({ text: 'UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?', params: ['cancelled', ts, id] })
  await recordAudit(ctx, user, 'ticket_cancel', id, { reason })
  const row = await ctx.db.queryOne<TicketRow>({ text: `${TICKET_SELECT} WHERE t.id = ?`, params: [id] })
  return mapTicket(row!)
}

export async function getSubmitterInfo(ctx: ServiceContext, user: TicketUser, id: string): Promise<SubmitterInfo> {
  const ticket = await ctx.db.queryOne<{ submitter_id: string }>({ text: 'SELECT submitter_id FROM tickets WHERE id = ? AND company_id = ?', params: [id, user.companyId] })
  if (!ticket) throw new ServiceError('NOT_FOUND', 'Ticket not found', 404)
  const u = await ctx.db.queryOne<{ id: string; name: string; email: string; company_id: string; department_id: string | null; company_name: string | null; department_name: string | null; created_at: string }>({
    text: `SELECT u.id, u.name, u.email, u.company_id, u.department_id, c.name AS company_name, d.name AS department_name, u.created_at
           FROM users u LEFT JOIN companies c ON c.id = u.company_id LEFT JOIN departments d ON d.id = u.department_id
           WHERE u.id = ?`,
    params: [ticket.submitter_id],
  })
  if (!u) throw new ServiceError('NOT_FOUND', 'Submitter not found', 404)
  const history = await ctx.db.queryAll<{ id: string; title: string; status: string; sla_priority: string; created_at: string }>({
    text: 'SELECT id, title, status, sla_priority, created_at FROM tickets WHERE submitter_id = ? AND company_id = ? ORDER BY created_at DESC',
    params: [u.id, user.companyId],
  })
  const countRow = await ctx.db.queryOne<{ total: number }>({ text: 'SELECT COUNT(*) AS total FROM tickets WHERE submitter_id = ? AND company_id = ?', params: [u.id, user.companyId] })
  return {
    id: u.id, fullName: u.name, email: u.email, companyId: u.company_id, companyName: u.company_name ?? '',
    departmentId: u.department_id, departmentName: u.department_name,
    ticketCount: Number(countRow?.total ?? 0),
    historyTickets: history.map((h) => ({ id: h.id, title: h.title, status: h.status as TicketStatus, slaPriority: h.sla_priority as SLAPriority, createdAt: h.created_at })),
  }
}

export async function listOperationLogs(ctx: ServiceContext, user: TicketUser, id: string): Promise<OperationLog[]> {
  const ticket = await ctx.db.queryOne<{ id: string }>({ text: 'SELECT id FROM tickets WHERE id = ? AND company_id = ?', params: [id, user.companyId] })
  if (!ticket) throw new ServiceError('NOT_FOUND', 'Ticket not found', 404)
  const rows = await ctx.db.queryAll<{ id: string; occurred_at: string; actor_user_id: string | null; event_type: string; metadata_json: string }>({
    text: `SELECT id, occurred_at, actor_user_id, event_type, metadata_json FROM audit_events
           WHERE event_type LIKE 'ticket_%' AND json_extract(metadata_json, '$.targetId') = ?
           ORDER BY occurred_at ASC`,
    params: [id],
  })
  return rows.map((r) => {
    const meta = safeParse(r.metadata_json)
    return {
      id: r.id, actorId: r.actor_user_id ?? '', actorName: String(meta?.actorName ?? ''),
      actionType: r.event_type, targetType: 'ticket', targetId: id,
      detail: JSON.stringify(meta ?? {}), createdAt: r.occurred_at,
    }
  })
}

/* ---------- 评价 ---------- */

async function getEvaluationRow(ctx: ServiceContext, ticketId: string): Promise<TicketEvaluation | null> {
  const row = await ctx.db.queryOne<{ id: string; ticket_id: string; evaluator_id: string; evaluator_name: string | null; rating: number; comment: string | null; created_at: string }>({
    text: `SELECT te.id, te.ticket_id, te.evaluator_id, u.name AS evaluator_name, te.rating, te.comment, te.created_at
           FROM ticket_evaluations te LEFT JOIN users u ON u.id = te.evaluator_id
           WHERE te.ticket_id = ?`,
    params: [ticketId],
  })
  if (!row) return null
  return { id: row.id, ticketId: row.ticket_id, evaluatorId: row.evaluator_id, evaluatorName: row.evaluator_name ?? '', rating: row.rating, comment: row.comment, createdAt: row.created_at }
}

export async function getEvaluation(ctx: ServiceContext, user: TicketUser, id: string): Promise<TicketEvaluation | null> {
  const ticket = await ctx.db.queryOne<{ id: string }>({ text: 'SELECT id FROM tickets WHERE id = ? AND company_id = ?', params: [id, user.companyId] })
  if (!ticket) throw new ServiceError('NOT_FOUND', 'Ticket not found', 404)
  return getEvaluationRow(ctx, id)
}

export async function createEvaluation(ctx: ServiceContext, user: TicketUser, id: string, rating: number, comment?: string): Promise<TicketEvaluation> {
  const ticket = await ctx.db.queryOne<{ id: string; status: string; submitter_id: string }>({ text: 'SELECT id, status, submitter_id FROM tickets WHERE id = ? AND company_id = ?', params: [id, user.companyId] })
  if (!ticket) throw new ServiceError('NOT_FOUND', 'Ticket not found', 404)
  if (user.role !== 'submitter') throw new ServiceError('FORBIDDEN', 'Only submitter can evaluate', 403)
  if (ticket.submitter_id !== user.id) throw new ServiceError('FORBIDDEN', 'Only the ticket submitter can evaluate', 403)
  if (ticket.status !== 'completed') throw new ServiceError('INVALID_STATE', 'Ticket must be completed to evaluate', 409)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new ServiceError('INVALID_INPUT', 'Rating must be an integer between 1 and 5', 400)
  const evalId = randomUUID()
  const ts = now()
  try {
    await ctx.db.run({
      text: 'INSERT INTO ticket_evaluations (id, ticket_id, evaluator_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      params: [evalId, id, user.id, rating, comment ?? null, ts],
    })
  } catch (error) {
    if (error instanceof Error && /unique constraint/i.test(error.message)) throw new ServiceError('CONFLICT', 'Ticket already evaluated', 409)
    throw error
  }
  return { id: evalId, ticketId: id, evaluatorId: user.id, evaluatorName: user.name, rating, comment: comment ?? null, createdAt: ts }
}

/* ---------- 业务组 ---------- */

export async function listGroups(ctx: ServiceContext, companyId: string): Promise<BusinessGroup[]> {
  const rows = await ctx.db.queryAll<{ id: string; company_id: string; name: string; created_at: string; member_count: number }>({
    text: `SELECT bg.id, bg.company_id, bg.name, bg.created_at, COUNT(bgm.id) AS member_count
           FROM business_groups bg LEFT JOIN business_group_members bgm ON bgm.group_id = bg.id
           WHERE bg.company_id = ? GROUP BY bg.id ORDER BY bg.created_at ASC`,
    params: [companyId],
  })
  return rows.map((r) => ({ id: r.id, companyId: r.company_id, name: r.name, memberCount: Number(r.member_count), createdAt: r.created_at }))
}

export async function createGroup(ctx: ServiceContext, companyId: string, name: string): Promise<BusinessGroup> {
  const id = randomUUID()
  const ts = now()
  await ctx.db.run({ text: 'INSERT INTO business_groups (id, company_id, name, created_at) VALUES (?, ?, ?, ?)', params: [id, companyId, name, ts] })
  return { id, companyId, name, memberCount: 0, createdAt: ts }
}

export async function listMembers(ctx: ServiceContext, groupId: string): Promise<BusinessGroupMember[]> {
  const rows = await ctx.db.queryAll<{ id: string; group_id: string; user_id: string; user_name: string | null; user_email: string | null; created_at: string }>({
    text: `SELECT bgm.id, bgm.group_id, bgm.user_id, u.name AS user_name, u.email AS user_email, bgm.created_at
           FROM business_group_members bgm LEFT JOIN users u ON u.id = bgm.user_id
           WHERE bgm.group_id = ? ORDER BY bgm.created_at ASC`,
    params: [groupId],
  })
  return rows.map((r) => ({ id: r.id, groupId: r.group_id, userId: r.user_id, userName: r.user_name ?? '', userEmail: r.user_email ?? '', createdAt: r.created_at }))
}

export async function addMember(ctx: ServiceContext, groupId: string, userId: string): Promise<BusinessGroupMember> {
  const user = await ctx.db.queryOne<{ id: string; name: string; email: string }>({ text: 'SELECT id, name, email FROM users WHERE id = ?', params: [userId] })
  if (!user) throw new ServiceError('NOT_FOUND', 'User not found', 404)
  const id = randomUUID()
  const ts = now()
  try {
    await ctx.db.run({ text: 'INSERT INTO business_group_members (id, group_id, user_id, created_at) VALUES (?, ?, ?, ?)', params: [id, groupId, userId, ts] })
  } catch (error) {
    if (error instanceof Error && /unique constraint/i.test(error.message)) throw new ServiceError('CONFLICT', 'User is already a member', 409)
    throw error
  }
  return { id, groupId, userId, userName: user.name, userEmail: user.email, createdAt: ts }
}

export async function removeMember(ctx: ServiceContext, groupId: string, userId: string): Promise<boolean> {
  const result = await ctx.db.run({ text: 'DELETE FROM business_group_members WHERE group_id = ? AND user_id = ?', params: [groupId, userId] })
  return result.changes === 1
}

/* ---------- 自动分配规则 ---------- */

export async function listAutoAssignRules(ctx: ServiceContext, companyId: string): Promise<AutoAssignRule[]> {
  const rows = await ctx.db.queryAll<{ id: string; company_id: string; category_id: string; category_name: string | null; target_group_id: string; target_group_name: string | null; created_at: string }>({
    text: `SELECT ar.id, ar.company_id, ar.category_id, tc.name AS category_name, ar.target_group_id, bg.name AS target_group_name, ar.created_at
           FROM auto_assign_rules ar
           LEFT JOIN ticket_categories tc ON tc.id = ar.category_id
           LEFT JOIN business_groups bg ON bg.id = ar.target_group_id
           WHERE ar.company_id = ? ORDER BY ar.created_at ASC`,
    params: [companyId],
  })
  return rows.map((r) => ({ id: r.id, companyId: r.company_id, categoryId: r.category_id, categoryName: r.category_name ?? '', targetGroupId: r.target_group_id, targetGroupName: r.target_group_name ?? '', createdAt: r.created_at }))
}

export async function createAutoAssignRule(ctx: ServiceContext, companyId: string, categoryId: string, targetGroupId: string): Promise<AutoAssignRule> {
  const cat = await ctx.db.queryOne<{ id: string; name: string }>({ text: 'SELECT id, name FROM ticket_categories WHERE id = ? AND company_id = ?', params: [categoryId, companyId] })
  if (!cat) throw new ServiceError('INVALID_INPUT', 'Category does not belong to your company', 400)
  const group = await ctx.db.queryOne<{ id: string; name: string }>({ text: 'SELECT id, name FROM business_groups WHERE id = ? AND company_id = ?', params: [targetGroupId, companyId] })
  if (!group) throw new ServiceError('INVALID_INPUT', 'Group does not belong to your company', 400)
  const id = randomUUID()
  const ts = now()
  try {
    await ctx.db.run({ text: 'INSERT INTO auto_assign_rules (id, company_id, category_id, target_group_id, created_at) VALUES (?, ?, ?, ?, ?)', params: [id, companyId, categoryId, targetGroupId, ts] })
  } catch (error) {
    if (error instanceof Error && /unique constraint/i.test(error.message)) throw new ServiceError('CONFLICT', 'Rule already exists for this category', 409)
    throw error
  }
  return { id, companyId, categoryId, categoryName: cat.name, targetGroupId, targetGroupName: group.name, createdAt: ts }
}

/* ---------- 问题分类 ---------- */

export async function listCategories(ctx: ServiceContext, companyId: string): Promise<TicketCategory[]> {
  const rows = await ctx.db.queryAll<{ id: string; company_id: string; name: string; created_at: string }>({
    text: 'SELECT id, company_id, name, created_at FROM ticket_categories WHERE company_id = ? ORDER BY created_at ASC',
    params: [companyId],
  })
  return rows.map((r) => ({ id: r.id, companyId: r.company_id, name: r.name, createdAt: r.created_at }))
}

export async function createCategory(ctx: ServiceContext, companyId: string, name: string): Promise<TicketCategory> {
  const id = randomUUID()
  const ts = now()
  await ctx.db.run({ text: 'INSERT INTO ticket_categories (id, company_id, name, created_at) VALUES (?, ?, ?, ?)', params: [id, companyId, name, ts] })
  return { id, companyId, name, createdAt: ts }
}

/* ---------- 统计分析 ---------- */

const STATUS_KEYS: TicketStatus[] = ['created', 'pending_assignment', 'pending_processing', 'completed', 'cancelled']

function emptyByStatus(): Record<TicketStatus, number> {
  return { created: 0, pending_assignment: 0, pending_processing: 0, completed: 0, cancelled: 0 }
}

export async function distribution(ctx: ServiceContext, user: TicketUser, dimension: 'company' | 'department'): Promise<{
  dimension: string
  groups: { key: string; label: string; total: number; byStatus: Record<TicketStatus, number> }[]
}> {
  if (dimension === 'company') {
    const rows = await ctx.db.queryAll<{ company_id: string; company_name: string | null; status: string; total: number }>({
      text: `SELECT t.company_id, c.name AS company_name, t.status, COUNT(*) AS total
             FROM tickets t LEFT JOIN companies c ON c.id = t.company_id
             WHERE t.company_id = ? GROUP BY t.company_id, t.status`,
      params: [user.companyId],
    })
    return { dimension, groups: buildGroups(rows, 'company_id', 'company_name') }
  }
  const rows = await ctx.db.queryAll<{ department_id: string | null; department_name: string | null; status: string; total: number }>({
    text: `SELECT u.department_id, d.name AS department_name, t.status, COUNT(*) AS total
           FROM tickets t JOIN users u ON u.id = t.submitter_id
           LEFT JOIN departments d ON d.id = u.department_id
           WHERE t.company_id = ? GROUP BY u.department_id, d.name, t.status`,
      params: [user.companyId],
  })
  return { dimension, groups: buildGroups(rows, 'department_id', 'department_name') }
}

function buildGroups(
  rows: { status: string; total: number }[] & Record<string, unknown>[],
  keyField: string,
  labelField: string,
) {
  const map = new Map<string, { label: string; total: number; byStatus: Record<TicketStatus, number> }>()
  for (const row of rows) {
    const key = String(row[keyField] ?? 'unknown')
    const label = String(row[labelField] ?? '未知')
    let g = map.get(key)
    if (!g) { g = { label, total: 0, byStatus: emptyByStatus() }; map.set(key, g) }
    const st = (row.status as TicketStatus)
    if (STATUS_KEYS.includes(st)) g.byStatus[st] += Number(row.total)
    g.total += Number(row.total)
  }
  return Array.from(map.entries()).map(([key, g]) => ({ key, ...g }))
}

export async function dashboard(ctx: ServiceContext, companyId: string): Promise<{
  totalTickets: number
  byStatus: Record<TicketStatus, number>
  averageResponseTimeHours: number
  satisfactionScore: number
  totalEvaluations: number
  topCategories: { categoryId: string; categoryName: string; count: number }[]
}> {
  const statusRows = await ctx.db.queryAll<{ status: string; total: number }>({
    text: 'SELECT status, COUNT(*) AS total FROM tickets WHERE company_id = ? GROUP BY status',
    params: [companyId],
  })
  const byStatus = emptyByStatus()
  let totalTickets = 0
  for (const r of statusRows) { const st = r.status as TicketStatus; if (STATUS_KEYS.includes(st)) byStatus[st] = Number(r.total); totalTickets += Number(r.total) }
  const avgRow = await ctx.db.queryOne<{ avg_hours: number | null }>({
    text: `SELECT AVG((julianday(handled_at) - julianday(created_at)) * 24) AS avg_hours
           FROM tickets WHERE company_id = ? AND handled_at IS NOT NULL`,
    params: [companyId],
  })
  const evalRow = await ctx.db.queryAll<{ rating: number }>({
    text: `SELECT te.rating FROM ticket_evaluations te JOIN tickets t ON t.id = te.ticket_id WHERE t.company_id = ?`,
    params: [companyId],
  })
  const totalEvaluations = evalRow.length
  const satisfactionScore = totalEvaluations ? evalRow.reduce((s, e) => s + Number(e.rating), 0) / totalEvaluations : 0
  const topRows = await ctx.db.queryAll<{ category_id: string; category_name: string | null; count: number }>({
    text: `SELECT t.category_id, tc.name AS category_name, COUNT(*) AS count
           FROM tickets t LEFT JOIN ticket_categories tc ON tc.id = t.category_id
           WHERE t.company_id = ? GROUP BY t.category_id ORDER BY count DESC LIMIT 10`,
    params: [companyId],
  })
  return {
    totalTickets,
    byStatus,
    averageResponseTimeHours: avgRow?.avg_hours != null ? Math.round(Number(avgRow.avg_hours) * 100) / 100 : 0,
    satisfactionScore: Math.round(satisfactionScore * 100) / 100,
    totalEvaluations,
    topCategories: topRows.map((r) => ({ categoryId: r.category_id, categoryName: r.category_name ?? '', count: Number(r.count) })),
  }
}

/* ---------- 工作台 ---------- */

export async function workbench(
  ctx: ServiceContext,
  user: TicketUser,
  query: {
    page?: number
    pageSize?: number
    status?: string
    slaPriority?: string
    categoryId?: string
    companyId?: string
    keyword?: string
    sortBy?: string
    sortOrder?: string
  },
): Promise<Paginated<Ticket>> {
  const page = Math.max(Number(query.page ?? 1), 1)
  const pageSize = Math.min(Math.max(Number(query.pageSize ?? 20), 1), 100)
  const offset = (page - 1) * pageSize
  const where: string[] = []
  const params: unknown[] = []
  if (user.role === 'admin') {
    const companyId = query.companyId ?? user.companyId!
    where.push('t.company_id = ?')
    params.push(companyId)
  } else {
    where.push('t.company_id = ? AND t.assigned_handler_id = ?')
    params.push(user.companyId, user.id)
  }
  const status = query.status ?? 'pending_processing'
  where.push('t.status = ?')
  params.push(status)
  if (query.slaPriority) { where.push('t.sla_priority = ?'); params.push(query.slaPriority) }
  if (query.categoryId) { where.push('t.category_id = ?'); params.push(query.categoryId) }
  if (query.keyword) { where.push('(t.title LIKE ? OR t.description LIKE ?)'); const kw = `%${query.keyword}%`; params.push(kw, kw) }
  const sortMap: Record<string, string> = { slaPriority: 't.sla_priority', createdAt: 't.created_at', updatedAt: 't.updated_at' }
  const sortColumn = sortMap[query.sortBy ?? 'slaPriority'] ?? 't.sla_priority'
  // SLA 优先级排序：P0 最先
  const sortOrder = query.sortOrder === 'asc' ? 'ASC' : 'DESC'
  const slaSort = sortColumn === 't.sla_priority' ? `CASE t.sla_priority ${Object.entries(SLA_ORDER).map(([k, v]) => `WHEN '${k}' THEN ${v}`).join(' ')} END ${sortOrder}` : `${sortColumn} ${sortOrder}`
  const whereClause = where.join(' AND ')
  const totalRow = await ctx.db.queryOne<{ total: number }>({ text: `SELECT COUNT(*) AS total FROM tickets t WHERE ${whereClause}`, params })
  const total = Number(totalRow?.total ?? 0)
  const rows = await ctx.db.queryAll<TicketRow>({
    text: `${TICKET_SELECT} WHERE ${whereClause} ORDER BY ${slaSort}, t.created_at ASC LIMIT ? OFFSET ?`,
    params: [...params, pageSize, offset],
  })
  return { items: rows.map(mapTicket), total, page, pageSize }
}

/* ---------- 邮件 ---------- */

async function sendCompletionEmail(ctx: ServiceContext, submitterId: string, ticketTitle: string): Promise<void> {
  try {
    const u = await ctx.db.queryOne<{ email: string; name: string }>({ text: 'SELECT email, name FROM users WHERE id = ?', params: [submitterId] })
    if (!u?.email) return
    if (!ctx.emailClient) {
      console.info(`[email] SMTP not configured; completion notification for ${u.email} (ticket: ${ticketTitle}) logged`)
      return
    }
    const result = await ctx.emailClient.send({
      to: u.email,
      subject: '工单已完成通知',
      text: `您的工单「${ticketTitle}」已处理完成，请查看详情并进行满意度评价。`,
    })
    if (result.status === 'failed') console.error(`[email] send failed: ${result.message}`)
  } catch (error) {
    console.error('[email] completion notification error', error)
  }
}

/* ---------- 用户信息 ---------- */

export async function getUserInfo(ctx: ServiceContext, user: TicketUser): Promise<{
  id: string
  username: string
  email: string
  fullName: string
  companyId: string
  companyName: string
  departmentId: string | null
  departmentName: string | null
  role: UserRole
  createdAt: string
}> {
  const row = await ctx.db.queryOne<{ name: string; created_at: string; company_name: string | null; department_name: string | null }>({
    text: `SELECT u.name, u.created_at, c.name AS company_name, d.name AS department_name
           FROM users u LEFT JOIN companies c ON c.id = u.company_id LEFT JOIN departments d ON d.id = u.department_id
           WHERE u.id = ?`,
    params: [user.id],
  })
  return {
    id: user.id,
    username: user.email,
    email: user.email,
    fullName: row?.name ?? user.name,
    companyId: user.companyId ?? '',
    companyName: row?.company_name ?? '',
    departmentId: user.departmentId,
    departmentName: row?.department_name ?? null,
    role: user.role as UserRole,
    createdAt: row?.created_at ?? now(),
  }
}

/* ---------- 辅助 ---------- */

export class ServiceError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message) }
}

function safeParse(json: string): Record<string, unknown> | null {
  try { return JSON.parse(json) } catch { return null }
}
