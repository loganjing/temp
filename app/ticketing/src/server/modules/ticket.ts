import type { DbClient } from '@commonapp/dbkit'
import type { Priority, Rating, Reply, Ticket, TicketStatus } from '../../shared/contracts'
import { isPriority, isTicketStatus } from '../../shared/contracts'
import { recordAudit } from './audit'
import { listTicketNotifications } from './notification'
import { formatTicketNo, lastInsertId, now } from './util'

export interface TicketRow {
  id: number
  ticket_no: string
  subject: string
  description: string
  category: string
  priority: string
  status: string
  company_id: number
  company_name: string
  submitter_id: string
  submitter_name: string
  submitter_email: string
  submitter_department: string | null
  current_group_id: number | null
  current_group_name: string | null
  handler_id: string | null
  handler_name: string | null
  handled_at: string | null
  created_at: string
  updated_at: string
}

export const TICKET_SELECT = `SELECT t.id, t.ticket_no, t.subject, t.description, t.category, t.priority, t.status,
  t.company_id, c.name AS company_name,
  t.submitter_id, u.name AS submitter_name, u.email AS submitter_email, u.department AS submitter_department,
  t.current_group_id, g.name AS current_group_name,
  t.handler_id, h.name AS handler_name,
  t.handled_at, t.created_at, t.updated_at
  FROM tickets t
  JOIN companies c ON c.id = t.company_id
  JOIN users u ON u.id = t.submitter_id
  LEFT JOIN groups g ON g.id = t.current_group_id
  LEFT JOIN users h ON h.id = t.handler_id`

