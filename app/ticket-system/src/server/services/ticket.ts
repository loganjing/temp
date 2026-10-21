import type { DbClient } from '@commonapp/dbkit'
import { forbidden, notFound, stateConflict, validationError } from '../errors'
import { requireCategory, resolveAutoAssignGroupId, requireGroupForCompany } from './assignment'
import type { SessionUser } from './identity'
import { enqueueCompletionNotice } from './notification'
import { listTicketTimeline, recordOperationEvent, type TimelineItem } from './operation-log'

export const TICKET_STATUSES = ['created', 'pending_assignment', 'pending_process', 'completed', 'cancelled'] as const
export type TicketStatus = (typeof TICKET_STATUSES)[number]
export const PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'P4'] as const
export type Priority = (typeof PRIORITIES)[number]
export const WORKBENCH_STATUSES: readonly TicketStatus[] = ['pending_process', 'pending_assignment']

export type TicketListItem = {
  id: number
  ticketNo: string
  subject: string
  categoryId: number
  categoryName: string
  priority: string
  status: string
  companyName: string
  submitterName: string
  assignedGroupId: number | null
  assignedGroupName: string | null
  createdAt: string
  firstReplyAt: string | null
}
export type TicketDetail = TicketListItem & {
  description: string
  submitter: SessionUser
  completedBy: { id: number; fullName: string } | null
  completedAt: string | null
  updatedAt: string
}
export type ReplyItem = { id: number; author: { id: number; fullName: string }; content: string; createdAt: string }
export type HistoryTicketItem = { id: number; ticketNo: string; subject: string; status: string; createdAt: string }
export type RatingInfo = { rating: number; ratedAt: string; ratedBy: { id: number; fullName: string } }
export type TicketDetailResponse = {
  ticket: TicketDetail
  replies: ReplyItem[]
  timeline: TimelineItem[]
  submitterHistory: HistoryTicketItem[]
  rating: RatingInfo | null
}
export type ListTicketsQuery = {
  scope: 'company' | 'mine'
  status?: TicketStatus
  categoryId?: number
  priority?: Priority
  companyId?: number
  q?: string
  sort: 'createdAt' | 'priority'
  order: 'asc' | 'desc'
  page: number
  pageSize: number
}

type TicketCoreRow = {
  id: number
  ticketNo: string
  subject: string
  status: TicketStatus
  submitterId: number
  submitterEmail: string
  assignedGroupId: number | null
  firstReplyAt: string | null
}

type TicketDetailRow = {
  id: number
  ticketNo: string
  subject: string
  description: string
  categoryId: number
  categoryName: string
  priority: string
  status: string
  companyId: number
  companyName: string
  submitterName: string
  assignedGroupId: number | null
  assignedGroupName: string | null
  createdAt: string
  firstReplyAt: string | null
  submitterId: number
  submitterUsername: string
  submitterEmail: string
  submitterDepartment: string
  completedById: number | null
  completedByName: string | null
  completedAt: string | null
  updatedAt: string
}

const TICKET_DETAIL_SELECT = `SELECT t.id, t.ticket_no AS ticketNo, t.subject, t.description, t.category_id AS categoryId, c.name AS categoryName,
    t.priority, t.status, t.company_id AS companyId, co.name AS companyName, s.full_name AS submitterName,
    t.assigned_group_id AS assignedGroupId, g.name AS assignedGroupName,
    t.created_at AS createdAt, t.first_reply_at AS firstReplyAt,
    s.id AS submitterId, s.username AS submitterUsername, s.email AS submitterEmail, s.department AS submitterDepartment,
    t.completed_by AS completedById, cb.full_name AS completedByName, t.completed_at AS completedAt,
    t.updated_at AS updatedAt
  FROM tickets t
  JOIN categories c ON c.id = t.category_id
  JOIN companies co ON co.id = t.company_id
  JOIN users s ON s.id = t.submitter_id
  LEFT JOIN business_groups g ON g.id = t.assigned_group_id
  LEFT JOIN users cb ON cb.id = t.completed_by`

function toTicketDetail(row: TicketDetailRow): TicketDetail {
  return {
    id: row.id,
    ticketNo: row.ticketNo,
    subject: row.subject,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    priority: row.priority,
    status: row.status,
    companyName: row.companyName,
    submitterName: row.submitterName,
    assignedGroupId: row.assignedGroupId,
    assignedGroupName: row.assignedGroupName,
    createdAt: row.createdAt,
    firstReplyAt: row.firstReplyAt,
    description: row.description,
    submitter: {
      id: row.submitterId,
      username: row.submitterUsername,
      fullName: row.submitterName,
      email: row.submitterEmail,
      companyId: row.companyId,
      companyName: row.companyName,
      department: row.submitterDepartment,
    },
    completedBy: row.completedById === null ? null : { id: row.completedById, fullName: row.completedByName ?? '' },
    completedAt: row.completedAt,
    updatedAt: row.updatedAt,
  }
}

