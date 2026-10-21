import type { DbClient } from '@commonapp/dbkit'
import type { Hono } from 'hono'
import { invalidState, notFound } from './errors'
import { requireRole, requireSessionProfile, toSummary, type SessionProfile } from './session'
import type { LogAction, Priority, Role, Status, Ticket, TicketDetail, TicketLog, TicketReply, TicketSummary } from './types'
import {
  escapeLike,
  optionalBodyString,
  pathInt,
  queryEnum,
  queryFlag,
  queryInt,
  queryPriority,
  queryStatus,
  requiredBodyEnum,
  requiredBodyInt,
  requiredBodyScore,
  requiredBodyString,
} from './validate'

// —— 工单读取（列表 / 详情共用） ——

const TICKET_SELECT = `SELECT
  t.id AS id, t.ticket_no AS ticket_no, t.company_id AS company_id, t.subject AS subject, t.description AS description,
  t.category_id AS category_id, t.priority AS priority, t.status AS status, t.submitter_id AS submitter_id,
  t.group_id AS group_id, t.handler_id AS handler_id, t.first_reply_at AS first_reply_at,
  t.completed_at AS completed_at, t.cancelled_at AS cancelled_at, t.created_at AS created_at,
  comp.name AS company_name, cat.name AS category_name, grp.name AS group_name,
  sub.id AS submitter_pid, sub.display_name AS submitter_display_name, sub.email AS submitter_email,
  sub.department AS submitter_department, sub.role AS submitter_role,
  hdl.id AS handler_pid, hdl.display_name AS handler_display_name,
  r.score AS rating_score, r.comment AS rating_comment, r.rater_id AS rating_rater_id, r.created_at AS rating_created_at
FROM tickets t
JOIN companies comp ON comp.id = t.company_id
JOIN categories cat ON cat.id = t.category_id
JOIN user_profiles sub ON sub.id = t.submitter_id
LEFT JOIN business_groups grp ON grp.id = t.group_id
LEFT JOIN user_profiles hdl ON hdl.id = t.handler_id
LEFT JOIN ticket_ratings r ON r.ticket_id = t.id`

interface TicketRow {
  id: number
  ticket_no: string
  company_id: number
  subject: string
  description: string
  category_id: number
  priority: string
  status: string
  submitter_id: number
  group_id: number | null
  handler_id: number | null
  first_reply_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  created_at: string
  company_name: string
  category_name: string
  group_name: string | null
  submitter_pid: number
  submitter_display_name: string
  submitter_email: string
  submitter_department: string
  submitter_role: string
  handler_pid: number | null
  handler_display_name: string | null
  rating_score: number | null
  rating_comment: string | null
  rating_rater_id: number | null
  rating_created_at: string | null
}

const REPLY_SELECT = `SELECT
  r.id AS id, r.ticket_id AS ticket_id, r.author_id AS author_id, r.content AS content, r.created_at AS created_at,
  a.display_name AS author_name, a.email AS author_email, a.department AS author_department,
  a.role AS author_role, comp.name AS author_company_name
FROM ticket_replies r
JOIN user_profiles a ON a.id = r.author_id
JOIN companies comp ON comp.id = a.company_id`

interface ReplyRow {
  id: number
  ticket_id: number
  author_id: number
  content: string
  created_at: string
  author_name: string
  author_email: string
  author_department: string
  author_role: string
  author_company_name: string
}

function mapTicket(row: TicketRow): Ticket {
  return {
    id: row.id,
    ticketNo: row.ticket_no,
    companyId: row.company_id,
    companyName: row.company_name,
    subject: row.subject,
    description: row.description,
    categoryId: row.category_id,
    categoryName: row.category_name,
    priority: row.priority as Priority,
    status: row.status as Status,
    submitter: {
      id: row.submitter_pid,
      displayName: row.submitter_display_name,
      email: row.submitter_email,
      department: row.submitter_department,
      companyName: row.company_name,
      role: row.submitter_role as Role,
    },
    groupId: row.group_id,
    groupName: row.group_name,
    handlerId: row.handler_pid,
    handlerName: row.handler_display_name,
    firstReplyAt: row.first_reply_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
    rating: row.rating_score === null ? null : {
      score: row.rating_score,
      comment: row.rating_comment,
      raterId: row.rating_rater_id ?? 0,
      createdAt: row.rating_created_at ?? '',
    },
  }
}

function mapReply(row: ReplyRow): TicketReply {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    author: {
      id: row.author_id,
      displayName: row.author_name,
      email: row.author_email,
      department: row.author_department,
      companyName: row.author_company_name,
      role: row.author_role as Role,
    },
    content: row.content,
    createdAt: row.created_at,
  }
}

