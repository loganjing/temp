import type { DbClient } from '@commonapp/dbkit'
import {
  ApiError,
  ERROR_CODES,
  PRIORITIES,
  TICKET_STATUS,
  type CreateEvaluationRequest,
  type CreateReplyRequest,
  type CreateTicketRequest,
  type EvaluationResponse,
  type ReplyResponse,
  type TicketDetail,
  type TicketListItem,
  type TransferResponse,
  type TransferTicketRequest,
  type UpdateStatusRequest,
} from '../shared/types'

// ── Helpers ────────────────────────────────────────────────────────────

const now = (): string => new Date().toISOString()

function requireField(value: unknown, field: string): asserts value is string | number {
  if (value === undefined || value === null || value === '') {
    throw new ApiError(400, ERROR_CODES.MISSING_FIELD, `Missing required field: ${field}`)
  }
}

// ── Company services ───────────────────────────────────────────────────

export async function listCompanies(db: DbClient) {
  const rows = await db.queryAll<{ id: number; name: string; created_at: string }>({
    text: 'SELECT id, name, created_at FROM companies ORDER BY id',
  })
  return rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at }))
}

export async function createCompany(db: DbClient, name: string) {
  requireField(name, 'name')
  const ts = now()
  await db.run({
    text: 'INSERT INTO companies (name, created_at) VALUES (?, ?)',
    params: [name, ts],
  })
  const row = await db.queryOne<{ id: number; name: string; created_at: string }>({
    text: 'SELECT id, name, created_at FROM companies WHERE rowid = last_insert_rowid()',
  })
  return { id: row!.id, name: row!.name, createdAt: row!.created_at }
}

// ── User services ──────────────────────────────────────────────────────

export async function getUserDetail(db: DbClient, id: number) {
  const row = await db.queryOne<{
    id: number; name: string; email: string
    company_id: number | null; company_name: string | null
    department: string | null; created_at: string
  }>({
    text: `SELECT u.id, u.name, u.email, u.company_id, c.name AS company_name,
              u.department, u.created_at
            FROM users u LEFT JOIN companies c ON c.id = u.company_id
            WHERE u.id = ?`,
    params: [id],
  })
  if (!row) throw new ApiError(404, ERROR_CODES.USER_NOT_FOUND, 'User not found')

  const tickets = await db.queryAll<{ id: number; ticket_no: string; subject: string; status: string; priority: string; created_at: string }>({
    text: `SELECT id, ticket_no, subject, status, priority, created_at
            FROM tickets WHERE submitter_id = ? ORDER BY created_at DESC`,
    params: [id],
  })

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    companyId: row.company_id,
    companyName: row.company_name,
    department: row.department,
    createdAt: row.created_at,
    historicalTickets: tickets.map((t) => ({
      id: t.id,
      ticketNo: t.ticket_no,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      createdAt: t.created_at,
    })),
  }
}

/** Insert a user directly (no public endpoint — users originate externally). */
export async function seedUser(
  db: DbClient,
  data: { name: string; email: string; companyId?: number; department?: string },
): Promise<number> {
  const ts = now()
  await db.run({
    text: 'INSERT INTO users (name, email, company_id, department, created_at) VALUES (?, ?, ?, ?, ?)',
    params: [data.name, data.email, data.companyId ?? null, data.department ?? null, ts],
  })
  const row = await db.queryOne<{ id: number }>({ text: 'SELECT last_insert_rowid() AS id' })
  return row!.id
}

// ── Category services ──────────────────────────────────────────────────

export async function listCategories(db: DbClient) {
  const rows = await db.queryAll<{ id: number; name: string; created_at: string }>({
    text: 'SELECT id, name, created_at FROM categories ORDER BY id',
  })
  return rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at }))
}

