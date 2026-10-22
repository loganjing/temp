import type { DbClient } from '@commonapp/dbkit'
import {
  NOTIFICATION_CHANNEL,
  type AssignmentKind,
  type NotificationStatus,
  type Priority,
  type TicketStatus,
} from '../../shared/contracts'
import { likeContains } from '../platform/http'

export type TicketRow = {
  id: string
  companyId: string
  ticketNo: string
  subject: string
  description: string
  category: string
  priority: Priority
  status: TicketStatus
  groupId: string | null
  groupName: string | null
  assigneeMemberId: string | null
  assigneeName: string | null
  submitterMemberId: string
  submitterName: string
  submitterDepartment: string | null
  submitterEmail: string
  createdAt: string
  completedAt: string | null
  completedByMemberId: string | null
  completedByName: string | null
  cancelledAt: string | null
  companyName: string
  submitterDepartmentId: string | null
  submitterDepartmentName: string | null
}

export type TicketSummaryRow = {
  id: string
  ticketNo: string
  subject: string
  category: string
  priority: Priority
  status: TicketStatus
  groupId: string | null
  groupName: string | null
  assigneeMemberId: string | null
  assigneeName: string | null
  submitterName: string
  createdAt: string
  completedAt: string | null
}

export type ReplyRow = { id: string; authorMemberId: string; authorName: string; authorRole: string; content: string; createdAt: string }
export type AssignmentRow = {
  id: string
  kind: AssignmentKind
  fromMemberName: string | null
  toMemberName: string | null
  toGroupName: string | null
  actorName: string | null
  createdAt: string
}
export type RatingRow = { score: number; comment: string | null; createdAt: string }
export type NotificationRow = {
  id: string
  channel: string
  recipientEmail: string
  status: NotificationStatus
  error: string | null
  createdAt: string
  sentAt: string | null
}
export type SubmitterHistoryRow = {
  id: string
  ticketNo: string
  subject: string
  category: string
  status: TicketStatus
  priority: Priority
  createdAt: string
}

/** 工单筛选条件；companyId 始终由服务端注入，不接受客户端覆盖。 */
export type TicketFilter = {
  status?: TicketStatus
  category?: string
  priority?: Priority
  groupId?: string
  assigneeMemberId?: string
  submitterMemberId?: string
  search?: string
  from?: string
  to?: string
}

export type TicketSort = { field: 'created_at' | 'priority' | 'ticket_no'; descending: boolean }

const PRIORITY_RANK = "CASE t.priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 ELSE 4 END"

function buildWhere(companyId: string, filter: TicketFilter): { where: string; params: unknown[] } {
  const conditions = ['t.company_id = ?']
  const params: unknown[] = [companyId]
  if (filter.status) { conditions.push('t.status = ?'); params.push(filter.status) }
  if (filter.category) { conditions.push('t.category = ?'); params.push(filter.category) }
  if (filter.priority) { conditions.push('t.priority = ?'); params.push(filter.priority) }
  if (filter.groupId) { conditions.push('t.group_id = ?'); params.push(filter.groupId) }
  if (filter.assigneeMemberId) { conditions.push('t.assignee_member_id = ?'); params.push(filter.assigneeMemberId) }
  if (filter.submitterMemberId) { conditions.push('t.submitter_member_id = ?'); params.push(filter.submitterMemberId) }
  if (filter.from) { conditions.push('t.created_at >= ?'); params.push(filter.from) }
  if (filter.to) { conditions.push('t.created_at <= ?'); params.push(filter.to) }
  if (filter.search) {
    const pattern = likeContains(filter.search)
    conditions.push("(t.ticket_no LIKE ? ESCAPE '\\' OR t.subject LIKE ? ESCAPE '\\' OR t.description LIKE ? ESCAPE '\\' OR t.submitter_name LIKE ? ESCAPE '\\')")
    params.push(pattern, pattern, pattern, pattern)
  }
  return { where: conditions.join(' AND '), params }
}

function orderBy(sort: TicketSort): string {
  if (sort.field === 'priority') {
    // 优先级排序中 P0 为最高权重：降序前缀表示 P0 最前。
    return `${PRIORITY_RANK} ${sort.descending ? 'ASC' : 'DESC'}, t.id ASC`
  }
  const column = sort.field === 'ticket_no' ? 't.ticket_no' : 't.created_at'
  return `${column} ${sort.descending ? 'DESC' : 'ASC'}, t.id ASC`
}

