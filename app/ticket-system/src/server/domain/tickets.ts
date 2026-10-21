import { randomUUID } from 'node:crypto'
import type { Context, Hono } from 'hono'
import type { DbClient } from '@commonapp/dbkit'
import { type AuditKit, createAuditRecorder, type AuditRecorder } from './audit'
import { buildCompletionEmail, deliverOutboxEmail, queueCompletionEmail } from './notify'
import type { EmailPlatform } from '../platform/email'
import {
  ApiError,
  BodyReader,
  currentAuthUser,
  escapeLike,
  forbiddenCompany,
  invalidState,
  parsePagination,
  requireCompanyContext,
  ticketNotFound,
  validationFailed,
  type CompanyContext,
} from './support'

// 工单域（契约第 2 节）：提交、列表、详情、回复、人工分配、转派、完成、取消、评价。

export type TicketListItem = {
  ticketId: number
  ticketNo: string
  subject: string
  category: string
  priority: string
  status: string
  companyId: number
  companyName: string
  submitterName: string
  assignedGroupId: number | null
  assignedGroupName: string | null
  handlerId: number | null
  handlerName: string | null
  replyCount: number
  createdAt: string
  completedAt: string | null
}

export type TicketReplyView = {
  replyId: number
  replierId: number
  replierName: string
  content: string
  repliedAt: string
}

export type TicketRatingView = { score: number; comment: string | null; ratedAt: string }

export type TicketDetail = {
  ticket: TicketListItem
  description: string
  submitter: {
    userId: number
    name: string
    email: string
    companyName: string
    department: string
    historyTickets: Array<{ ticketNo: string; subject: string; status: string; priority: string; createdAt: string }>
  }
  replies: TicketReplyView[]
  rating: TicketRatingView | null
}

export type TicketDeps = { db: DbClient; audit: AuditKit; email: EmailPlatform }

const PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'P4'] as const
const SORTS = ['createdAt', 'priority', 'ticketNo'] as const
const ORDERS = ['asc', 'desc'] as const

type TicketListRow = {
  ticket_id: number
  ticket_no: string
  subject: string
  category: string
  priority: string
  status: string
  company_id: number
  company_name: string
  submitter_name: string
  assigned_group_id: number | null
  assigned_group_name: string | null
  handler_no: number | null
  handler_name: string | null
  reply_count: number
  created_at: string
  completed_at: string | null
}

type TicketStateRow = {
  id: number
  ticket_no: string
  company_id: number
  status: string
  submitter_no: number
  submitter_email: string
  submitter_name: string
  assigned_group_id: number | null
  handler_no: number | null
}

const TICKET_LIST_SELECT = `
  SELECT t.id AS ticket_id, t.ticket_no, t.subject, t.category, t.priority, t.status,
         t.company_id, c.name AS company_name, su.name AS submitter_name,
         t.assigned_group_id, bg.name AS assigned_group_name,
         t.handler_no, hu.name AS handler_name,
         (SELECT COUNT(*) FROM ticket_replies r WHERE r.ticket_id = t.id) AS reply_count,
         t.created_at, t.completed_at
  FROM tickets t
  JOIN companies c ON c.id = t.company_id
  JOIN users su ON su.user_no = t.submitter_no
  LEFT JOIN business_groups bg ON bg.id = t.assigned_group_id
  LEFT JOIN users hu ON hu.user_no = t.handler_no`

const toListItem = (row: TicketListRow): TicketListItem => ({
  ticketId: row.ticket_id,
  ticketNo: row.ticket_no,
  subject: row.subject,
  category: row.category,
  priority: row.priority,
  status: row.status,
  companyId: row.company_id,
  companyName: row.company_name,
  submitterName: row.submitter_name,
  assignedGroupId: row.assigned_group_id ?? null,
  assignedGroupName: row.assigned_group_name ?? null,
  handlerId: row.handler_no ?? null,
  handlerName: row.handler_name ?? null,
  replyCount: Number(row.reply_count ?? 0),
  createdAt: row.created_at,
  completedAt: row.completed_at ?? null,
})

