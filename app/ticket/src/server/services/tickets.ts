import { randomUUID } from 'node:crypto'
import type { DbClient } from '@commonapp/dbkit'
import type {
  NotificationRecord,
  NotificationStatus,
  Paginated,
  TicketAllowedAction,
  TicketDetail,
  TicketLogEntry,
  TicketPriority,
  TicketReply,
  TicketStatus,
  TicketSummary,
} from '../../shared/ticket-contracts'
import {
  LOG_ACTION_LABELS,
  LOG_ACTIONS,
  NOTIFICATION_STATUSES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  formatTicketCode,
  isTerminalStatus,
} from '../../shared/ticket-contracts'
import { duplicateRating, forbidden, invalidState, notFound, validationFailed } from '../errors'
import type { Identity, IdentityService } from './identity'
import type { OrgService } from './org'

type TicketRow = {
  id: string
  code: string
  company_id: string
  company_name: string
  subject: string
  description: string
  category_id: string
  category_name: string
  priority: TicketPriority
  status: TicketStatus
  submitter_id: string
  submitter_name: string
  submitter_email: string
  department: string | null
  group_id: string | null
  group_name: string | null
  assignee_id: string | null
  assignee_name: string | null
  first_reply_at: string | null
  completed_by: string | null
  completed_by_name: string | null
  completed_at: string | null
  cancelled_by: string | null
  cancelled_by_name: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string
}

type TicketLogRow = {
  id: string
  action: string
  summary: string
  detail_json: string | null
  created_at: string
  actor_id: string
  actor_name: string
}

type ReplyRow = { id: string; content: string; created_at: string; author_id: string; author_name: string }
type RatingRow = { score: number; comment: string | null; created_at: string }
type NotificationRow = {
  id: string
  recipient_email: string
  status: NotificationStatus
  error_message: string | null
  attempt: number
  created_at: string
  sent_at: string | null
}

export type TicketListQuery = {
  scope?: string
  status?: string[]
  priority?: string[]
  categoryId?: string
  groupId?: string
  companyId?: string
  submitterId?: string
  from?: string
  to?: string
  q?: string
  sort?: string
  order?: string
  page?: number
  pageSize?: number
}

export type CreateTicketInput = {
  subject: string
  description: string
  categoryId: string
  priority: TicketPriority
}

export type LogInput = {
  ticketId: string
  companyId: string
  actorId: string
  action: (typeof LOG_ACTIONS)[number]
  summary: string
  detail?: Record<string, unknown> | null
  createdAt?: string
}

const SUMMARY_SELECT = `SELECT t.id, t.code, t.company_id, co.name AS company_name, t.subject, t.description,
  t.category_id, c.name AS category_name, t.priority, t.status,
  t.submitter_id, su.name AS submitter_name, su.email AS submitter_email, p.department,
  t.group_id, g.name AS group_name, t.assignee_id, au.name AS assignee_name,
  t.first_reply_at,
  t.completed_by, cu.name AS completed_by_name, t.completed_at,
  t.cancelled_by, xu.name AS cancelled_by_name, t.cancelled_at,
  t.created_at, t.updated_at
  FROM tickets t
  JOIN companies co ON co.id = t.company_id
  JOIN ticket_categories c ON c.id = t.category_id
  JOIN users su ON su.id = t.submitter_id
  LEFT JOIN user_profiles p ON p.user_id = t.submitter_id
  LEFT JOIN business_groups g ON g.id = t.group_id
  LEFT JOIN users au ON au.id = t.assignee_id
  LEFT JOIN users cu ON cu.id = t.completed_by
  LEFT JOIN users xu ON xu.id = t.cancelled_by`

const isUniqueError = (error: unknown) => error instanceof Error && /unique constraint/i.test(error.message)

function parseInstant(value: string | undefined, field: string, errors: Record<string, string>): string | undefined {
  if (value === undefined || value === '') return undefined
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    errors[field] = '时间格式不正确'
    return undefined
  }
  return parsed.toISOString()
}

