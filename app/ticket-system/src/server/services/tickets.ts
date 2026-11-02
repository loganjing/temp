import { randomUUID } from 'node:crypto'
import type { DbClient } from '@commonapp/dbkit'
import type { EmailClient } from '@commonapp/emailkit'
import {
  TICKET_PRIORITIES,
  TICKET_SORTS,
  TICKET_STATUSES,
  isTerminalStatus,
  type TicketCapabilities,
  type TicketEventAction,
  type TicketPriority,
  type TicketSort,
  type TicketStatus,
} from '../../shared/ticket-domain'
import {
  canViewTicket,
  isGroupMember,
  type Profile,
  type TicketAccessShape,
  visibleTicketScope,
} from './access'
import { conflict, forbidden, notFound, validationError } from './errors'
import { findNotification, listNotifications, sendCompletionNotification } from './notifications'

type TicketRow = TicketAccessShape & {
  department_id: string
  title: string
  description: string
  category_id: string
  category_name: string
  priority: TicketPriority
  submitter_name: string
  submitter_email: string
  assignee_id: string | null
  assignee_name: string | null
  created_at: string
  updated_at: string
  first_response_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  satisfaction_score: number | null
  satisfaction_comment: string | null
  satisfaction_at: string | null
  company_name: string
  department_name: string
  group_name: string | null
}

const TICKET_SELECT = `SELECT t.id, t.company_id, t.department_id, t.title, t.description, t.category_id,
       t.priority, t.status, t.submitter_id, t.submitter_name, t.submitter_email,
       t.group_id, t.assignee_id, t.assignee_name, t.created_at, t.updated_at,
       t.first_response_at, t.completed_at, t.cancelled_at, t.satisfaction_score,
       t.satisfaction_comment, t.satisfaction_at,
       c.name AS company_name, d.name AS department_name, cat.name AS category_name,
       g.name AS group_name
  FROM tickets t
  JOIN companies c ON c.id = t.company_id
  JOIN departments d ON d.id = t.department_id
  JOIN categories cat ON cat.id = t.category_id
  LEFT JOIN business_groups g ON g.id = t.group_id`

const TICKET_ID_PATTERN = /^TK-\d{6,}$/

function normalizeTicketId(raw: string): string {
  const id = raw.trim().toUpperCase()
  if (!TICKET_ID_PATTERN.test(id)) throw notFound('工单不存在')
  return id
}

export async function findTicketRow(db: DbClient, ticketId: string): Promise<TicketRow | null> {
  return db.queryOne<TicketRow>({ text: `${TICKET_SELECT} WHERE t.id = ?`, params: [ticketId] })
}

async function loadVisibleTicket(db: DbClient, profile: Profile, rawTicketId: string): Promise<TicketRow> {
  const row = await findTicketRow(db, normalizeTicketId(rawTicketId))
  if (!row) throw notFound('工单不存在')
  if (!canViewTicket(profile, row)) throw forbidden('无权访问该工单')
  return row
}

async function reloadTicket(db: DbClient, ticketId: string): Promise<TicketRow> {
  const row = await findTicketRow(db, ticketId)
  if (!row) throw notFound('工单不存在')
  return row
}

function capabilities(profile: Profile, row: TicketRow): TicketCapabilities {
  const sameCompany = row.company_id === profile.companyId
  const isOwn = row.submitter_id === profile.userId
  const handlerHere = profile.role === 'handler' && sameCompany
  const adminHere = profile.role === 'admin' && sameCompany
  const inGroup = handlerHere && isGroupMember(profile, row.group_id)
  const handlerVisible = handlerHere && (row.status === 'unassigned' || inGroup)
  const active = row.status === 'unassigned' || row.status === 'in_progress'

  return {
    canReply: profile.role !== 'ops' && !isTerminalStatus(row.status) && (isOwn || adminHere || handlerVisible),
    canAssign: row.status === 'unassigned' && (adminHere || handlerHere),
    canTransfer: row.status === 'in_progress' && (adminHere || inGroup),
    canComplete: row.status === 'in_progress' && (adminHere || inGroup),
    canCancel: active && (isOwn || adminHere || handlerVisible),
    canRate: profile.role === 'submitter' && isOwn && row.status === 'completed' && row.satisfaction_score === null,
    canChangePriority: row.status === 'in_progress' && (adminHere || inGroup),
  }
}

