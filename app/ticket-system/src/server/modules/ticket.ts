/**
 * ticket 模块：工单创建（事务内分类自动分配）、列表/工作台、详情、多轮回复、取消与提交人完整信息（契约第 3 节）。
 */
import type { Hono } from 'hono'
import { ACTIVE_TICKET_STATUSES, isTicketCategory, isTicketPriority, isTicketStatus } from '../../shared/domain'
import type { PlatformResources } from '../platform/bootstrap'
import { recordTicketAudit } from '../audit-log'
import {
  ApiError,
  currentProfile,
  pathId,
  requiredString,
  resolveCompanyFilter,
  route,
} from '../http'
import type { ProfileContext } from '../profile'
import {
  assembleReplies,
  assembleTickets,
  loadUserBrief,
  TICKET_COLUMNS,
  type ReplyRow,
  type TicketRow,
} from '../views'

async function loadTicket(db: PlatformResources['db'], ticketId: number): Promise<TicketRow> {
  const row = await db.queryOne<TicketRow>({
    text: `SELECT ${TICKET_COLUMNS} FROM tickets WHERE id = ?`,
    params: [ticketId],
  })
  if (!row) throw new ApiError(404, 'NOT_FOUND', '工单不存在')
  return row
}

/** 工单公司隔离：写操作一律本公司；跨公司读仅 crossCompanyView 放行。 */
function assertTicketCompany(ticket: TicketRow, me: ProfileContext, crossRead: boolean): void {
  if (ticket.company_id === me.companyId) return
  if (crossRead && me.crossCompanyView) return
  throw new ApiError(403, 'COMPANY_FORBIDDEN', '无权访问其他公司的工单')
}

const TICKET_SORTS = {
  createdAt: 't.created_at, t.id',
  priority: "CASE t.priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 WHEN 'P4' THEN 4 ELSE 9 END, t.id",
  status: 't.status, t.id',
  firstReplyAt: 'CASE WHEN t.first_reply_at IS NULL THEN 1 ELSE 0 END ASC, t.first_reply_at, t.id',
} as const

function orderByClause(sort: keyof typeof TICKET_SORTS, order: 'asc' | 'desc'): string {
  const columns = TICKET_SORTS[sort].split(', ')
  return columns
    .map((column) => (column.endsWith(' ASC') ? column : `${column} ${order.toUpperCase()}`))
    .join(', ')
}

