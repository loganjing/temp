import type { DbClient } from '@commonapp/dbkit'
import { recordTicketEvent } from './audit'
import { duplicate, forbidden, invalidInput, invalidState, notFound, validationFailed } from './errors'
import { canViewTicket, isCompanyAdminOf, isGroupMemberOf, ticketVisibilityClause, findGroup, type Identity } from './org'
import {
  type Priority,
  type Reply,
  type ReplySide,
  type TicketDetail,
  type TicketSort,
  type TicketStatus,
  type TicketSummary,
} from './types'

// 工单领域模块（契约第 3 节）：状态机、公司隔离可见范围与全部工单行为。
// 服务端是唯一判定点：角色、可见范围与状态前置都在本模块强制。

const SUMMARY_SELECT = `SELECT t.id, t.company_id, t.subject, t.description, t.category_id, c.name AS category_name,
       comp.name AS company_name, t.priority, t.status, t.submitter_user_id,
       u.name AS submitter_name, u.email AS submitter_email, uo.department AS submitter_department,
       t.assigned_group_id, bg.name AS assigned_group_name,
       t.handler_user_id, h.name AS handler_name, t.handled_at, t.first_reply_at, t.created_at,
       tr.score AS rating_score, tr.created_at AS rating_created_at
FROM tickets t
JOIN categories c ON c.id = t.category_id
JOIN companies comp ON comp.id = t.company_id
JOIN users u ON u.id = t.submitter_user_id
LEFT JOIN user_org uo ON uo.user_id = t.submitter_user_id
LEFT JOIN business_groups bg ON bg.id = t.assigned_group_id
LEFT JOIN users h ON h.id = t.handler_user_id
LEFT JOIN ticket_ratings tr ON tr.ticket_id = t.id`

type TicketRow = {
  id: number
  company_id: number
  subject: string
  description: string
  category_id: number
  category_name: string
  company_name: string
  priority: string
  status: string
  submitter_user_id: string
  submitter_name: string
  submitter_email: string
  submitter_department: string | null
  assigned_group_id: number | null
  assigned_group_name: string | null
  handler_user_id: string | null
  handler_name: string | null
  handled_at: string | null
  first_reply_at: string | null
  created_at: string
  rating_score: number | null
  rating_created_at: string | null
}

function toSummary(row: TicketRow): TicketSummary {
  return {
    id: row.id,
    subject: row.subject,
    status: row.status as TicketStatus,
    priority: row.priority as Priority,
    category: { id: row.category_id, name: row.category_name },
    company: { id: row.company_id, name: row.company_name },
    submitter: {
      id: row.submitter_user_id,
      name: row.submitter_name,
      email: row.submitter_email,
      department: row.submitter_department ?? '',
    },
    createdAt: row.created_at,
    assignedGroup: row.assigned_group_id !== null ? { id: row.assigned_group_id, name: row.assigned_group_name ?? '' } : null,
    handler: row.handler_user_id !== null ? { id: row.handler_user_id, name: row.handler_name ?? '' } : null,
    handledAt: row.handled_at,
    ratingScore: row.rating_score,
  }
}

export async function getTicketRow(db: DbClient, ticketId: number): Promise<TicketRow | null> {
  return db.queryOne<TicketRow>({ text: `${SUMMARY_SELECT} WHERE t.id = ?`, params: [ticketId] })
}

function assertVisible(identity: Identity, row: TicketRow): void {
  if (!canViewTicket(identity, row)) throw notFound()
}

export async function listReplies(db: DbClient, ticketId: number): Promise<Reply[]> {
  const rows = await db.queryAll<{ id: number; author_user_id: string; author_name: string; author_side: string; content: string; created_at: string }>({
    text: `SELECT r.id, r.author_user_id, u.name AS author_name, r.author_side, r.content, r.created_at
           FROM ticket_replies r JOIN users u ON u.id = r.author_user_id
           WHERE r.ticket_id = ? ORDER BY r.created_at ASC, r.id ASC`,
    params: [ticketId],
  })
  return rows.map((row) => ({
    id: row.id,
    author: { id: row.author_user_id, name: row.author_name },
    side: row.author_side as ReplySide,
    content: row.content,
    createdAt: row.created_at,
  }))
}

export async function getTicketDetail(db: DbClient, ticketId: number): Promise<TicketDetail | null> {
  const row = await getTicketRow(db, ticketId)
  if (!row) return null
  const replies = await listReplies(db, ticketId)
  return {
    ...toSummary(row),
    description: row.description,
    replies,
    rating: row.rating_score !== null ? { score: row.rating_score, createdAt: row.rating_created_at ?? row.handled_at ?? row.created_at } : null,
  }
}

