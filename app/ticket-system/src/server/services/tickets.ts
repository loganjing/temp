import type { DbClient } from '@commonapp/dbkit'
import { ApiError, forbidden, invalidState, notFound, validationFailed } from '../api-error'
import {
  CANCELLABLE_TICKET_STATUSES,
  PRIORITIES,
  REPLYABLE_TICKET_STATUSES,
  type Priority,
  type Role,
  type TicketDetail,
  type TicketListResponse,
  type TicketRatingResponse,
  type TicketStatus,
  type SubmitterView,
  type TicketSummary,
} from '../../shared/tickets'
import type { AuditService } from '../platform/audit'
import type { NotificationService } from '../platform/email'
import { assertTicketVisible, requireHandlerOrOps, type Actor } from './actor'

type TicketRow = {
  id: number
  ticket_no: string
  subject: string
  description: string
  category: string
  priority: Priority
  status: TicketStatus
  company_id: number
  company_name: string
  submitter_user_id: string
  submitter_name: string
  submitter_department: string | null
  submitter_email: string
  created_at: string
  assigned_group_id: number | null
  assigned_group_name: string | null
  assigned_handler_id: string | null
  handled_by: string | null
  handled_by_name: string | null
  handled_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  cancel_reason: string | null
}

type ReplyRow = { id: number; author_user_id: string; author_name: string; content: string; created_at: string }
type RatingRow = { ticket_id: number; score: number; comment: string | null; created_at: string }

export type CreateTicketInput = {
  subject: string
  description: string
  category: string
  priority: Priority
}

export type ListTicketsQuery = {
  scope: 'mine' | 'workbench'
  statuses: TicketStatus[] | null
  category: string | null
  priority: Priority | null
  companyId: number | null
  search: string | null
  sort: 'created_at' | 'priority'
  order: 'asc' | 'desc'
  page: number
  pageSize: number
}

export type ReplyInput = { content: string }
export type AssignInput = { groupId: number; handlerId: string | null }
export type TransferInput = { toGroupId: number; toHandlerId: string | null; reason: string | null }
export type CompleteInput = { resolution: string | null }
export type CancelInput = { reason: string | null }
export type RatingInput = { score: number; comment: string | null }

const SELECT_TICKET = `
  SELECT t.id, t.ticket_no, t.subject, t.description, t.category, t.priority, t.status,
         t.company_id, c.name AS company_name,
         t.submitter_user_id, t.submitter_name, t.submitter_department, t.submitter_email, t.created_at,
         t.assigned_group_id, bg.name AS assigned_group_name, t.assigned_handler_id,
         t.handled_by, hp.display_name AS handled_by_name, t.handled_at,
         t.completed_at, t.cancelled_at, t.cancel_reason
  FROM tickets t
  JOIN companies c ON c.id = t.company_id
  LEFT JOIN business_groups bg ON bg.id = t.assigned_group_id
  LEFT JOIN user_profiles hp ON hp.user_id = t.handled_by
`

const toSummary = (row: TicketRow): TicketSummary => ({
  id: row.id,
  ticket_no: row.ticket_no,
  subject: row.subject,
  category: row.category,
  priority: row.priority,
  status: row.status,
  company_id: row.company_id,
  company_name: row.company_name,
  submitter_name: row.submitter_name,
  created_at: row.created_at,
  assigned_group_id: row.assigned_group_id,
  assigned_group_name: row.assigned_group_name,
  assigned_handler_id: row.assigned_handler_id,
  handled_at: row.handled_at,
})