function presentDetail(profile: Profile, row: TicketRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    categoryId: row.category_id,
    categoryName: row.category_name,
    priority: row.priority,
    status: row.status,
    companyId: row.company_id,
    companyName: row.company_name,
    departmentId: row.department_id,
    departmentName: row.department_name,
    submitterId: row.submitter_id,
    submitterName: row.submitter_name,
    submitterEmail: row.submitter_email,
    groupId: row.group_id,
    groupName: row.group_name,
    assigneeId: row.assignee_id,
    assigneeName: row.assignee_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    firstResponseAt: row.first_response_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    satisfactionScore: row.satisfaction_score,
    satisfactionComment: row.satisfaction_comment,
    satisfactionAt: row.satisfaction_at,
    ...capabilities(profile, row),
  }
}

function presentListItem(row: TicketRow) {
  return {
    id: row.id,
    title: row.title,
    categoryId: row.category_id,
    categoryName: row.category_name,
    priority: row.priority,
    status: row.status,
    companyId: row.company_id,
    companyName: row.company_name,
    departmentId: row.department_id,
    departmentName: row.department_name,
    submitterId: row.submitter_id,
    submitterName: row.submitter_name,
    groupId: row.group_id,
    groupName: row.group_name,
    assigneeId: row.assignee_id,
    assigneeName: row.assignee_name,
    createdAt: row.created_at,
    satisfactionScore: row.satisfaction_score,
  }
}

