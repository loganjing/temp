import { randomUUID } from 'node:crypto'
import type { DbClient, SqlStatement } from '@commonapp/dbkit'
import type { TicketDTO, TicketDetailDTO, TicketReplyDTO, EvaluationDTO, SubmitterInfoDTO, LogEntryDTO, UserRole } from '../../shared/types'
import { type ServiceContext, BusinessError, now } from './context'

type TicketRow = {
  id: string
  subject: string
  description: string
  category_id: string
  category_name: string
  priority: string
  status: string
  submitter_id: string
  submitter_name: string
  handler_id: string | null
  handler_name: string | null
  group_id: string | null
  group_name: string | null
  created_at: string
  completed_at: string | null
}

function toTicketDTO(row: TicketRow): TicketDTO {
  return {
    id: row.id,
    subject: row.subject,
    description: row.description,
    categoryId: row.category_id,
    categoryName: row.category_name,
    priority: row.priority as TicketDTO['priority'],
    status: row.status as TicketDTO['status'],
    submitterId: row.submitter_id,
    submitterName: row.submitter_name,
    handlerId: row.handler_id,
    handlerName: row.handler_name,
    groupId: row.group_id,
    groupName: row.group_name,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  }
}

const TICKET_SELECT = `
  SELECT t.id, t.subject, t.description, t.category_id, t.priority, t.status,
         t.submitter_id, t.handler_id, t.group_id, t.created_at, t.completed_at,
         c.name AS category_name,
         s.name AS submitter_name,
         h.name AS handler_name,
         g.name AS group_name
  FROM tickets t
  LEFT JOIN categories c ON t.category_id = c.id
  LEFT JOIN users s ON t.submitter_id = s.id
  LEFT JOIN users h ON t.handler_id = h.id
  LEFT JOIN business_groups g ON t.group_id = g.id`

async function getTicketRow(db: DbClient, ticketId: string): Promise<TicketRow | null> {
  return db.queryOne<TicketRow>({
    text: `${TICKET_SELECT} WHERE t.id = ?`,
    params: [ticketId],
  })
}