export async function createCategory(db: DbClient, name: string) {
  requireField(name, 'name')
  const ts = now()
  await db.run({
    text: 'INSERT INTO categories (name, created_at) VALUES (?, ?)',
    params: [name, ts],
  })
  const row = await db.queryOne<{ id: number; name: string; created_at: string }>({
    text: 'SELECT id, name, created_at FROM categories WHERE rowid = last_insert_rowid()',
  })
  return { id: row!.id, name: row!.name, createdAt: row!.created_at }
}

// ── Business group services ────────────────────────────────────────────

export async function listBusinessGroups(db: DbClient, companyId: number) {
  const rows = await db.queryAll<{ id: number; company_id: number; name: string; created_at: string }>({
    text: 'SELECT id, company_id, name, created_at FROM business_groups WHERE company_id = ? ORDER BY id',
    params: [companyId],
  })
  return rows.map((r) => ({ id: r.id, companyId: r.company_id, name: r.name, createdAt: r.created_at }))
}

export async function createBusinessGroup(db: DbClient, companyId: number, name: string) {
  // Verify company exists
  const company = await db.queryOne<{ id: number }>({ text: 'SELECT id FROM companies WHERE id = ?', params: [companyId] })
  if (!company) throw new ApiError(404, ERROR_CODES.GROUP_NOT_FOUND, 'Company not found')

  requireField(name, 'name')
  const ts = now()
  await db.run({
    text: 'INSERT INTO business_groups (company_id, name, created_at) VALUES (?, ?, ?)',
    params: [companyId, name, ts],
  })
  const row = await db.queryOne<{ id: number; company_id: number; name: string; created_at: string }>({
    text: 'SELECT id, company_id, name, created_at FROM business_groups WHERE rowid = last_insert_rowid()',
  })
  return { id: row!.id, companyId: row!.company_id, name: row!.name, createdAt: row!.created_at }
}

export async function listGroupMembers(db: DbClient, groupId: number) {
  const rows = await db.queryAll<{
    id: number; group_id: number; user_id: number; user_name: string
    user_email: string; created_at: string
  }>({
    text: `SELECT m.id, m.group_id, m.user_id, u.name AS user_name, u.email AS user_email, m.created_at
            FROM business_group_members m JOIN users u ON u.id = m.user_id
            WHERE m.group_id = ? ORDER BY m.id`,
    params: [groupId],
  })
  return rows.map((r) => ({
    id: r.id,
    groupId: r.group_id,
    userId: r.user_id,
    userName: r.user_name,
    userEmail: r.user_email,
    createdAt: r.created_at,
  }))
}

export async function addGroupMember(db: DbClient, groupId: number, userId: number) {
  const group = await db.queryOne<{ id: number }>({ text: 'SELECT id FROM business_groups WHERE id = ?', params: [groupId] })
  if (!group) throw new ApiError(404, ERROR_CODES.GROUP_NOT_FOUND, 'Business group not found')

  const user = await db.queryOne<{ id: number; name: string }>({ text: 'SELECT id, name FROM users WHERE id = ?', params: [userId] })
  if (!user) throw new ApiError(404, ERROR_CODES.USER_NOT_FOUND, 'User not found')

  const existing = await db.queryOne<{ id: number }>({
    text: 'SELECT id FROM business_group_members WHERE group_id = ? AND user_id = ?',
    params: [groupId, userId],
  })
  if (existing) throw new ApiError(409, ERROR_CODES.MEMBER_EXISTS, 'Member already exists')

  const ts = now()
  await db.run({
    text: 'INSERT INTO business_group_members (group_id, user_id, created_at) VALUES (?, ?, ?)',
    params: [groupId, userId, ts],
  })
  const row = await db.queryOne<{ id: number; group_id: number; user_id: number; created_at: string }>({
    text: 'SELECT id, group_id, user_id, created_at FROM business_group_members WHERE rowid = last_insert_rowid()',
  })
  return { id: row!.id, groupId: row!.group_id, userId: row!.user_id, userName: user.name, createdAt: row!.created_at }
}

export async function removeGroupMember(db: DbClient, groupId: number, userId: number): Promise<number> {
  const result = await db.run({
    text: 'DELETE FROM business_group_members WHERE group_id = ? AND user_id = ?',
    params: [groupId, userId],
  })
  return result.changes
}