// 跨公司与不存在统一 404 语义（AC-02）：按当前用户公司过滤读取。
async function loadTicketCore(db: DbClient, ticketId: number, companyId: number): Promise<TicketCoreRow> {
  const row = await db.queryOne<TicketCoreRow>({
    text: `SELECT t.id, t.ticket_no AS ticketNo, t.subject, t.status, t.submitter_id AS submitterId,
        s.email AS submitterEmail, t.assigned_group_id AS assignedGroupId, t.first_reply_at AS firstReplyAt
      FROM tickets t JOIN users s ON s.id = t.submitter_id
      WHERE t.id = ? AND t.company_id = ?`,
    params: [ticketId, companyId],
  })
  if (!row) throw notFound('工单不存在或无权限')
  return row
}

export async function getTicketDetail(db: DbClient, ticketId: number, companyId: number): Promise<TicketDetailResponse> {
  const row = await db.queryOne<TicketDetailRow>({
    text: `${TICKET_DETAIL_SELECT} WHERE t.id = ? AND t.company_id = ?`,
    params: [ticketId, companyId],
  })
  if (!row) throw notFound('工单不存在或无权限')
  const replies = await db.queryAll<{ id: number; authorId: number; authorName: string; content: string; createdAt: string }>({
    text: `SELECT r.id, r.author_id AS authorId, u.full_name AS authorName, r.content, r.created_at AS createdAt
      FROM ticket_replies r JOIN users u ON u.id = r.author_id
      WHERE r.ticket_id = ?
      ORDER BY r.created_at ASC, r.id ASC`,
    params: [ticketId],
  })
  const timeline = await listTicketTimeline(db, ticketId)
  const submitterHistory = await db.queryAll<HistoryTicketItem>({
    text: 'SELECT id, ticket_no AS ticketNo, subject, status, created_at AS createdAt FROM tickets WHERE submitter_id = ? ORDER BY created_at DESC, id DESC',
    params: [row.submitterId],
  })
  const ratingRow = await db.queryOne<{ rating: number; ratedAt: string; ratedById: number; ratedByName: string }>({
    text: `SELECT r.rating, r.rated_at AS ratedAt, r.rated_by AS ratedById, u.full_name AS ratedByName
      FROM ticket_ratings r JOIN users u ON u.id = r.rated_by
      WHERE r.ticket_id = ?`,
    params: [ticketId],
  })
  return {
    ticket: toTicketDetail(row),
    replies: replies.map((r) => ({ id: r.id, author: { id: r.authorId, fullName: r.authorName }, content: r.content, createdAt: r.createdAt })),
    timeline,
    submitterHistory,
    rating: ratingRow ? { rating: ratingRow.rating, ratedAt: ratingRow.ratedAt, ratedBy: { id: ratingRow.ratedById, fullName: ratingRow.ratedByName } } : null,
  }
}

// 创建工单：创建事务内生成 ticketNo、流转 created → pending_assignment，并按本公司"分类 → 业务组"规则尝试自动分配。
export async function createTicket(
  db: DbClient,
  actor: SessionUser,
  input: { subject: string; categoryId: number; priority: Priority; description: string },
): Promise<number> {
  await requireCategory(db, input.categoryId)
  const now = new Date().toISOString()
  return db.transaction(async (tx) => {
    const { nextId } = (await tx.queryOne<{ nextId: number }>({ text: 'SELECT COALESCE(MAX(id), 0) + 1 AS nextId FROM tickets' }))!
    const ticketNo = `TKT-${String(nextId).padStart(6, '0')}`
    await tx.run({
      text: `INSERT INTO tickets (id, ticket_no, subject, description, category_id, priority, status, company_id, submitter_id, assigned_group_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'created', ?, ?, NULL, ?, ?)`,
      params: [nextId, ticketNo, input.subject, input.description, input.categoryId, input.priority, actor.companyId, actor.id, now, now],
    })
    await recordOperationEvent(tx, {
      type: 'TICKET_CREATED',
      ticketId: nextId,
      actorUserId: actor.id,
      occurredAt: now,
      payload: { ticketNo, categoryId: input.categoryId, priority: input.priority },
    })
    await tx.run({ text: "UPDATE tickets SET status = 'pending_assignment', updated_at = ? WHERE id = ?", params: [now, nextId] })
    await recordOperationEvent(tx, { type: 'TICKET_ASSIGNMENT_ENTERED', ticketId: nextId, occurredAt: now, payload: { status: 'pending_assignment' } })
    const groupId = await resolveAutoAssignGroupId(tx, actor.companyId, input.categoryId)
    if (groupId !== null) {
      await tx.run({
        text: "UPDATE tickets SET status = 'pending_process', assigned_group_id = ?, updated_at = ? WHERE id = ?",
        params: [groupId, now, nextId],
      })
      await recordOperationEvent(tx, { type: 'TICKET_ASSIGNED', ticketId: nextId, occurredAt: now, payload: { groupId } })
    }
    return nextId
  })
}