type TicketRowSql = {
  id: string
  company_id: string
  ticket_no: string
  subject: string
  description: string
  category: string
  priority: Priority
  status: TicketStatus
  group_id: string | null
  group_name: string | null
  assignee_member_id: string | null
  assignee_name: string | null
  submitter_member_id: string
  submitter_name: string
  submitter_department: string | null
  submitter_email: string
  created_at: string
  completed_at: string | null
  completed_by_member_id: string | null
  completed_by_name: string | null
  cancelled_at: string | null
  company_name: string
  submitter_department_id: string | null
  submitter_department_name: string | null
}

const TICKET_SELECT = `SELECT t.id, t.company_id, t.ticket_no, t.subject, t.description, t.category, t.priority, t.status,
         t.group_id, g.name AS group_name,
         t.assignee_member_id, am.display_name AS assignee_name,
         t.submitter_member_id, t.submitter_name, t.submitter_department, t.submitter_email,
         t.created_at, t.completed_at, t.completed_by_member_id, cm.display_name AS completed_by_name, t.cancelled_at,
         c.name AS company_name,
         sm.department_id AS submitter_department_id, sd.name AS submitter_department_name
  FROM tickets t
  JOIN companies c ON c.id = t.company_id
  LEFT JOIN business_groups g ON g.id = t.group_id
  LEFT JOIN company_members am ON am.id = t.assignee_member_id
  LEFT JOIN company_members cm ON cm.id = t.completed_by_member_id
  LEFT JOIN company_members sm ON sm.id = t.submitter_member_id
  LEFT JOIN departments sd ON sd.id = sm.department_id`

const toTicketRow = (row: TicketRowSql): TicketRow => ({
  id: row.id,
  companyId: row.company_id,
  ticketNo: row.ticket_no,
  subject: row.subject,
  description: row.description,
  category: row.category,
  priority: row.priority,
  status: row.status,
  groupId: row.group_id,
  groupName: row.group_name,
  assigneeMemberId: row.assignee_member_id,
  assigneeName: row.assignee_name,
  submitterMemberId: row.submitter_member_id,
  submitterName: row.submitter_name,
  submitterDepartment: row.submitter_department,
  submitterEmail: row.submitter_email,
  createdAt: row.created_at,
  completedAt: row.completed_at,
  completedByMemberId: row.completed_by_member_id,
  completedByName: row.completed_by_name,
  cancelledAt: row.cancelled_at,
  companyName: row.company_name,
  submitterDepartmentId: row.submitter_department_id,
  submitterDepartmentName: row.submitter_department_name,
})

/**
 * ticket-workflow 数据访问。既服务工单域写入与详情读取，也向 analytics 提供
 * 只读聚合查询；analytics 不直接读取 tickets 相关表。
 */