/** 创建工单（3.1）：单事务内创建并按分类规则自动分配，同时记录审计事件。 */
export async function createTicket(
  db: DbClient,
  identity: Identity,
  input: { subject: string; description: string; categoryId: number; priority: Priority },
): Promise<TicketDetail> {
  if (!identity.org) throw validationFailed('An organization profile is required to create a ticket')
  const org = identity.org
  const category = await db.queryOne<{ id: number; name: string }>({
    text: 'SELECT id, name FROM categories WHERE id = ?',
    params: [input.categoryId],
  })
  if (!category) throw invalidInput('Category does not exist')
  const rule = await db.queryOne<{ group_id: number }>({
    text: 'SELECT group_id FROM assignment_rules WHERE company_id = ? AND category_id = ?',
    params: [org.companyId, input.categoryId],
  })
  const now = new Date().toISOString()
  const status: TicketStatus = rule ? 'pending' : 'awaiting_assignment'
  const ticketId = await db.transaction(async (tx) => {
    await tx.run({
      text: `INSERT INTO tickets (company_id, subject, description, category_id, priority, status, submitter_user_id, assigned_group_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [org.companyId, input.subject, input.description, input.categoryId, input.priority, status, identity.userId, rule?.group_id ?? null, now],
    })
    const row = await tx.queryOne<{ id: number }>({ text: 'SELECT last_insert_rowid() AS id' })
    const id = Number(row?.id ?? 0)
    await recordTicketEvent(tx, {
      type: 'ticket_created',
      actorUserId: identity.userId,
      ticketId: id,
      detail: { subject: input.subject, priority: input.priority, categoryId: input.categoryId },
      occurredAt: now,
    })
    if (rule) {
      await recordTicketEvent(tx, {
        type: 'ticket_auto_assigned',
        actorUserId: identity.userId,
        ticketId: id,
        detail: { groupId: rule.group_id },
        occurredAt: now,
      })
    }
    return id
  })
  const detail = await getTicketDetail(db, ticketId)
  if (!detail) throw new Error('Created ticket could not be read back')
  return detail
}

const PRIORITY_ORDER = `CASE t.priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 WHEN 'P4' THEN 4 END`
const ORDER_BY: Record<TicketSort, string> = {
  created_at_desc: 't.created_at DESC, t.id DESC',
  created_at_asc: 't.created_at ASC, t.id ASC',
  priority_asc: `${PRIORITY_ORDER} ASC, t.created_at DESC, t.id DESC`,
  priority_desc: `${PRIORITY_ORDER} DESC, t.created_at DESC, t.id DESC`,
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

/** 工单列表（3.2）：服务端按可见范围过滤，支持状态、公司、搜索与排序。 */
export async function listTickets(
  db: DbClient,
  identity: Identity,
  query: { status?: TicketStatus; companyId?: number; q?: string; sort?: TicketSort } = {},
): Promise<TicketSummary[]> {
  const clauses: string[] = []
  const params: unknown[] = []
  const visibility = ticketVisibilityClause(identity)
  clauses.push(visibility.clause)
  params.push(...visibility.params)
  if (query.status) {
    clauses.push('t.status = ?')
    params.push(query.status)
  }
  if (query.companyId !== undefined) {
    clauses.push('t.company_id = ?')
    params.push(query.companyId)
  }
  if (query.q) {
    const searchClauses: string[] = []
    if (/^\d+$/.test(query.q)) {
      searchClauses.push('t.id = ?')
      params.push(Number(query.q))
    }
    const like = `%${escapeLike(query.q)}%`
    searchClauses.push(`t.subject LIKE ? ESCAPE '\\'`)
    params.push(like)
    searchClauses.push(`u.name LIKE ? ESCAPE '\\'`)
    params.push(like)
    clauses.push(`(${searchClauses.join(' OR ')})`)
  }
  const sort: TicketSort = query.sort ?? 'created_at_desc'
  const rows = await db.queryAll<TicketRow>({
    text: `${SUMMARY_SELECT} WHERE ${clauses.join(' AND ')} ORDER BY ${ORDER_BY[sort]}`,
    params,
  })
  return rows.map(toSummary)
}

/** 提交人完整信息与历史工单（3.4）：该提交人全部工单按创建时间降序。 */
export async function getSubmitterHistory(
  db: DbClient,
  submitterId: string,
): Promise<{
  submitter: { id: string; name: string; email: string; company: { id: number; name: string } | null; department: string }
  tickets: { id: number; subject: string; status: TicketStatus; priority: Priority; createdAt: string }[]
}> {
  const user = await db.queryOne<{ id: string; name: string; email: string; company_id: number | null; company_name: string | null; department: string | null }>({
    text: `SELECT u.id, u.name, u.email, uo.company_id, c.name AS company_name, uo.department
           FROM users u LEFT JOIN user_org uo ON uo.user_id = u.id LEFT JOIN companies c ON c.id = uo.company_id
           WHERE u.id = ?`,
    params: [submitterId],
  })
  if (!user) throw notFound('Submitter not found')
  const tickets = await db.queryAll<{ id: number; subject: string; status: string; priority: string; created_at: string }>({
    text: `SELECT id, subject, status, priority, created_at FROM tickets
           WHERE submitter_user_id = ? ORDER BY created_at DESC, id DESC`,
    params: [submitterId],
  })
  return {
    submitter: {
      id: user.id,
      name: user.name,
      email: user.email,
      company: user.company_id !== null && user.company_id !== undefined ? { id: user.company_id, name: user.company_name ?? '' } : null,
      department: user.department ?? '',
    },
    tickets: tickets.map((ticket) => ({
      id: ticket.id,
      subject: ticket.subject,
      status: ticket.status as TicketStatus,
      priority: ticket.priority as Priority,
      createdAt: ticket.created_at,
    })),
  }
}

/** 回复（3.5）：side 由服务端判定；首次处理端回复维护 first_reply_at。 */
export async function addReply(db: DbClient, identity: Identity, ticketId: number, content: string): Promise<Reply> {
  const row = await getTicketRow(db, ticketId)
  if (!row) throw notFound()
  assertVisible(identity, row)
  const isSubmitter = row.submitter_user_id === identity.userId
  const isMember = isGroupMemberOf(identity, row.assigned_group_id)
  if (!isSubmitter && !isMember) throw forbidden('Only the submitter or the assigned group members can reply')
  const side: ReplySide = isSubmitter ? 'submitter' : 'handler'
  const now = new Date().toISOString()
  return db.transaction(async (tx) => {
    await tx.run({
      text: 'INSERT INTO ticket_replies (ticket_id, author_user_id, author_side, content, created_at) VALUES (?, ?, ?, ?, ?)',
      params: [ticketId, identity.userId, side, content, now],
    })
    const replyRow = await tx.queryOne<{ id: number }>({ text: 'SELECT last_insert_rowid() AS id' })
    const replyId = Number(replyRow?.id ?? 0)
    if (side === 'handler' && !row.first_reply_at) {
      await tx.run({ text: 'UPDATE tickets SET first_reply_at = ? WHERE id = ? AND first_reply_at IS NULL', params: [now, ticketId] })
    }
    await recordTicketEvent(tx, { type: 'ticket_replied', actorUserId: identity.userId, ticketId, detail: { side }, occurredAt: now })
    return { id: replyId, author: { id: identity.userId, name: identity.name }, side, content, createdAt: now }
  })
}

/** 手工分配（3.6）：仅公司配置管理员，前置 awaiting_assignment。 */
export async function assignTicket(db: DbClient, identity: Identity, ticketId: number, groupId: number): Promise<TicketSummary> {
  const row = await getTicketRow(db, ticketId)
  if (!row) throw notFound()
  assertVisible(identity, row)
  if (!isCompanyAdminOf(identity, row.company_id)) throw forbidden('Only a company admin can assign tickets')
  if (row.status !== 'awaiting_assignment') throw invalidState('Only awaiting_assignment tickets can be assigned')
  const group = await findGroup(db, groupId)
  if (!group || group.company_id !== row.company_id) throw validationFailed('Group does not belong to the ticket company')
  const now = new Date().toISOString()
  await db.transaction(async (tx) => {
    await tx.run({ text: 'UPDATE tickets SET assigned_group_id = ?, status = ? WHERE id = ?', params: [groupId, 'pending', ticketId] })
    await recordTicketEvent(tx, { type: 'ticket_manually_assigned', actorUserId: identity.userId, ticketId, detail: { groupId }, occurredAt: now })
  })
  const updated = await getTicketRow(db, ticketId)
  if (!updated) throw notFound()
  return toSummary(updated)
}

/** 转派（3.7）：成员或公司管理员，前置 pending，目标组须为同公司其他业务组。 */
export async function transferTicket(db: DbClient, identity: Identity, ticketId: number, targetGroupId: number): Promise<TicketSummary> {
  const row = await getTicketRow(db, ticketId)
  if (!row) throw notFound()
  assertVisible(identity, row)
  if (!isGroupMemberOf(identity, row.assigned_group_id) && !isCompanyAdminOf(identity, row.company_id)) {
    throw forbidden('Only the assigned group members or a company admin can transfer tickets')
  }
  if (row.status !== 'pending') throw invalidState('Only pending tickets can be transferred')
  const targetGroup = await findGroup(db, targetGroupId)
  if (!targetGroup || targetGroup.company_id !== row.company_id) throw validationFailed('Target group does not belong to the ticket company')
  if (targetGroup.id === row.assigned_group_id) throw invalidState('Target group is the same as the current group')
  const now = new Date().toISOString()
  await db.transaction(async (tx) => {
    await tx.run({ text: 'UPDATE tickets SET assigned_group_id = ? WHERE id = ?', params: [targetGroupId, ticketId] })
    await recordTicketEvent(tx, {
      type: 'ticket_transferred',
      actorUserId: identity.userId,
      ticketId,
      detail: { fromGroupId: row.assigned_group_id, toGroupId: targetGroupId },
      occurredAt: now,
    })
  })
  const updated = await getTicketRow(db, ticketId)
  if (!updated) throw notFound()
  return toSummary(updated)
}

/** 完成处理（3.8）：记录处理人与处理时间；邮件由调用方在事务提交后发送。 */
export async function completeTicket(db: DbClient, identity: Identity, ticketId: number): Promise<{ ticket: TicketSummary; handledAt: string }> {
  const row = await getTicketRow(db, ticketId)
  if (!row) throw notFound()
  assertVisible(identity, row)
  if (!isGroupMemberOf(identity, row.assigned_group_id) && !isCompanyAdminOf(identity, row.company_id)) {
    throw forbidden('Only the assigned group members or a company admin can complete tickets')
  }
  if (row.status !== 'pending') throw invalidState('Only pending tickets can be completed')
  const now = new Date().toISOString()
  await db.transaction(async (tx) => {
    await tx.run({
      text: 'UPDATE tickets SET status = ?, handler_user_id = ?, handled_at = ? WHERE id = ?',
      params: ['completed', identity.userId, now, ticketId],
    })
    await recordTicketEvent(tx, { type: 'ticket_completed', actorUserId: identity.userId, ticketId, detail: { handledAt: now }, occurredAt: now })
  })
  const updated = await getTicketRow(db, ticketId)
  if (!updated) throw notFound()
  return { ticket: toSummary(updated), handledAt: now }
}

/** 取消（3.9）：提交人或公司管理员；完成前（待分配/待处理）可取消。 */
export async function cancelTicket(db: DbClient, identity: Identity, ticketId: number): Promise<TicketSummary> {
  const row = await getTicketRow(db, ticketId)
  if (!row) throw notFound()
  assertVisible(identity, row)
  if (row.submitter_user_id !== identity.userId && !isCompanyAdminOf(identity, row.company_id)) {
    throw forbidden('Only the submitter or a company admin can cancel tickets')
  }
  if (row.status !== 'awaiting_assignment' && row.status !== 'pending') {
    throw invalidState('Only awaiting_assignment or pending tickets can be cancelled')
  }
  const now = new Date().toISOString()
  await db.transaction(async (tx) => {
    await tx.run({ text: 'UPDATE tickets SET status = ? WHERE id = ?', params: ['cancelled', ticketId] })
    await recordTicketEvent(tx, { type: 'ticket_cancelled', actorUserId: identity.userId, ticketId, detail: null, occurredAt: now })
  })
  const updated = await getTicketRow(db, ticketId)
  if (!updated) throw notFound()
  return toSummary(updated)
}

/** 满意度评价（3.10）：仅提交人、已完成、每工单一次。 */
export async function rateTicket(db: DbClient, identity: Identity, ticketId: number, score: number): Promise<{ score: number; createdAt: string }> {
  const row = await getTicketRow(db, ticketId)
  if (!row) throw notFound()
  assertVisible(identity, row)
  if (row.submitter_user_id !== identity.userId) throw forbidden('Only the submitter can rate the ticket')
  if (row.status !== 'completed') throw invalidState('Only completed tickets can be rated')
  if (row.rating_score !== null) throw duplicate('The ticket has already been rated')
  const now = new Date().toISOString()
  await db.transaction(async (tx) => {
    await tx.run({
      text: 'INSERT INTO ticket_ratings (ticket_id, submitter_user_id, score, created_at) VALUES (?, ?, ?, ?)',
      params: [ticketId, identity.userId, score, now],
    })
    await recordTicketEvent(tx, { type: 'ticket_rated', actorUserId: identity.userId, ticketId, detail: { score }, occurredAt: now })
  })
  return { score, createdAt: now }
}