export async function addReply(db: DbClient, actor: SessionUser, ticketId: number, content: string): Promise<ReplyItem> {
  const now = new Date().toISOString()
  return db.transaction(async (tx) => {
    const ticket = await loadTicketCore(tx, ticketId, actor.companyId)
    if (ticket.status === 'completed' || ticket.status === 'cancelled') throw stateConflict('工单已终态，不能回复')
    await tx.run({
      text: 'INSERT INTO ticket_replies (ticket_id, author_id, content, created_at) VALUES (?, ?, ?, ?)',
      params: [ticketId, actor.id, content, now],
    })
    const { replyId } = (await tx.queryOne<{ replyId: number }>({ text: 'SELECT last_insert_rowid() AS replyId' }))!
    if (ticket.firstReplyAt === null) {
      await tx.run({ text: 'UPDATE tickets SET first_reply_at = ?, updated_at = ? WHERE id = ?', params: [now, now, ticketId] })
    }
    await recordOperationEvent(tx, { type: 'TICKET_REPLIED', ticketId, actorUserId: actor.id, occurredAt: now })
    return { id: replyId, author: { id: actor.id, fullName: actor.fullName }, content, createdAt: now }
  })
}

export async function assignTicket(db: DbClient, actor: SessionUser, ticketId: number, groupId: number): Promise<void> {
  const now = new Date().toISOString()
  await db.transaction(async (tx) => {
    const ticket = await loadTicketCore(tx, ticketId, actor.companyId)
    if (ticket.status !== 'pending_assignment') throw stateConflict('工单状态非待分配，不能分配')
    await requireGroupForCompany(tx, groupId, actor.companyId)
    await tx.run({
      text: "UPDATE tickets SET status = 'pending_process', assigned_group_id = ?, updated_at = ? WHERE id = ? AND company_id = ?",
      params: [groupId, now, ticketId, actor.companyId],
    })
    await recordOperationEvent(tx, { type: 'TICKET_ASSIGNED', ticketId, actorUserId: actor.id, occurredAt: now, payload: { groupId } })
  })
}

export async function transferTicket(db: DbClient, actor: SessionUser, ticketId: number, toGroupId: number): Promise<void> {
  const now = new Date().toISOString()
  await db.transaction(async (tx) => {
    const ticket = await loadTicketCore(tx, ticketId, actor.companyId)
    if (ticket.status !== 'pending_process') throw stateConflict('工单状态非待处理，不能转派')
    await requireGroupForCompany(tx, toGroupId, actor.companyId)
    if (ticket.assignedGroupId === toGroupId) throw validationError('转派目标组与当前归属组相同')
    await tx.run({
      text: 'UPDATE tickets SET assigned_group_id = ?, updated_at = ? WHERE id = ? AND company_id = ?',
      params: [toGroupId, now, ticketId, actor.companyId],
    })
    await recordOperationEvent(tx, {
      type: 'TICKET_TRANSFERRED',
      ticketId,
      actorUserId: actor.id,
      occurredAt: now,
      payload: { fromGroupId: ticket.assignedGroupId, toGroupId },
    })
  })
}

// 完成处理：同事务写入发件箱（收件人为提交人邮箱）。
export async function completeTicket(db: DbClient, actor: SessionUser, ticketId: number): Promise<void> {
  const now = new Date().toISOString()
  await db.transaction(async (tx) => {
    const ticket = await loadTicketCore(tx, ticketId, actor.companyId)
    if (ticket.status !== 'pending_process') throw stateConflict('工单状态非待处理，不能完成')
    await tx.run({
      text: "UPDATE tickets SET status = 'completed', completed_by = ?, completed_at = ?, updated_at = ? WHERE id = ? AND company_id = ?",
      params: [actor.id, now, now, ticketId, actor.companyId],
    })
    await enqueueCompletionNotice(tx, {
      ticketId,
      ticketNo: ticket.ticketNo,
      subject: ticket.subject,
      toEmail: ticket.submitterEmail,
      completedByName: actor.fullName,
      completedAt: now,
    })
    await recordOperationEvent(tx, { type: 'TICKET_COMPLETED', ticketId, actorUserId: actor.id, occurredAt: now })
  })
}

