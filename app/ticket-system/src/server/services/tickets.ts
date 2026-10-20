import type { DbClient } from '@commonapp/dbkit'
import type { CurrentUser } from '../platform/auth'
import { ApiError, forbidden, invalidRequest, invalidState, ticketNotFound } from '../errors'
import { escapeLike, nowIso } from '../util'
import type { NotifyService } from './notify'
import {
  isSortOrder,
  isTicketListStatus,
  isTicketPriority,
  isTicketSortField,
} from '../../shared/contracts'
import type {
  NotificationItem,
  PaginatedResult,
  RatingSummary,
  ReplyItem,
  SubmitterInfoResponse,
  Ticket,
  TicketListItem,
  TicketLogAction,
  TicketLogItem,
  TicketPriority,
  TicketSortField,
  SortOrder,
} from '../../shared/contracts'

export interface CreateTicketInput {
  title: unknown
  description: unknown
  category: unknown
  priority: unknown
}

export interface AssignTicketInput {
  groupId: unknown
  assigneeId: unknown
}

export interface ReassignTicketInput {
  groupId: unknown
  assigneeId: unknown
}

export interface CompleteTicketInput {
  resolution: unknown
}

export interface CancelTicketInput {
  reason: unknown
}

export interface CreateReplyInput {
  content: unknown
}

export interface CreateRatingInput {
  score: unknown
  comment: unknown
}

export interface ListTicketsQuery {
  status?: string
  company?: string
  category?: string
  priority?: string
  q?: string
  sort?: string
  order?: string
  page?: string
  pageSize?: string
}

interface TicketRow {
  id: string
  company_id: string
  company_name: string
  title: string
  description: string
  category: string
  priority: TicketPriority
  status: string
  submitter_id: string
  submitter_name: string
  submitter_email: string
  submitter_department: string | null
  assigned_group_id: string | null
  assigned_group_name: string | null
  assignee_id: string | null
  assignee_name: string | null
  completed_by: string | null
  completed_at: string | null
  first_reply_at: string | null
  rating_score: number | null
  rating_comment: string | null
  rating_created_at: string | null
  created_at: string
  reply_count?: number
}

const TICKET_SELECT = `SELECT t.id, t.company_id, c.name AS company_name, t.title, t.description, t.category, t.priority, t.status,
  t.submitter_id, su.name AS submitter_name, su.email AS submitter_email, sup.department AS submitter_department,
  t.assigned_group_id, g.name AS assigned_group_name, t.assignee_id, au.name AS assignee_name,
  t.completed_by, t.completed_at, t.first_reply_at, t.created_at,
  r.score AS rating_score, r.comment AS rating_comment, r.created_at AS rating_created_at`

const TICKET_JOINS = `FROM tickets t
  JOIN companies c ON c.id = t.company_id
  JOIN users su ON su.id = t.submitter_id
  LEFT JOIN user_profiles sup ON sup.user_id = t.submitter_id
  LEFT JOIN groups g ON g.id = t.assigned_group_id
  LEFT JOIN users au ON au.id = t.assignee_id
  LEFT JOIN ratings r ON r.ticket_id = t.id`

const PENDING_OR_PROCESSING = ['PENDING_ASSIGNMENT', 'PROCESSING']

function isHandlerLike(user: CurrentUser): boolean {
  return user.role === 'handler' || user.role === 'admin'
}

function readTrimmedString(value: unknown, min: number, max: number): string {
  if (typeof value !== 'string') throw invalidRequest()
  const trimmed = value.trim()
  if (trimmed.length < min || trimmed.length > max) throw invalidRequest()
  return trimmed
}

function readOptionalTrimmedString(value: unknown, max: number): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') throw invalidRequest()
  const trimmed = value.trim()
  if (trimmed.length > max) throw invalidRequest()
  return trimmed || null
}

function parsePagination(query: ListTicketsQuery): { page: number; pageSize: number } {
  let page = 1
  let pageSize = 20
  if (query.page !== undefined && query.page !== '') {
    const value = Number(query.page)
    if (!Number.isInteger(value) || value < 1) throw invalidRequest()
    page = value
  }
  if (query.pageSize !== undefined && query.pageSize !== '') {
    const value = Number(query.pageSize)
    if (!Number.isInteger(value) || value < 1 || value > 100) throw invalidRequest()
    pageSize = value
  }
  return { page, pageSize }
}