async function queryListItem(db: DbClient, ticketId: number): Promise<TicketListItem | null> {
  const row = await db.queryOne<TicketListRow>({
    text: `${TICKET_LIST_SELECT} WHERE t.id = ?`,
    params: [ticketId],
  })
  return row ? toListItem(row) : null
}

// 操作端点工单行：不存在 → 404；跨公司 → 403（契约第 0/2 节拒绝语义）。
async function loadActionTicket(db: DbClient, ticketId: number, company: CompanyContext): Promise<TicketStateRow> {
  const row = await db.queryOne<TicketStateRow>({
    text: `SELECT t.id, t.ticket_no, t.company_id, t.status, t.submitter_no,
                  su.email AS submitter_email, su.name AS submitter_name,
                  t.assigned_group_id, t.handler_no
           FROM tickets t JOIN users su ON su.user_no = t.submitter_no
           WHERE t.id = ?`,
    params: [ticketId],
  })
  if (!row) throw ticketNotFound()
  if (row.company_id !== company.companyId) throw forbiddenCompany()
  return row
}

const recorderFor = (deps: TicketDeps, company: CompanyContext, now: string): AuditRecorder =>
  createAuditRecorder(
    deps.audit,
    { userId: company.userId, userNo: company.userNo, userName: company.name },
    () => now,
  )

async function loadTicketDetail(db: DbClient, ticketId: number): Promise<TicketDetail | null> {
  const ticket = await queryListItem(db, ticketId)
  if (!ticket) return null
  const state = await db.queryOne<{ description: string; submitter_no: number }>({
    text: 'SELECT description, submitter_no FROM tickets WHERE id = ?',
    params: [ticketId],
  })
  if (!state) return null
  const [submitter, history, replies, rating] = await Promise.all([
    db.queryOne<{ user_no: number; name: string; email: string; department: string; company_name: string | null }>({
      text: `SELECT u.user_no, u.name, u.email, u.department, c.name AS company_name
             FROM users u LEFT JOIN companies c ON c.id = CAST(u.company_id AS INTEGER)
             WHERE u.user_no = ?`,
      params: [state.submitter_no],
    }),
    db.queryAll<{ ticket_no: string; subject: string; status: string; priority: string; created_at: string }>({
      text: `SELECT ticket_no, subject, status, priority, created_at
             FROM tickets WHERE submitter_no = ? ORDER BY created_at DESC, id DESC`,
      params: [state.submitter_no],
    }),
    db.queryAll<{ reply_id: number; replier_no: number; replier_name: string; content: string; replied_at: string }>({
      text: `SELECT r.id AS reply_id, r.replier_no, u.name AS replier_name, r.content, r.replied_at
             FROM ticket_replies r JOIN users u ON u.user_no = r.replier_no
             WHERE r.ticket_id = ? ORDER BY r.replied_at ASC, r.id ASC`,
      params: [ticketId],
    }),
    db.queryOne<{ score: number; comment: string | null; rated_at: string }>({
      text: 'SELECT score, comment, rated_at FROM ticket_ratings WHERE ticket_id = ?',
      params: [ticketId],
    }),
  ])
  return {
    ticket,
    description: state.description,
    submitter: {
      userId: submitter?.user_no ?? 0,
      name: submitter?.name ?? '',
      email: submitter?.email ?? '',
      companyName: submitter?.company_name ?? '',
      department: submitter?.department ?? '',
      historyTickets: history.map((row) => ({
        ticketNo: row.ticket_no,
        subject: row.subject,
        status: row.status,
        priority: row.priority,
        createdAt: row.created_at,
      })),
    },
    replies: replies.map((row) => ({
      replyId: row.reply_id,
      replierId: row.replier_no,
      replierName: row.replier_name,
      content: row.content,
      repliedAt: row.replied_at,
    })),
    rating: rating ? { score: rating.score, comment: rating.comment ?? null, ratedAt: rating.rated_at } : null,
  }
}

const parseTicketId = (raw: string | undefined): number => {
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) throw ticketNotFound()
  return value
}

