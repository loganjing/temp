import type { Hono } from 'hono'
import type { DbClient } from '@commonapp/dbkit'
import type { Priority, TicketHistoryItem, TicketStatus } from '../../shared/contract'
import { PRIORITIES } from '../../shared/contract'
import { apiError } from '../api-error'
import { newId, newTicketId } from '../ids'
import { optionalString, readJson, requireEnum, requireString } from '../request'
import { findRuleForCategory } from './assignment'
import { listTicketTransfers } from './collaboration'
import { findTicketEvaluation } from './evaluation'
import { findUsersByIds, requireUser, upsertSubmitterByEmail } from './organizations'
import { requireTicket, requireTicketRow } from './ticket-store'

// ticketing：工单创建、查询、详情、多轮回复（架构基线 2.2）。
// 独占 tickets / ticket_replies 表；提交人历史工单按提交人过滤 tickets，数据归属 ticketing，故路由注册于此。

interface ReplyRow {
  id: string
  author_id: string
  content: string
  created_at: string
}

interface TicketListRow {
  id: string
  subject: string
  status: string
  priority: string
  category: string
  submitter_id: string
  assigned_group_id: string | null
  created_at: string
}

export function registerTicketingRoutes(app: Hono, db: DbClient) {
  app.post('/api/tickets', async (c) => {
    const body = await readJson(c)
    const operatorId = requireString(body, 'operatorId')
    const subject = requireString(body, 'subject', 200)
    const description = requireString(body, 'description')
    const category = requireString(body, 'category')
    const priority = requireEnum(body, 'priority', PRIORITIES)
    const submitterInput = body.submitter
    if (!submitterInput || typeof submitterInput !== 'object' || Array.isArray(submitterInput)) {
      throw apiError.validation('提交人信息不能为空')
    }
    const submitter = submitterInput as Record<string, unknown>
    const submitterName = requireString(submitter, 'name')
    const submitterEmail = requireString(submitter, 'email')
    const submitterDepartment = optionalString(submitter, 'department')

    const operator = await requireUser(db, operatorId, '操作者')
    const ticket = await db.transaction(async (tx) => {
      // 提交人按邮箱归并/新建（AD-3），公司上下文取操作者所属公司。
      const submitterUser = await upsertSubmitterByEmail(tx, {
        name: submitterName,
        email: submitterEmail,
        department: submitterDepartment,
        companyId: operator.company_id,
      })
      // 同一事务内评估自动分配规则：命中则归属规则业务组并进入待处理，否则停留待分配。
      const rule = await findRuleForCategory(tx, operator.company_id, category)
      const id = newTicketId()
      const createdAt = new Date().toISOString()
      await tx.run({
        text: `INSERT INTO tickets (id, subject, description, category, priority, status, submitter_id, company_id, assigned_group_id, handler_id, handled_at, cancelled_at, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)`,
        params: [
          id,
          subject,
          description,
          category,
          priority,
          rule ? 'pending_handling' : 'pending_assignment',
          submitterUser.id,
          operator.company_id,
          rule?.group_id ?? null,
          createdAt,
          createdAt,
        ],
      })
      return requireTicket(tx, id)
    })
    return c.json(ticket, 201)
  })

  app.get('/api/tickets', async (c) => {
    const conditions: string[] = []
    const params: unknown[] = []
    const filters: Array<[string | undefined, string]> = [
      [c.req.query('companyId'), 't.company_id = ?'],
      [c.req.query('status'), 't.status = ?'],
      [c.req.query('category'), 't.category = ?'],
      [c.req.query('submitterId'), 't.submitter_id = ?'],
      [c.req.query('groupId'), 't.assigned_group_id = ?'],
    ]
    for (const [value, condition] of filters) {
      if (value) {
        conditions.push(condition)
        params.push(value)
      }
    }
    const keyword = c.req.query('keyword')
    if (keyword) {
      conditions.push('t.subject LIKE ?')
      params.push(`%${keyword}%`)
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const rows = await db.queryAll<TicketListRow>({
      text: `SELECT id, subject, status, priority, category, submitter_id, assigned_group_id, created_at
             FROM tickets t ${where} ORDER BY created_at DESC`,
      params,
    })
    const submitters = await findUsersByIds(db, rows.map((row) => row.submitter_id))
    return c.json({
      tickets: rows.map((row) => ({
        id: row.id,
        subject: row.subject,
        status: row.status as TicketStatus,
        priority: row.priority as Priority,
        category: row.category,
        submitterName: submitters.get(row.submitter_id)?.name ?? '',
        assignedGroupId: row.assigned_group_id,
        createdAt: row.created_at,
      })),
    })
  })

  app.get('/api/tickets/:id', async (c) => {
    const ticket = await requireTicket(db, c.req.param('id'))
    const [replyRows, transfers, evaluation] = await Promise.all([
      db.queryAll<ReplyRow>({
        text: 'SELECT id, author_id, content, created_at FROM ticket_replies WHERE ticket_id = ? ORDER BY created_at ASC',
        params: [ticket.id],
      }),
      listTicketTransfers(db, ticket.id),
      findTicketEvaluation(db, ticket.id),
    ])
    const authors = await findUsersByIds(db, replyRows.map((row) => row.author_id))
    return c.json({
      ticket,
      replies: replyRows.map((row) => ({
        id: row.id,
        authorId: row.author_id,
        authorName: authors.get(row.author_id)?.name ?? '',
        content: row.content,
        createdAt: row.created_at,
      })),
      transfers,
      evaluation,
    })
  })

  app.post('/api/tickets/:id/replies', async (c) => {
    const body = await readJson(c)
    const operatorId = requireString(body, 'operatorId')
    const content = requireString(body, 'content')
    const operator = await requireUser(db, operatorId, '操作者')
    const ticket = await requireTicketRow(db, c.req.param('id'))
    if (ticket.status === 'cancelled') throw apiError.invalidState('已取消的工单不能回复')
    const id = newId()
    const createdAt = new Date().toISOString()
    await db.run({
      text: 'INSERT INTO ticket_replies (id, ticket_id, author_id, content, created_at) VALUES (?, ?, ?, ?, ?)',
      params: [id, ticket.id, operator.id, content, createdAt],
    })
    return c.json({ id, ticketId: ticket.id, authorId: operator.id, content, createdAt }, 201)
  })

  app.get('/api/users/:id/tickets', async (c) => {
    const user = await requireUser(db, c.req.param('id'))
    const rows = await db.queryAll<{ id: string; subject: string; status: string; priority: string; created_at: string }>({
      text: 'SELECT id, subject, status, priority, created_at FROM tickets WHERE submitter_id = ? ORDER BY created_at DESC',
      params: [user.id],
    })
    const tickets: TicketHistoryItem[] = rows.map((row) => ({
      id: row.id,
      subject: row.subject,
      status: row.status as TicketStatus,
      priority: row.priority as Priority,
      createdAt: row.created_at,
    }))
    return c.json({ tickets })
  })
}