async function insertEvent(
  tx: DbClient,
  ticketId: string,
  action: TicketEventAction,
  actor: { id: string | null; name: string },
  detail?: Record<string, unknown>,
  result: 'success' | 'failed' = 'success',
  at = new Date().toISOString(),
) {
  await tx.run({
    text: `INSERT INTO ticket_events (id, ticket_id, action, actor_id, actor_name, result, detail, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [randomUUID(), ticketId, action, actor.id, actor.name, result, detail ? JSON.stringify(detail) : null, at],
  })
}

function readText(body: Record<string, unknown>, field: string, min: number, max: number, fields: Record<string, string>): string {
  const value = body[field]
  if (typeof value !== 'string') {
    fields[field] = `${field} 为必填项`
    return ''
  }
  const trimmed = value.trim()
  if (trimmed.length < min || trimmed.length > max) {
    fields[field] = `${field} 长度需为 ${min}-${max} 个字符`
    return ''
  }
  return trimmed
}

function readPriority(value: unknown, fields: Record<string, string>): TicketPriority {
  if (typeof value === 'string' && (TICKET_PRIORITIES as readonly string[]).includes(value)) {
    return value as TicketPriority
  }
  fields.priority = 'priority 必须是 P0-P4'
  return 'P3'
}

function pageParams(query: Record<string, string | undefined>) {
  const page = Math.max(Number.parseInt(query.page ?? '1', 10) || 1, 1)
  const pageSize = Math.min(Math.max(Number.parseInt(query.pageSize ?? '20', 10) || 20, 1), 100)
  return { page, pageSize, offset: (page - 1) * pageSize }
}

function sortClause(sort: string | undefined): string {
  const value: TicketSort = sort && (TICKET_SORTS as readonly string[]).includes(sort) ? (sort as TicketSort) : 'createdAt_desc'
  if (sort && !(TICKET_SORTS as readonly string[]).includes(sort)) throw validationError('不支持的排序方式', { sort: 'sort 取值无效' })
  if (value === 'createdAt_asc') return 't.created_at ASC, t.rowid ASC'
  if (value === 'priority_asc') return 't.priority ASC, t.created_at DESC, t.rowid DESC'
  if (value === 'priority_desc') return 't.priority DESC, t.created_at DESC, t.rowid DESC'
  return 't.created_at DESC, t.rowid DESC'
}

export async function listTickets(
  db: DbClient,
  profile: Profile,
  query: Record<string, string | undefined>,
) {
  const scope = visibleTicketScope(profile, 't')
  const filters = [scope.sql]
  const params: unknown[] = [...scope.params]
  const { pageSize, offset } = pageParams(query)

  if (query.companyId) {
    if (profile.role !== 'ops' && query.companyId !== profile.companyId) throw forbidden('只能查看本公司工单')
    filters.push('t.company_id = ?')
    params.push(query.companyId)
  }
  if (query.departmentId) {
    filters.push('t.department_id = ?')
    params.push(query.departmentId)
  }
  if (query.status) {
    if (!(TICKET_STATUSES as readonly string[]).includes(query.status))
      throw validationError('状态取值无效', { status: 'status 取值无效' })
    filters.push('t.status = ?')
    params.push(query.status)
  }
  if (query.priority) {
    if (!(TICKET_PRIORITIES as readonly string[]).includes(query.priority))
      throw validationError('优先级取值无效', { priority: 'priority 取值无效' })
    filters.push('t.priority = ?')
    params.push(query.priority)
  }
  if (query.categoryId) {
    filters.push('t.category_id = ?')
    params.push(query.categoryId)
  }
  if (query.groupId) {
    filters.push('t.group_id = ?')
    params.push(query.groupId)
  }
  if (query.q?.trim()) {
    const like = `%${query.q.trim().toLowerCase()}%`
    filters.push('(LOWER(t.id) LIKE ? OR LOWER(t.title) LIKE ?)')
    params.push(like, like)
  }

  const where = filters.join(' AND ')
  const total = await db.queryOne<{ total: number }>({
    text: `SELECT COUNT(*) AS total FROM tickets t WHERE ${where}`,
    params,
  })
  const rows = await db.queryAll<TicketRow>({
    text: `${TICKET_SELECT} WHERE ${where} ORDER BY ${sortClause(query.sort)} LIMIT ? OFFSET ?`,
    params: [...params, pageSize, offset],
  })

  return { items: rows.map(presentListItem), total: Number(total?.total ?? 0) }
}

export async function getTicketDetail(db: DbClient, profile: Profile, rawTicketId: string) {
  return presentDetail(profile, await loadVisibleTicket(db, profile, rawTicketId))
}

export async function createTicket(
  db: DbClient,
  profile: Profile,
  body: Record<string, unknown>,
) {
  if (profile.role !== 'submitter') throw forbidden('仅提交人可以创建工单')

  const fields: Record<string, string> = {}
  const title = readText(body, 'title', 1, 200, fields)
  const description = readText(body, 'description', 1, 5000, fields)
  const categoryId = typeof body.categoryId === 'string' && body.categoryId.trim() ? body.categoryId.trim() : ''
  if (!categoryId) fields.categoryId = 'categoryId 为必填项'
  const priority = readPriority(body.priority, fields)
  if (Object.keys(fields).length > 0) throw validationError('工单字段校验失败', fields)

  const category = await db.queryOne<{ id: string }>({
    text: 'SELECT id FROM categories WHERE id = ? AND active = 1',
    params: [categoryId],
  })
  if (!category) throw validationError('问题分类不存在或已停用', { categoryId: 'categoryId 无效' })

  const ticketId = await db.transaction(async (tx) => {
    const now = new Date().toISOString()
    await tx.run({ text: "INSERT INTO ticket_sequences (name, next_seq) VALUES ('ticket', 0) ON CONFLICT(name) DO NOTHING" })
    await tx.run({ text: "UPDATE ticket_sequences SET next_seq = next_seq + 1 WHERE name = 'ticket'" })
    const sequence = await tx.queryOne<{ next_seq: number }>({
      text: "SELECT next_seq FROM ticket_sequences WHERE name = 'ticket'",
    })
    if (!sequence) throw new Error('ticket sequence is unavailable')
    const id = `TK-${String(sequence.next_seq).padStart(6, '0')}`

    const rule = await tx.queryOne<{ group_id: string }>({
      text: 'SELECT group_id FROM assignment_rules WHERE company_id = ? AND category_id = ?',
      params: [profile.companyId, categoryId],
    })
    const status: TicketStatus = rule ? 'in_progress' : 'unassigned'

    await tx.run({
      text: `INSERT INTO tickets
               (id, company_id, department_id, title, description, category_id, priority, status,
                submitter_id, submitter_name, submitter_email, group_id, assignee_id, assignee_name,
                created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
      params: [
        id,
        profile.companyId,
        profile.departmentId,
        title,
        description,
        categoryId,
        priority,
        status,
        profile.userId,
        profile.name,
        profile.email,
        rule?.group_id ?? null,
        now,
        now,
      ],
    })
    await insertEvent(
      tx,
      id,
      'created',
      { id: profile.userId, name: profile.name },
      { fromStatus: null, toStatus: status, groupId: rule?.group_id ?? null },
      'success',
      now,
    )
    if (rule) {
      await insertEvent(
        tx,
        id,
        'auto_assigned',
        { id: 'system', name: '系统' },
        { fromStatus: 'unassigned', toStatus: 'in_progress', groupId: rule.group_id },
        'success',
        now,
      )
    }
    return id
  })

  return getTicketDetail(db, profile, ticketId)
}

