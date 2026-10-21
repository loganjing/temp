import { randomUUID } from 'node:crypto'
import type { DbClient } from '@commonapp/dbkit'
import type { EmailClient } from '@commonapp/emailkit'
import { ApiError, conflict, forbidden, notFound, validationError } from '../errors'
import { requireProfile, requireRole, type Session } from '../session'
import { latestEmailLog, sendCompletionNotification, type EmailLogSummary } from './notify'
import { SYSTEM_OPERATOR, listTicketLogs, writeTicketLog } from './ticket-log'

/** ticket 模块：编号生成、状态机事务、回复、转派、完成、取消、满意度评价与提交人完整信息。 */

export const PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'P4'] as const

export const STATUSES = ['created', 'pending_assignment', 'in_progress', 'completed', 'cancelled'] as const

interface TicketRow {
  id: number
  ticket_no: string
  subject: string
  description: string
  category_id: number
  category_name: string
  priority: string
  status: string
  company_id: number
  company_name: string
  submitter_id: string
  submitter_name: string
  submitter_profile_email: string | null
  submitter_platform_email: string | null
  assigned_group_id: number | null
  assigned_group_name: string | null
  completed_by: string | null
  completed_by_name: string | null
  completed_at: string | null
  cancelled_by: string | null
  cancelled_by_name: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string
}

const TICKET_SELECT = `
  SELECT t.id, t.ticket_no, t.subject, t.description, t.category_id, c.name AS category_name,
         t.priority, t.status, t.company_id, co.name AS company_name,
         t.submitter_id, COALESCE(sup.display_name, su.name) AS submitter_name,
         sup.email AS submitter_profile_email, su.email AS submitter_platform_email,
         t.assigned_group_id, bg.name AS assigned_group_name,
         t.completed_by, COALESCE(cbp.display_name, cbu.name) AS completed_by_name, t.completed_at,
         t.cancelled_by, COALESCE(cxp.display_name, cxu.name) AS cancelled_by_name, t.cancelled_at,
         t.created_at, t.updated_at
  FROM tickets t
  JOIN categories c ON c.id = t.category_id
  JOIN companies co ON co.id = t.company_id
  JOIN users su ON su.id = t.submitter_id
  LEFT JOIN user_profiles sup ON sup.user_id = t.submitter_id
  LEFT JOIN business_groups bg ON bg.id = t.assigned_group_id
  LEFT JOIN users cbu ON cbu.id = t.completed_by
  LEFT JOIN user_profiles cbp ON cbp.user_id = t.completed_by
  LEFT JOIN users cxu ON cxu.id = t.cancelled_by
  LEFT JOIN user_profiles cxp ON cxp.user_id = t.cancelled_by`

export interface TicketSummary {
  id: number
  ticketNo: string
  subject: string
  categoryName: string
  priority: string
  status: string
  companyId: number
  companyName: string
  submitterName: string
  assignedGroupName: string | null
  createdAt: string
}

export interface TicketObject extends TicketSummary {
  description: string
  assignedGroupId: number | null
  completedByName: string | null
  completedAt: string | null
  cancelledByName: string | null
  cancelledAt: string | null
}

const ticketSummary = (row: TicketRow): TicketSummary => ({
  id: row.id,
  ticketNo: row.ticket_no,
  subject: row.subject,
  categoryName: row.category_name,
  priority: row.priority,
  status: row.status,
  companyId: row.company_id,
  companyName: row.company_name,
  submitterName: row.submitter_name,
  assignedGroupName: row.assigned_group_name,
  createdAt: row.created_at,
})

const ticketObject = (row: TicketRow): TicketObject => ({
  ...ticketSummary(row),
  description: row.description,
  assignedGroupId: row.assigned_group_id,
  completedByName: row.completed_by_name,
  completedAt: row.completed_at,
  cancelledByName: row.cancelled_by_name,
  cancelledAt: row.cancelled_at,
})

export interface TicketReply {
  id: number
  authorName: string
  authorSide: string
  content: string
  createdAt: string
}

export interface SatisfactionSummary {
  rating: number
  comment: string | null
  ratedAt: string
}