export function createTicketRepository(db: DbClient) {
  return {
    async findTicket(companyId: string, ticketId: string, client: DbClient = db): Promise<TicketRow | null> {
      const row = await client.queryOne<TicketRowSql>({ text: `${TICKET_SELECT} WHERE t.id = ? AND t.company_id = ?`, params: [ticketId, companyId] })
      return row ? toTicketRow(row) : null
    },

    async allocateTicketNo(companyId: string, client: DbClient = db): Promise<number> {
      const row = await client.queryOne<{ next_value: number }>({
        text: 'INSERT INTO ticket_no_sequences (company_id, next_value) VALUES (?, 1) ON CONFLICT(company_id) DO UPDATE SET next_value = next_value + 1 RETURNING next_value',
        params: [companyId],
      })
      return Number(row?.next_value ?? 1)
    },

    async insertTicket(input: {
      id: string
      companyId: string
      ticketNo: string
      subject: string
      description: string
      category: string
      priority: Priority
      status: TicketStatus
      groupId: string | null
      submitterMemberId: string
      submitterName: string
      submitterDepartment: string | null
      submitterEmail: string
      createdAt: string
    }, client: DbClient = db): Promise<void> {
      await client.run({
        text: `INSERT INTO tickets (id, company_id, ticket_no, subject, description, category, priority, status, group_id, assignee_member_id,
                 submitter_member_id, submitter_name, submitter_department, submitter_email, created_at, completed_at, completed_by_member_id, cancelled_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, NULL, NULL, NULL)`,
        params: [input.id, input.companyId, input.ticketNo, input.subject, input.description, input.category, input.priority, input.status, input.groupId,
          input.submitterMemberId, input.submitterName, input.submitterDepartment, input.submitterEmail, input.createdAt],
      })
    },

    async assignTicket(ticketId: string, input: { groupId: string; assigneeMemberId: string | null; status: TicketStatus }, client: DbClient = db): Promise<void> {
      await client.run({
        text: 'UPDATE tickets SET group_id = ?, assignee_member_id = ?, status = ? WHERE id = ?',
        params: [input.groupId, input.assigneeMemberId, input.status, ticketId],
      })
    },

    async transferTicket(ticketId: string, input: { groupId: string | null; assigneeMemberId: string }, client: DbClient = db): Promise<void> {
      await client.run({
        text: "UPDATE tickets SET group_id = ?, assignee_member_id = ?, status = 'pending_processing' WHERE id = ?",
        params: [input.groupId, input.assigneeMemberId, ticketId],
      })
    },

    async completeTicket(ticketId: string, input: { completedAt: string; completedByMemberId: string }, client: DbClient = db): Promise<void> {
      await client.run({
        text: "UPDATE tickets SET status = 'completed', completed_at = ?, completed_by_member_id = ? WHERE id = ?",
        params: [input.completedAt, input.completedByMemberId, ticketId],
      })
    },

    async cancelTicket(ticketId: string, input: { cancelledAt: string }, client: DbClient = db): Promise<void> {
      await client.run({
        text: "UPDATE tickets SET status = 'cancelled', cancelled_at = ? WHERE id = ?",
        params: [input.cancelledAt, ticketId],
      })
    },

    async insertAssignment(input: {
      id: string
      ticketId: string
      companyId: string
      kind: AssignmentKind
      fromMemberId: string | null
      toMemberId: string | null
      toGroupId: string | null
      actorMemberId: string | null
      createdAt: string
    }, client: DbClient = db): Promise<void> {
      await client.run({
        text: `INSERT INTO ticket_assignments (id, ticket_id, company_id, kind, from_member_id, to_member_id, to_group_id, actor_member_id, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [input.id, input.ticketId, input.companyId, input.kind, input.fromMemberId, input.toMemberId, input.toGroupId, input.actorMemberId, input.createdAt],
      })
    },

    async listAssignments(ticketId: string, client: DbClient = db): Promise<AssignmentRow[]> {
      const rows = await client.queryAll<{
        id: string
        kind: AssignmentKind
        from_member_name: string | null
        to_member_name: string | null
        to_group_name: string | null
        actor_name: string | null
        created_at: string
      }>({
        text: `SELECT a.id, a.kind, fm.display_name AS from_member_name, tm.display_name AS to_member_name, tg.name AS to_group_name,
                 acm.display_name AS actor_name, a.created_at
               FROM ticket_assignments a
               LEFT JOIN company_members fm ON fm.id = a.from_member_id
               LEFT JOIN company_members tm ON tm.id = a.to_member_id
               LEFT JOIN business_groups tg ON tg.id = a.to_group_id
               LEFT JOIN company_members acm ON acm.id = a.actor_member_id
               WHERE a.ticket_id = ?
               ORDER BY a.created_at ASC, a.id ASC`,
        params: [ticketId],
      })
      return rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        fromMemberName: row.from_member_name,
        toMemberName: row.to_member_name,
        toGroupName: row.to_group_name,
        actorName: row.actor_name,
        createdAt: row.created_at,
      }))
    },

    async insertReply(input: { id: string; ticketId: string; companyId: string; authorMemberId: string; authorRole: string; content: string; createdAt: string }, client: DbClient = db): Promise<void> {
      await client.run({
        text: 'INSERT INTO ticket_replies (id, ticket_id, company_id, author_member_id, author_role, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        params: [input.id, input.ticketId, input.companyId, input.authorMemberId, input.authorRole, input.content, input.createdAt],
      })
    },

    async listReplies(ticketId: string, client: DbClient = db): Promise<ReplyRow[]> {
      const rows = await client.queryAll<{ id: string; author_member_id: string; author_name: string; author_role: string; content: string; created_at: string }>({
        text: `SELECT r.id, r.author_member_id, m.display_name AS author_name, r.author_role, r.content, r.created_at
               FROM ticket_replies r
               JOIN company_members m ON m.id = r.author_member_id
               WHERE r.ticket_id = ?
               ORDER BY r.created_at ASC, r.id ASC`,
        params: [ticketId],
      })
      return rows.map((row) => ({ id: row.id, authorMemberId: row.author_member_id, authorName: row.author_name, authorRole: row.author_role, content: row.content, createdAt: row.created_at }))
    },

    async findRating(ticketId: string, client: DbClient = db): Promise<RatingRow | null> {
      const row = await client.queryOne<{ score: number; comment: string | null; created_at: string }>({
        text: 'SELECT score, comment, created_at FROM ticket_ratings WHERE ticket_id = ?',
        params: [ticketId],
      })
      return row ? { score: Number(row.score), comment: row.comment, createdAt: row.created_at } : null
    },

    async insertRating(input: { id: string; ticketId: string; companyId: string; score: number; comment: string | null; createdAt: string }, client: DbClient = db): Promise<void> {
      await client.run({
        text: 'INSERT INTO ticket_ratings (id, ticket_id, company_id, score, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        params: [input.id, input.ticketId, input.companyId, input.score, input.comment, input.createdAt],
      })
    },

    async insertNotification(input: {
      id: string
      ticketId: string
      companyId: string
      recipientEmail: string
      status: NotificationStatus
      error: string | null
      createdAt: string
      sentAt: string | null
    }, client: DbClient = db): Promise<void> {
      await client.run({
        text: 'INSERT INTO notifications (id, ticket_id, company_id, channel, recipient_email, status, error, created_at, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        params: [input.id, input.ticketId, input.companyId, NOTIFICATION_CHANNEL, input.recipientEmail, input.status, input.error, input.createdAt, input.sentAt],
      })
    },

    async listNotifications(ticketId: string, client: DbClient = db): Promise<NotificationRow[]> {
      const rows = await client.queryAll<{ id: string; channel: string; recipient_email: string; status: NotificationStatus; error: string | null; created_at: string; sent_at: string | null }>({
        text: 'SELECT id, channel, recipient_email, status, error, created_at, sent_at FROM notifications WHERE ticket_id = ? ORDER BY created_at ASC, id ASC',
        params: [ticketId],
      })
      return rows.map((row) => ({
        id: row.id,
        channel: row.channel,
        recipientEmail: row.recipient_email,
        status: row.status,
        error: row.error,
        createdAt: row.created_at,
        sentAt: row.sent_at,
      }))
    },

    async listSubmitterHistory(companyId: string, submitterMemberId: string, excludeTicketId: string, limit: number): Promise<SubmitterHistoryRow[]> {
      const rows = await db.queryAll<{ id: string; ticket_no: string; subject: string; category: string; status: TicketStatus; priority: Priority; created_at: string }>({
        text: `SELECT id, ticket_no, subject, category, status, priority, created_at
               FROM tickets
               WHERE company_id = ? AND submitter_member_id = ? AND id <> ?
               ORDER BY created_at DESC, id DESC
               LIMIT ?`,
        params: [companyId, submitterMemberId, excludeTicketId, limit],
      })
      return rows.map((row) => ({ id: row.id, ticketNo: row.ticket_no, subject: row.subject, category: row.category, status: row.status, priority: row.priority, createdAt: row.created_at }))
    },

    async listTicketSummaries(companyId: string, filter: TicketFilter, sort: TicketSort, limit: number, offset: number): Promise<TicketSummaryRow[]> {
      const { where, params } = buildWhere(companyId, filter)
      const rows = await db.queryAll<{
        id: string
        ticket_no: string
        subject: string
        category: string
        priority: Priority
        status: TicketStatus
        group_id: string | null
        group_name: string | null
        assignee_member_id: string | null
        assignee_name: string | null
        submitter_name: string
        created_at: string
        completed_at: string | null
      }>({
        text: `SELECT t.id, t.ticket_no, t.subject, t.category, t.priority, t.status, t.group_id, g.name AS group_name,
                 t.assignee_member_id, am.display_name AS assignee_name, t.submitter_name, t.created_at, t.completed_at
               FROM tickets t
               LEFT JOIN business_groups g ON g.id = t.group_id
               LEFT JOIN company_members am ON am.id = t.assignee_member_id
               WHERE ${where}
               ORDER BY ${orderBy(sort)}
               LIMIT ? OFFSET ?`,
        params: [...params, limit, offset],
      })
      return rows.map((row) => ({
        id: row.id,
        ticketNo: row.ticket_no,
        subject: row.subject,
        category: row.category,
        priority: row.priority,
        status: row.status,
        groupId: row.group_id,
        groupName: row.group_name,
        assigneeMemberId: row.assignee_member_id,
        assigneeName: row.assignee_name,
        submitterName: row.submitter_name,
        createdAt: row.created_at,
        completedAt: row.completed_at,
      }))
    },

    async countTickets(companyId: string, filter: TicketFilter): Promise<number> {
      const { where, params } = buildWhere(companyId, filter)
      const row = await db.queryOne<{ total: number }>({ text: `SELECT COUNT(*) AS total FROM tickets t WHERE ${where}`, params })
      return Number(row?.total ?? 0)
    },

    // ── analytics 只读聚合（经由工单域公开只读查询取数） ──

    async countByStatus(companyId: string, filter: TicketFilter): Promise<Array<{ status: TicketStatus; count: number }>> {
      const { where, params } = buildWhere(companyId, filter)
      const rows = await db.queryAll<{ status: TicketStatus; total: number }>({
        text: `SELECT t.status, COUNT(*) AS total FROM tickets t WHERE ${where} GROUP BY t.status`,
        params,
      })
      return rows.map((row) => ({ status: row.status, count: Number(row.total) }))
    },

    async countByDepartment(companyId: string, filter: TicketFilter): Promise<Array<{ key: string; name: string; count: number }>> {
      const { where, params } = buildWhere(companyId, filter)
      const rows = await db.queryAll<{ department_key: string | null; department_name: string | null; total: number }>({
        text: `SELECT sd.id AS department_key, sd.name AS department_name, COUNT(*) AS total
               FROM tickets t
               LEFT JOIN company_members sm ON sm.id = t.submitter_member_id
               LEFT JOIN departments sd ON sd.id = sm.department_id
               WHERE ${where}
               GROUP BY sd.id, sd.name`,
        params,
      })
      return rows.map((row) => ({
        key: row.department_key ?? 'unassigned',
        name: row.department_name ?? '未设置部门',
        count: Number(row.total),
      }))
    },

    async listFirstResponseTimes(companyId: string, filter: TicketFilter): Promise<Array<{ createdAt: string; firstReplyAt: string | null }>> {
      const { where, params } = buildWhere(companyId, filter)
      const rows = await db.queryAll<{ created_at: string; first_reply_at: string | null }>({
        text: `SELECT t.created_at, (SELECT MIN(r.created_at) FROM ticket_replies r WHERE r.ticket_id = t.id) AS first_reply_at
               FROM tickets t
               WHERE ${where}`,
        params,
      })
      return rows.map((row) => ({ createdAt: row.created_at, firstReplyAt: row.first_reply_at }))
    },

    async listRatings(companyId: string, filter: TicketFilter): Promise<number[]> {
      const { where, params } = buildWhere(companyId, filter)
      const rows = await db.queryAll<{ score: number }>({
        text: `SELECT r.score FROM ticket_ratings r JOIN tickets t ON t.id = r.ticket_id WHERE ${where}`,
        params,
      })
      return rows.map((row) => Number(row.score))
    },

    async countByCategory(companyId: string, filter: TicketFilter): Promise<Array<{ category: string; count: number }>> {
      const { where, params } = buildWhere(companyId, filter)
      const rows = await db.queryAll<{ category: string; total: number }>({
        text: `SELECT t.category, COUNT(*) AS total FROM tickets t WHERE ${where} GROUP BY t.category ORDER BY total DESC, t.category ASC`,
        params,
      })
      return rows.map((row) => ({ category: row.category, count: Number(row.total) }))
    },
  }
}

export type TicketRepository = ReturnType<typeof createTicketRepository>