export async function addReply(db: DbClient, profile: Profile, rawTicketId: string, body: Record<string, unknown>) {
  const ticket = await loadVisibleTicket(db, profile, rawTicketId)
  if (profile.role === 'ops') throw forbidden('平台运营为只读角色')
  if (isTerminalStatus(ticket.status)) throw conflict('ticket_closed', '工单已结束，无法回复')

  const fields: Record<string, string> = {}
  const text = readText(body, 'body', 1, 5000, fields)
  if (Object.keys(fields).length > 0) throw validationError('回复内容校验失败', fields)

  const replyId = randomUUID()
  let createdAt = ''
  await db.transaction(async (tx) => {
    const now = new Date().toISOString()
    createdAt = now
    const isFirstResponse = profile.role !== 'submitter' && ticket.first_response_at === null
    const claimAssignee = profile.role === 'handler' && ticket.assignee_id === null
    const result = await tx.run({
      text: `UPDATE tickets
                SET updated_at = ?,
                    first_response_at = CASE WHEN first_response_at IS NULL AND ? = 1 THEN ? ELSE first_response_at END,
                    assignee_id = CASE WHEN assignee_id IS NULL AND ? = 1 THEN ? ELSE assignee_id END,
                    assignee_name = CASE WHEN assignee_id IS NULL AND ? = 1 THEN ? ELSE assignee_name END
              WHERE id = ? AND status IN ('unassigned', 'in_progress')`,
      params: [now, isFirstResponse ? 1 : 0, now, claimAssignee ? 1 : 0, profile.userId, claimAssignee ? 1 : 0, profile.name, ticket.id],
    })
    if (result.changes === 0) throw conflict('ticket_closed', '工单已结束，无法回复')
    await tx.run({
      text: `INSERT INTO ticket_replies (id, ticket_id, author_id, author_name, author_role, body, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
      params: [replyId, ticket.id, profile.userId, profile.name, profile.role, text, now],
    })
    await insertEvent(tx, ticket.id, 'replied', { id: profile.userId, name: profile.name }, { replyId }, 'success', now)
  })

  return { id: replyId, ticketId: ticket.id, authorId: profile.userId, authorName: profile.name, authorRole: profile.role, body: text, createdAt }
}

export async function listReplies(db: DbClient, profile: Profile, rawTicketId: string) {
  const ticket = await loadVisibleTicket(db, profile, rawTicketId)
  const rows = await db.queryAll<{
    id: string
    ticket_id: string
    author_id: string
    author_name: string
    author_role: string
    body: string
    created_at: string
  }>({
    text: 'SELECT * FROM ticket_replies WHERE ticket_id = ? ORDER BY created_at ASC, rowid ASC',
    params: [ticket.id],
  })
  return rows.map((row) => ({
    id: row.id,
    ticketId: row.ticket_id,
    authorId: row.author_id,
    authorName: row.author_name,
    authorRole: row.author_role,
    body: row.body,
    createdAt: row.created_at,
  }))
}

async function loadGroup(db: DbClient, groupId: string, companyId: string) {
  const group = await db.queryOne<{ id: string; company_id: string; name: string }>({
    text: 'SELECT id, company_id, name FROM business_groups WHERE id = ?',
    params: [groupId],
  })
  if (!group) throw notFound('业务组不存在')
  if (group.company_id !== companyId) throw forbidden('业务组不属于该公司')
  return group
}

export async function assignTicket(db: DbClient, profile: Profile, rawTicketId: string, body: Record<string, unknown>) {
  if (profile.role !== 'admin' && profile.role !== 'handler') throw forbidden('仅处理人或管理员可以分配工单')
  const ticket = await loadVisibleTicket(db, profile, rawTicketId)
  if (ticket.status !== 'unassigned') throw conflict('invalid_transition', '仅待分配工单可以指定业务组')
  const groupId = typeof body.groupId === 'string' && body.groupId.trim() ? body.groupId.trim() : ''
  if (!groupId) throw validationError('groupId 为必填项', { groupId: 'groupId 为必填项' })
  const group = await loadGroup(db, groupId, ticket.company_id)

  await db.transaction(async (tx) => {
    const now = new Date().toISOString()
    const result = await tx.run({
      text: "UPDATE tickets SET status = 'in_progress', group_id = ?, updated_at = ? WHERE id = ? AND status = 'unassigned'",
      params: [group.id, now, ticket.id],
    })
    if (result.changes === 0) throw conflict('invalid_transition', '工单状态已变化，请刷新后重试')
    await insertEvent(
      tx,
      ticket.id,
      'assigned',
      { id: profile.userId, name: profile.name },
      { fromStatus: 'unassigned', toStatus: 'in_progress', groupId: group.id, groupName: group.name },
      'success',
      now,
    )
  })
  // The actor may not belong to the target group; return the updated record
  // without re-applying read visibility to the action that just succeeded.
  return presentDetail(profile, await reloadTicket(db, ticket.id))
}

export async function transferTicket(db: DbClient, profile: Profile, rawTicketId: string, body: Record<string, unknown>) {
  if (profile.role !== 'admin' && profile.role !== 'handler') throw forbidden('仅处理人或管理员可以转派工单')
  const ticket = await loadVisibleTicket(db, profile, rawTicketId)
  if (ticket.status !== 'in_progress' || !ticket.group_id) throw conflict('invalid_transition', '仅待处理工单可以转派')
  if (profile.role === 'handler' && !isGroupMember(profile, ticket.group_id))
    throw forbidden('仅当前承接业务组成员可以转派')

  const toGroupId = typeof body.toGroupId === 'string' && body.toGroupId.trim() ? body.toGroupId.trim() : ''
  if (!toGroupId) throw validationError('toGroupId 为必填项', { toGroupId: 'toGroupId 为必填项' })
  const target = await loadGroup(db, toGroupId, ticket.company_id)
  if (target.id === ticket.group_id) throw validationError('目标业务组不能与当前业务组相同', { toGroupId: 'toGroupId 无效' })

  await db.transaction(async (tx) => {
    const now = new Date().toISOString()
    const result = await tx.run({
      text: `UPDATE tickets SET group_id = ?, assignee_id = NULL, assignee_name = NULL, updated_at = ?
              WHERE id = ? AND status = 'in_progress' AND group_id = ?`,
      params: [target.id, now, ticket.id, ticket.group_id],
    })
    if (result.changes === 0) throw conflict('invalid_transition', '工单状态已变化，请刷新后重试')
    await tx.run({
      text: `INSERT INTO ticket_transfers (id, ticket_id, from_group_id, to_group_id, actor_id, actor_name, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
      params: [randomUUID(), ticket.id, ticket.group_id, target.id, profile.userId, profile.name, now],
    })
    await insertEvent(
      tx,
      ticket.id,
      'transferred',
      { id: profile.userId, name: profile.name },
      { fromGroupId: ticket.group_id, toGroupId: target.id, toGroupName: target.name, status: 'in_progress' },
      'success',
      now,
    )
  })
  return presentDetail(profile, await reloadTicket(db, ticket.id))
}

export async function completeTicket(
  db: DbClient,
  email: Pick<EmailClient, 'send'>,
  profile: Profile,
  rawTicketId: string,
) {
  if (profile.role !== 'admin' && profile.role !== 'handler') throw forbidden('仅处理人或管理员可以完成工单')
  const ticket = await loadVisibleTicket(db, profile, rawTicketId)
  if (ticket.status !== 'in_progress' || !ticket.group_id) throw conflict('invalid_transition', '仅待处理工单可以完成')
  if (profile.role === 'handler' && !isGroupMember(profile, ticket.group_id))
    throw forbidden('仅当前承接业务组成员可以完成工单')

  const notification = await db.transaction(async (tx) => {
    const now = new Date().toISOString()
    const assigneeId = ticket.assignee_id ?? profile.userId
    const assigneeName = ticket.assignee_name ?? profile.name
    const result = await tx.run({
      text: `UPDATE tickets
                SET status = 'completed', completed_at = ?, updated_at = ?,
                    assignee_id = ?, assignee_name = ?
              WHERE id = ? AND status = 'in_progress'`,
      params: [now, now, assigneeId, assigneeName, ticket.id],
    })
    if (result.changes === 0) throw conflict('invalid_transition', '工单状态已变化，请刷新后重试')
    await insertEvent(
      tx,
      ticket.id,
      'completed',
      { id: profile.userId, name: profile.name },
      { fromStatus: 'in_progress', toStatus: 'completed', assigneeId, assigneeName, completedAt: now },
      'success',
      now,
    )

    const delivery = await sendCompletionNotification(tx, email, {
      ticketId: ticket.id,
      recipientEmail: ticket.submitter_email,
      submitterName: ticket.submitter_name,
      ticketTitle: ticket.title,
      assigneeName,
      completedAt: now,
      attempt: 1,
    })
    await insertEvent(
      tx,
      ticket.id,
      delivery.action,
      { id: 'system', name: '系统' },
      { notificationId: delivery.record.id, status: delivery.record.status, errorMessage: delivery.errorMessage },
      delivery.result,
      now,
    )
    return delivery.record
  })

  const detail = await getTicketDetail(db, profile, ticket.id)
  return { ...detail, notification: { id: notification.id, status: notification.status } }
}

export async function cancelTicket(db: DbClient, profile: Profile, rawTicketId: string) {
  const ticket = await loadVisibleTicket(db, profile, rawTicketId)
  if (profile.role === 'ops') throw forbidden('平台运营为只读角色')
  const canCancel =
    ticket.submitter_id === profile.userId ||
    profile.role === 'admin' ||
    profile.role === 'handler'
  if (!canCancel) throw forbidden('无权取消该工单')
  if (isTerminalStatus(ticket.status)) throw conflict('invalid_transition', '工单已结束，无法取消')

  await db.transaction(async (tx) => {
    const now = new Date().toISOString()
    const result = await tx.run({
      text: "UPDATE tickets SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE id = ? AND status IN ('unassigned', 'in_progress')",
      params: [now, now, ticket.id],
    })
    if (result.changes === 0) throw conflict('invalid_transition', '工单状态已变化，请刷新后重试')
    await insertEvent(
      tx,
      ticket.id,
      'cancelled',
      { id: profile.userId, name: profile.name },
      { fromStatus: ticket.status, toStatus: 'cancelled', cancelledAt: now },
      'success',
      now,
    )
  })
  return getTicketDetail(db, profile, ticket.id)
}

export async function changePriority(db: DbClient, profile: Profile, rawTicketId: string, body: Record<string, unknown>) {
  if (profile.role !== 'admin' && profile.role !== 'handler') throw forbidden('仅处理人或管理员可以调整优先级')
  const ticket = await loadVisibleTicket(db, profile, rawTicketId)
  if (ticket.status !== 'in_progress') throw conflict('invalid_transition', '仅待处理工单可以调整优先级')
  if (profile.role === 'handler' && !isGroupMember(profile, ticket.group_id))
    throw forbidden('仅当前承接业务组成员可以调整优先级')
  const fields: Record<string, string> = {}
  const priority = readPriority(body.priority, fields)
  if (Object.keys(fields).length > 0) throw validationError('优先级字段校验失败', fields)

  await db.transaction(async (tx) => {
    const now = new Date().toISOString()
    const result = await tx.run({
      text: "UPDATE tickets SET priority = ?, updated_at = ? WHERE id = ? AND status = 'in_progress'",
      params: [priority, now, ticket.id],
    })
    if (result.changes === 0) throw conflict('invalid_transition', '工单状态已变化，请刷新后重试')
    await insertEvent(
      tx,
      ticket.id,
      'priority_changed',
      { id: profile.userId, name: profile.name },
      { from: ticket.priority, to: priority },
      'success',
      now,
    )
  })
  return getTicketDetail(db, profile, ticket.id)
}

export async function rateTicket(db: DbClient, profile: Profile, rawTicketId: string, body: Record<string, unknown>) {
  if (profile.role !== 'submitter') throw forbidden('仅提交人可以评价工单')
  const ticket = await loadVisibleTicket(db, profile, rawTicketId)
  if (ticket.status !== 'completed') throw conflict('invalid_transition', '仅已完成工单可以评价')
  if (ticket.satisfaction_score !== null) throw conflict('already_rated', '该工单已评价，不能重复提交')

  const fields: Record<string, string> = {}
  const score = typeof body.score === 'number' ? body.score : Number.NaN
  if (!Number.isInteger(score) || score < 1 || score > 5) fields.score = 'score 必须是 1-5 的整数'
  let comment: string | null = null
  if (body.comment !== undefined && body.comment !== null) {
    if (typeof body.comment !== 'string' || body.comment.length > 1000) fields.comment = 'comment 不能超过 1000 个字符'
    else comment = body.comment.trim() || null
  }
  if (Object.keys(fields).length > 0) throw validationError('评价字段校验失败', fields)

  await db.transaction(async (tx) => {
    const now = new Date().toISOString()
    const result = await tx.run({
      text: `UPDATE tickets
                SET satisfaction_score = ?, satisfaction_comment = ?, satisfaction_at = ?, updated_at = ?
              WHERE id = ? AND status = 'completed' AND satisfaction_score IS NULL`,
      params: [score, comment, now, now, ticket.id],
    })
    if (result.changes === 0) throw conflict('already_rated', '该工单已评价，不能重复提交')
    await insertEvent(
      tx,
      ticket.id,
      'rated',
      { id: profile.userId, name: profile.name },
      { score, comment },
      'success',
      now,
    )
  })
  return getTicketDetail(db, profile, ticket.id)
}

export async function listEvents(db: DbClient, profile: Profile, rawTicketId: string) {
  const ticket = await loadVisibleTicket(db, profile, rawTicketId)
  const rows = await db.queryAll<{
    id: string
    action: TicketEventAction
    actor_id: string | null
    actor_name: string
    result: 'success' | 'failed'
    detail: string | null
    created_at: string
  }>({
    text: 'SELECT * FROM ticket_events WHERE ticket_id = ? ORDER BY created_at ASC, rowid ASC',
    params: [ticket.id],
  })
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    actorId: row.actor_id,
    actorName: row.actor_name,
    result: row.result,
    detail: row.detail ? (JSON.parse(row.detail) as Record<string, unknown>) : null,
    createdAt: row.created_at,
  }))
}