export function registerTicketRoutes(app: Hono, platform: PlatformResources): void {
  const { db, audit } = platform

  // 契约 3.1：创建工单。单事务内写入并执行本公司"分类 → 业务组"规则匹配。
  app.post(
    '/api/tickets',
    route(async (context) => {
      const me = await currentProfile(db, context)
      const body = (await context.req.json().catch(() => ({}))) as Record<string, unknown>
      const subject = requiredString(body.subject, '主题', 200)
      const description = requiredString(body.description, '描述', 20000)
      if (!isTicketCategory(body.category) || !isTicketPriority(body.priority)) {
        throw new ApiError(400, 'VALIDATION_ERROR', '分类或优先级取值不合法')
      }
      const category = body.category as string
      const priority = body.priority as string
      const ticket = await db.transaction(async (tx) => {
        const now = new Date().toISOString()
        const inserted = await tx.queryOne<TicketRow>({
          text: `INSERT INTO tickets (company_id, subject, description, category, priority, status, submitter_user_id, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, 'created', ?, ?, ?) RETURNING ${TICKET_COLUMNS}`,
          params: [me.companyId, subject, description, category, priority, me.profileId, now, now],
        })
        if (!inserted) throw new ApiError(500, 'INTERNAL_ERROR', '工单创建失败')
        const rule = await tx.queryOne<{ target_group_id: number; group_name: string }>({
          text: `SELECT r.target_group_id, g.name AS group_name
                 FROM assignment_rules r JOIN groups g ON g.id = r.target_group_id
                 WHERE r.company_id = ? AND r.category = ?`,
          params: [me.companyId, category],
        })
        const finalRow = rule
          ? await tx.queryOne<TicketRow>({
              text: `UPDATE tickets SET assigned_group_id = ?, status = 'pending_processing', updated_at = ? WHERE id = ? RETURNING ${TICKET_COLUMNS}`,
              params: [rule.target_group_id, now, inserted.id],
            })
          : await tx.queryOne<TicketRow>({
              text: `UPDATE tickets SET status = 'pending_assignment', updated_at = ? WHERE id = ? RETURNING ${TICKET_COLUMNS}`,
              params: [now, inserted.id],
            })
        await recordTicketAudit(audit, {
          action: 'ticket_created',
          actorPlatformUserId: me.platformUserId,
          ticketId: inserted.id,
          companyId: me.companyId,
          detail: `创建工单 #${inserted.id}「${subject}」`,
        })
        if (rule) {
          await recordTicketAudit(audit, {
            action: 'ticket_assigned',
            actorPlatformUserId: me.platformUserId,
            ticketId: inserted.id,
            companyId: me.companyId,
            detail: `按分类「${category}」规则自动分配到业务组「${rule.group_name}」`,
          })
        }
        return finalRow ?? inserted
      })
      const [dto] = await assembleTickets(db, [ticket])
      return context.json(dto, 201)
    }),
  )

  // 契约 3.2：列表 / 工作台。
  app.get(
    '/api/tickets',
    route(async (context) => {
      const me = await currentProfile(db, context)
      const query = context.req.query()
      const scope = query.scope ?? 'workbench'
      if (scope !== 'workbench' && scope !== 'mine') throw new ApiError(400, 'VALIDATION_ERROR', 'scope 取值不合法')
      const companyId = resolveCompanyFilter(context, me)
      const sortRaw = query.sort ?? 'createdAt'
      if (sortRaw !== 'createdAt' && sortRaw !== 'priority' && sortRaw !== 'status' && sortRaw !== 'firstReplyAt') {
        throw new ApiError(400, 'VALIDATION_ERROR', 'sort 取值不合法')
      }
      const sort = sortRaw as keyof typeof TICKET_SORTS
      let order: 'asc' | 'desc' = 'desc'
      if (query.order !== undefined && query.order !== '') {
        if (query.order !== 'asc' && query.order !== 'desc') throw new ApiError(400, 'VALIDATION_ERROR', 'order 取值不合法')
        order = query.order
      }
      const pageRaw = query.page
      const pageSizeRaw = query.pageSize
      const page = pageRaw === undefined || pageRaw === '' ? 1 : Number(pageRaw)
      const pageSize = pageSizeRaw === undefined || pageSizeRaw === '' ? 20 : Number(pageSizeRaw)
      if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'page 或 pageSize 取值不合法')
      }

      const conditions: string[] = []
      const params: unknown[] = []
      if (scope === 'mine') {
        conditions.push('t.submitter_user_id = ?')
        params.push(me.profileId)
      } else {
        conditions.push('t.company_id = ?')
        params.push(companyId)
      }
      const status = query.status ?? (scope === 'workbench' ? 'pending_processing' : '')
      if (status !== '') {
        if (!isTicketStatus(status)) throw new ApiError(400, 'VALIDATION_ERROR', 'status 取值不合法')
        conditions.push('t.status = ?')
        params.push(status)
      }
      if (query.category !== undefined && query.category !== '') {
        conditions.push('t.category = ?')
        params.push(query.category)
      }
      if (query.priority !== undefined && query.priority !== '') {
        if (!isTicketPriority(query.priority)) throw new ApiError(400, 'VALIDATION_ERROR', 'priority 取值不合法')
        conditions.push('t.priority = ?')
        params.push(query.priority)
      }
      const groupIdRaw = query.groupId
      if (groupIdRaw !== undefined && groupIdRaw !== '') {
        const groupId = Number(groupIdRaw)
        if (!Number.isInteger(groupId) || groupId < 1) throw new ApiError(400, 'VALIDATION_ERROR', 'groupId 取值不合法')
        conditions.push('t.assigned_group_id = ?')
        params.push(groupId)
      }
      if (query.q !== undefined && query.q.trim() !== '') {
        const keyword = `%${query.q.trim().toLowerCase()}%`
        conditions.push('(LOWER(t.subject) LIKE ? OR LOWER(t.description) LIKE ? OR CAST(t.id AS TEXT) LIKE ?)')
        params.push(keyword, keyword, keyword)
      }
      const where = `WHERE ${conditions.join(' AND ')}`
      const total = await db.queryOne<{ total: number }>({
        text: `SELECT COUNT(*) AS total FROM tickets t ${where}`,
        params,
      })
      const rows = await db.queryAll<TicketRow>({
        text: `SELECT ${TICKET_COLUMNS.replace(/(^|, )/g, '$1t.')} FROM tickets t ${where} ORDER BY ${orderByClause(sort, order)} LIMIT ? OFFSET ?`,
        params: [...params, pageSize, (page - 1) * pageSize],
      })
      const items = await assembleTickets(db, rows)
      return context.json({ items, total: Number(total?.total ?? 0), page, pageSize })
    }),
  )

  // 契约 3.3：工单详情（含回复与评价）。
  app.get(
    '/api/tickets/:id',
    route(async (context) => {
      const me = await currentProfile(db, context)
      const ticket = await loadTicket(db, pathId(context.req.param('id')))
      assertTicketCompany(ticket, me, true)
      const replies = await db.queryAll<ReplyRow>({
        text: 'SELECT id, ticket_id, replier_user_id, content, created_at FROM ticket_replies WHERE ticket_id = ? ORDER BY created_at ASC, id ASC',
        params: [ticket.id],
      })
      const rating = await db.queryOne<{ score: number; created_at: string }>({
        text: 'SELECT score, created_at FROM ticket_ratings WHERE ticket_id = ?',
        params: [ticket.id],
      })
      const [dto] = await assembleTickets(db, [ticket])
      return context.json({
        ticket: dto,
        replies: await assembleReplies(db, replies),
        rating: rating ? { score: rating.score, createdAt: rating.created_at } : null,
      })
    }),
  )

  // 契约 3.4：多轮回复；首次回复写入 first_reply_at（响应时间口径锚点）。
  app.post(
    '/api/tickets/:id/replies',
    route(async (context) => {
      const me = await currentProfile(db, context)
      const ticket = await loadTicket(db, pathId(context.req.param('id')))
      assertTicketCompany(ticket, me, false)
      if (!(ACTIVE_TICKET_STATUSES as readonly string[]).includes(ticket.status)) {
        throw new ApiError(409, 'STATE_CONFLICT', '工单已结束，无法回复')
      }
      const body = (await context.req.json().catch(() => ({}))) as Record<string, unknown>
      const content = requiredString(body.content, '回复内容', 5000)
      const reply = await db.transaction(async (tx) => {
        const now = new Date().toISOString()
        const created = await tx.queryOne<ReplyRow>({
          text: 'INSERT INTO ticket_replies (ticket_id, replier_user_id, content, created_at) VALUES (?, ?, ?, ?) RETURNING id, ticket_id, replier_user_id, content, created_at',
          params: [ticket.id, me.profileId, content, now],
        })
        await tx.run({
          text: 'UPDATE tickets SET first_reply_at = COALESCE(first_reply_at, ?), updated_at = ? WHERE id = ?',
          params: [now, now, ticket.id],
        })
        await recordTicketAudit(audit, {
          action: 'ticket_replied',
          actorPlatformUserId: me.platformUserId,
          ticketId: ticket.id,
          companyId: ticket.company_id,
          detail: `回复工单 #${ticket.id}`,
        })
        return created
      })
      if (!reply) throw new ApiError(500, 'INTERNAL_ERROR', '回复写入失败')
      const [dto] = await assembleReplies(db, [reply])
      return context.json(dto, 201)
    }),
  )

  // 契约 3.5：取消（完成前任意活跃状态）。
  app.post(
    '/api/tickets/:id/cancel',
    route(async (context) => {
      const me = await currentProfile(db, context)
      const ticket = await loadTicket(db, pathId(context.req.param('id')))
      assertTicketCompany(ticket, me, false)
      if (ticket.status === 'completed') throw new ApiError(409, 'STATE_CONFLICT', '工单已完成，无法取消')
      if (ticket.status === 'cancelled') throw new ApiError(409, 'STATE_CONFLICT', '工单已取消')
      const cancelled = await db.transaction(async (tx) => {
        const now = new Date().toISOString()
        const row = await tx.queryOne<TicketRow>({
          text: `UPDATE tickets SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE id = ? AND status IN ('created', 'pending_assignment', 'pending_processing') RETURNING ${TICKET_COLUMNS}`,
          params: [now, now, ticket.id],
        })
        if (!row) throw new ApiError(409, 'STATE_CONFLICT', '工单已结束，无法取消')
        await recordTicketAudit(audit, {
          action: 'ticket_cancelled',
          actorPlatformUserId: me.platformUserId,
          ticketId: ticket.id,
          companyId: ticket.company_id,
          detail: `取消工单 #${ticket.id}`,
        })
        return row
      })
      const [dto] = await assembleTickets(db, [cancelled])
      return context.json(dto)
    }),
  )

  // 契约 3.6：处理上下文（提交人完整信息与历史工单）；跨公司视角可读任意公司工单的该视图。
  app.get(
    '/api/tickets/:id/submitter',
    route(async (context) => {
      const me = await currentProfile(db, context)
      const ticket = await loadTicket(db, pathId(context.req.param('id')))
      assertTicketCompany(ticket, me, true)
      const submitter = await loadUserBrief(db, ticket.submitter_user_id)
      if (!submitter) throw new ApiError(404, 'NOT_FOUND', '提交人档案不存在')
      const history = await db.queryAll<{
        id: number
        subject: string
        status: string
        category: string
        priority: string
        created_at: string
      }>({
        text: 'SELECT id, subject, status, category, priority, created_at FROM tickets WHERE submitter_user_id = ? ORDER BY created_at DESC, id DESC',
        params: [ticket.submitter_user_id],
      })
      return context.json({
        name: submitter.displayName,
        email: submitter.email,
        companyName: submitter.companyName,
        departmentName: submitter.departmentName,
        historyTickets: history.map((item) => ({
          id: item.id,
          subject: item.subject,
          status: item.status,
          category: item.category,
          priority: item.priority,
          createdAt: item.created_at,
        })),
      })
    }),
  )
}