const emptyList = (context: Context, page: number, pageSize: number) => {
  const body = { items: [] as TicketListItem[], total: 0, page, pageSize }
  return context.json(body)
}

export function registerTicketRoutes(app: Hono, deps: TicketDeps) {
  // 2.1 提交：事务内同步自动分配（命中规则 → pending_processing；未命中 → pending_assignment）。
  app.post('/api/tickets', async (context: Context) => {
    const company = await requireCompanyContext(deps.db, currentAuthUser(context))
    const reader = new BodyReader(await context.req.json().catch(() => null))
    const subject = reader.string('subject', { required: true, min: 1, max: 200 })
    const description = reader.string('description', { required: true, min: 1, max: 5000 })
    const category = reader.string('category', { required: true, min: 1, max: 50 })
    const priority = reader.enumValue('priority', PRIORITIES, { required: true })
    if (reader.issues.length > 0) throw validationFailed(reader.issues)

    const now = new Date().toISOString()
    const created = await deps.db.transaction(async (tx) => {
      const inserted = await tx.queryOne<{ id: number }>({
        text: `INSERT INTO tickets (ticket_no, subject, description, category, priority, status, company_id, submitter_no, assigned_group_id, created_at)
               VALUES (?, ?, ?, ?, ?, 'created', ?, ?, NULL, ?) RETURNING id AS id`,
        params: [`TK-PENDING-${randomUUID()}`, subject, description, category, priority, company.companyId, company.userNo, now],
      })
      if (!inserted) throw new Error('工单创建失败')
      const ticketId = inserted.id
      const ticketNo = `TK-${String(ticketId).padStart(6, '0')}`
      await tx.run({ text: 'UPDATE tickets SET ticket_no = ? WHERE id = ?', params: [ticketNo, ticketId] })
      const record = recorderFor(deps, company, now)
      await record({
        type: 'ticket.created',
        ticketId,
        ticketNo,
        detail: `提交工单 ${ticketNo}（${category}/${priority}）`,
      })
      const rule = await tx.queryOne<{ group_id: number; group_name: string }>({
        text: `SELECT r.group_id, g.name AS group_name
               FROM category_rules r JOIN business_groups g ON g.id = r.group_id
               WHERE r.company_id = ? AND r.category = ?`,
        params: [company.companyId, category],
      })
      if (rule) {
        await tx.run({
          text: "UPDATE tickets SET status = 'pending_processing', assigned_group_id = ? WHERE id = ?",
          params: [rule.group_id, ticketId],
        })
        await record({
          type: 'ticket.assigned',
          ticketId,
          ticketNo,
          detail: `按分类 ${category} 自动分配到业务组 ${rule.group_name}`,
          extra: { assignment: 'auto', groupId: rule.group_id, groupName: rule.group_name },
        })
      } else {
        await tx.run({ text: "UPDATE tickets SET status = 'pending_assignment' WHERE id = ?", params: [ticketId] })
      }
      return ticketId
    })
    const detail = await loadTicketDetail(deps.db, created)
    return context.json(detail, 201)
  })

  // 2.2 列表（工作台/我的工单共用）：筛选、搜索、排序、公司维度筛选。
  app.get('/api/tickets', async (context: Context) => {
    const company = await requireCompanyContext(deps.db, currentAuthUser(context))
    const query = context.req.query()
    const { page, pageSize, offset } = parsePagination(query)
    const issues: Array<{ field: string; message: string }> = []
    const status = query.status
    if (status !== undefined && status !== '' && !['created', 'pending_assignment', 'pending_processing', 'completed', 'cancelled'].includes(status)) {
      issues.push({ field: 'status', message: 'status 仅支持 created/pending_assignment/pending_processing/completed/cancelled' })
    }
    const priority = query.priority
    if (priority !== undefined && priority !== '' && !PRIORITIES.includes(priority as (typeof PRIORITIES)[number])) {
      issues.push({ field: 'priority', message: `priority 仅支持 ${PRIORITIES.join('/')}` })
    }
    const sort = query.sort
    if (sort !== undefined && sort !== '' && !SORTS.includes(sort as (typeof SORTS)[number])) {
      issues.push({ field: 'sort', message: `sort 仅支持 ${SORTS.join('/')}` })
    }
    const order = query.order
    if (order !== undefined && order !== '' && !ORDERS.includes(order as (typeof ORDERS)[number])) {
      issues.push({ field: 'order', message: 'order 仅支持 asc/desc' })
    }
    if (issues.length > 0) throw validationFailed(issues)

    // 公司维度筛选：默认与本人公司相同；传他公司 → 空结果集，不报错。
    const companyFilter = query.companyId
    if (companyFilter !== undefined && companyFilter !== '' && Number(companyFilter) !== company.companyId) {
      return emptyList(context, page, pageSize)
    }

    // 业务组筛选：非本公司组不出现（列表天然过滤 → 空结果集）。
    let groupId: number | null = null
    if (query.groupId !== undefined && query.groupId !== '') {
      const parsed = Number(query.groupId)
      if (!Number.isInteger(parsed) || parsed <= 0) return emptyList(context, page, pageSize)
      const group = await deps.db.queryOne<{ id: number }>({
        text: 'SELECT id FROM business_groups WHERE id = ? AND company_id = ?',
        params: [parsed, company.companyId],
      })
      if (!group) return emptyList(context, page, pageSize)
      groupId = parsed
    }

    const conditions = ['t.company_id = ?']
    const values: unknown[] = [company.companyId]
    if (status) { conditions.push('t.status = ?'); values.push(status) }
    const category = query.category?.trim() ?? ''
    if (category) { conditions.push('t.category = ?'); values.push(category) }
    if (priority) { conditions.push('t.priority = ?'); values.push(priority) }
    if (groupId !== null) { conditions.push('t.assigned_group_id = ?'); values.push(groupId) }
    if (query.mine === 'true') { conditions.push('t.submitter_no = ?'); values.push(company.userNo) }
    const q = query.q?.trim() ?? ''
    if (q) {
      const like = `%${escapeLike(q)}%`
      conditions.push("(t.ticket_no LIKE ? ESCAPE '\\' OR t.subject LIKE ? ESCAPE '\\')")
      values.push(like, like)
    }
    const where = conditions.join(' AND ')
    const direction = order === 'asc' ? 'ASC' : 'DESC'
    const sortColumn = sort === 'priority' ? 't.priority' : sort === 'ticketNo' ? 't.ticket_no' : 't.created_at'

    const [rows, totalRow] = await Promise.all([
      deps.db.queryAll<TicketListRow>({
        text: `${TICKET_LIST_SELECT} WHERE ${where} ORDER BY ${sortColumn} ${direction}, t.id ${direction} LIMIT ? OFFSET ?`,
        params: [...values, pageSize, offset],
      }),
      deps.db.queryOne<{ total: number }>({ text: `SELECT COUNT(*) AS total FROM tickets t WHERE ${where}`, params: values }),
    ])
    return context.json({ items: rows.map(toListItem), total: Number(totalRow?.total ?? 0), page, pageSize })
  })

  // 2.3 详情：跨公司以不存在呈现（404）。
  app.get('/api/tickets/:ticketId', async (context: Context) => {
    const company = await requireCompanyContext(deps.db, currentAuthUser(context))
    const ticketId = parseTicketId(context.req.param('ticketId'))
    const row = await deps.db.queryOne<{ id: number; company_id: number }>({
      text: 'SELECT id, company_id FROM tickets WHERE id = ?',
      params: [ticketId],
    })
    if (!row || row.company_id !== company.companyId) throw ticketNotFound()
    const detail = await loadTicketDetail(deps.db, ticketId)
    if (!detail) throw ticketNotFound()
    return context.json(detail)
  })

  // 2.4 回复：本公司已登录用户（提交人与处理侧双向）；终态拒绝。
  app.post('/api/tickets/:ticketId/replies', async (context: Context) => {
    const company = await requireCompanyContext(deps.db, currentAuthUser(context))
    const ticketId = parseTicketId(context.req.param('ticketId'))
    const ticket = await loadActionTicket(deps.db, ticketId, company)
    if (ticket.status === 'completed' || ticket.status === 'cancelled') throw invalidState('工单已结束，无法回复')
    const reader = new BodyReader(await context.req.json().catch(() => null))
    const content = reader.string('content', { required: true, min: 1, max: 5000 })
    if (reader.issues.length > 0) throw validationFailed(reader.issues)

    const now = new Date().toISOString()
    const reply = await deps.db.transaction(async (tx) => {
      const inserted = await tx.queryOne<{ id: number }>({
        text: 'INSERT INTO ticket_replies (ticket_id, replier_no, content, replied_at) VALUES (?, ?, ?, ?) RETURNING id AS id',
        params: [ticketId, company.userNo, content, now],
      })
      if (!inserted) throw new Error('回复写入失败')
      await recorderFor(deps, company, now)({
        type: 'ticket.replied',
        ticketId,
        ticketNo: ticket.ticket_no,
        detail: `回复工单 ${ticket.ticket_no}（${company.name}）`,
      })
      return inserted
    })
    return context.json(
      { replyId: reply.id, replierId: company.userNo, replierName: company.name, content, repliedAt: now },
      201,
    )
  })

  // 2.5 人工分配：待分配 → 待处理。
  app.post('/api/tickets/:ticketId/assign', async (context: Context) => {
    const company = await requireCompanyContext(deps.db, currentAuthUser(context))
    const ticketId = parseTicketId(context.req.param('ticketId'))
    const ticket = await loadActionTicket(deps.db, ticketId, company)
    if (ticket.status !== 'pending_assignment') throw invalidState('仅待分配工单可执行人工分配')
    const reader = new BodyReader(await context.req.json().catch(() => null))
    const groupId = reader.number('groupId', { required: true, min: 1 })
    if (reader.issues.length > 0) throw validationFailed(reader.issues)

    const group = await deps.db.queryOne<{ id: number; name: string }>({
      text: 'SELECT id, name FROM business_groups WHERE id = ? AND company_id = ?',
      params: [groupId, company.companyId],
    })
    if (!group) throw forbiddenCompany()

    const now = new Date().toISOString()
    await deps.db.transaction(async (tx) => {
      await tx.run({
        text: "UPDATE tickets SET status = 'pending_processing', assigned_group_id = ? WHERE id = ?",
        params: [group.id, ticketId],
      })
      await recorderFor(deps, company, now)({
        type: 'ticket.assigned',
        ticketId,
        ticketNo: ticket.ticket_no,
        detail: `人工分配到业务组 ${group.name}`,
        extra: { assignment: 'manual', groupId: group.id, groupName: group.name },
      })
    })
    const item = await queryListItem(deps.db, ticketId)
    return context.json(item)
  })

  // 2.6 转派：仅待处理状态下变更归属，状态保持 pending_processing。
  app.post('/api/tickets/:ticketId/reassign', async (context: Context) => {
    const company = await requireCompanyContext(deps.db, currentAuthUser(context))
    const ticketId = parseTicketId(context.req.param('ticketId'))
    const ticket = await loadActionTicket(deps.db, ticketId, company)
    if (ticket.status !== 'pending_processing') throw invalidState('仅待处理工单可转派')
    const body = await context.req.json().catch(() => null)
    const reader = new BodyReader(body)
    const groupId = reader.number('groupId', { min: 1 })
    const handlerId = reader.number('handlerId', { min: 1 })
    if (reader.issues.length > 0) throw validationFailed(reader.issues)
    if (groupId === null && handlerId === null) {
      throw validationFailed([{ field: 'groupId', message: 'groupId 与 handlerId 至少提供一项' }])
    }

    let groupName: string | null = null
    if (groupId !== null) {
      const group = await deps.db.queryOne<{ id: number; name: string }>({
        text: 'SELECT id, name FROM business_groups WHERE id = ? AND company_id = ?',
        params: [groupId, company.companyId],
      })
      if (!group) throw forbiddenCompany()
      groupName = group.name
    }
    let handlerName: string | null = null
    if (handlerId !== null) {
      const handler = await deps.db.queryOne<{ user_no: number; name: string }>({
        text: 'SELECT user_no, name FROM users WHERE user_no = ? AND CAST(company_id AS INTEGER) = ?',
        params: [handlerId, company.companyId],
      })
      if (!handler) throw forbiddenCompany('转派处理人须属于本公司')
      handlerName = handler.name
    }
    // 指定处理人时，处理人须为转派目标业务组成员（未分配组则无法指定处理人）。
    const targetGroupId = groupId ?? ticket.assigned_group_id
    if (handlerId !== null) {
      if (targetGroupId === null) throw invalidState('工单尚未分配业务组，无法指定处理人')
      const member = await deps.db.queryOne<{ user_no: number }>({
        text: 'SELECT user_no FROM group_members WHERE group_id = ? AND user_no = ?',
        params: [targetGroupId, handlerId],
      })
      if (!member) throw invalidState('转派处理人须属于目标业务组')
    }
    const oldGroupId = ticket.assigned_group_id
    const oldGroupName = oldGroupId === null ? null
      : (await deps.db.queryOne<{ name: string }>({ text: 'SELECT name FROM business_groups WHERE id = ?', params: [oldGroupId] }))?.name ?? null
    const oldHandlerName = ticket.handler_no === null ? null
      : (await deps.db.queryOne<{ name: string }>({ text: 'SELECT name FROM users WHERE user_no = ?', params: [ticket.handler_no] }))?.name ?? null

    const now = new Date().toISOString()
    await deps.db.transaction(async (tx) => {
      const nextGroupId = groupId ?? oldGroupId
      const nextHandler = handlerId ?? ticket.handler_no
      await tx.run({
        text: 'UPDATE tickets SET assigned_group_id = ?, handler_no = ? WHERE id = ?',
        params: [nextGroupId, nextHandler, ticketId],
      })
      await recorderFor(deps, company, now)({
        type: 'ticket.reassigned',
        ticketId,
        ticketNo: ticket.ticket_no,
        detail: `转派工单 ${ticket.ticket_no}：业务组 ${oldGroupName ?? '未分配'} → ${groupName ?? oldGroupName ?? '未分配'}，处理人 ${oldHandlerName ?? '未指定'} → ${handlerName ?? oldHandlerName ?? '未指定'}`,
        extra: { fromGroupId: oldGroupId, toGroupId: nextGroupId, fromHandlerId: ticket.handler_no, toHandlerId: nextHandler },
      })
    })
    const item = await queryListItem(deps.db, ticketId)
    return context.json(item)
  })

  // 2.7 完成：事务内更新状态、写审计与发件箱；事务外经通知域发送。
  app.post('/api/tickets/:ticketId/complete', async (context: Context) => {
    const company = await requireCompanyContext(deps.db, currentAuthUser(context))
    const ticketId = parseTicketId(context.req.param('ticketId'))
    const ticket = await loadActionTicket(deps.db, ticketId, company)
    if (ticket.status !== 'pending_processing') throw invalidState('仅待处理工单可完成')
    const reader = new BodyReader(await context.req.json().catch(() => null))
    const resolution = reader.string('resolution', { min: 0, max: 1000 })
    if (reader.issues.length > 0) throw validationFailed(reader.issues)

    const now = new Date().toISOString()
    const channel: 'smtp' | 'local' = deps.email.configured ? 'smtp' : 'local'
    const emailContent = buildCompletionEmail({
      ticketNo: ticket.ticket_no,
      subject: (await deps.db.queryOne<{ subject: string }>({ text: 'SELECT subject FROM tickets WHERE id = ?', params: [ticketId] }))?.subject ?? '',
      submitterName: ticket.submitter_name,
      submitterEmail: ticket.submitter_email,
      handlerName: company.name,
      completedAt: now,
    })
    const outboxId = await deps.db.transaction(async (tx) => {
      await tx.run({
        text: "UPDATE tickets SET status = 'completed', handler_no = ?, handled_at = ?, completed_at = ?, resolution = ? WHERE id = ?",
        params: [company.userNo, now, now, resolution, ticketId],
      })
      await recorderFor(deps, company, now)({
        type: 'ticket.completed',
        ticketId,
        ticketNo: ticket.ticket_no,
        detail: `完成工单 ${ticket.ticket_no}，处理人 ${company.name}`,
      })
      return queueCompletionEmail(
        tx,
        { ticketId, ticketNo: ticket.ticket_no, toEmail: emailContent.toEmail, subject: emailContent.subject, body: emailContent.body },
        channel,
        now,
      )
    })
    // 事务外投递：发送失败仅记录 failed，不改变工单状态。
    const notificationStatus = await deliverOutboxEmail(deps.db, deps.email, outboxId)
    const item = await queryListItem(deps.db, ticketId)
    return context.json({ ticket: item, notification: { outboxId, channel, status: notificationStatus } })
  })

  // 2.8 取消：非终态可取消。
  app.post('/api/tickets/:ticketId/cancel', async (context: Context) => {
    const company = await requireCompanyContext(deps.db, currentAuthUser(context))
    const ticketId = parseTicketId(context.req.param('ticketId'))
    const ticket = await loadActionTicket(deps.db, ticketId, company)
    if (ticket.status === 'completed' || ticket.status === 'cancelled') throw invalidState('工单已结束，无法取消')
    const reader = new BodyReader(await context.req.json().catch(() => null))
    const reason = reader.string('reason', { min: 0, max: 500 })
    if (reader.issues.length > 0) throw validationFailed(reader.issues)

    const now = new Date().toISOString()
    await deps.db.transaction(async (tx) => {
      await tx.run({
        text: "UPDATE tickets SET status = 'cancelled', cancel_reason = ? WHERE id = ?",
        params: [reason, ticketId],
      })
      await recorderFor(deps, company, now)({
        type: 'ticket.cancelled',
        ticketId,
        ticketNo: ticket.ticket_no,
        detail: `取消工单 ${ticket.ticket_no}${reason ? `（原因：${reason}）` : ''}`,
      })
    })
    const item = await queryListItem(deps.db, ticketId)
    return context.json(item)
  })

  // 2.9 满意度评价：仅提交人本人、仅完成态、一单一评。
  app.post('/api/tickets/:ticketId/rating', async (context: Context) => {
    const company = await requireCompanyContext(deps.db, currentAuthUser(context))
    const ticketId = parseTicketId(context.req.param('ticketId'))
    const ticket = await loadActionTicket(deps.db, ticketId, company)
    if (ticket.status !== 'completed') throw invalidState('仅已完成工单可评价')
    if (ticket.submitter_no !== company.userNo) {
      throw new ApiError(403, 'NOT_SUBMITTER', '仅提交人可评价该工单')
    }
    const reader = new BodyReader(await context.req.json().catch(() => null))
    const score = reader.number('score', { required: true, min: 1, max: 5 })
    const comment = reader.string('comment', { min: 0, max: 500 })
    if (reader.issues.length > 0) throw validationFailed(reader.issues)

    const existing = await deps.db.queryOne<{ id: number }>({
      text: 'SELECT id FROM ticket_ratings WHERE ticket_id = ?',
      params: [ticketId],
    })
    if (existing) {
      throw new ApiError(409, 'RATING_EXISTS', '该工单已有评价')
    }

    const now = new Date().toISOString()
    await deps.db.transaction(async (tx) => {
      await tx.run({
        text: 'INSERT INTO ticket_ratings (ticket_id, submitter_no, score, comment, rated_at) VALUES (?, ?, ?, ?, ?)',
        params: [ticketId, company.userNo, score, comment, now],
      })
      await recorderFor(deps, company, now)({
        type: 'ticket.rated',
        ticketId,
        ticketNo: ticket.ticket_no,
        detail: `提交人评价工单 ${ticket.ticket_no}：${score} 分${comment ? `（${comment}）` : ''}`,
      })
    })
    return context.json({ score, comment, ratedAt: now }, 201)
  })
}