export async function cancelTicket(db: DbClient, actor: SessionUser, ticketId: number): Promise<void> {
  const now = new Date().toISOString()
  await db.transaction(async (tx) => {
    const ticket = await loadTicketCore(tx, ticketId, actor.companyId)
    if (ticket.status === 'completed' || ticket.status === 'cancelled') throw stateConflict('工单已终态，不能取消')
    await tx.run({
      text: "UPDATE tickets SET status = 'cancelled', updated_at = ? WHERE id = ? AND company_id = ?",
      params: [now, ticketId, actor.companyId],
    })
    await recordOperationEvent(tx, { type: 'TICKET_CANCELLED', ticketId, actorUserId: actor.id, occurredAt: now })
  })
}

export async function rateTicket(db: DbClient, actor: SessionUser, ticketId: number, rating: number): Promise<RatingInfo> {
  const now = new Date().toISOString()
  return db.transaction(async (tx) => {
    const ticket = await loadTicketCore(tx, ticketId, actor.companyId)
    if (ticket.submitterId !== actor.id) throw forbidden('仅提交人可评价工单')
    if (ticket.status !== 'completed') throw stateConflict('工单未完成，不能评价')
    const existing = await tx.queryOne<{ ticketId: number }>({
      text: 'SELECT ticket_id AS ticketId FROM ticket_ratings WHERE ticket_id = ?',
      params: [ticketId],
    })
    if (existing) throw stateConflict('工单已评价')
    await tx.run({
      text: 'INSERT INTO ticket_ratings (ticket_id, rating, rated_by, rated_at) VALUES (?, ?, ?, ?)',
      params: [ticketId, rating, actor.id, now],
    })
    await recordOperationEvent(tx, { type: 'TICKET_RATED', ticketId, actorUserId: actor.id, occurredAt: now, payload: { rating } })
    return { rating, ratedAt: now, ratedBy: { id: actor.id, fullName: actor.fullName } }
  })
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

// 工作台 / 我的工单列表：所有条件可组合，跨公司工单永不出现在结果中（AC-02 / AC-11）。
export async function listTickets(
  db: DbClient,
  user: { id: number; companyId: number },
  query: ListTicketsQuery,
): Promise<{ items: TicketListItem[]; total: number; page: number; pageSize: number }> {
  // companyId 仅接受当前用户本公司，其他取值返回空结果。
  if (query.companyId !== undefined && query.companyId !== user.companyId) {
    return { items: [], total: 0, page: query.page, pageSize: query.pageSize }
  }
  const conditions: string[] = []
  const params: unknown[] = []
  if (query.scope === 'mine') {
    conditions.push('t.submitter_id = ?')
    params.push(user.id)
  } else {
    conditions.push('t.company_id = ?')
    params.push(user.companyId)
  }
  if (query.status !== undefined) {
    conditions.push('t.status = ?')
    params.push(query.status)
  }
  if (query.categoryId !== undefined) {
    conditions.push('t.category_id = ?')
    params.push(query.categoryId)
  }
  if (query.priority !== undefined) {
    conditions.push('t.priority = ?')
    params.push(query.priority)
  }
  if (query.q !== undefined) {
    conditions.push(`(t.subject LIKE ? ESCAPE '\\' OR t.ticket_no = ? COLLATE NOCASE)`)
    params.push(`%${escapeLike(query.q)}%`, query.q)
  }
  const where = conditions.join(' AND ')
  const from = `FROM tickets t
    JOIN categories c ON c.id = t.category_id
    JOIN companies co ON co.id = t.company_id
    JOIN users s ON s.id = t.submitter_id
    LEFT JOIN business_groups g ON g.id = t.assigned_group_id`
  const totalRow = await db.queryOne<{ total: number }>({
    text: `SELECT COUNT(*) AS total ${from} WHERE ${where}`,
    params,
  })
  const direction = query.order === 'asc' ? 'ASC' : 'DESC'
  const orderBy =
    query.sort === 'priority' ? `t.priority ${direction}, t.created_at DESC, t.id DESC` : `t.created_at ${direction}, t.id ${direction}`
  const items = await db.queryAll<TicketListItem>({
    text: `SELECT t.id, t.ticket_no AS ticketNo, t.subject, t.category_id AS categoryId, c.name AS categoryName,
        t.priority, t.status, co.name AS companyName, s.full_name AS submitterName,
        t.assigned_group_id AS assignedGroupId, g.name AS assignedGroupName,
        t.created_at AS createdAt, t.first_reply_at AS firstReplyAt
      ${from} WHERE ${where}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?`,
    params: [...params, query.pageSize, (query.page - 1) * query.pageSize],
  })
  return { items, total: totalRow?.total ?? 0, page: query.page, pageSize: query.pageSize }
}