// ── Category→group rule services ───────────────────────────────────────

export async function listRules(db: DbClient, companyId?: number) {
  const rows = companyId
    ? await db.queryAll<{
        id: number; company_id: number; company_name: string
        category_id: number; category_name: string
        group_id: number; group_name: string; created_at: string
      }>({
        text: `SELECT r.id, r.company_id, c.name AS company_name,
                  r.category_id, cat.name AS category_name,
                  r.group_id, g.name AS group_name, r.created_at
                FROM category_group_rules r
                JOIN companies c ON c.id = r.company_id
                JOIN categories cat ON cat.id = r.category_id
                JOIN business_groups g ON g.id = r.group_id
                WHERE r.company_id = ? ORDER BY r.id`,
        params: [companyId],
      })
    : await db.queryAll<{
        id: number; company_id: number; company_name: string
        category_id: number; category_name: string
        group_id: number; group_name: string; created_at: string
      }>({
        text: `SELECT r.id, r.company_id, c.name AS company_name,
                  r.category_id, cat.name AS category_name,
                  r.group_id, g.name AS group_name, r.created_at
                FROM category_group_rules r
                JOIN companies c ON c.id = r.company_id
                JOIN categories cat ON cat.id = r.category_id
                JOIN business_groups g ON g.id = r.group_id
                ORDER BY r.id`,
      })
  return rows.map((r) => ({
    id: r.id,
    companyId: r.company_id,
    companyName: r.company_name,
    categoryId: r.category_id,
    categoryName: r.category_name,
    groupId: r.group_id,
    groupName: r.group_name,
    createdAt: r.created_at,
  }))
}

export async function createRule(db: DbClient, companyId: number, categoryId: number, groupId: number) {
  const existing = await db.queryOne<{ id: number }>({
    text: 'SELECT id FROM category_group_rules WHERE company_id = ? AND category_id = ?',
    params: [companyId, categoryId],
  })
  if (existing) throw new ApiError(409, ERROR_CODES.RULE_EXISTS, 'Rule already exists for this company and category')

  const ts = now()
  await db.run({
    text: 'INSERT INTO category_group_rules (company_id, category_id, group_id, created_at) VALUES (?, ?, ?, ?)',
    params: [companyId, categoryId, groupId, ts],
  })
  const row = await db.queryOne<{ id: number; company_id: number; category_id: number; group_id: number; created_at: string }>({
    text: 'SELECT id, company_id, category_id, group_id, created_at FROM category_group_rules WHERE rowid = last_insert_rowid()',
  })
  return { id: row!.id, companyId: row!.company_id, categoryId: row!.category_id, groupId: row!.group_id, createdAt: row!.created_at }
}

export async function deleteRule(db: DbClient, id: number): Promise<number> {
  const result = await db.run({ text: 'DELETE FROM category_group_rules WHERE id = ?', params: [id] })
  return result.changes
}

// ── Ticket services ────────────────────────────────────────────────────

/** Generate ticket number TKT-YYYYMMDD-NNNN with daily sequence. */
async function generateTicketNo(db: DbClient): Promise<string> {
  const date = new Date()
  const yyyy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  const prefix = `TKT-${yyyy}${mm}${dd}-`

  const row = await db.queryOne<{ cnt: number }>({
    text: 'SELECT COUNT(*) AS cnt FROM tickets WHERE ticket_no LIKE ?',
    params: [`${prefix}%`],
  })
  const seq = (row?.cnt ?? 0) + 1
  return `${prefix}${String(seq).padStart(4, '0')}`
}

interface TicketRow {
  id: number; ticket_no: string; subject: string; description: string | null
  category_id: number; category_name: string
  priority: string; status: string
  submitter_id: number; submitter_name: string; submitter_email: string
  submitter_company_id: number | null; submitter_company_name: string | null
  submitter_department: string | null; submitter_created_at: string
  assigned_group_id: number | null; assigned_group_name: string | null; assigned_group_company_id: number | null
  assignee_id: number | null; assignee_name: string | null
  handled_by: number | null; handled_at: string | null
  created_at: string; updated_at: string; completed_at: string | null
}