export function createTicketService(db: DbClient, identity: IdentityService, org: OrgService) {
  const mapSummary = (row: TicketRow): TicketSummary => ({
    id: row.id,
    code: row.code,
    subject: row.subject,
    categoryId: row.category_id,
    categoryName: row.category_name,
    priority: row.priority,
    status: row.status,
    submitter: { id: row.submitter_id, name: row.submitter_name },
    companyId: row.company_id,
    companyName: row.company_name,
    department: row.department ?? '未分配',
    group: row.group_id && row.group_name ? { id: row.group_id, name: row.group_name } : null,
    assignee: row.assignee_id && row.assignee_name ? { id: row.assignee_id, name: row.assignee_name } : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })

  async function loadTicket(ticketId: string): Promise<TicketRow | null> {
    return db.queryOne<TicketRow>({ text: `${SUMMARY_SELECT} WHERE t.id = ?`, params: [ticketId] })
  }

  async function requireTicket(ticketId: string): Promise<TicketRow> {
    const ticket = await loadTicket(ticketId)
    if (!ticket) throw notFound('工单不存在')
    return ticket
  }

  function assertSameCompany(ticket: TicketRow, actor: Identity): void {
    if (ticket.company_id !== actor.companyId) throw forbidden('无权访问其他公司的工单')
  }

  function canView(ticket: TicketRow, actor: Identity): boolean {
    if (ticket.company_id !== actor.companyId) return false
    if (actor.isCompanyAdmin) return true
    if (ticket.submitter_id === actor.id) return true
    return Boolean(ticket.group_id) && actor.isAgent && actor.groups.some((group) => group.id === ticket.group_id)
  }

  function assertVisible(ticket: TicketRow, actor: Identity): void {
    identity.requireTicketUser(actor)
    assertSameCompany(ticket, actor)
    if (!canView(ticket, actor)) throw forbidden('无权访问该工单')
  }

  function agentOfCurrentGroup(ticket: TicketRow, actor: Identity): boolean {
    return Boolean(ticket.group_id) && actor.isAgent && actor.groups.some((group) => group.id === ticket.group_id)
  }

  async function appendLog(input: LogInput, executor: DbClient = db): Promise<void> {
    await executor.run({
      text: `INSERT INTO ticket_logs (id, ticket_id, company_id, actor_id, action, summary, detail_json, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        randomUUID(),
        input.ticketId,
        input.companyId,
        input.actorId,
        input.action,
        input.summary,
        input.detail ? JSON.stringify(input.detail) : null,
        input.createdAt ?? new Date().toISOString(),
      ],
    })
  }

  async function nextTicketCode(tx: DbClient): Promise<string> {
    await tx.run({ text: "UPDATE counters SET value = value + 1 WHERE name = 'ticket_code'" })
    const row = await tx.queryOne<{ value: number }>({ text: "SELECT value FROM counters WHERE name = 'ticket_code'" })
    if (!row) throw new Error('Ticket counter is missing')
    return formatTicketCode(Number(row.value))
  }

  async function createTicket(input: CreateTicketInput, actor: Identity): Promise<TicketSummary> {
    identity.requireTicketUser(actor)
    const category = await org.getCategory(actor.companyId, input.categoryId)
    if (!category) {
      const existsElsewhere = await db.queryOne({ text: 'SELECT id FROM ticket_categories WHERE id = ?', params: [input.categoryId] })
      if (existsElsewhere) throw forbidden('分类不属于当前公司')
      throw validationFailed('提交内容有误，请检查后重试', { categoryId: '分类不存在' })
    }
    if (!category.enabled) throw validationFailed('提交内容有误，请检查后重试', { categoryId: '该分类已停用' })

    const now = new Date().toISOString()
    const ticketId = randomUUID()
    await db.transaction(async (tx) => {
      const rule = await tx.queryOne<{ group_id: string }>({
        text: `SELECT r.group_id FROM assignment_rules r
               JOIN business_groups g ON g.id = r.group_id
               WHERE r.company_id = ? AND r.category_id = ? AND r.enabled = 1 AND g.enabled = 1`,
        params: [actor.companyId, input.categoryId],
      })
      const groupId = rule?.group_id ?? null
      const status: TicketStatus = groupId ? 'pending' : 'pending_assignment'
      const code = await nextTicketCode(tx)
      await tx.run({
        text: `INSERT INTO tickets (id, code, company_id, subject, description, category_id, priority, status,
                 submitter_id, group_id, assignee_id, first_reply_at, completed_by, completed_at, cancelled_by, cancelled_at,
                 created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
        params: [
          ticketId,
          code,
          actor.companyId,
          input.subject,
          input.description,
          input.categoryId,
          input.priority,
          status,
          actor.id,
          groupId,
          now,
          now,
        ],
      })
      await appendLog({
        ticketId,
        companyId: actor.companyId,
        actorId: actor.id,
        action: 'created',
        summary: `提交工单 ${code}`,
        detail: { code, status, categoryId: input.categoryId, groupId, priority: input.priority },
        createdAt: now,
      }, tx)
    })
    const created = await loadTicket(ticketId)
    if (!created) throw notFound('工单不存在')
    return mapSummary(created)
  }

  async function listTickets(query: TicketListQuery, actor: Identity): Promise<Paginated<TicketSummary>> {
    identity.requireTicketUser(actor)
    const fields: Record<string, string> = {}
    const scope = query.scope ?? 'workbench'
    if (scope !== 'mine' && scope !== 'workbench') fields.scope = '范围只能是 mine 或 workbench'
    if (query.companyId && query.companyId !== actor.companyId) throw forbidden('只能查询本公司的工单')

    const statuses = (query.status ?? []).filter((value) => value !== '')
    const includeAll = statuses.includes('all')
    for (const value of statuses) {
      if (value !== 'all' && !(TICKET_STATUSES as readonly string[]).includes(value)) fields.status = '状态取值不正确'
    }
    const priorities = (query.priority ?? []).filter(Boolean)
    for (const value of priorities) {
      if (!(TICKET_PRIORITIES as readonly string[]).includes(value)) fields.priority = '优先级取值不正确'
    }
    const sort = query.sort ?? 'createdAt'
    if (!['createdAt', 'priority', 'updatedAt'].includes(sort)) fields.sort = '排序字段不正确'
    const order = query.order ?? 'desc'
    if (order !== 'asc' && order !== 'desc') fields.order = '排序方向不正确'
    const from = parseInstant(query.from, 'from', fields)
    const to = parseInstant(query.to, 'to', fields)
    if (from && to && from > to) fields.from = '开始时间不能晚于结束时间'
    if (Object.keys(fields).length > 0) throw validationFailed('查询条件有误，请检查后重试', fields)

    const where: string[] = ['t.company_id = ?']
    const params: unknown[] = [actor.companyId]

    if (scope === 'mine') {
      where.push('t.submitter_id = ?')
      params.push(actor.id)
    } else {
      const isAdmin = actor.isCompanyAdmin
      if (!isAdmin && !actor.isAgent) throw forbidden('仅处理人或公司管理员可查看工作台')
      if (!isAdmin) {
        if (actor.groups.length === 0) where.push('1 = 0')
        else {
          where.push(`t.group_id IN (${actor.groups.map(() => '?').join(', ')})`)
          params.push(...actor.groups.map((group) => group.id))
        }
      }
    }

    let effectiveStatuses = statuses.filter((value) => value !== 'all')
    if (!includeAll && effectiveStatuses.length === 0 && scope === 'workbench') effectiveStatuses = ['pending']
    if (effectiveStatuses.length > 0) {
      where.push(`t.status IN (${effectiveStatuses.map(() => '?').join(', ')})`)
      params.push(...effectiveStatuses)
    }
    if (priorities.length > 0) {
      where.push(`t.priority IN (${priorities.map(() => '?').join(', ')})`)
      params.push(...priorities)
    }
    if (query.categoryId) {
      where.push('t.category_id = ?')
      params.push(query.categoryId)
    }
    if (query.groupId) {
      where.push('t.group_id = ?')
      params.push(query.groupId)
    }
    if (query.submitterId) {
      where.push('t.submitter_id = ?')
      params.push(query.submitterId)
    }
    if (from) {
      where.push('t.created_at >= ?')
      params.push(from)
    }
    if (to) {
      where.push('t.created_at <= ?')
      params.push(to)
    }
    if (query.q?.trim()) {
      const like = `%${query.q.trim().toLowerCase()}%`
      where.push('(lower(t.code) LIKE ? OR lower(t.subject) LIKE ?)')
      params.push(like, like)
    }

    const orderColumn =
      sort === 'priority' ? "CASE t.priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 ELSE 4 END" : sort === 'updatedAt' ? 't.updated_at' : 't.created_at'
    // 优先级以 P0 为最高：降序（默认）表示由高到低，方向与 P0–P4 的数值序位相反。
    const direction = sort === 'priority'
      ? (order === 'asc' ? 'DESC' : 'ASC')
      : (order === 'asc' ? 'ASC' : 'DESC')
    const page = Number.isFinite(query.page) && Number(query.page) >= 1 ? Math.floor(Number(query.page)) : 1
    const pageSize = Number.isFinite(query.pageSize) ? Math.min(Math.max(Math.floor(Number(query.pageSize)), 1), 100) : 20
    const whereSql = where.join(' AND ')
    const totalRow = await db.queryOne<{ total: number }>({
      text: `SELECT COUNT(*) AS total FROM tickets t WHERE ${whereSql}`,
      params,
    })
    const rows = await db.queryAll<TicketRow>({
      text: `${SUMMARY_SELECT} WHERE ${whereSql} ORDER BY ${orderColumn} ${direction}, t.created_at DESC, t.id LIMIT ? OFFSET ?`,
      params: [...params, pageSize, (page - 1) * pageSize],
    })
    return { items: rows.map(mapSummary), total: Number(totalRow?.total ?? 0), page, pageSize }
  }

  async function getTicketDetail(ticketId: string, actor: Identity): Promise<TicketDetail> {
    const ticket = await requireTicket(ticketId)
    assertVisible(ticket, actor)
    const [historyRows, replyRows, ratingRow, notificationRows] = await Promise.all([
      db.queryAll<{
        id: string
        code: string
        subject: string
        category_name: string
        status: TicketStatus
        created_at: string
      }>({
        text: `SELECT t.id, t.code, t.subject, c.name AS category_name, t.status, t.created_at
               FROM tickets t JOIN ticket_categories c ON c.id = t.category_id
               WHERE t.company_id = ? AND t.submitter_id = ?
               ORDER BY t.created_at DESC, t.id LIMIT 10`,
        params: [ticket.company_id, ticket.submitter_id],
      }),
      db.queryAll<ReplyRow>({
        text: `SELECT r.id, r.content, r.created_at, u.id AS author_id, u.name AS author_name
               FROM ticket_replies r JOIN users u ON u.id = r.author_id
               WHERE r.ticket_id = ? ORDER BY r.created_at, r.id`,
        params: [ticket.id],
      }),
      db.queryOne<RatingRow>({
        text: 'SELECT score, comment, created_at FROM ticket_ratings WHERE ticket_id = ?',
        params: [ticket.id],
      }),
      db.queryAll<NotificationRow>({
        text: `SELECT id, recipient_email, status, error_message, attempt, created_at, sent_at
               FROM ticket_notifications WHERE ticket_id = ? ORDER BY created_at, id`,
        params: [ticket.id],
      }),
    ])
    const rating: TicketDetail['rating'] = ratingRow
      ? { score: Number(ratingRow.score), comment: ratingRow.comment, createdAt: ratingRow.created_at }
      : null
    const notifications = notificationRows.map(mapNotification)
    const submitter = {
      id: ticket.submitter_id,
      name: ticket.submitter_name,
      email: ticket.submitter_email,
      companyId: ticket.company_id,
      companyName: ticket.company_name,
      department: ticket.department ?? '未分配',
    }
    const allowedActions: TicketAllowedAction[] = []
    const terminal = isTerminalStatus(ticket.status)
    if (!terminal && (ticket.submitter_id === actor.id || actor.isCompanyAdmin || agentOfCurrentGroup(ticket, actor))) allowedActions.push('reply')
    if (ticket.status === 'pending_assignment' && (actor.isCompanyAdmin || actor.isAgent)) allowedActions.push('assign')
    if (ticket.status === 'pending' && (actor.isCompanyAdmin || agentOfCurrentGroup(ticket, actor))) {
      allowedActions.push('transfer', 'complete')
    }
    if (!terminal && (ticket.submitter_id === actor.id || actor.isCompanyAdmin)) allowedActions.push('cancel')
    if (ticket.status === 'completed' && ticket.submitter_id === actor.id && !rating) allowedActions.push('rate')
    if (
      ticket.status === 'completed' &&
      (actor.isCompanyAdmin || agentOfCurrentGroup(ticket, actor)) &&
      notifications.some((notification) => notification.status === 'failed' || notification.status === 'skipped')
    ) {
      allowedActions.push('retryNotification')
    }
    return {
      ...mapSummary(ticket),
      description: ticket.description,
      submitter,
      history: historyRows.map((row) => ({
        id: row.id,
        code: row.code,
        subject: row.subject,
        categoryName: row.category_name,
        status: row.status,
        createdAt: row.created_at,
      })),
      replies: replyRows.map((row) => ({
        id: row.id,
        author: { id: row.author_id, name: row.author_name },
        content: row.content,
        createdAt: row.created_at,
      })),
      rating,
      notifications,
      completedBy: ticket.completed_by && ticket.completed_by_name ? { id: ticket.completed_by, name: ticket.completed_by_name } : null,
      completedAt: ticket.completed_at,
      cancelledBy: ticket.cancelled_by && ticket.cancelled_by_name ? { id: ticket.cancelled_by, name: ticket.cancelled_by_name } : null,
      cancelledAt: ticket.cancelled_at,
      firstReplyAt: ticket.first_reply_at,
      allowedActions,
    }
  }

  async function getTicketLogs(ticketId: string, actor: Identity): Promise<{ items: TicketLogEntry[] }> {
    const ticket = await requireTicket(ticketId)
    assertVisible(ticket, actor)
    const rows = await db.queryAll<TicketLogRow>({
      text: `SELECT l.id, l.action, l.summary, l.detail_json, l.created_at, u.id AS actor_id, u.name AS actor_name
             FROM ticket_logs l JOIN users u ON u.id = l.actor_id
             WHERE l.ticket_id = ? AND l.company_id = ? ORDER BY l.created_at, l.id`,
      params: [ticket.id, ticket.company_id],
    })
    return {
      items: rows.map((row) => ({
        id: row.id,
        action: ((LOG_ACTIONS as readonly string[]).includes(row.action) ? row.action : 'created') as TicketLogEntry['action'],
        actionLabel: LOG_ACTION_LABELS[((LOG_ACTIONS as readonly string[]).includes(row.action) ? row.action : 'created') as TicketLogEntry['action']],
        summary: row.summary,
        actor: { id: row.actor_id, name: row.actor_name },
        detail: row.detail_json ? (JSON.parse(row.detail_json) as Record<string, unknown>) : null,
        createdAt: row.created_at,
      })),
    }
  }

  async function addReply(ticketId: string, content: string, actor: Identity): Promise<TicketReply> {
    const ticket = await requireTicket(ticketId)
    assertVisible(ticket, actor)
    if (isTerminalStatus(ticket.status)) throw invalidState('工单已结束，不能再回复')
    if (!(ticket.submitter_id === actor.id || actor.isCompanyAdmin || agentOfCurrentGroup(ticket, actor))) {
      throw forbidden('无权回复该工单')
    }
    const now = new Date().toISOString()
    const replyId = randomUUID()
    await db.transaction(async (tx) => {
      await tx.run({
        text: 'INSERT INTO ticket_replies (id, ticket_id, author_id, content, created_at) VALUES (?, ?, ?, ?, ?)',
        params: [replyId, ticket.id, actor.id, content, now],
      })
      await tx.run({
        text: 'UPDATE tickets SET first_reply_at = COALESCE(first_reply_at, ?), updated_at = ? WHERE id = ?',
        params: [now, now, ticket.id],
      })
      await appendLog({
        ticketId: ticket.id,
        companyId: ticket.company_id,
        actorId: actor.id,
        action: 'replied',
        summary: '回复工单',
        detail: { status: ticket.status, firstReply: !ticket.first_reply_at },
        createdAt: now,
      }, tx)
    })
    return { id: replyId, author: { id: actor.id, name: actor.name }, content, createdAt: now }
  }

  async function requireAssignableGroup(actor: Identity, groupId: string) {
    const group = await org.getGroup(actor.companyId, groupId)
    if (!group) throw validationFailed('提交内容有误，请检查后重试', { groupId: '业务组不属于当前公司' })
    if (!group.enabled) throw validationFailed('提交内容有误，请检查后重试', { groupId: '业务组已停用' })
    return group
  }

  async function requireGroupAssignee(companyId: string, groupId: string, assigneeId: string) {
    const member = await db.queryOne<{ name: string }>({
      text: `SELECT u.name FROM business_group_members m JOIN users u ON u.id = m.user_id
             WHERE m.company_id = ? AND m.group_id = ? AND m.user_id = ?`,
      params: [companyId, groupId, assigneeId],
    })
    if (!member) throw validationFailed('提交内容有误，请检查后重试', { assigneeId: '处理人必须是目标业务组成员' })
    return member.name
  }

  async function assignTicket(
    ticketId: string,
    input: { groupId: string; assigneeId?: string },
    actor: Identity,
  ): Promise<TicketSummary> {
    const ticket = await requireTicket(ticketId)
    identity.requireTicketUser(actor)
    assertSameCompany(ticket, actor)
    if (ticket.status !== 'pending_assignment') throw invalidState('仅待分配工单可以指派')
    const group = await requireAssignableGroup(actor, input.groupId)
    const isOwnGroup = actor.isAgent && actor.groups.some((item) => item.id === input.groupId)
    if (!actor.isCompanyAdmin && !isOwnGroup) throw forbidden('处理人只能指派到其所属业务组')
    const assigneeName = input.assigneeId ? await requireGroupAssignee(actor.companyId, input.groupId, input.assigneeId) : null
    const now = new Date().toISOString()
    await db.transaction(async (tx) => {
      await tx.run({
        text: 'UPDATE tickets SET group_id = ?, assignee_id = ?, status = ?, updated_at = ? WHERE id = ?',
        params: [input.groupId, input.assigneeId ?? null, 'pending', now, ticket.id],
      })
      await appendLog({
        ticketId: ticket.id,
        companyId: ticket.company_id,
        actorId: actor.id,
        action: 'assigned',
        summary: `工单指派至 ${group.name}${assigneeName ? `（处理人 ${assigneeName}）` : ''}`,
        detail: {
          fromStatus: ticket.status,
          toStatus: 'pending',
          fromGroupId: ticket.group_id,
          toGroupId: input.groupId,
          fromAssigneeId: ticket.assignee_id,
          toAssigneeId: input.assigneeId ?? null,
        },
        createdAt: now,
      }, tx)
    })
    const updated = await loadTicket(ticket.id)
    if (!updated) throw notFound('工单不存在')
    return mapSummary(updated)
  }

  async function transferTicket(
    ticketId: string,
    input: { groupId: string; assigneeId?: string; note?: string },
    actor: Identity,
  ): Promise<TicketSummary> {
    const ticket = await requireTicket(ticketId)
    assertVisible(ticket, actor)
    if (ticket.status !== 'pending') throw invalidState('仅待处理工单可以转派')
    if (!(actor.isCompanyAdmin || agentOfCurrentGroup(ticket, actor))) throw forbidden('仅该工单所属业务组成员或公司管理员可转派')
    const group = await requireAssignableGroup(actor, input.groupId)
    const assigneeName = input.assigneeId ? await requireGroupAssignee(actor.companyId, input.groupId, input.assigneeId) : null
    const now = new Date().toISOString()
    const fromGroupName = ticket.group_name
    await db.transaction(async (tx) => {
      await tx.run({
        text: 'UPDATE tickets SET group_id = ?, assignee_id = ?, updated_at = ? WHERE id = ?',
        params: [input.groupId, input.assigneeId ?? null, now, ticket.id],
      })
      await appendLog({
        ticketId: ticket.id,
        companyId: ticket.company_id,
        actorId: actor.id,
        action: 'transferred',
        summary: `工单由 ${fromGroupName ?? '未分配'} 转派至 ${group.name}${assigneeName ? `（处理人 ${assigneeName}）` : ''}${input.note ? `：${input.note}` : ''}`,
        detail: {
          fromStatus: ticket.status,
          toStatus: 'pending',
          fromGroupId: ticket.group_id,
          toGroupId: input.groupId,
          fromAssigneeId: ticket.assignee_id,
          toAssigneeId: input.assigneeId ?? null,
          note: input.note ?? null,
        },
        createdAt: now,
      }, tx)
    })
    const updated = await loadTicket(ticket.id)
    if (!updated) throw notFound('工单不存在')
    return mapSummary(updated)
  }

  async function completeTicket(ticketId: string, note: string | undefined, actor: Identity): Promise<TicketSummary> {
    const ticket = await requireTicket(ticketId)
    assertVisible(ticket, actor)
    if (ticket.status !== 'pending') throw invalidState('仅待处理工单可以完成')
    if (!(actor.isCompanyAdmin || agentOfCurrentGroup(ticket, actor))) throw forbidden('仅该工单所属业务组成员或公司管理员可完成')
    const now = new Date().toISOString()
    await db.transaction(async (tx) => {
      await tx.run({
        text: 'UPDATE tickets SET status = ?, completed_by = ?, completed_at = ?, updated_at = ? WHERE id = ?',
        params: ['completed', actor.id, now, now, ticket.id],
      })
      await appendLog({
        ticketId: ticket.id,
        companyId: ticket.company_id,
        actorId: actor.id,
        action: 'completed',
        summary: `完成工单${note ? `：${note}` : ''}`,
        detail: { fromStatus: ticket.status, toStatus: 'completed', completedAt: now, note: note ?? null },
        createdAt: now,
      }, tx)
    })
    const updated = await loadTicket(ticket.id)
    if (!updated) throw notFound('工单不存在')
    return mapSummary(updated)
  }

  async function cancelTicket(ticketId: string, reason: string | undefined, actor: Identity): Promise<TicketSummary> {
    const ticket = await requireTicket(ticketId)
    assertVisible(ticket, actor)
    if (isTerminalStatus(ticket.status)) throw invalidState('工单已结束，不能取消')
    if (!(ticket.submitter_id === actor.id || actor.isCompanyAdmin)) throw forbidden('仅提交人本人或公司管理员可取消工单')
    const now = new Date().toISOString()
    await db.transaction(async (tx) => {
      await tx.run({
        text: 'UPDATE tickets SET status = ?, cancelled_by = ?, cancelled_at = ?, updated_at = ? WHERE id = ?',
        params: ['cancelled', actor.id, now, now, ticket.id],
      })
      await appendLog({
        ticketId: ticket.id,
        companyId: ticket.company_id,
        actorId: actor.id,
        action: 'cancelled',
        summary: `取消工单${reason ? `：${reason}` : ''}`,
        detail: { fromStatus: ticket.status, toStatus: 'cancelled', cancelledAt: now, reason: reason ?? null },
        createdAt: now,
      }, tx)
    })
    const updated = await loadTicket(ticket.id)
    if (!updated) throw notFound('工单不存在')
    return mapSummary(updated)
  }

  async function rateTicket(
    ticketId: string,
    input: { score: number; comment?: string },
    actor: Identity,
  ): Promise<{ score: number; comment: string | null; createdAt: string }> {
    const ticket = await requireTicket(ticketId)
    identity.requireTicketUser(actor)
    assertSameCompany(ticket, actor)
    if (ticket.submitter_id !== actor.id) throw forbidden('仅提交人本人可以评价')
    if (ticket.status !== 'completed') throw invalidState('仅已完成工单可以评价')
    const existing = await db.queryOne({ text: 'SELECT id FROM ticket_ratings WHERE ticket_id = ?', params: [ticket.id] })
    if (existing) throw duplicateRating()
    const now = new Date().toISOString()
    try {
      await db.transaction(async (tx) => {
        await tx.run({
          text: `INSERT INTO ticket_ratings (id, ticket_id, company_id, submitter_id, score, comment, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
          params: [randomUUID(), ticket.id, ticket.company_id, actor.id, input.score, input.comment ?? null, now],
        })
        await appendLog({
          ticketId: ticket.id,
          companyId: ticket.company_id,
          actorId: actor.id,
          action: 'rated',
          summary: `提交满意度评价（${input.score} 分）`,
          detail: { score: input.score, comment: input.comment ?? null },
          createdAt: now,
        }, tx)
      })
    } catch (error) {
      if (isUniqueError(error)) throw duplicateRating()
      throw error
    }
    return { score: input.score, comment: input.comment ?? null, createdAt: now }
  }

  async function getNotificationContext(ticketId: string) {
    return db.queryOne<{
      id: string
      code: string
      subject: string
      company_id: string
      status: TicketStatus
      group_id: string | null
      submitter_email: string
      submitter_name: string
      completed_by_name: string | null
      completed_at: string | null
    }>({
      text: `SELECT t.id, t.code, t.subject, t.company_id, t.status, t.group_id,
                    su.email AS submitter_email, su.name AS submitter_name,
                    cu.name AS completed_by_name, t.completed_at
             FROM tickets t JOIN users su ON su.id = t.submitter_id LEFT JOIN users cu ON cu.id = t.completed_by
             WHERE t.id = ?`,
      params: [ticketId],
    })
  }

  return {
    createTicket,
    listTickets,
    getTicketDetail,
    getTicketLogs,
    addReply,
    assignTicket,
    transferTicket,
    completeTicket,
    cancelTicket,
    rateTicket,
    appendLog,
    loadTicket,
    mapSummary,
    canView,
    assertSameCompany,
    getNotificationContext,
  }
}

function mapNotification(row: NotificationRow): NotificationRecord {
  const status = (NOTIFICATION_STATUSES as readonly string[]).includes(row.status) ? row.status : 'failed'
  return {
    id: row.id,
    recipientEmail: row.recipient_email,
    status,
    errorMessage: row.error_message,
    attempt: Number(row.attempt),
    createdAt: row.created_at,
    sentAt: row.sent_at,
  }
}

export type TicketService = ReturnType<typeof createTicketService>