export interface SubmitterInfo {
  userId: string
  displayName: string
  email: string | null
  companyName: string
  department: string | null
  historyTotal: number
}

export interface TicketDetail extends TicketObject {
  ticket: TicketObject
  submitter: SubmitterInfo
  submitterHistory: { ticketNo: string; subject: string; status: string; createdAt: string }[]
  replies: TicketReply[]
  satisfaction: SatisfactionSummary | null
  emailLog: { toEmail: string; status: string; sentAt: string } | null
}

async function findTicketRow(db: DbClient, ticketId: number): Promise<TicketRow | null> {
  return db.queryOne<TicketRow>({ text: `${TICKET_SELECT} WHERE t.id = ?`, params: [ticketId] })
}

async function isGroupMember(db: DbClient, groupId: number, userId: string): Promise<boolean> {
  return Boolean(
    await db.queryOne({ text: 'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?', params: [groupId, userId] }),
  )
}

/** 契约可见性：提交人本人 | 当前分配组成员 | 完成人 | admin。不满足按 404 资源隐藏。 */
export async function canViewTicket(db: DbClient, session: Session, row: TicketRow): Promise<boolean> {
  if (row.submitter_id === session.userId) return true
  if (session.profile?.role === 'admin') return true
  if (row.completed_by === session.userId) return true
  if (row.assigned_group_id !== null && (await isGroupMember(db, row.assigned_group_id, session.userId))) return true
  return false
}

async function requireVisibleTicket(db: DbClient, session: Session, ticketId: number): Promise<TicketRow> {
  const row = await findTicketRow(db, ticketId)
  if (!row) throw notFound('Ticket not found')
  if (!(await canViewTicket(db, session, row))) throw notFound('Ticket not found')
  return row
}

export interface CreateTicketInput {
  subject: string
  description: string
  categoryId: number
  priority: string
}