const TICKET_JOIN_SQL = `
  SELECT t.id, t.ticket_no, t.subject, t.description,
    t.category_id, cat.name AS category_name,
    t.priority, t.status,
    t.submitter_id, u.name AS submitter_name, u.email AS submitter_email,
    u.company_id AS submitter_company_id, c.name AS submitter_company_name,
    u.department AS submitter_department, u.created_at AS submitter_created_at,
    t.assigned_group_id, g.name AS assigned_group_name, g.company_id AS assigned_group_company_id,
    t.assignee_id, a.name AS assignee_name,
    t.handled_by, t.handled_at,
    t.created_at, t.updated_at, t.completed_at
  FROM tickets t
  JOIN categories cat ON cat.id = t.category_id
  JOIN users u ON u.id = t.submitter_id
  LEFT JOIN companies c ON c.id = u.company_id
  LEFT JOIN business_groups g ON g.id = t.assigned_group_id
  LEFT JOIN users a ON a.id = t.assignee_id
`

async function fetchTicketRow(db: DbClient, id: number): Promise<TicketRow> {
  const row = await db.queryOne<TicketRow>({ text: `${TICKET_JOIN_SQL} WHERE t.id = ?`, params: [id] })
  if (!row) throw new ApiError(404, ERROR_CODES.TICKET_NOT_FOUND, 'Ticket not found')
  return row
}

/** Build full detail with replies, transfers, and evaluation. */
async function buildTicketDetail(db: DbClient, row: TicketRow): Promise<TicketDetail> {
  const [replies, transfers, evaluation] = await Promise.all([
    fetchReplies(db, row.id),
    fetchTransfers(db, row.id),
    fetchEvaluation(db, row.id),
  ])

  return {
    id: row.id,
    ticketNo: row.ticket_no,
    subject: row.subject,
    description: row.description,
    categoryId: row.category_id,
    categoryName: row.category_name,
    priority: row.priority,
    status: row.status,
    submitterId: row.submitter_id,
    submitter: {
      id: row.submitter_id,
      name: row.submitter_name,
      email: row.submitter_email,
      companyId: row.submitter_company_id,
      companyName: row.submitter_company_name,
      department: row.submitter_department,
      createdAt: row.submitter_created_at,
    },
    assignedGroupId: row.assigned_group_id,
    assignedGroup: row.assigned_group_id
      ? { id: row.assigned_group_id, name: row.assigned_group_name!, companyId: row.assigned_group_company_id! }
      : null,
    assigneeId: row.assignee_id,
    assignee: row.assignee_id ? { id: row.assignee_id, name: row.assignee_name! } : null,
    handledById: row.handled_by,
    handledAt: row.handled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    replies,
    transfers,
    evaluation,
  }
}