export async function getSubmitterContext(db: DbClient, profile: Profile, rawTicketId: string) {
  if (profile.role === 'submitter') throw forbidden('仅处理人、管理员或平台运营可以查看提交人上下文')
  const ticket = await loadVisibleTicket(db, profile, rawTicketId)
  const submitter = await db.queryOne<{
    id: string
    name: string
    email: string
    department_name: string | null
    company_name: string | null
  }>({
    text: `SELECT u.id, u.name, u.email, d.name AS department_name, c.name AS company_name
             FROM users u
             LEFT JOIN user_profiles p ON p.user_id = u.id
             LEFT JOIN departments d ON d.id = p.department_id
             LEFT JOIN companies c ON c.id = d.company_id
            WHERE u.id = ?`,
    params: [ticket.submitter_id],
  })
  const history = await db.queryAll<{
    id: string
    title: string
    status: TicketStatus
    priority: TicketPriority
    created_at: string
    category_name: string
  }>({
    text: `SELECT t.id, t.title, t.status, t.priority, t.created_at, cat.name AS category_name
             FROM tickets t JOIN categories cat ON cat.id = t.category_id
            WHERE t.submitter_id = ? AND t.company_id = ?
            ORDER BY t.created_at DESC, t.rowid DESC LIMIT 50`,
    params: [ticket.submitter_id, ticket.company_id],
  })
  return {
    submitter: {
      id: ticket.submitter_id,
      name: ticket.submitter_name,
      email: ticket.submitter_email,
      companyName: submitter?.company_name ?? ticket.company_name,
      departmentName: submitter?.department_name ?? null,
    },
    history: history.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      priority: row.priority,
      createdAt: row.created_at,
      categoryName: row.category_name,
    })),
  }
}