/** 工单域：创建/列表/详情/状态流转/回复/评价/日志/通知记录（契约 §4/§5）。 */
export function createTicketService(db: DbClient, notify: NotifyService) {
  // -- 读回组装 ------------------------------------------------------------

  function mapTicket(row: TicketRow): Ticket {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      category: row.category,
      priority: row.priority,
      status: row.status as Ticket['status'],
      companyId: row.company_id,
      companyName: row.company_name,
      submitter: {
        id: row.submitter_id,
        name: row.submitter_name,
        email: row.submitter_email,
        department: row.submitter_department ?? null,
      },
      assignedGroupId: row.assigned_group_id ?? null,
      assignedGroupName: row.assigned_group_name ?? null,
      assigneeId: row.assignee_id ?? null,
      assigneeName: row.assignee_name ?? null,
      completedById: row.completed_by ?? null,
      completedAt: row.completed_at ?? null,
      firstReplyAt: row.first_reply_at ?? null,
      rating:
        row.rating_score == null
          ? null
          : { score: Number(row.rating_score), comment: row.rating_comment ?? null, ratedAt: row.rating_created_at as string },
      createdAt: row.created_at,
    }
  }

  function mapTicketListItem(row: TicketRow): TicketListItem {
    return { ...mapTicket(row), replyCount: Number(row.reply_count ?? 0), unreadHint: false }
  }

  async function loadTicketRow(ticketId: string): Promise<TicketRow | null> {
    return db.queryOne<TicketRow>({ text: `${TICKET_SELECT} ${TICKET_JOINS} WHERE t.id = ?`, params: [ticketId] })
  }

  async function loadTicket(ticketId: string): Promise<Ticket> {
    const row = await loadTicketRow(ticketId)
    if (!row) throw ticketNotFound()
    return mapTicket(row)
  }

  /** 可见性（契约 §4.3）：submitter 仅本公司，越权一律 404 不泄露存在性。 */
  function assertVisible(user: CurrentUser, row: TicketRow | null): TicketRow {
    if (!row) throw ticketNotFound()
    if (user.role === 'submitter' && row.company_id !== user.companyId) throw ticketNotFound()
    return row
  }

  async function requireTicket(user: CurrentUser, ticketId: string): Promise<TicketRow> {
    return assertVisible(user, await loadTicketRow(ticketId))
  }

  // -- 日志与发号 ----------------------------------------------------------

  async function insertLog(tx: DbClient, ticketId: string, actorId: string | null, action: TicketLogAction, detail: string | null) {
    await tx.run({
      text: 'INSERT INTO ticket_logs (ticket_id, actor_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)',
      params: [ticketId, actorId, action, detail, nowIso()],
    })
  }

  async function nextTicketId(tx: DbClient): Promise<string> {
    await tx.run({ text: 'UPDATE ticket_sequence SET current_value = current_value + 1 WHERE id = 1' })
    const row = await tx.queryOne<{ current_value: number }>({
      text: 'SELECT current_value FROM ticket_sequence WHERE id = 1',
    })
    if (!row) throw new Error('ticket_sequence row missing')
    return `TK-${String(row.current_value).padStart(6, '0')}`
  }

  /** assign/reassign 的处理人校验：须为 handler/admin 角色用户。 */
  async function assertAssignee(assigneeId: string): Promise<{ id: string; name: string }> {
    const row = await db.queryOne<{ id: string; name: string; role: string }>({
      text: `SELECT u.id, u.name, up.role FROM users u LEFT JOIN user_profiles up ON up.user_id = u.id WHERE u.id = ?`,
      params: [assigneeId],
    })
    if (!row || (row.role !== 'handler' && row.role !== 'admin')) throw invalidRequest()
    return row
  }

  // -- 创建（契约 §4.1）---------------------------------------------------

  async function createTicket(user: CurrentUser, input: CreateTicketInput): Promise<Ticket> {
    if (user.role !== 'submitter') throw forbidden()
    if (!user.companyId) throw forbidden()
    const title = readTrimmedString(input.title, 1, 200)
    const description = readTrimmedString(input.description, 1, 5000)
    const category = readTrimmedString(input.category, 1, 50)
    if (!isTicketPriority(input.priority)) throw invalidRequest()
    const priority = input.priority
    const companyId = user.companyId
    const createdAt = nowIso()

    const ticketId = await db.transaction(async (tx) => {
      const id = await nextTicketId(tx)
      await tx.run({
        text: `INSERT INTO tickets (id, company_id, title, description, category, priority, status, submitter_id, assigned_group_id, assignee_id, completed_by, completed_at, first_reply_at, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, 'PENDING_ASSIGNMENT', ?, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
        params: [id, companyId, title, description, category, priority, user.id, createdAt, createdAt],
      })
      // 创建公司 = 提交人公司（服务端取当前用户，不信任请求体公司字段）。
      const rule = await tx.queryOne<{ group_id: string; group_name: string }>({
        text: `SELECT r.group_id, g.name AS group_name
               FROM category_rules r JOIN groups g ON g.id = r.group_id
               WHERE r.company_id = ? AND r.category = ?`,
        params: [companyId, category],
      })
      if (rule) {
        await tx.run({
          text: `UPDATE tickets SET assigned_group_id = ?, status = 'PROCESSING', updated_at = ? WHERE id = ?`,
          params: [rule.group_id, createdAt, id],
        })
      }
      await insertLog(tx, id, user.id, 'ticket.created', null)
      if (rule) {
        await insertLog(tx, id, null, 'ticket.assigned', `自动分配至业务组「${rule.group_name}」`)
      }
      return id
    })
    return loadTicket(ticketId)
  }

  // -- 列表（契约 §4.2）---------------------------------------------------

  async function listTickets(user: CurrentUser, query: ListTicketsQuery): Promise<PaginatedResult<TicketListItem>> {
    const { page, pageSize } = parsePagination(query)
    const conditions: string[] = []
    const params: unknown[] = []

    // 公司行级隔离：submitter 强制本公司（company 参数忽略）；handler/admin 可选公司过滤。
    if (user.role === 'submitter') {
      conditions.push('t.company_id = ?')
      params.push(user.companyId)
    } else if (query.company && query.company.trim()) {
      conditions.push('t.company_id = ?')
      params.push(query.company.trim())
    }

    let status = query.status
    if (status === undefined || status === '') {
      status = user.role === 'submitter' ? 'ALL' : 'PROCESSING'
    }
    if (!isTicketListStatus(status)) throw invalidRequest()
    if (status !== 'ALL') {
      conditions.push('t.status = ?')
      params.push(status)
    }
    if (query.category && query.category.trim()) {
      conditions.push('t.category = ?')
      params.push(query.category.trim())
    }
    if (query.priority && query.priority.trim()) {
      if (!isTicketPriority(query.priority)) throw invalidRequest()
      conditions.push('t.priority = ?')
      params.push(query.priority)
    }
    if (query.q && query.q.trim()) {
      const like = `%${escapeLike(query.q.trim())}%`
      conditions.push(
        "(t.id LIKE ? ESCAPE '\\' OR t.title LIKE ? ESCAPE '\\' OR t.description LIKE ? ESCAPE '\\')",
      )
      params.push(like, like, like)
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    let sort: TicketSortField = 'createdAt'
    if (query.sort !== undefined && query.sort !== '') {
      if (!isTicketSortField(query.sort)) throw invalidRequest()
      sort = query.sort
    }
    let order: SortOrder = 'desc'
    if (query.order !== undefined && query.order !== '') {
      if (!isSortOrder(query.order)) throw invalidRequest()
      order = query.order
    }
    const sortColumn =
      sort === 'priority'
        ? `CASE t.priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 ELSE 4 END`
        : sort === 'firstReplyAt'
          ? 't.first_reply_at'
          : 't.created_at'
    const direction = order === 'asc' ? 'ASC' : 'DESC'

    const totalRow = await db.queryOne<{ total: number }>({
      text: `SELECT COUNT(*) AS total FROM tickets t ${where}`,
      params,
    })
    const rows = await db.queryAll<TicketRow>({
      text: `${TICKET_SELECT}, (SELECT COUNT(*) FROM replies rp WHERE rp.ticket_id = t.id) AS reply_count
             ${TICKET_JOINS}
             ${where}
             ORDER BY ${sortColumn} ${direction}, t.created_at ${direction}, t.id ${direction}
             LIMIT ? OFFSET ?`,
      params: [...params, pageSize, (page - 1) * pageSize],
    })
    return {
      items: rows.map(mapTicketListItem),
      page,
      pageSize,
      total: Number(totalRow?.total ?? 0),
    }
  }

  // -- 详情（契约 §4.3）---------------------------------------------------

  async function getTicket(user: CurrentUser, ticketId: string): Promise<Ticket> {
    const row = await requireTicket(user, ticketId)
    return mapTicket(row)
  }

  // -- 人工分配（契约 §4.4）-----------------------------------------------

  async function assignTicket(user: CurrentUser, ticketId: string, input: AssignTicketInput): Promise<Ticket> {
    if (!isHandlerLike(user)) throw forbidden()
    const row = await requireTicket(user, ticketId)
    if (row.status !== 'PENDING_ASSIGNMENT') throw invalidState()
    if (typeof input.groupId !== 'string' || !input.groupId.trim()) throw invalidRequest()
    const groupId = input.groupId.trim()
    if (input.assigneeId !== undefined && input.assigneeId !== null && typeof input.assigneeId !== 'string') {
      throw invalidRequest()
    }
    const assigneeId = typeof input.assigneeId === 'string' && input.assigneeId.trim() ? input.assigneeId.trim() : null
    const group = await db.queryOne<{ id: string; name: string; company_id: string }>({
      text: 'SELECT id, name, company_id FROM groups WHERE id = ? AND company_id = ?',
      params: [groupId, row.company_id],
    })
    if (!group) throw new ApiError(400, 'group_company_mismatch')
    const assignee = assigneeId ? await assertAssignee(assigneeId) : null
    const updatedAt = nowIso()
    await db.transaction(async (tx) => {
      await tx.run({
        text: `UPDATE tickets SET assigned_group_id = ?, assignee_id = ?, status = 'PROCESSING', updated_at = ? WHERE id = ?`,
        params: [groupId, assigneeId, updatedAt, ticketId],
      })
      const detail = assignee
        ? `人工分配至业务组「${group.name}」，处理人：${assignee.name}`
        : `人工分配至业务组「${group.name}」`
      await insertLog(tx, ticketId, user.id, 'ticket.assigned', detail)
    })
    return loadTicket(ticketId)
  }

  // -- 转派（契约 §4.5）---------------------------------------------------

  async function reassignTicket(user: CurrentUser, ticketId: string, input: ReassignTicketInput): Promise<Ticket> {
    if (!isHandlerLike(user)) throw forbidden()
    const row = await requireTicket(user, ticketId)
    if (row.status !== 'PROCESSING') throw invalidState()
    if (
      (input.groupId === undefined || input.groupId === null || input.groupId === '') &&
      (input.assigneeId === undefined || input.assigneeId === null || input.assigneeId === '')
    ) {
      throw invalidRequest()
    }
    let group: { id: string; name: string } | null = null
    if (typeof input.groupId === 'string' && input.groupId.trim()) {
      const groupId = input.groupId.trim()
      const candidate = await db.queryOne<{ id: string; name: string; company_id: string }>({
        text: 'SELECT id, name, company_id FROM groups WHERE id = ? AND company_id = ?',
        params: [groupId, row.company_id],
      })
      if (!candidate) throw new ApiError(400, 'group_company_mismatch')
      group = candidate
    } else if (input.groupId !== undefined && input.groupId !== null && typeof input.groupId !== 'string') {
      throw invalidRequest()
    }
    let assignee: { id: string; name: string } | null = null
    if (typeof input.assigneeId === 'string' && input.assigneeId.trim()) {
      assignee = await assertAssignee(input.assigneeId.trim())
    } else if (input.assigneeId !== undefined && input.assigneeId !== null && typeof input.assigneeId !== 'string') {
      throw invalidRequest()
    }
    if (!group && !assignee) throw invalidRequest()
    const updatedAt = nowIso()
    await db.transaction(async (tx) => {
      if (group) {
        await tx.run({
          text: 'UPDATE tickets SET assigned_group_id = ?, updated_at = ? WHERE id = ?',
          params: [group.id, updatedAt, ticketId],
        })
      }
      if (assignee) {
        await tx.run({
          text: 'UPDATE tickets SET assignee_id = ?, updated_at = ? WHERE id = ?',
          params: [assignee.id, updatedAt, ticketId],
        })
      }
      const targets: string[] = []
      if (group) targets.push(`业务组「${group.name}」`)
      if (assignee) targets.push(`处理人 ${assignee.name}`)
      await insertLog(tx, ticketId, user.id, 'ticket.reassigned', `转派至${targets.join('，')}`)
    })
    return loadTicket(ticketId)
  }

  // -- 完成（契约 §4.6）---------------------------------------------------

  async function completeTicket(user: CurrentUser, ticketId: string, input: CompleteTicketInput): Promise<Ticket> {
    if (!isHandlerLike(user)) throw forbidden()
    const row = await requireTicket(user, ticketId)
    if (row.status !== 'PROCESSING') throw invalidState()
    const resolution = readOptionalTrimmedString(input.resolution, 2000)
    const completedAt = nowIso()
    await db.transaction(async (tx) => {
      await tx.run({
        text: `UPDATE tickets SET status = 'COMPLETED', completed_by = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
        params: [user.id, completedAt, completedAt, ticketId],
      })
      await insertLog(tx, ticketId, user.id, 'ticket.completed', resolution)
    })
    // 事务提交后发送完成通知（邮件失败不回滚，结果落 notifications）。
    await notify.sendCompletionNotification(ticketId)
    return loadTicket(ticketId)
  }

  // -- 取消（契约 §4.7）---------------------------------------------------

  async function cancelTicket(user: CurrentUser, ticketId: string, input: CancelTicketInput): Promise<Ticket> {
    const row = await loadTicketRow(ticketId)
    if (!row) throw ticketNotFound()
    if (user.role === 'submitter') {
      // 仅本人提交且本公司；跨公司 404 不泄露，同公司他人工单 403。
      if (row.company_id !== user.companyId) throw ticketNotFound()
      if (row.submitter_id !== user.id) throw forbidden()
    } else if (user.role !== 'admin') {
      throw forbidden()
    }
    if (!PENDING_OR_PROCESSING.includes(row.status)) throw invalidState()
    const reason = readOptionalTrimmedString(input.reason, 200)
    const updatedAt = nowIso()
    await db.transaction(async (tx) => {
      await tx.run({
        text: `UPDATE tickets SET status = 'CANCELLED', updated_at = ? WHERE id = ?`,
        params: [updatedAt, ticketId],
      })
      await insertLog(tx, ticketId, user.id, 'ticket.cancelled', reason)
    })
    return loadTicket(ticketId)
  }

  // -- 提交人完整信息（契约 §4.8）-----------------------------------------

  async function getSubmitterInfo(user: CurrentUser, ticketId: string): Promise<SubmitterInfoResponse> {
    if (!isHandlerLike(user)) throw forbidden()
    const row = await requireTicket(user, ticketId)
    const profile = await db.queryOne<{ name: string; email: string; department: string | null; companyName: string | null }>({
      text: `SELECT u.name, u.email, up.department, c.name AS companyName
             FROM users u
             LEFT JOIN user_profiles up ON up.user_id = u.id
             LEFT JOIN companies c ON c.id = u.company_id
             WHERE u.id = ?`,
      params: [row.submitter_id],
    })
    const historyRows = await db.queryAll<TicketRow>({
      text: `${TICKET_SELECT}, (SELECT COUNT(*) FROM replies rp WHERE rp.ticket_id = t.id) AS reply_count
             ${TICKET_JOINS}
             WHERE t.submitter_id = ?
             ORDER BY t.created_at DESC, t.id DESC`,
      params: [row.submitter_id],
    })
    return {
      user: {
        id: row.submitter_id,
        name: profile?.name ?? row.submitter_name,
        email: profile?.email ?? row.submitter_email,
        companyName: profile?.companyName ?? row.company_name,
        department: profile?.department ?? row.submitter_department ?? null,
      },
      historyTickets: historyRows.map(mapTicketListItem),
    }
  }

  // -- 回复（契约 §5.1/§5.2）----------------------------------------------

  function mapReplyRow(row: {
    id: number
    ticket_id: string
    author_id: string
    author_name: string
    author_role: string | null
    content: string
    created_at: string
  }): ReplyItem {
    return {
      id: Number(row.id),
      ticketId: row.ticket_id,
      authorId: row.author_id,
      authorName: row.author_name,
      authorRole: row.author_role ?? 'user',
      content: row.content,
      createdAt: row.created_at,
    }
  }

  async function loadReply(replyId: number): Promise<ReplyItem> {
    const row = await db.queryOne<{
      id: number
      ticket_id: string
      author_id: string
      author_name: string
      author_role: string | null
      content: string
      created_at: string
    }>({
      text: `SELECT r.id, r.ticket_id, r.author_id, u.name AS author_name, up.role AS author_role, r.content, r.created_at
             FROM replies r
             JOIN users u ON u.id = r.author_id
             LEFT JOIN user_profiles up ON up.user_id = r.author_id
             WHERE r.id = ?`,
      params: [replyId],
    })
    if (!row) throw ticketNotFound()
    return mapReplyRow(row)
  }

  async function listReplies(user: CurrentUser, ticketId: string): Promise<{ items: ReplyItem[] }> {
    const row = await requireTicket(user, ticketId)
    void row
    const rows = await db.queryAll<{
      id: number
      ticket_id: string
      author_id: string
      author_name: string
      author_role: string | null
      content: string
      created_at: string
    }>({
      text: `SELECT r.id, r.ticket_id, r.author_id, u.name AS author_name, up.role AS author_role, r.content, r.created_at
             FROM replies r
             JOIN users u ON u.id = r.author_id
             LEFT JOIN user_profiles up ON up.user_id = r.author_id
             WHERE r.ticket_id = ?
             ORDER BY r.created_at ASC, r.id ASC`,
      params: [ticketId],
    })
    return { items: rows.map(mapReplyRow) }
  }

  async function addReply(user: CurrentUser, ticketId: string, input: CreateReplyInput): Promise<ReplyItem> {
    const row = await loadTicketRow(ticketId)
    if (!row) throw ticketNotFound()
    if (user.role === 'submitter') {
      if (row.company_id !== user.companyId) throw ticketNotFound()
      if (row.submitter_id !== user.id) throw forbidden()
    }
    const content = readTrimmedString(input.content, 1, 5000)
    if (!PENDING_OR_PROCESSING.includes(row.status)) throw invalidState()
    const createdAt = nowIso()
    const replyId = await db.transaction(async (tx) => {
      const inserted = await tx.queryOne<{ id: number }>({
        text: 'INSERT INTO replies (ticket_id, author_id, content, created_at) VALUES (?, ?, ?, ?) RETURNING id',
        params: [ticketId, user.id, content, createdAt],
      })
      if (!inserted) throw new Error('reply insert returned no id')
      const countRow = await tx.queryOne<{ total: number }>({
        text: 'SELECT COUNT(*) AS total FROM replies WHERE ticket_id = ?',
        params: [ticketId],
      })
      if (Number(countRow?.total ?? 0) === 1) {
        await tx.run({
          text: 'UPDATE tickets SET first_reply_at = ?, updated_at = ? WHERE id = ? AND first_reply_at IS NULL',
          params: [createdAt, createdAt, ticketId],
        })
      }
      await insertLog(tx, ticketId, user.id, 'ticket.replied', null)
      return Number(inserted.id)
    })
    return loadReply(replyId)
  }

  // -- 评价（契约 §5.3）---------------------------------------------------

  async function addRating(user: CurrentUser, ticketId: string, input: CreateRatingInput): Promise<RatingSummary> {
    if (user.role !== 'submitter') throw forbidden()
    const row = await loadTicketRow(ticketId)
    if (!row) throw ticketNotFound()
    if (row.company_id !== user.companyId) throw ticketNotFound()
    if (row.submitter_id !== user.id) throw forbidden()
    if (row.status !== 'COMPLETED') throw invalidState()
    if (typeof input.score !== 'number' || !Number.isInteger(input.score) || input.score < 1 || input.score > 5) {
      throw invalidRequest()
    }
    const comment = readOptionalTrimmedString(input.comment, 1000)
    const existing = await db.queryOne<{ id: number }>({
      text: 'SELECT id FROM ratings WHERE ticket_id = ?',
      params: [ticketId],
    })
    if (existing) throw new ApiError(409, 'rating_exists')
    const ratedAt = nowIso()
    await db.transaction(async (tx) => {
      await tx.run({
        text: 'INSERT INTO ratings (ticket_id, rater_id, score, comment, created_at) VALUES (?, ?, ?, ?, ?)',
        params: [ticketId, user.id, input.score, comment, ratedAt],
      })
      await insertLog(tx, ticketId, user.id, 'ticket.rated', comment)
    })
    return { score: input.score, comment, ratedAt }
  }

  // -- 日志（契约 §5.4）---------------------------------------------------

  async function listLogs(user: CurrentUser, ticketId: string): Promise<{ items: TicketLogItem[] }> {
    const row = await requireTicket(user, ticketId)
    void row
    const rows = await db.queryAll<{
      id: number
      ticket_id: string
      actor_id: string | null
      actor_name: string | null
      action: TicketLogAction
      detail: string | null
      created_at: string
    }>({
      text: `SELECT l.id, l.ticket_id, l.actor_id, u.name AS actor_name, l.action, l.detail, l.created_at
             FROM ticket_logs l
             LEFT JOIN users u ON u.id = l.actor_id
             WHERE l.ticket_id = ?
             ORDER BY l.created_at ASC, l.id ASC`,
      params: [ticketId],
    })
    return {
      items: rows.map((row) => ({
        id: Number(row.id),
        ticketId: row.ticket_id,
        actorId: row.actor_id ?? null,
        actorName: row.actor_name ?? null,
        action: row.action,
        detail: row.detail ?? null,
        createdAt: row.created_at,
      })),
    }
  }

  // -- 通知记录（契约 §5.5）-----------------------------------------------

  async function listNotifications(user: CurrentUser, ticketId: string): Promise<{ items: NotificationItem[] }> {
    const row = await loadTicketRow(ticketId)
    if (!row) throw ticketNotFound()
    if (user.role === 'submitter') {
      if (row.company_id !== user.companyId) throw ticketNotFound()
      if (row.submitter_id !== user.id) throw forbidden()
    }
    const rows = await db.queryAll<{
      id: number
      ticket_id: string
      to_email: string
      subject: string
      status: 'sent' | 'skipped' | 'failed'
      error: string | null
      created_at: string
    }>({
      text: `SELECT n.id, n.ticket_id, n.to_email, n.subject, n.status, n.error, n.created_at
             FROM notifications n
             WHERE n.ticket_id = ?
             ORDER BY n.created_at ASC, n.id ASC`,
      params: [ticketId],
    })
    return {
      items: rows.map((row) => ({
        id: Number(row.id),
        ticketId: row.ticket_id,
        toEmail: row.to_email,
        subject: row.subject,
        status: row.status,
        error: row.error ?? null,
        createdAt: row.created_at,
      })),
    }
  }

  return {
    createTicket,
    listTickets,
    getTicket,
    assignTicket,
    reassignTicket,
    completeTicket,
    cancelTicket,
    getSubmitterInfo,
    listReplies,
    addReply,
    addRating,
    listLogs,
    listNotifications,
  }
}

export type TicketService = ReturnType<typeof createTicketService>