export async function createTicket(db: DbClient, body: CreateTicketRequest): Promise<TicketDetail> {
  requireField(body.subject, 'subject')
  requireField(body.categoryId, 'categoryId')
  requireField(body.priority, 'priority')
  requireField(body.submitterId, 'submitterId')

  if (!PRIORITIES.includes(body.priority)) {
    throw new ApiError(400, ERROR_CODES.INVALID_PRIORITY, 'Priority must be one of P0-P4')
  }

  // Verify category exists
  const category = await db.queryOne<{ id: number }>({ text: 'SELECT id FROM categories WHERE id = ?', params: [body.categoryId] })
  if (!category) throw new ApiError(404, ERROR_CODES.CATEGORY_NOT_FOUND, 'Category not found')

  // Verify submitter exists
  const submitter = await db.queryOne<{ id: number; company_id: number | null }>({
    text: 'SELECT id, company_id FROM users WHERE id = ?',
    params: [body.submitterId],
  })
  if (!submitter) throw new ApiError(404, ERROR_CODES.USER_NOT_FOUND, 'Submitter not found')

  // Check auto-assignment rule
  const rule = submitter.company_id
    ? await db.queryOne<{ group_id: number }>({
        text: 'SELECT group_id FROM category_group_rules WHERE company_id = ? AND category_id = ?',
        params: [submitter.company_id, body.categoryId],
      })
    : null

  const ticketNo = await generateTicketNo(db)
  const ts = now()
  const status = rule ? TICKET_STATUS.PENDING_PROCESSING : TICKET_STATUS.PENDING_ASSIGNMENT
  const assignedGroupId = rule?.group_id ?? null

  await db.run({
    text: `INSERT INTO tickets
      (ticket_no, subject, description, category_id, priority, status, submitter_id, assigned_group_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [ticketNo, body.subject, body.description ?? null, body.categoryId, body.priority, status, body.submitterId, assignedGroupId, ts, ts],
  })

  const idRow = await db.queryOne<{ id: number }>({ text: 'SELECT last_insert_rowid() AS id' })
  const row = await fetchTicketRow(db, idRow!.id)
  return buildTicketDetail(db, row)
}

export async function listTickets(
  db: DbClient,
  filters: { status?: string; categoryId?: number; priority?: string; assigneeId?: number; submitterId?: number },
): Promise<TicketListItem[]> {
  const conditions: string[] = []
  const params: unknown[] = []

  if (filters.status) { conditions.push('t.status = ?'); params.push(filters.status) }
  if (filters.categoryId !== undefined) { conditions.push('t.category_id = ?'); params.push(filters.categoryId) }
  if (filters.priority) { conditions.push('t.priority = ?'); params.push(filters.priority) }
  if (filters.assigneeId !== undefined) { conditions.push('t.assignee_id = ?'); params.push(filters.assigneeId) }
  if (filters.submitterId !== undefined) { conditions.push('t.submitter_id = ?'); params.push(filters.submitterId) }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const rows = await db.queryAll<{
    id: number; ticket_no: string; subject: string; priority: string; status: string
    category_id: number; category_name: string
    submitter_id: number; submitter_name: string
    assigned_group_id: number | null; assignee_id: number | null; created_at: string
  }>({
    text: `SELECT t.id, t.ticket_no, t.subject, t.priority, t.status,
              t.category_id, cat.name AS category_name,
              t.submitter_id, u.name AS submitter_name,
              t.assigned_group_id, t.assignee_id, t.created_at
            FROM tickets t
            JOIN categories cat ON cat.id = t.category_id
            JOIN users u ON u.id = t.submitter_id
            ${where} ORDER BY t.created_at DESC`,
    params,
  })

  return rows.map((r) => ({
    id: r.id,
    ticketNo: r.ticket_no,
    subject: r.subject,
    priority: r.priority,
    status: r.status,
    categoryId: r.category_id,
    categoryName: r.category_name,
    submitterId: r.submitter_id,
    submitterName: r.submitter_name,
    assignedGroupId: r.assigned_group_id,
    assigneeId: r.assignee_id,
    createdAt: r.created_at,
  }))
}

export async function getTicketDetail(db: DbClient, id: number): Promise<TicketDetail> {
  const row = await fetchTicketRow(db, id)
  return buildTicketDetail(db, row)
}

// State machine: valid transitions
const VALID_TRANSITIONS: Record<string, Record<string, boolean>> = {
  [TICKET_STATUS.CREATED]: { [TICKET_STATUS.PENDING_ASSIGNMENT]: true },
  [TICKET_STATUS.PENDING_ASSIGNMENT]: {
    [TICKET_STATUS.PENDING_PROCESSING]: true,
    [TICKET_STATUS.CANCELLED]: true,
  },
  [TICKET_STATUS.PENDING_PROCESSING]: {
    [TICKET_STATUS.COMPLETED]: true,
    [TICKET_STATUS.CANCELLED]: true,
  },
}

export async function updateTicketStatus(db: DbClient, id: number, body: UpdateStatusRequest): Promise<TicketDetail> {
  requireField(body.status, 'status')

  const row = await fetchTicketRow(db, id)
  const current = row.status
  const target = body.status

  const allowed = VALID_TRANSITIONS[current]?.[target]
  if (!allowed) {
    throw new ApiError(400, ERROR_CODES.INVALID_TRANSITION, `Cannot transition from ${current} to ${target}`)
  }

  const ts = now()
  const updates: string[] = ['status = ?', 'updated_at = ?']
  const params: unknown[] = [target, ts]

  if (target === TICKET_STATUS.PENDING_PROCESSING) {
    if (body.groupId) { updates.push('assigned_group_id = ?'); params.push(body.groupId) }
    if (body.assigneeId) { updates.push('assignee_id = ?'); params.push(body.assigneeId) }
  } else if (target === TICKET_STATUS.COMPLETED) {
    updates.push('handled_by = ?'); params.push(body.assigneeId ?? null)
    updates.push('handled_at = ?'); params.push(ts)
    updates.push('completed_at = ?'); params.push(ts)
  }

  params.push(id)
  await db.run({ text: `UPDATE tickets SET ${updates.join(', ')} WHERE id = ?`, params })

  const updated = await fetchTicketRow(db, id)
  return buildTicketDetail(db, updated)
}

// ── Reply services ─────────────────────────────────────────────────────

async function fetchReplies(db: DbClient, ticketId: number): Promise<ReplyResponse[]> {
  const rows = await db.queryAll<{
    id: number; ticket_id: number; replier_id: number; replier_name: string
    content: string; created_at: string
  }>({
    text: `SELECT r.id, r.ticket_id, r.replier_id, u.name AS replier_name,
              r.content, r.created_at
            FROM ticket_replies r JOIN users u ON u.id = r.replier_id
            WHERE r.ticket_id = ? ORDER BY r.created_at ASC`,
    params: [ticketId],
  })
  return rows.map((r) => ({
    id: r.id, ticketId: r.ticket_id, replierId: r.replier_id,
    replierName: r.replier_name, content: r.content, createdAt: r.created_at,
  }))
}

export async function addReply(db: DbClient, ticketId: number, body: CreateReplyRequest): Promise<ReplyResponse> {
  requireField(body.replierId, 'replierId')
  requireField(body.content, 'content')

  // Verify ticket exists
  await fetchTicketRow(db, ticketId)

  // Verify replier exists
  const user = await db.queryOne<{ id: number; name: string }>({ text: 'SELECT id, name FROM users WHERE id = ?', params: [body.replierId] })
  if (!user) throw new ApiError(404, ERROR_CODES.USER_NOT_FOUND, 'Replier not found')

  const ts = now()
  await db.run({
    text: 'INSERT INTO ticket_replies (ticket_id, replier_id, content, created_at) VALUES (?, ?, ?, ?)',
    params: [ticketId, body.replierId, body.content, ts],
  })

  return {
    id: (await db.queryOne<{ id: number }>({ text: 'SELECT last_insert_rowid() AS id' }))!.id,
    ticketId,
    replierId: body.replierId,
    replierName: user.name,
    content: body.content,
    createdAt: ts,
  }
}

// ── Transfer services ──────────────────────────────────────────────────

async function fetchTransfers(db: DbClient, ticketId: number): Promise<TransferResponse[]> {
  const rows = await db.queryAll<{
    id: number; from_user_id: number | null; from_user_name: string | null
    to_user_id: number | null; to_user_name: string | null
    to_group_id: number | null; to_group_name: string | null
    reason: string | null; created_at: string
  }>({
    text: `SELECT tr.id, tr.from_user_id, fu.name AS from_user_name,
              tr.to_user_id, tu.name AS to_user_name,
              tr.to_group_id, g.name AS to_group_name,
              tr.reason, tr.created_at
            FROM ticket_transfers tr
            LEFT JOIN users fu ON fu.id = tr.from_user_id
            LEFT JOIN users tu ON tu.id = tr.to_user_id
            LEFT JOIN business_groups g ON g.id = tr.to_group_id
            WHERE tr.ticket_id = ? ORDER BY tr.created_at ASC`,
    params: [ticketId],
  })
  return rows.map((r) => ({
    id: r.id,
    fromUserId: r.from_user_id,
    fromUserName: r.from_user_name,
    toUserId: r.to_user_id,
    toUserName: r.to_user_name,
    toGroupId: r.to_group_id,
    toGroupName: r.to_group_name,
    reason: r.reason,
    createdAt: r.created_at,
  }))
}

export async function transferTicket(db: DbClient, ticketId: number, body: TransferTicketRequest): Promise<TicketDetail> {
  requireField(body.fromUserId, 'fromUserId')

  const row = await fetchTicketRow(db, ticketId)

  if (row.status !== TICKET_STATUS.PENDING_PROCESSING) {
    throw new ApiError(400, ERROR_CODES.INVALID_TICKET_STATUS, 'Ticket must be in pending_processing status to transfer')
  }

  if (!body.toUserId && !body.toGroupId) {
    throw new ApiError(400, ERROR_CODES.TRANSFER_TARGET_REQUIRED, 'Either toUserId or toGroupId is required')
  }

  const ts = now()
  const updates: string[] = ['updated_at = ?']
  const params: unknown[] = [ts]

  if (body.toUserId) {
    updates.push('assignee_id = ?')
    params.push(body.toUserId)
  }
  if (body.toGroupId) {
    updates.push('assigned_group_id = ?')
    params.push(body.toGroupId)
  }

  params.push(ticketId)
  await db.run({ text: `UPDATE tickets SET ${updates.join(', ')} WHERE id = ?`, params })

  // Record transfer
  await db.run({
    text: `INSERT INTO ticket_transfers (ticket_id, from_user_id, to_user_id, to_group_id, reason, created_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
    params: [ticketId, body.fromUserId, body.toUserId ?? null, body.toGroupId ?? null, body.reason ?? null, ts],
  })

  const updated = await fetchTicketRow(db, ticketId)
  return buildTicketDetail(db, updated)
}

// ── Evaluation services ────────────────────────────────────────────────

async function fetchEvaluation(db: DbClient, ticketId: number): Promise<EvaluationResponse | null> {
  const row = await db.queryOne<{ id: number; ticket_id: number; rating: number; comment: string | null; created_at: string }>({
    text: 'SELECT id, ticket_id, rating, comment, created_at FROM ticket_evaluations WHERE ticket_id = ?',
    params: [ticketId],
  })
  if (!row) return null
  return {
    id: row.id,
    ticketId: row.ticket_id,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.created_at,
  }
}

export async function createEvaluation(db: DbClient, ticketId: number, body: CreateEvaluationRequest): Promise<EvaluationResponse> {
  requireField(body.rating, 'rating')

  if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5) {
    throw new ApiError(400, ERROR_CODES.INVALID_RATING, 'Rating must be an integer from 1 to 5')
  }

  const row = await fetchTicketRow(db, ticketId)

  if (row.status !== TICKET_STATUS.COMPLETED) {
    throw new ApiError(400, ERROR_CODES.TICKET_NOT_COMPLETED, 'Ticket must be completed before evaluation')
  }

  const existing = await fetchEvaluation(db, ticketId)
  if (existing) {
    throw new ApiError(409, ERROR_CODES.EVALUATION_EXISTS, 'Evaluation already exists for this ticket')
  }

  const ts = now()
  await db.run({
    text: 'INSERT INTO ticket_evaluations (ticket_id, rating, comment, created_at) VALUES (?, ?, ?, ?)',
    params: [ticketId, body.rating, body.comment ?? null, ts],
  })

  return {
    id: (await db.queryOne<{ id: number }>({ text: 'SELECT last_insert_rowid() AS id' }))!.id,
    ticketId,
    rating: body.rating,
    comment: body.comment ?? null,
    createdAt: ts,
  }
}