export async function listTicketNotifications(db: DbClient, profile: Profile, rawTicketId: string) {
  if (profile.role === 'submitter') throw forbidden('仅处理人、管理员或平台运营可以查看通知记录')
  const ticket = await loadVisibleTicket(db, profile, rawTicketId)
  const notifications = await listNotifications(db, ticket.id)
  return notifications.map((notification) => ({
    id: notification.id,
    kind: notification.kind,
    recipientEmail: notification.recipientEmail,
    subject: notification.subject,
    status: notification.status,
    attempt: notification.attempt,
    errorMessage: notification.errorMessage,
    createdAt: notification.createdAt,
    sentAt: notification.sentAt,
  }))
}

export async function resendTicketNotification(
  db: DbClient,
  email: Pick<EmailClient, 'send'>,
  profile: Profile,
  rawTicketId: string,
  notificationId: string,
) {
  if (profile.role !== 'admin' && profile.role !== 'handler') throw forbidden('仅处理人或管理员可以重发通知')
  const ticket = await loadVisibleTicket(db, profile, rawTicketId)
  const original = await findNotification(db, ticket.id, notificationId)
  if (!original) throw notFound('通知记录不存在')
  if (original.status === 'sent') throw conflict('already_sent', '通知已发送，不能重发')

  const record = await db.transaction(async (tx) => {
    const now = new Date().toISOString()
    const delivery = await sendCompletionNotification(tx, email, {
      ticketId: ticket.id,
      recipientEmail: original.recipient_email,
      submitterName: ticket.submitter_name,
      ticketTitle: ticket.title,
      assigneeName: ticket.assignee_name,
      completedAt: ticket.completed_at ?? now,
      attempt: original.attempt + 1,
    })
    await insertEvent(
      tx,
      ticket.id,
      delivery.action,
      { id: profile.userId, name: profile.name },
      {
        notificationId: delivery.record.id,
        previousNotificationId: original.id,
        attempt: delivery.record.attempt,
        status: delivery.record.status,
        errorMessage: delivery.errorMessage,
      },
      delivery.result,
      now,
    )
    return delivery.record
  })

  return { notification: record, status: record.status }
}