export function mapTicket(row: TicketRow): Ticket {
  return {
    ticketNo: row.ticket_no,
    subject: row.subject,
    description: row.description,
    category: row.category,
    priority: row.priority as Priority,
    status: row.status as TicketStatus,
    company: { id: row.company_id, name: row.company_name },
    submitter: {
      id: row.submitter_id,
      name: row.submitter_name,
      email: row.submitter_email,
      department: row.submitter_department ?? '',
    },
    currentGroup: row.current_group_id != null ? { id: row.current_group_id, name: row.current_group_name ?? '' } : null,
    handler: row.handler_id != null ? { id: row.handler_id, name: row.handler_name ?? '' } : null,
    handledAt: row.handled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function getTicketRowByNo(db: DbClient, ticketNo: string, companyId: number): Promise<TicketRow | null> {
  return db.queryOne<TicketRow>({
    text: `${TICKET_SELECT} WHERE t.ticket_no = ? AND t.company_id = ?`,
    params: [ticketNo, companyId],
  })
}

export interface CreateTicketInput {
  subject: string
  description: string
  category: string
  priority: Priority
}

// 创建事务（落库 + ticket_created）提交后执行分配事务（置组 + ticket_assigned）。
// 两步同处一请求；分配失败时工单停留 pending_assignment（契约 §6）。
export async function createTicket(
  db: DbClient,
  input: CreateTicketInput,
  companyId: number,
  submitterId: string,
  submitterName: string,
): Promise<Ticket> {
  const ticketNo = await db.transaction(async (tx) => {
    const next = await tx.queryOne<{ next_id: number }>({ text: 'SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM tickets' })
    const id = next!.next_id
    const no = formatTicketNo(id)
    const ts = now()
    await tx.run({
      text: `INSERT INTO tickets (id, ticket_no, subject, description, category, priority, status, company_id, submitter_id, current_group_id, handler_id, handled_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, 'pending_assignment', ?, ?, NULL, NULL, NULL, ?, ?)`,
      params: [id, no, input.subject, input.description, input.category, input.priority, companyId, submitterId, ts, ts],
    })
    await recordAudit(tx, { action: 'ticket_created', actorId: submitterId, actorName: submitterName, ticketNo: no })
    return no
  })
  await db.transaction(async (tx) => {
    const rule = await tx.queryOne<{ group_id: number }>({
      text: 'SELECT group_id FROM assignment_rules WHERE company_id = ? AND category = ?',
      params: [companyId, input.category],
    })
    if (rule) {
      const ts = now()
      await tx.run({
        text: 'UPDATE tickets SET current_group_id = ?, status = \'processing\', updated_at = ? WHERE ticket_no = ?',
        params: [rule.group_id, ts, ticketNo],
      })
      await recordAudit(tx, { action: 'ticket_assigned', actorId: submitterId, actorName: submitterName, ticketNo, detail: `groupId=${rule.group_id}` })
    }
  })
  const row = await getTicketRowByNo(db, ticketNo, companyId)
  return mapTicket(row!)
}

export interface ListOptions {
  status?: string
  category?: string
  priority?: string
  companyId?: string
  q?: string
  sort?: string
  order?: string
  mine?: boolean
  userId?: string
}

export async function listTickets(db: DbClient, companyId: number, opts: ListOptions): Promise<Ticket[]> {
  // 公司筛选参数传入非本公司 ID 时返回空结果集（契约 §1）。
  if (opts.companyId != null && opts.companyId !== '' && Number(opts.companyId) !== companyId) return []
  const conditions = ['t.company_id = ?']
  const params: unknown[] = [companyId]
  if (opts.status && isTicketStatus(opts.status)) {
    conditions.push('t.status = ?')
    params.push(opts.status)
  }
  if (opts.category) {
    conditions.push('t.category = ?')
    params.push(opts.category)
  }
  if (opts.priority && isPriority(opts.priority)) {
    conditions.push('t.priority = ?')
    params.push(opts.priority)
  }
  if (opts.mine && opts.userId) {
    conditions.push('t.submitter_id = ?')
    params.push(opts.userId)
  }
  if (opts.q) {
    conditions.push('(t.subject LIKE ? OR t.ticket_no = ?)')
    params.push(`%${opts.q}%`, opts.q)
  }
  const sort = opts.sort === 'priority' ? 't.priority' : 't.created_at'
  const order = opts.order === 'asc' ? 'ASC' : 'DESC'
  const rows = await db.queryAll<TicketRow>({
    text: `${TICKET_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY ${sort} ${order}, t.id ${order}`,
    params,
  })
  return rows.map(mapTicket)
}

export async function getTicketDetail(
  db: DbClient,
  row: TicketRow,
): Promise<{ ticket: Ticket; replies: Reply[]; rating: Rating | null; notifications: Awaited<ReturnType<typeof listTicketNotifications>> }> {
  const replyRows = await db.queryAll<{
    id: number
    author_id: string
    author_name: string
    content: string
    created_at: string
  }>({
    text: `SELECT r.id, r.author_id, u.name AS author_name, r.content, r.created_at
           FROM replies r JOIN users u ON u.id = r.author_id
           WHERE r.ticket_id = ?
           ORDER BY r.created_at ASC, r.id ASC`,
    params: [row.id],
  })
  const rating = await db.queryOne<{ score: number; comment: string | null; rater_id: string; created_at: string }>({
    text: 'SELECT score, comment, rater_id, created_at FROM ratings WHERE ticket_id = ?',
    params: [row.id],
  })
  const notifications = await listTicketNotifications(db, row.id)
  return {
    ticket: mapTicket(row),
    replies: replyRows.map((r) => ({
      id: r.id,
      author: { id: r.author_id, name: r.author_name },
      content: r.content,
      createdAt: r.created_at,
    })),
    rating: rating ? { score: rating.score, comment: rating.comment, raterId: rating.rater_id, createdAt: rating.created_at } : null,
    notifications,
  }
}

export async function addReply(
  db: DbClient,
  row: TicketRow,
  authorId: string,
  authorName: string,
  content: string,
): Promise<Reply> {
  return db.transaction(async (tx) => {
    const ts = now()
    await tx.run({
      text: 'INSERT INTO replies (ticket_id, author_id, content, created_at) VALUES (?, ?, ?, ?)',
      params: [row.id, authorId, content, ts],
    })
    const id = await lastInsertId(tx)
    await recordAudit(tx, { action: 'ticket_replied', actorId: authorId, actorName: authorName, ticketNo: row.ticket_no })
    return { id, author: { id: authorId, name: authorName }, content, createdAt: ts }
  })
}

export async function transferTicket(
  db: DbClient,
  row: TicketRow,
  toGroupId: number,
  actorId: string,
  actorName: string,
): Promise<Ticket> {
  return db.transaction(async (tx) => {
    const ts = now()
    await tx.run({
      text: 'UPDATE tickets SET current_group_id = ?, updated_at = ? WHERE id = ?',
      params: [toGroupId, ts, row.id],
    })
    await recordAudit(tx, {
      action: 'ticket_transferred',
      actorId,
      actorName,
      ticketNo: row.ticket_no,
      detail: `from=${row.current_group_id ?? null},to=${toGroupId}`,
    })
    const updated = await tx.queryOne<TicketRow>({ text: `${TICKET_SELECT} WHERE t.id = ?`, params: [row.id] })
    return mapTicket(updated!)
  })
}

export async function completeTicket(
  db: DbClient,
  row: TicketRow,
  handlerId: string,
  handlerName: string,
): Promise<Ticket> {
  return db.transaction(async (tx) => {
    const ts = now()
    await tx.run({
      text: 'UPDATE tickets SET handler_id = ?, handled_at = ?, status = \'completed\', updated_at = ? WHERE id = ?',
      params: [handlerId, ts, ts, row.id],
    })
    await recordAudit(tx, { action: 'ticket_completed', actorId: handlerId, actorName: handlerName, ticketNo: row.ticket_no })
    const updated = await tx.queryOne<TicketRow>({ text: `${TICKET_SELECT} WHERE t.id = ?`, params: [row.id] })
    return mapTicket(updated!)
  })
}

export async function cancelTicket(db: DbClient, row: TicketRow, actorId: string, actorName: string): Promise<Ticket> {
  return db.transaction(async (tx) => {
    const ts = now()
    await tx.run({ text: 'UPDATE tickets SET status = \'cancelled\', updated_at = ? WHERE id = ?', params: [ts, row.id] })
    await recordAudit(tx, { action: 'ticket_cancelled', actorId, actorName, ticketNo: row.ticket_no })
    const updated = await tx.queryOne<TicketRow>({ text: `${TICKET_SELECT} WHERE t.id = ?`, params: [row.id] })
    return mapTicket(updated!)
  })
}

export async function rateTicket(
  db: DbClient,
  row: TicketRow,
  raterId: string,
  raterName: string,
  score: number,
  comment: string | null,
): Promise<Rating> {
  return db.transaction(async (tx) => {
    const ts = now()
    await tx.run({
      text: 'INSERT INTO ratings (ticket_id, rater_id, score, comment, created_at) VALUES (?, ?, ?, ?, ?)',
      params: [row.id, raterId, score, comment, ts],
    })
    await recordAudit(tx, { action: 'ticket_rated', actorId: raterId, actorName: raterName, ticketNo: row.ticket_no, detail: `score=${score}` })
    return { score, comment, raterId, createdAt: ts }
  })
}

export async function getSubmitterInfo(
  db: DbClient,
  row: TicketRow,
): Promise<{
  submitter: { id: string; name: string; email: string; department: string; company: { id: number; name: string } }
  history: Ticket[]
}> {
  const history = await db.queryAll<TicketRow>({
    text: `${TICKET_SELECT} WHERE t.submitter_id = ? AND t.company_id = ? ORDER BY t.created_at DESC, t.id DESC`,
    params: [row.submitter_id, row.company_id],
  })
  return {
    submitter: {
      id: row.submitter_id,
      name: row.submitter_name,
      email: row.submitter_email,
      department: row.submitter_department ?? '',
      company: { id: row.company_id, name: row.company_name },
    },
    history: history.map(mapTicket),
  }
}