export function createTicketService(db: DbClient, deps: { audit: AuditService; notify: NotificationService }) {
  const nowIso = () => new Date().toISOString()

  const loadTicket = async (ticketId: number): Promise<TicketRow> => {
    const row = await db.queryOne<TicketRow>({ text: `${SELECT_TICKET} WHERE t.id = ?`, params: [ticketId] })
    if (!row) throw notFound('工单不存在')
    return row
  }

  const loadDetail = async (row: TicketRow): Promise<TicketDetail> => {
    const [replies, rating] = await Promise.all([
      db.queryAll<ReplyRow>({
        text: 'SELECT id, author_user_id, author_name, content, created_at FROM ticket_replies WHERE ticket_id = ? ORDER BY id',
        params: [row.id],
      }),
      db.queryOne<RatingRow>({ text: 'SELECT ticket_id, score, comment, created_at FROM ticket_ratings WHERE ticket_id = ?', params: [row.id] }),
    ])
    return {
      ...toSummary(row),
      description: row.description,
      submitter_user_id: row.submitter_user_id,
      submitter_department: row.submitter_department,
      submitter_email: row.submitter_email,
      handled_by: row.handled_by,
      handled_by_name: row.handled_by_name,
      completed_at: row.completed_at,
      cancelled_at: row.cancelled_at,
      cancel_reason: row.cancel_reason,
      rating: rating ? { score: rating.score, comment: rating.comment, created_at: rating.created_at } : null,
      replies,
    }
  }

  // 数据域内的组/处理人目标校验：组须属工单公司（契约 400 GROUP_COMPANY_MISMATCH），
  // 处理人须属工单公司（数据完整性，VALIDATION_FAILED）。
  const assertGroupInTicketCompany = async (groupId: number, companyId: number): Promise<void> => {
    const group = await db.queryOne<{ id: number; company_id: number }>({
      text: 'SELECT id, company_id FROM business_groups WHERE id = ?',
      params: [groupId],
    })
    if (!group) throw notFound('业务组不存在')
    if (group.company_id !== companyId) throw new ApiError(400, 'GROUP_COMPANY_MISMATCH', '业务组不属于工单所在公司')
  }

  const assertHandlerInTicketCompany = async (handlerId: string, companyId: number, label: string): Promise<void> => {
    const profile = await db.queryOne<{ company_id: number }>({
      text: 'SELECT company_id FROM user_profiles WHERE user_id = ?',
      params: [handlerId],
    })
    if (!profile || profile.company_id !== companyId) throw validationFailed(`${label}须属于工单所在公司`)
  }

  // 创建（契约 7.1）：事务内生成 TKT-NNNNNN 序号并执行自动分配决策，
  // 命中规则 → in_progress（assigned_group_id），未命中 → pending_assignment。
  const createTicket = async (actor: Actor, input: CreateTicketInput): Promise<TicketDetail> => {
    const createdAt = nowIso()
    const ticketId = await db.transaction(async (tx) => {
      const rule = await tx.queryOne<{ id: number; group_id: number }>({
        text: 'SELECT id, group_id FROM assignment_rules WHERE company_id = ? AND category = ?',
        params: [actor.companyId, input.category],
      })
      const nextId = await tx.queryOne<{ next: number }>({ text: 'SELECT COALESCE(MAX(id), 0) + 1 AS next FROM tickets' })
      const ticketNo = `TKT-${String(nextId?.next ?? 1).padStart(6, '0')}`
      const status: TicketStatus = rule ? 'in_progress' : 'pending_assignment'
      await tx.run({
        text: `INSERT INTO tickets (ticket_no, subject, description, category, priority, status, company_id, submitter_user_id, submitter_name, submitter_department, submitter_email, created_at, assigned_group_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          ticketNo,
          input.subject,
          input.description,
          input.category,
          input.priority,
          status,
          actor.companyId,
          actor.userId,
          actor.displayName,
          actor.department,
          actor.email,
          createdAt,
          rule?.group_id ?? null,
        ],
      })
      const id = await tx.queryOne<{ id: number }>({ text: 'SELECT last_insert_rowid() AS id' })
      const ticketId = id?.id ?? 0
      await deps.audit.record(tx, {
        action: 'ticket.created',
        actorUserId: actor.userId,
        actorName: actor.displayName,
        ticketId,
        companyId: actor.companyId,
        details: { ticket_no: ticketNo, subject: input.subject, category: input.category, priority: input.priority },
      })
      if (rule) {
        await deps.audit.record(tx, {
          action: 'ticket.auto_assigned',
          actorUserId: actor.userId,
          actorName: actor.displayName,
          ticketId,
          companyId: actor.companyId,
          details: { rule_id: rule.id, group_id: rule.group_id, category: input.category },
        })
      }
      return ticketId
    })
    const row = await loadTicket(ticketId)
    return loadDetail(row)
  }

  const listTickets = async (actor: Actor, query: ListTicketsQuery): Promise<TicketListResponse> => {
    const conditions: string[] = []
    const params: unknown[] = []
    if (query.scope === 'mine') {
      conditions.push('t.submitter_user_id = ?')
      params.push(actor.userId)
    } else if (actor.role === 'ops') {
      if (query.companyId != null) {
        conditions.push('t.company_id = ?')
        params.push(query.companyId)
      }
    } else {
      // handler 工作台：强制本公司（服务端注入数据域，前端无法越域）。
      conditions.push('t.company_id = ?')
      params.push(actor.companyId)
    }
    if (query.statuses && query.statuses.length > 0) {
      conditions.push(`t.status IN (${query.statuses.map(() => '?').join(', ')})`)
      params.push(...query.statuses)
    }
    if (query.category) {
      conditions.push('t.category = ?')
      params.push(query.category)
    }
    if (query.priority) {
      conditions.push('t.priority = ?')
      params.push(query.priority)
    }
    if (query.search) {
      conditions.push('(t.ticket_no LIKE ? OR t.subject LIKE ? OR t.submitter_name LIKE ?)')
      params.push(`${query.search}%`, `%${query.search}%`, `%${query.search}%`)
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const priorityOrder = "CASE t.priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 WHEN 'P4' THEN 4 END"
    const primary = query.sort === 'priority' ? priorityOrder : 't.created_at'
    const offset = (query.page - 1) * query.pageSize
    const [rows, totalRow] = await Promise.all([
      db.queryAll<TicketRow>({
        text: `${SELECT_TICKET} ${where} ORDER BY ${primary} ${query.order}, t.id ${query.order} LIMIT ? OFFSET ?`,
        params: [...params, query.pageSize, offset],
      }),
      db.queryOne<{ total: number }>({ text: `SELECT COUNT(*) AS total FROM tickets t ${where}`, params }),
    ])
    return { items: rows.map(toSummary), page: query.page, page_size: query.pageSize, total: totalRow?.total ?? 0 }
  }

  const getTicketDetail = async (actor: Actor, ticketId: number): Promise<TicketDetail> => {
    const row = await loadTicket(ticketId)
    assertTicketVisible(actor, row)
    return loadDetail(row)
  }

  // 域内可见性预检（契约第 5 节）：公司隔离 404 优先于请求体验证，
  // 避免跨公司探测通过 4xx 差异判断工单存在性。
  const requireTicketScope = async (actor: Actor, ticketId: number): Promise<void> => {
    assertTicketVisible(actor, await loadTicket(ticketId))
  }

  // 多轮回复（契约 7.4）：权限 = 工单可见域（提交人/本公司 handler/ops）。
  const replyTicket = async (actor: Actor, ticketId: number, input: ReplyInput): Promise<ReplyRow> => {
    const row = await loadTicket(ticketId)
    assertTicketVisible(actor, row)
    if (!REPLYABLE_TICKET_STATUSES.includes(row.status)) throw invalidState('终态工单不可回复')
    const createdAt = nowIso()
    const replyId = await db.transaction(async (tx) => {
      await tx.run({
        text: 'INSERT INTO ticket_replies (ticket_id, author_user_id, author_name, content, created_at) VALUES (?, ?, ?, ?, ?)',
        params: [ticketId, actor.userId, actor.displayName, input.content, createdAt],
      })
      const idRow = await tx.queryOne<{ id: number }>({ text: 'SELECT last_insert_rowid() AS id' })
      await deps.audit.record(tx, {
        action: 'ticket.replied',
        actorUserId: actor.userId,
        actorName: actor.displayName,
        ticketId,
        companyId: row.company_id,
        details: { content_preview: input.content.slice(0, 80) },
      })
      return idRow?.id ?? 0
    })
    const reply = await db.queryOne<ReplyRow>({
      text: 'SELECT id, author_user_id, author_name, content, created_at FROM ticket_replies WHERE id = ?',
      params: [replyId],
    })
    if (!reply) throw new ApiError(500, 'INTERNAL_ERROR', '回复写入失败')
    return reply
  }

  // 手动分配（契约 7.5）：pending_assignment → in_progress。
  const assignTicket = async (actor: Actor, ticketId: number, input: AssignInput): Promise<TicketDetail> => {
    const row = await loadTicket(ticketId)
    assertTicketVisible(actor, row)
    requireHandlerOrOps(actor)
    if (row.status !== 'pending_assignment') throw invalidState('仅待分配工单可手动分配')
    await assertGroupInTicketCompany(input.groupId, row.company_id)
    if (input.handlerId != null) await assertHandlerInTicketCompany(input.handlerId, row.company_id, '处理人')
    await db.transaction(async (tx) => {
      await tx.run({
        text: "UPDATE tickets SET assigned_group_id = ?, assigned_handler_id = ?, status = 'in_progress' WHERE id = ?",
        params: [input.groupId, input.handlerId, ticketId],
      })
      await deps.audit.record(tx, {
        action: 'ticket.assigned',
        actorUserId: actor.userId,
        actorName: actor.displayName,
        ticketId,
        companyId: row.company_id,
        details: { group_id: input.groupId, handler_id: input.handlerId },
      })
    })
    return loadDetail(await loadTicket(ticketId))
  }

  // 转派（契约 7.6）：in_progress 保持不变，归属变更，审计含 from/to/reason。
  const transferTicket = async (actor: Actor, ticketId: number, input: TransferInput): Promise<TicketDetail> => {
    const row = await loadTicket(ticketId)
    assertTicketVisible(actor, row)
    requireHandlerOrOps(actor)
    if (row.status !== 'in_progress') throw invalidState('仅待处理工单可转派')
    await assertGroupInTicketCompany(input.toGroupId, row.company_id)
    if (input.toHandlerId != null) await assertHandlerInTicketCompany(input.toHandlerId, row.company_id, '转派处理人')
    await db.transaction(async (tx) => {
      await tx.run({
        text: 'UPDATE tickets SET assigned_group_id = ?, assigned_handler_id = ? WHERE id = ?',
        params: [input.toGroupId, input.toHandlerId, ticketId],
      })
      await deps.audit.record(tx, {
        action: 'ticket.transferred',
        actorUserId: actor.userId,
        actorName: actor.displayName,
        ticketId,
        companyId: row.company_id,
        details: {
          from_group_id: row.assigned_group_id,
          to_group_id: input.toGroupId,
          from_handler_id: row.assigned_handler_id,
          to_handler_id: input.toHandlerId,
          reason: input.reason ?? null,
        },
      })
    })
    return loadDetail(await loadTicket(ticketId))
  }

  // 完成处理（契约 7.7）：事务内记录处理人/处理时间/完成时间、追加 resolution 回复；
  // 事务提交后 best-effort 邮件通知，结果写审计，不改变完成状态。
  const completeTicket = async (actor: Actor, ticketId: number, input: CompleteInput): Promise<TicketDetail> => {
    const row = await loadTicket(ticketId)
    assertTicketVisible(actor, row)
    requireHandlerOrOps(actor)
    if (row.status !== 'in_progress') throw invalidState('仅待处理工单可完成')
    const completedAt = nowIso()
    await db.transaction(async (tx) => {
      await tx.run({
        text: "UPDATE tickets SET status = 'completed', handled_by = ?, handled_at = ?, completed_at = ? WHERE id = ?",
        params: [actor.userId, completedAt, completedAt, ticketId],
      })
      if (input.resolution && input.resolution.trim() !== '') {
        await tx.run({
          text: 'INSERT INTO ticket_replies (ticket_id, author_user_id, author_name, content, created_at) VALUES (?, ?, ?, ?, ?)',
          params: [ticketId, actor.userId, actor.displayName, input.resolution, completedAt],
        })
      }
      await deps.audit.record(tx, {
        action: 'ticket.completed',
        actorUserId: actor.userId,
        actorName: actor.displayName,
        ticketId,
        companyId: row.company_id,
        details: { resolution: input.resolution ?? null, completed_at: completedAt },
      })
    })
    const completed = await loadTicket(ticketId)
    const notification = await deps.notify.sendCompletionNotification({
      ticketNo: completed.ticket_no,
      subject: completed.subject,
      category: completed.category,
      priority: completed.priority,
      submitterEmail: completed.submitter_email,
      handlerName: actor.displayName,
      completedAt,
      resolution: input.resolution,
    })
    await deps.audit.record(db, {
      action: notification.ok ? 'email.notification_sent' : 'email.notification_failed',
      actorUserId: actor.userId,
      actorName: actor.displayName,
      ticketId,
      companyId: row.company_id,
      details: {
        to: completed.submitter_email,
        ...(notification.ok ? { message_id: notification.messageId ?? null } : { reason: notification.reason }),
      },
    })
    return loadDetail(completed)
  }

  // 取消（契约 7.8）：提交人或 ops；非终态可取消。
  const cancelTicket = async (actor: Actor, ticketId: number, input: CancelInput): Promise<TicketDetail> => {
    const row = await loadTicket(ticketId)
    assertTicketVisible(actor, row)
    if (actor.role !== 'ops' && row.submitter_user_id !== actor.userId) throw forbidden('仅工单提交人或运营可取消工单')
    if (!CANCELLABLE_TICKET_STATUSES.includes(row.status)) throw invalidState('终态工单不可取消')
    const cancelledAt = nowIso()
    await db.transaction(async (tx) => {
      await tx.run({
        text: "UPDATE tickets SET status = 'cancelled', cancelled_at = ?, cancel_reason = ? WHERE id = ?",
        params: [cancelledAt, input.reason, ticketId],
      })
      await deps.audit.record(tx, {
        action: 'ticket.cancelled',
        actorUserId: actor.userId,
        actorName: actor.displayName,
        ticketId,
        companyId: row.company_id,
        details: { reason: input.reason ?? null },
      })
    })
    return loadDetail(await loadTicket(ticketId))
  }

  // 满意度评价（契约 7.9）：仅提交人，完成后一次。
  const rateTicket = async (actor: Actor, ticketId: number, input: RatingInput): Promise<TicketRatingResponse> => {
    const row = await loadTicket(ticketId)
    assertTicketVisible(actor, row)
    if (row.submitter_user_id !== actor.userId) throw forbidden('仅工单提交人可评价')
    if (row.status !== 'completed') throw invalidState('仅已完成工单可评价')
    const existing = await db.queryOne<{ ticket_id: number }>({ text: 'SELECT ticket_id FROM ticket_ratings WHERE ticket_id = ?', params: [ticketId] })
    if (existing) throw new ApiError(409, 'ALREADY_RATED', '该工单已评价')
    const createdAt = nowIso()
    await db.transaction(async (tx) => {
      await tx.run({
        text: 'INSERT INTO ticket_ratings (ticket_id, score, comment, created_at) VALUES (?, ?, ?, ?)',
        params: [ticketId, input.score, input.comment, createdAt],
      })
      await deps.audit.record(tx, {
        action: 'ticket.rated',
        actorUserId: actor.userId,
        actorName: actor.displayName,
        ticketId,
        companyId: row.company_id,
        details: { score: input.score, comment: input.comment ?? null },
      })
    })
    return { ticket_id: ticketId, score: input.score, comment: input.comment, created_at: createdAt }
  }

  // 提交人完整视图（契约 7.10）：历史工单按创建时间倒序，均属提交人所在公司。
  const getSubmitterView = async (actor: Actor, ticketId: number): Promise<SubmitterView> => {
    const row = await loadTicket(ticketId)
    assertTicketVisible(actor, row)
    const submitter = await db.queryOne<{
      user_id: string
      email: string
      display_name: string
      department: string | null
      company_id: number
      company_name: string
    }>({
      text: `SELECT p.user_id, u.email, p.display_name, p.department, p.company_id, c.name AS company_name
             FROM user_profiles p JOIN users u ON u.id = p.user_id JOIN companies c ON c.id = p.company_id
             WHERE p.user_id = ?`,
      params: [row.submitter_user_id],
    })
    if (!submitter) throw notFound('提交人档案不存在')
    const history = await db.queryAll<{
      ticket_no: string
      subject: string
      status: TicketStatus
      priority: Priority
      created_at: string
    }>({
      text: 'SELECT ticket_no, subject, status, priority, created_at FROM tickets WHERE submitter_user_id = ? ORDER BY created_at DESC, id DESC',
      params: [submitter.user_id],
    })
    return {
      user_id: submitter.user_id,
      display_name: submitter.display_name,
      email: submitter.email,
      company: { id: submitter.company_id, name: submitter.company_name },
      department: submitter.department,
      history,
    }
  }

  return {
    createTicket,
    listTickets,
    getTicketDetail,
    requireTicketScope,
    replyTicket,
    assignTicket,
    transferTicket,
    completeTicket,
    cancelTicket,
    rateTicket,
    getSubmitterView,
  }
}

export type TicketService = ReturnType<typeof createTicketService>