/** 创建工单：单事务内 created → queued（pending_assignment）→ 命中规则则 auto_assigned（in_progress）。 */
export async function createTicket(db: DbClient, session: Session, input: CreateTicketInput): Promise<TicketDetail> {
  const profile = requireRole(session, 'submitter')
  if (profile.companyId === null) throw validationError('The submitter profile has no company')
  const category = await db.queryOne<{ id: number }>({ text: 'SELECT id FROM categories WHERE id = ?', params: [input.categoryId] })
  if (!category) throw validationError('categoryId does not exist')
  const at = new Date().toISOString()
  const operator = { id: session.userId, name: profile.displayName }
  let ticketId = 0
  await db.transaction(async (tx) => {
    await tx.run({
      text: `INSERT INTO tickets (ticket_no, subject, description, category_id, priority, status, company_id, submitter_id, assigned_group_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      params: [`TMP-${randomUUID()}`, input.subject, input.description, input.categoryId, input.priority, 'created', profile.companyId, session.userId, at, at],
    })
    const inserted = await tx.queryOne<{ id: number }>({ text: 'SELECT last_insert_rowid() AS id' })
    ticketId = Number(inserted?.id ?? 0)
    await writeTicketLog(tx, ticketId, 'created', operator, input.subject, at)
    const ticketNo = `TK-${String(ticketId).padStart(6, '0')}`
    await tx.run({
      text: "UPDATE tickets SET ticket_no = ?, status = 'pending_assignment', updated_at = ? WHERE id = ?",
      params: [ticketNo, at, ticketId],
    })
    await writeTicketLog(tx, ticketId, 'queued', { id: null, name: SYSTEM_OPERATOR }, null, at)
    const rule = await tx.queryOne<{ group_id: number; group_name: string }>({
      text: `SELECT rr.group_id, bg.name AS group_name
             FROM routing_rules rr
             JOIN business_groups bg ON bg.id = rr.group_id
             WHERE rr.company_id = ? AND rr.category_id = ?`,
      params: [profile.companyId, input.categoryId],
    })
    if (rule) {
      await tx.run({
        text: "UPDATE tickets SET assigned_group_id = ?, status = 'in_progress', updated_at = ? WHERE id = ?",
        params: [rule.group_id, at, ticketId],
      })
      await writeTicketLog(tx, ticketId, 'auto_assigned', { id: null, name: SYSTEM_OPERATOR }, rule.group_name, at)
    }
  })
  return getTicketDetail(db, session, ticketId)
}

export async function getTicketDetail(db: DbClient, session: Session, ticketId: number): Promise<TicketDetail> {
  const row = await requireVisibleTicket(db, session, ticketId)
  const [submitter, history, historyTotal, replies, satisfaction] = await Promise.all([
    db.queryOne<{ userId: string; displayName: string; email: string | null; department: string | null }>({
      text: `SELECT u.id AS userId, COALESCE(up.display_name, u.name) AS displayName, COALESCE(up.email, u.email) AS email, up.department
             FROM users u
             LEFT JOIN user_profiles up ON up.user_id = u.id
             WHERE u.id = ?`,
      params: [row.submitter_id],
    }),
    db.queryAll<{ ticketNo: string; subject: string; status: string; createdAt: string }>({
      text: 'SELECT ticket_no AS ticketNo, subject, status, created_at AS createdAt FROM tickets WHERE submitter_id = ? ORDER BY created_at DESC, id DESC LIMIT 50',
      params: [row.submitter_id],
    }),
    db.queryOne<{ total: number }>({ text: 'SELECT COUNT(*) AS total FROM tickets WHERE submitter_id = ?', params: [row.submitter_id] }),
    db.queryAll<TicketReply>({
      text: 'SELECT id, author_name AS authorName, author_side AS authorSide, content, created_at AS createdAt FROM ticket_replies WHERE ticket_id = ? ORDER BY created_at, id',
      params: [ticketId],
    }),
    db.queryOne<SatisfactionSummary>({
      text: 'SELECT rating, comment, rated_at AS ratedAt FROM satisfaction_ratings WHERE ticket_id = ?',
      params: [ticketId],
    }),
  ])
  const showEmailLog = session.profile?.role === 'agent' || session.profile?.role === 'admin'
  const ticket = ticketObject(row)
  return {
    // 契约 §3：detail 响应在 ticket 对象之外同时平铺 description/assignedGroupId 等工单字段。
    ...ticket,
    ticket,
    submitter: {
      userId: row.submitter_id,
      displayName: submitter?.displayName ?? row.submitter_name,
      email: submitter?.email ?? null,
      companyName: row.company_name,
      department: submitter?.department ?? null,
      historyTotal: Number(historyTotal?.total ?? 0),
    },
    submitterHistory: history,
    replies,
    satisfaction: satisfaction ?? null,
    emailLog: showEmailLog ? await latestEmailLog(db, ticketId) : null,
  }
}

export interface ListTicketsQuery {
  status?: string
  priority?: string
  categoryId?: number
  companyId?: number
  search?: string
  sort: 'createdAt' | 'priority' | 'ticketNo'
  order: 'asc' | 'desc'
  page: number
  pageSize: number
}

/** 列表视图域：S 仅本人提交（公司隔离 + 本人限定）；A 仅所属业务组承接的工单（跨公司，由成员关系授权）。 */
export async function listTickets(db: DbClient, session: Session, query: ListTicketsQuery) {
  const profile = requireProfile(session)
  const conditions: string[] = []
  const params: unknown[] = []
  if (profile.role === 'submitter') {
    conditions.push('t.submitter_id = ?')
    params.push(session.userId)
  } else if (profile.role === 'agent') {
    conditions.push('t.assigned_group_id IN (SELECT group_id FROM group_members WHERE user_id = ?)')
    params.push(session.userId)
    if (query.companyId !== undefined) {
      conditions.push('t.company_id = ?')
      params.push(query.companyId)
    }
  } else {
    throw forbidden('The ticket list requires role submitter or agent')
  }
  if (query.status) {
    conditions.push('t.status = ?')
    params.push(query.status)
  }
  if (query.priority) {
    conditions.push('t.priority = ?')
    params.push(query.priority)
  }
  if (query.categoryId !== undefined) {
    conditions.push('t.category_id = ?')
    params.push(query.categoryId)
  }
  if (query.search) {
    const needle = query.search.trim().toLowerCase()
    conditions.push("(LOWER(t.ticket_no) = ? OR LOWER(t.subject) LIKE '%' || ? || '%')")
    params.push(needle, needle)
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const sortColumn = query.sort === 'priority' ? 't.priority' : query.sort === 'ticketNo' ? 't.ticket_no' : 't.created_at'
  const direction = query.order === 'asc' ? 'ASC' : 'DESC'
  const [rows, total] = await Promise.all([
    db.queryAll<TicketRow>({
      text: `${TICKET_SELECT} ${where} ORDER BY ${sortColumn} ${direction}, t.id ${direction} LIMIT ? OFFSET ?`,
      params: [...params, query.pageSize, (query.page - 1) * query.pageSize],
    }),
    db.queryOne<{ total: number }>({ text: `SELECT COUNT(*) AS total FROM tickets t ${where}`, params }),
  ])
  return {
    items: rows.map(ticketSummary),
    total: Number(total?.total ?? 0),
    page: query.page,
    pageSize: query.pageSize,
  }
}

export async function addReply(db: DbClient, session: Session, ticketId: number, content: string): Promise<TicketReply> {
  const row = await requireVisibleTicket(db, session, ticketId)
  const profile = requireProfile(session)
  const at = new Date().toISOString()
  const authorSide = row.submitter_id === session.userId ? 'submitter' : 'agent'
  let replyId = 0
  await db.transaction(async (tx) => {
    await tx.run({
      text: 'INSERT INTO ticket_replies (ticket_id, author_id, author_name, author_side, content, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      params: [ticketId, session.userId, profile.displayName, authorSide, content, at],
    })
    const inserted = await tx.queryOne<{ id: number }>({ text: 'SELECT last_insert_rowid() AS id' })
    replyId = Number(inserted?.id ?? 0)
    await writeTicketLog(tx, ticketId, 'replied', { id: session.userId, name: profile.displayName }, null, at)
  })
  return { id: replyId, authorName: profile.displayName, authorSide, content, createdAt: at }
}

/** 转派：仅当前分配组成员的 agent；目标组须属同公司且不同于当前组；状态须为待处理。 */
export async function transferTicket(db: DbClient, session: Session, ticketId: number, targetGroupId: number): Promise<TicketObject> {
  const row = await requireVisibleTicket(db, session, ticketId)
  const profile = requireProfile(session)
  const isAssignedAgent =
    profile.role === 'agent' && row.assigned_group_id !== null && (await isGroupMember(db, row.assigned_group_id, session.userId))
  if (!isAssignedAgent) throw forbidden('Only a member of the assigned group can transfer the ticket')
  if (row.status !== 'in_progress') throw conflict('INVALID_STATE', 'Only in-progress tickets can be transferred')
  const target = await db.queryOne<{ id: number; name: string; company_id: number }>({
    text: 'SELECT id, name, company_id FROM business_groups WHERE id = ?',
    params: [targetGroupId],
  })
  if (!target) throw notFound('Target group not found')
  if (target.company_id !== row.company_id) {
    throw new ApiError(400, 'TARGET_COMPANY_MISMATCH', 'The target group belongs to another company')
  }
  if (target.id === row.assigned_group_id) throw conflict('SAME_GROUP', 'The ticket is already assigned to this group')
  const at = new Date().toISOString()
  await db.transaction(async (tx) => {
    await tx.run({ text: 'UPDATE tickets SET assigned_group_id = ?, updated_at = ? WHERE id = ?', params: [target.id, at, ticketId] })
    await writeTicketLog(
      tx,
      ticketId,
      'transferred',
      { id: session.userId, name: profile.displayName },
      `${row.assigned_group_name ?? ''} → ${target.name}`,
      at,
    )
  })
  const updated = await findTicketRow(db, ticketId)
  if (!updated) throw notFound('Ticket not found')
  return ticketObject(updated)
}

/** 完成：事务内置终态并记日志，事务提交后发通知邮件（失败不回滚工单状态）。 */
export async function completeTicket(
  db: DbClient,
  email: EmailClient,
  session: Session,
  ticketId: number,
): Promise<{ ticket: TicketObject; emailLog: EmailLogSummary }> {
  const row = await requireVisibleTicket(db, session, ticketId)
  const profile = requireProfile(session)
  const isAssignedAgent =
    profile.role === 'agent' && row.assigned_group_id !== null && (await isGroupMember(db, row.assigned_group_id, session.userId))
  if (!isAssignedAgent) throw forbidden('Only a member of the assigned group can complete the ticket')
  if (row.status !== 'in_progress') throw conflict('INVALID_STATE', 'Only in-progress tickets can be completed')
  const at = new Date().toISOString()
  await db.transaction(async (tx) => {
    await tx.run({
      text: "UPDATE tickets SET status = 'completed', completed_by = ?, completed_at = ?, updated_at = ? WHERE id = ?",
      params: [session.userId, at, at, ticketId],
    })
    await writeTicketLog(tx, ticketId, 'completed', { id: session.userId, name: profile.displayName }, null, at)
  })
  const updated = await findTicketRow(db, ticketId)
  if (!updated) throw notFound('Ticket not found')
  const emailLog = await sendCompletionNotification(db, email, {
    ticketId,
    ticketNo: updated.ticket_no,
    subject: updated.subject,
    submitterEmail: updated.submitter_profile_email ?? updated.submitter_platform_email,
    completedByName: updated.completed_by_name,
    completedAt: at,
  })
  return { ticket: ticketObject(updated), emailLog }
}

/** 取消：提交人本人或 admin；仅未终态工单可取消。 */
export async function cancelTicket(db: DbClient, session: Session, ticketId: number): Promise<TicketObject> {
  const row = await requireVisibleTicket(db, session, ticketId)
  const profile = requireProfile(session)
  if (row.submitter_id !== session.userId && profile.role !== 'admin') {
    throw forbidden('Only the submitter or an admin can cancel the ticket')
  }
  if (row.status === 'completed' || row.status === 'cancelled') {
    throw conflict('INVALID_STATE', 'Terminal tickets cannot be cancelled')
  }
  const at = new Date().toISOString()
  await db.transaction(async (tx) => {
    await tx.run({
      text: "UPDATE tickets SET status = 'cancelled', cancelled_by = ?, cancelled_at = ?, updated_at = ? WHERE id = ?",
      params: [session.userId, at, at, ticketId],
    })
    await writeTicketLog(tx, ticketId, 'cancelled', { id: session.userId, name: profile.displayName }, null, at)
  })
  const updated = await findTicketRow(db, ticketId)
  if (!updated) throw notFound('Ticket not found')
  return ticketObject(updated)
}

export interface RatingInput {
  rating: number
  comment: string | null
}

/** 满意度评价：仅提交人本人对已完成且未评价的工单可评价。 */
export async function rateTicket(db: DbClient, session: Session, ticketId: number, input: RatingInput): Promise<SatisfactionSummary> {
  const row = await requireVisibleTicket(db, session, ticketId)
  if (row.submitter_id !== session.userId) throw forbidden('Only the submitter can rate this ticket')
  if (row.status !== 'completed') throw conflict('INVALID_STATE', 'Only completed tickets can be rated')
  if (await db.queryOne({ text: 'SELECT 1 FROM satisfaction_ratings WHERE ticket_id = ?', params: [ticketId] })) {
    throw conflict('ALREADY_RATED', 'This ticket has already been rated')
  }
  const profile = requireProfile(session)
  const at = new Date().toISOString()
  await db.transaction(async (tx) => {
    await tx.run({
      text: 'INSERT INTO satisfaction_ratings (ticket_id, rating, comment, rated_by, rated_at) VALUES (?, ?, ?, ?, ?)',
      params: [ticketId, input.rating, input.comment, session.userId, at],
    })
    await writeTicketLog(tx, ticketId, 'rated', { id: session.userId, name: profile.displayName }, `${input.rating} 星`, at)
  })
  return { rating: input.rating, comment: input.comment, ratedAt: at }
}

export async function getTicketLogs(db: DbClient, session: Session, ticketId: number, page: number, pageSize: number) {
  await requireVisibleTicket(db, session, ticketId)
  return listTicketLogs(db, ticketId, page, pageSize)
}