async function loadTicket(db: DbClient, ticketId: number): Promise<Ticket> {
  const row = await db.queryOne<TicketRow>({ text: `${TICKET_SELECT} WHERE t.id = ?`, params: [ticketId] })
  if (!row) throw notFound('工单不存在')
  return mapTicket(row)
}

// 公司隔离可见性：跨公司一律 404；submitter 仅可见本人工单；platform_ops 只读全平台。
function assertTicketVisible(profile: SessionProfile, ticket: Ticket): void {
  if (profile.role === 'platform_ops') return
  if (ticket.companyId !== profile.companyId) throw notFound('工单不存在')
  if (profile.role === 'submitter' && ticket.submitter.id !== profile.id) throw notFound('工单不存在')
}

async function loadVisibleTicket(db: DbClient, profile: SessionProfile, rawId: string): Promise<Ticket> {
  const ticket = await loadTicket(db, pathInt(rawId))
  assertTicketVisible(profile, ticket)
  return ticket
}

async function insertLog(
  tx: DbClient,
  ticketId: number,
  actorId: number | null,
  action: LogAction,
  detail: string,
  at: string,
): Promise<void> {
  await tx.run({
    text: 'INSERT INTO ticket_logs (ticket_id, actor_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)',
    params: [ticketId, actorId, action, detail, at],
  })
}

// 完成通知（本地发件箱）：与完成状态同一事务写入。
function completionNotification(ticket: Ticket, handlerName: string, completedAt: string): { subject: string; body: string } {
  const subject = `[工单完成] ${ticket.ticketNo} ${ticket.subject}`
  const body = [
    '您的工单已处理完成。',
    '',
    `工单号：${ticket.ticketNo}`,
    `主题：${ticket.subject}`,
    `处理人：${handlerName}`,
    `完成时间：${completedAt}`,
    '',
    '请登录工单系统，在「我的工单」中对本次处理进行满意度评价。',
  ].join('\n')
  return { subject, body }
}

// —— 路由注册 ——