export function createTicketService(ctx: ServiceContext) {
  const { db, audit, email } = ctx

  async function assertCompanyTicket(ticketId: string, companyId: string): Promise<TicketRow> {
    const row = await getTicketRow(db, ticketId)
    if (!row) throw new BusinessError('NOT_FOUND', '工单不存在', 404)
    // company_id is on the tickets table; join isn't needed since we query by id
    const ticket = await db.queryOne<{ company_id: string }>({ text: 'SELECT company_id FROM tickets WHERE id = ?', params: [ticketId] })
    if (!ticket || ticket.company_id !== companyId) throw new BusinessError('NOT_FOUND', '工单不存在', 404)
    return row
  }

  async function isGroupMember(userId: string, groupId: string | null): Promise<boolean> {
    if (!groupId) return false
    const member = await db.queryOne<{ id: string }>({
      text: 'SELECT id FROM business_group_members WHERE group_id = ? AND user_id = ?',
      params: [groupId, userId],
    })
    return !!member
  }

  async function recordAudit(type: string, operatorId: string, ticketId: string, extra?: Record<string, unknown>) {
    await audit.record({
      type,
      actorUserId: operatorId,
      metadata: { ticketId, ...(extra ?? {}) },
    })
  }

  return {
    async createTicket(companyId: string, submitterId: string, data: { subject: string; description: string; categoryId: string; priority: string }): Promise<TicketDTO> {
      const id = randomUUID()
      const ts = now()
      // Match assignment rule
      const rule = await db.queryOne<{ group_id: string }>({
        text: 'SELECT group_id FROM assignment_rules WHERE company_id = ? AND category_id = ?',
        params: [companyId, data.categoryId],
      })
      const status = rule ? 'pending' : 'unassigned'
      const groupId = rule?.group_id ?? null
      await db.run({
        text: `INSERT INTO tickets (id, subject, description, category_id, priority, status, submitter_id, handler_id, group_id, company_id, created_at, completed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL)`,
        params: [id, data.subject, data.description, data.categoryId, data.priority, status, submitterId, groupId, companyId, ts],
      })
      await recordAudit('ticket_created', submitterId, id)
      const row = await getTicketRow(db, id)
      return toTicketDTO(row!)
    },

    async listTickets(companyId: string, userId: string, role: UserRole, filters: {
      status?: string; priority?: string; categoryId?: string; search?: string; sort?: string; order?: string; page: number; pageSize: number
    }): Promise<{ data: TicketDTO[]; total: number; page: number; pageSize: number }> {
      const conditions: string[] = ['t.company_id = ?']
      const params: unknown[] = [companyId]

      // Role-based visibility
      if (role === 'submitter') {
        conditions.push('t.submitter_id = ?')
        params.push(userId)
      } else if (role === 'handler') {
        conditions.push('(t.handler_id = ? OR t.group_id IN (SELECT group_id FROM business_group_members WHERE user_id = ?))')
        params.push(userId, userId)
      }
      // admin sees all company tickets

      if (filters.status) { conditions.push('t.status = ?'); params.push(filters.status) }
      if (filters.priority) { conditions.push('t.priority = ?'); params.push(filters.priority) }
      if (filters.categoryId) { conditions.push('t.category_id = ?'); params.push(filters.categoryId) }
      if (filters.search) {
        conditions.push('(t.subject LIKE ? OR t.id LIKE ?)')
        const q = `%${filters.search}%`
        params.push(q, q)
      }

      const sortField = filters.sort === 'priority' ? 't.priority' : 't.created_at'
      const orderDir = filters.order === 'asc' ? 'ASC' : 'DESC'
      const offset = (filters.page - 1) * filters.pageSize

      const where = conditions.join(' AND ')
      const rows = await db.queryAll<TicketRow>({
        text: `${TICKET_SELECT} WHERE ${where} ORDER BY ${sortField} ${orderDir}, t.id DESC LIMIT ? OFFSET ?`,
        params: [...params, filters.pageSize, offset],
      })
      const countRow = await db.queryOne<{ total: number }>({ text: `SELECT COUNT(*) AS total FROM tickets t WHERE ${where}`, params })
      return {
        data: rows.map(toTicketDTO),
        total: Number(countRow?.total ?? 0),
        page: filters.page,
        pageSize: filters.pageSize,
      }
    },

    async getTicketDetail(companyId: string, ticketId: string): Promise<TicketDetailDTO> {
      const row = await assertCompanyTicket(ticketId, companyId)
      const replies = await db.queryAll<TicketReplyRow>({
        text: `SELECT r.id, r.ticket_id, r.replier_id, r.content, r.created_at, u.name AS replier_name
               FROM ticket_replies r LEFT JOIN users u ON r.replier_id = u.id
               WHERE r.ticket_id = ? ORDER BY r.created_at ASC, r.id ASC`,
        params: [ticketId],
      })
      const evalRow = await db.queryOne<EvaluationRow>({
        text: 'SELECT id, ticket_id, rating, comment, created_at FROM ticket_evaluations WHERE ticket_id = ?',
        params: [ticketId],
      })
      return {
        ...toTicketDTO(row),
        replies: replies.map(toReplyDTO),
        evaluation: evalRow ? toEvaluationDTO(evalRow) : null,
      }
    },

    async updateStatus(companyId: string, ticketId: string, userId: string, role: UserRole, targetStatus: 'completed' | 'cancelled'): Promise<TicketDTO> {
      const row = await assertCompanyTicket(ticketId, companyId)
      const currentStatus = row.status

      if (targetStatus === 'completed') {
        if (currentStatus !== 'pending') throw new BusinessError('CONFLICT', '仅待处理工单可标记完成', 409)
        if (row.handler_id !== userId && role !== 'admin') throw new BusinessError('FORBIDDEN', '无权限完成此工单', 403)
        const ts = now()
        await db.run({
          text: 'UPDATE tickets SET status = ?, handler_id = ?, completed_at = ? WHERE id = ?',
          params: ['completed', userId, ts, ticketId],
        })
        await recordAudit('ticket_completed', userId, ticketId)
        // Send completion email to submitter
        const submitter = await db.queryOne<{ email: string; name: string }>({ text: 'SELECT email, name FROM users WHERE id = ?', params: [row.submitter_id] })
        if (submitter) {
          await email.send({
            to: submitter.email,
            subject: `工单已完成：${row.subject}`,
            text: `您的工单 "${row.subject}" 已被标记为完成。`,
          })
        }
      } else {
        // cancelled
        if (currentStatus !== 'unassigned' && currentStatus !== 'pending') throw new BusinessError('CONFLICT', '仅未分配或待处理工单可取消', 409)
        if (role !== 'admin' && row.handler_id !== userId) throw new BusinessError('FORBIDDEN', '无权限取消此工单', 403)
        await db.run({ text: 'UPDATE tickets SET status = ? WHERE id = ?', params: ['cancelled', ticketId] })
        await recordAudit('ticket_cancelled', userId, ticketId)
      }
      const updated = await getTicketRow(db, ticketId)
      return toTicketDTO(updated!)
    },

    async addReply(companyId: string, ticketId: string, userId: string, role: UserRole, content: string): Promise<TicketReplyDTO> {
      const row = await assertCompanyTicket(ticketId, companyId)
      // Authorization: submitter can reply to own tickets; handler can reply to assigned or group tickets
      const canReply = row.submitter_id === userId
        || row.handler_id === userId
        || (await isGroupMember(userId, row.group_id))
      if (!canReply) throw new BusinessError('FORBIDDEN', '无权限回复此工单', 403)

      const id = randomUUID()
      const ts = now()
      await db.run({
        text: 'INSERT INTO ticket_replies (id, ticket_id, replier_id, content, created_at) VALUES (?, ?, ?, ?, ?)',
        params: [id, ticketId, userId, content, ts],
      })
      await recordAudit('ticket_replied', userId, ticketId)
      const reply = await db.queryOne<TicketReplyRow>({
        text: `SELECT r.id, r.ticket_id, r.replier_id, r.content, r.created_at, u.name AS replier_name
               FROM ticket_replies r LEFT JOIN users u ON r.replier_id = u.id WHERE r.id = ?`,
        params: [id],
      })
      return toReplyDTO(reply!)
    },

    async transferTicket(companyId: string, ticketId: string, userId: string, role: UserRole, opts: { toUserId?: string; toGroupId?: string }): Promise<TicketDTO> {
      const row = await assertCompanyTicket(ticketId, companyId)
      if (row.status !== 'pending') throw new BusinessError('CONFLICT', '仅待处理工单可转派', 409)
      // Authorization: current handler or admin
      if (role !== 'admin' && row.handler_id !== userId) throw new BusinessError('FORBIDDEN', '无权限转派此工单', 403)

      if (!opts.toUserId && !opts.toGroupId) throw new BusinessError('INVALID_INPUT', '需指定转派目标用户或业务组', 400)
      if (opts.toUserId && opts.toGroupId) throw new BusinessError('INVALID_INPUT', '转派目标用户和业务组不可同时指定', 400)

      const transferId = randomUUID()
      const ts = now()

      if (opts.toUserId) {
        // Verify target user is same company
        const target = await db.queryOne<{ company_id: string }>({ text: 'SELECT company_id FROM users WHERE id = ?', params: [opts.toUserId] })
        if (!target || target.company_id !== companyId) throw new BusinessError('NOT_FOUND', '目标用户不存在或不属于同公司', 404)
        await db.run({ text: 'UPDATE tickets SET handler_id = ?, group_id = NULL WHERE id = ?', params: [opts.toUserId, ticketId] })
        await db.run({
          text: 'INSERT INTO ticket_transfers (id, ticket_id, from_user_id, to_user_id, to_group_id, created_at) VALUES (?, ?, ?, ?, NULL, ?)',
          params: [transferId, ticketId, row.handler_id, opts.toUserId, ts],
        })
      } else {
        // toGroupId
        const target = await db.queryOne<{ company_id: string }>({ text: 'SELECT company_id FROM business_groups WHERE id = ?', params: [opts.toGroupId] })
        if (!target || target.company_id !== companyId) throw new BusinessError('NOT_FOUND', '目标业务组不存在或不属于同公司', 404)
        await db.run({ text: 'UPDATE tickets SET handler_id = NULL, group_id = ? WHERE id = ?', params: [opts.toGroupId, ticketId] })
        await db.run({
          text: 'INSERT INTO ticket_transfers (id, ticket_id, from_user_id, to_user_id, to_group_id, created_at) VALUES (?, ?, NULL, NULL, ?, ?)',
          params: [transferId, ticketId, row.handler_id, opts.toGroupId, ts],
        })
      }
      await recordAudit('ticket_transferred', userId, ticketId, { toUserId: opts.toUserId ?? null, toGroupId: opts.toGroupId ?? null })
      const updated = await getTicketRow(db, ticketId)
      return toTicketDTO(updated!)
    },

    async addEvaluation(companyId: string, ticketId: string, userId: string, rating: number, comment: string | null): Promise<EvaluationDTO> {
      const row = await assertCompanyTicket(ticketId, companyId)
      if (row.submitter_id !== userId) throw new BusinessError('FORBIDDEN', '仅提交人可评价工单', 403)
      if (row.status !== 'completed') throw new BusinessError('CONFLICT', '仅已完成工单可评价', 409)
      // Check for existing evaluation (UNIQUE constraint on ticket_id)
      const existing = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM ticket_evaluations WHERE ticket_id = ?', params: [ticketId] })
      if (existing) throw new BusinessError('CONFLICT', '该工单已评价', 409)

      const id = randomUUID()
      const ts = now()
      await db.run({
        text: 'INSERT INTO ticket_evaluations (id, ticket_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?)',
        params: [id, ticketId, rating, comment, ts],
      })
      return { id, ticketId, rating, comment, createdAt: ts }
    },

    async getSubmitterInfo(companyId: string, ticketId: string, userId: string, role: UserRole): Promise<SubmitterInfoDTO> {
      const row = await assertCompanyTicket(ticketId, companyId)
      // Authorization: handler of this ticket or admin
      const canView = role === 'admin' || row.handler_id === userId || (await isGroupMember(userId, row.group_id))
      if (!canView) throw new BusinessError('FORBIDDEN', '无权限查看提交人信息', 403)

      const submitter = await db.queryOne<{ id: string; name: string; email: string; company_id: string | null; department: string | null }>({
        text: 'SELECT id, name, email, company_id, department FROM users WHERE id = ?',
        params: [row.submitter_id],
      })
      if (!submitter) throw new BusinessError('NOT_FOUND', '提交人不存在', 404)

      const company = submitter.company_id ? await db.queryOne<{ name: string }>({ text: 'SELECT name FROM companies WHERE id = ?', params: [submitter.company_id] }) : null

      // History tickets (same company, same submitter, exclude current)
      const historyRows = await db.queryAll<TicketRow>({
        text: `${TICKET_SELECT} WHERE t.submitter_id = ? AND t.company_id = ? AND t.id != ? ORDER BY t.created_at DESC`,
        params: [submitter.id, companyId, ticketId],
      })

      return {
        user: {
          id: submitter.id,
          name: submitter.name,
          email: submitter.email,
          companyId: submitter.company_id ?? '',
          companyName: company?.name ?? '',
          department: submitter.department ?? '',
          role: 'submitter' as UserRole,
        },
        historyTickets: historyRows.map(toTicketDTO),
      }
    },

    async getLogs(companyId: string, ticketId: string): Promise<LogEntryDTO[]> {
      await assertCompanyTicket(ticketId, companyId)
      const rows = await db.queryAll<{
        id: string
        occurred_at: string
        event_type: string
        actor_user_id: string | null
        operator_name: string | null
      }>({
        text: `SELECT ae.id, ae.occurred_at, ae.event_type, ae.actor_user_id, u.name AS operator_name
               FROM audit_events ae
               LEFT JOIN users u ON ae.actor_user_id = u.id
               WHERE json_extract(ae.metadata_json, '$.ticketId') = ?
               ORDER BY ae.occurred_at ASC, ae.id ASC`,
        params: [ticketId],
      })
      return rows.map((r) => ({
        id: r.id,
        ticketId,
        action: r.event_type,
        operatorId: r.actor_user_id ?? '',
        operatorName: r.operator_name ?? '',
        createdAt: r.occurred_at,
      }))
    },

    _assertCompanyTicket: assertCompanyTicket,
    _isGroupMember: isGroupMember,
  }
}

type TicketReplyRow = {
  id: string
  ticket_id: string
  replier_id: string
  replier_name: string
  content: string
  created_at: string
}

function toReplyDTO(row: TicketReplyRow): TicketReplyDTO {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    replierId: row.replier_id,
    replierName: row.replier_name,
    content: row.content,
    createdAt: row.created_at,
  }
}

type EvaluationRow = {
  id: string
  ticket_id: string
  rating: number
  comment: string | null
  created_at: string
}

function toEvaluationDTO(row: EvaluationRow): EvaluationDTO {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.created_at,
  }
}