export function registerTicketRoutes(app: Hono, db: DbClient): void {
  app.get('/api/tickets', async (c) => {
    const profile = await requireSessionProfile(db, c)

    const status = queryStatus(c.req.query('status'))
    const priority = queryPriority(c.req.query('priority'))
    const categoryId = queryInt(c.req.query('categoryId'), 'categoryId')
    const groupId = queryInt(c.req.query('groupId'), 'groupId')
    const scope = queryEnum(c.req.query('scope'), 'scope', ['group', 'company'] as const)
    const mine = queryFlag(c.req.query('mine'), 'mine')
    const sort = queryEnum(c.req.query('sort'), 'sort', ['created_at', 'priority'] as const) ?? 'created_at'
    const order = queryEnum(c.req.query('order'), 'order', ['asc', 'desc'] as const) ?? 'asc'
    const q = c.req.query('q')?.trim() ?? ''

    const filters: string[] = []
    const params: unknown[] = []

    if (profile.role === 'platform_ops') {
      // companyId 仅对 platform_ops 有效；其他角色忽略并强制本公司。
      const rawCompanyId = c.req.query('companyId')
      if (rawCompanyId !== undefined && rawCompanyId !== '') {
        const companyId = queryInt(rawCompanyId, 'companyId')
        const company = await db.queryOne({ text: 'SELECT id FROM companies WHERE id = ?', params: [companyId] })
        if (!company) throw notFound('公司不存在')
        filters.push('t.company_id = ?')
        params.push(companyId)
      }
      if (mine) {
        filters.push('t.submitter_id = ?')
        params.push(profile.id)
      }
    } else if (profile.role === 'submitter') {
      // submitter 强制 mine=1：本人提交的全部状态工单。
      filters.push('t.submitter_id = ?')
      params.push(profile.id)
    } else {
      filters.push('t.company_id = ?')
      params.push(profile.companyId)
      const effectiveScope = scope ?? (profile.role === 'agent' ? 'group' : 'company')
      if (effectiveScope === 'group') {
        filters.push('t.group_id IN (SELECT group_id FROM group_members WHERE user_profile_id = ?)')
        params.push(profile.id)
      }
      if (mine) {
        filters.push('t.submitter_id = ?')
        params.push(profile.id)
      }
    }

    if (status) {
      filters.push('t.status = ?')
      params.push(status)
    }
    if (priority) {
      filters.push('t.priority = ?')
      params.push(priority)
    }
    if (categoryId !== undefined) {
      filters.push('t.category_id = ?')
      params.push(categoryId)
    }
    if (groupId !== undefined) {
      filters.push('t.group_id = ?')
      params.push(groupId)
    }
    if (q !== '') {
      filters.push("(t.ticket_no = ? OR t.subject LIKE ? ESCAPE '\\')")
      params.push(q, `%${escapeLike(q)}%`)
    }

    const dir = order === 'desc' ? 'DESC' : 'ASC'
    const orderBy = sort === 'priority'
      ? `ORDER BY CASE t.priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 ELSE 4 END ${dir}, t.id ${dir}`
      : `ORDER BY t.created_at ${dir}, t.id ${dir}`
    const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : ''

    const [rows, total] = await Promise.all([
      db.queryAll<TicketRow>({ text: `${TICKET_SELECT} ${where} ${orderBy}`, params }),
      db.queryOne<{ total: number }>({ text: `SELECT COUNT(*) AS total FROM tickets t ${where}`, params }),
    ])
    return c.json({ items: rows.map(mapTicket), total: Number(total?.total ?? 0) })
  })

  app.post('/api/tickets', async (c) => {
    const profile = await requireSessionProfile(db, c)
    requireRole(profile, 'submitter', 'agent', 'company_admin')
    const body = await c.req.json().catch(() => ({}))
    const subject = requiredBodyString(body.subject, 'subject', 200)
    const description = requiredBodyString(body.description, 'description', 5000)
    const categoryId = requiredBodyInt(body.categoryId, 'categoryId')
    const priority = requiredBodyEnum(body.priority, 'priority', ['P0', 'P1', 'P2', 'P3', 'P4'] as const)

    const ticket = await db.transaction(async (tx) => {
      const category = await tx.queryOne({ text: 'SELECT id FROM categories WHERE id = ? AND company_id = ?', params: [categoryId, profile.companyId] })
      if (!category) throw notFound('分类不存在')

      const next = await tx.queryOne<{ next: number }>({
        text: "SELECT COALESCE(MAX(CAST(SUBSTR(ticket_no, 5) AS INTEGER)), 0) + 1 AS next FROM tickets",
      })
      const ticketNo = `TKT-${String(next?.next ?? 1).padStart(6, '0')}`
      const now = new Date().toISOString()
      const inserted = await tx.queryOne<{ id: number }>({
        text: `INSERT INTO tickets (ticket_no, company_id, subject, description, category_id, priority, status, submitter_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 'pending_assign', ?, ?) RETURNING id`,
        params: [ticketNo, profile.companyId, subject, description, categoryId, priority, profile.id, now],
      })
      const ticketId = inserted?.id
      if (!ticketId) throw notFound('工单不存在')

      // 按分类自动分配：命中规则即置组并进入待处理（actor 为系统）。
      const rule = await tx.queryOne<{ group_id: number; group_name: string }>({
        text: `SELECT r.group_id, g.name AS group_name FROM assignment_rules r
          JOIN business_groups g ON g.id = r.group_id WHERE r.company_id = ? AND r.category_id = ?`,
        params: [profile.companyId, categoryId],
      })
      if (rule) {
        await tx.run({ text: "UPDATE tickets SET group_id = ?, status = 'processing' WHERE id = ?", params: [rule.group_id, ticketId] })
        await insertLog(tx, ticketId, null, 'auto_assigned', `按分类规则自动分配至「${rule.group_name}」`, now)
      } else {
        await insertLog(tx, ticketId, profile.id, 'created', '创建工单', now)
      }
      return loadTicket(tx, ticketId)
    })
    return c.json(ticket, 201)
  })

  app.get('/api/tickets/:id', async (c) => {
    const profile = await requireSessionProfile(db, c)
    const ticket = await loadVisibleTicket(db, profile, c.req.param('id'))
    const replies = await db.queryAll<ReplyRow>({
      text: `${REPLY_SELECT} WHERE r.ticket_id = ? ORDER BY r.created_at ASC, r.id ASC`,
      params: [ticket.id],
    })
    const detail: TicketDetail = { ...ticket, replies: replies.map(mapReply) }
    return c.json(detail)
  })

  app.get('/api/tickets/:id/logs', async (c) => {
    const profile = await requireSessionProfile(db, c)
    const ticket = await loadVisibleTicket(db, profile, c.req.param('id'))
    const rows = await db.queryAll<{ id: number; ticket_id: number; actor_id: number | null; action: string; detail: string; created_at: string; actor_name: string | null }>({
      text: `SELECT l.id, l.ticket_id, l.actor_id, l.action, l.detail, l.created_at, a.display_name AS actor_name
        FROM ticket_logs l LEFT JOIN user_profiles a ON a.id = l.actor_id
        WHERE l.ticket_id = ? ORDER BY l.created_at ASC, l.id ASC`,
      params: [ticket.id],
    })
    const items: TicketLog[] = rows.map((row) => ({
      id: row.id,
      ticketId: row.ticket_id,
      actor: row.actor_id === null ? null : { id: row.actor_id, displayName: row.actor_name ?? '' },
      action: row.action as LogAction,
      detail: row.detail,
      createdAt: row.created_at,
    }))
    return c.json({ items })
  })

  app.get('/api/tickets/:id/submitter', async (c) => {
    const profile = await requireSessionProfile(db, c)
    requireRole(profile, 'agent', 'company_admin', 'platform_ops')
    const ticket = await loadVisibleTicket(db, profile, c.req.param('id'))
    const history = await db.queryAll<{ id: number; ticket_no: string; subject: string; priority: string; status: string; created_at: string }>({
      text: 'SELECT id, ticket_no, subject, priority, status, created_at FROM tickets WHERE submitter_id = ? ORDER BY created_at DESC, id DESC',
      params: [ticket.submitter.id],
    })
    const historyTickets: TicketSummary[] = history.map((row) => ({
      id: row.id,
      ticketNo: row.ticket_no,
      subject: row.subject,
      priority: row.priority as Priority,
      status: row.status as Status,
      createdAt: row.created_at,
    }))
    return c.json({ ...ticket.submitter, historyTickets })
  })

  app.post('/api/tickets/:id/replies', async (c) => {
    const profile = await requireSessionProfile(db, c)
    requireRole(profile, 'submitter', 'agent', 'company_admin')
    const ticket = await loadVisibleTicket(db, profile, c.req.param('id'))
    if (ticket.status === 'completed' || ticket.status === 'cancelled') throw invalidState('工单已处于终态，无法回复')
    const body = await c.req.json().catch(() => ({}))
    const content = requiredBodyString(body.content, 'content', 5000)

    const now = new Date().toISOString()
    const reply = await db.transaction(async (tx) => {
      const inserted = await tx.queryOne<{ id: number }>({
        text: 'INSERT INTO ticket_replies (ticket_id, author_id, content, created_at) VALUES (?, ?, ?, ?) RETURNING id',
        params: [ticket.id, profile.id, content, now],
      })
      // first_reply_at 仅记录首次回复时间，供统计口径使用。
      await tx.run({ text: 'UPDATE tickets SET first_reply_at = COALESCE(first_reply_at, ?) WHERE id = ?', params: [now, ticket.id] })
      await insertLog(tx, ticket.id, profile.id, 'replied', '回复工单', now)
      return {
        id: inserted?.id ?? 0,
        ticketId: ticket.id,
        author: toSummary(profile),
        content,
        createdAt: now,
      }
    })
    return c.json(reply, 201)
  })

  app.post('/api/tickets/:id/assign', async (c) => {
    const profile = await requireSessionProfile(db, c)
    requireRole(profile, 'agent', 'company_admin')
    const ticket = await loadVisibleTicket(db, profile, c.req.param('id'))
    const body = await c.req.json().catch(() => ({}))
    const groupId = requiredBodyInt(body.groupId, 'groupId')
    // 校验顺序：先请求引用（404），再状态机（409）。
    const group = await db.queryOne<{ id: number; name: string }>({
      text: 'SELECT id, name FROM business_groups WHERE id = ? AND company_id = ?',
      params: [groupId, ticket.companyId],
    })
    if (!group) throw notFound('业务组不存在')
    if (ticket.status !== 'pending_assign') throw invalidState('只有待分配工单可以人工分配')

    const now = new Date().toISOString()
    const updated = await db.transaction(async (tx) => {
      await tx.run({ text: "UPDATE tickets SET group_id = ?, status = 'processing' WHERE id = ?", params: [group.id, ticket.id] })
      await insertLog(tx, ticket.id, profile.id, 'assigned', `人工分配至「${group.name}」`, now)
      return loadTicket(tx, ticket.id)
    })
    return c.json(updated)
  })

  app.post('/api/tickets/:id/transfer', async (c) => {
    const profile = await requireSessionProfile(db, c)
    requireRole(profile, 'agent', 'company_admin')
    const ticket = await loadVisibleTicket(db, profile, c.req.param('id'))
    const body = await c.req.json().catch(() => ({}))
    const groupId = requiredBodyInt(body.groupId, 'groupId')
    const reason = optionalBodyString(body.reason, 'reason', 500)
    // 校验顺序：先请求引用（404），再状态机（409）。
    const group = await db.queryOne<{ id: number; name: string }>({
      text: 'SELECT id, name FROM business_groups WHERE id = ? AND company_id = ?',
      params: [groupId, ticket.companyId],
    })
    if (!group) throw notFound('业务组不存在')
    if (ticket.status !== 'processing') throw invalidState('只有待处理工单可以转派')

    const now = new Date().toISOString()
    const detail = reason ? `转派至「${group.name}」：${reason}` : `转派至「${group.name}」`
    const updated = await db.transaction(async (tx) => {
      await tx.run({ text: 'UPDATE tickets SET group_id = ? WHERE id = ?', params: [group.id, ticket.id] })
      await insertLog(tx, ticket.id, profile.id, 'transferred', detail, now)
      return loadTicket(tx, ticket.id)
    })
    return c.json(updated)
  })

  app.post('/api/tickets/:id/complete', async (c) => {
    const profile = await requireSessionProfile(db, c)
    requireRole(profile, 'agent', 'company_admin')
    const ticket = await loadVisibleTicket(db, profile, c.req.param('id'))
    if (ticket.status !== 'processing') throw invalidState('只有待处理工单可以完成')
    const body = await c.req.json().catch(() => ({}))
    const resolution = optionalBodyString(body.resolution, 'resolution', 2000)

    const now = new Date().toISOString()
    const logDetail = resolution ? `完成处理：${resolution}` : '完成处理'
    const notification = completionNotification(ticket, profile.displayName, now)
    const updated = await db.transaction(async (tx) => {
      await tx.run({
        text: "UPDATE tickets SET status = 'completed', handler_id = ?, completed_at = ? WHERE id = ?",
        params: [profile.id, now, ticket.id],
      })
      // 处理记录与完成通知同事务：写入失败则整体回滚。
      await tx.run({
        text: 'INSERT INTO email_notifications (recipient_user_id, recipient_email, ticket_id, subject, body, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        params: [ticket.submitter.id, ticket.submitter.email, ticket.id, notification.subject, notification.body, now],
      })
      await insertLog(tx, ticket.id, profile.id, 'completed', logDetail, now)
      return loadTicket(tx, ticket.id)
    })
    return c.json(updated)
  })

  app.post('/api/tickets/:id/cancel', async (c) => {
    const profile = await requireSessionProfile(db, c)
    requireRole(profile, 'submitter', 'company_admin')
    const ticket = await loadVisibleTicket(db, profile, c.req.param('id'))
    if (ticket.status !== 'pending_assign' && ticket.status !== 'processing') throw invalidState('工单已处于终态，无法取消')
    const body = await c.req.json().catch(() => ({}))
    const reason = optionalBodyString(body.reason, 'reason', 500)

    const now = new Date().toISOString()
    const detail = reason ? `取消工单：${reason}` : '取消工单'
    const updated = await db.transaction(async (tx) => {
      await tx.run({ text: "UPDATE tickets SET status = 'cancelled', cancelled_at = ? WHERE id = ?", params: [now, ticket.id] })
      await insertLog(tx, ticket.id, profile.id, 'cancelled', detail, now)
      return loadTicket(tx, ticket.id)
    })
    return c.json(updated)
  })

  app.post('/api/tickets/:id/rating', async (c) => {
    const profile = await requireSessionProfile(db, c)
    requireRole(profile, 'submitter')
    const ticket = await loadVisibleTicket(db, profile, c.req.param('id'))
    const body = await c.req.json().catch(() => ({}))
    // 校验顺序：先输入（400），再状态机与重复约束（409）。
    const score = requiredBodyScore(body.score, 'score')
    const comment = optionalBodyString(body.comment, 'comment', 500)
    if (ticket.status !== 'completed') throw invalidState('只有已完成的工单可以评价')
    if (ticket.rating) throw invalidState('该工单已完成评价')

    const now = new Date().toISOString()
    const rating = await db.transaction(async (tx) => {
      await tx.run({
        text: 'INSERT INTO ticket_ratings (ticket_id, rater_id, score, comment, created_at) VALUES (?, ?, ?, ?, ?)',
        params: [ticket.id, profile.id, score, comment, now],
      })
      await insertLog(tx, ticket.id, profile.id, 'rated', `满意度评价 ${score}/5`, now)
      return { score, comment, raterId: profile.id, createdAt: now }
    })
    return c.json({ rating })
  })
}
