// Ticket domain service: drafts, idempotent submit, 8-state machine,
// replies (with claim side effects), resolution/confirmation, rating,
// timeline aggregation, CSV export. Writes run in dbkit transactions with
// activity rows committed atomically (architecture baseline §2.3/§4.2).
import type { DbClient } from '@commonapp/dbkit'
import type {
  AssignmentResult,
  Locale,
  Paginated,
  ReplyKind,
  Role,
  TicketDetail,
  TicketStatus,
  TicketSummary,
  TimelineItem,
} from '../../shared/domain'
import { serializeRef, serializeUserRef, localizedPair } from '../core/serialize'
import type { SessionUser } from '../core/session'
import type { TicketRow } from '../core/rows'
import { assertTicketVisible, isDepartmentManagerOf, managerScope, ticketVisibleTo } from '../core/guard'
import {
  assigneeNotInDepartment,
  assigneeOnVacation,
  forbidden,
  notFound,
  ratingExists,
  stateConflict,
  ticketNotDraft,
  validation,
} from '../core/errors'
import { runAssignment, buildAssignmentResult, usersOnLeaveToday } from '../core/assignment'
import { computeDeadlines, deferDeadlinesForHold, firstResponseBadge, loadSlaPolicyForCategory, resolutionBadge } from '../core/sla'
import { loadCalendar, dateKeyOf, addWorkingMinutes } from '../core/calendar'
import { insertActivity, listActivities, type FieldChange } from './audit'
import { notifyReply, notifyTicketSubmitted } from '../core/notify'
import { parseSort, queryTickets, ticketScopeFor, type TicketFilters, type TicketListRow } from '../core/stats'
import { csvDocument } from '../core/csv'

const DEFAULT_PAGE_SIZE = 20
const TICKET_PAGE_SIZES = [10, 20, 50, 100]

function nowIso(): string {
  return new Date().toISOString()
}

async function getTicketRow(db: DbClient, id: number): Promise<TicketListRow | null> {
  return db.queryOne<TicketListRow>({
    text: `SELECT t.*,
      c.name_zh AS category_name_zh, c.name_en AS category_name_en,
      sc.name_zh AS sub_category_name_zh, sc.name_en AS sub_category_name_en,
      tm.name_zh AS team_name_zh, tm.name_en AS team_name_en,
      d.name_zh AS department_name_zh, d.name_en AS department_name_en
      FROM tickets t
      JOIN categories c ON c.id = t.category_id
      LEFT JOIN subcategories sc ON sc.id = t.sub_category_id
      LEFT JOIN teams tm ON tm.id = t.team_id
      LEFT JOIN departments d ON d.id = t.department_id
      WHERE t.id = ?`,
    params: [id],
  })
}

async function loadTicketForUser(db: DbClient, user: SessionUser, id: number, locale: Locale): Promise<TicketListRow> {
  const ticket = await getTicketRow(db, id)
  if (!ticket) throw notFound(locale === 'zh' ? '工单不存在' : 'Ticket not found')
  await assertTicketVisible(db, user, ticket, locale === 'zh' ? '工单不存在' : 'Ticket not found')
  return ticket
}

async function userBrief(db: DbClient, id: number | null) {
  if (!id) return null
  return db.queryOne<{ id: number; name_zh: string; name_en: string; email: string; role: Role }>({
    text: 'SELECT id, name_zh, name_en, email, role FROM biz_users WHERE id = ?',
    params: [id],
  })
}

export async function toSummary(db: DbClient, row: TicketListRow, locale: Locale): Promise<TicketSummary> {
  const policy = await loadSlaPolicyForCategory(db, row.category_id)
  const now = new Date()
  const requester = await userBrief(db, row.requester_id)
  const assignee = await userBrief(db, row.assignee_id)
  const { nameZh: categoryZh, nameEn: categoryEn } = localizedPair(locale, row.category_name_zh, row.category_name_en)
  return {
    id: row.id,
    ticketNo: row.ticket_no,
    subjectZh: row.subject_zh,
    subjectEn: row.subject_en,
    category: { id: row.category_id, nameZh: categoryZh, nameEn: categoryEn },
    subCategory: serializeRef(locale, row.sub_category_id, row.sub_category_name_zh, row.sub_category_name_en),
    priority: row.priority,
    status: row.status,
    requester: serializeUserRef(locale, requester) as TicketSummary['requester'],
    assignee: serializeUserRef(locale, assignee),
    team: serializeRef(locale, row.team_id, row.team_name_zh, row.team_name_en),
    department: serializeRef(locale, row.department_id, row.department_name_zh, row.department_name_en),
    submittedAt: row.submitted_at,
    firstResponseAt: row.first_response_at,
    resolvedAt: row.resolved_at,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    slaFirstResponse: firstResponseBadge(row, policy, now, locale),
    slaResolution: resolutionBadge(row, policy, now, locale),
  }
}

function computeCan(db: DbClient, user: SessionUser, ticket: TicketListRow): Promise<TicketDetail['can']> {
  return (async () => {
    const requesterSelf = ticket.requester_id === user.id
    const assigneeSelf = ticket.assignee_id === user.id
    let scopeManager = false
    if (user.role === 'manager') {
      const scope = await managerScope(db, user.id)
      scopeManager =
        (ticket.department_id !== null && scope.departmentIds.includes(ticket.department_id)) ||
        (ticket.team_id !== null && scope.teamIds.includes(ticket.team_id))
    }
    const admin = user.role === 'admin'
    const active = !['closed', 'cancelled'].includes(ticket.status)
    return {
      editDraft: ticket.status === 'draft' && (requesterSelf || admin),
      submit: ticket.status === 'draft' && requesterSelf,
      reply: active && ticket.status !== 'draft' && (requesterSelf || assigneeSelf || scopeManager || admin),
      resolve: ticket.status === 'in_progress' && (assigneeSelf || admin),
      confirm: ticket.status === 'pending_confirm' && requesterSelf,
      reject: ticket.status === 'pending_confirm' && requesterSelf,
      cancel: ['assigned', 'in_progress'].includes(ticket.status) && (assigneeSelf || scopeManager || admin),
      hold: ['assigned', 'in_progress'].includes(ticket.status) && (assigneeSelf || scopeManager || admin),
      resume: ticket.status === 'on_hold' && (assigneeSelf || scopeManager || admin),
      assign: ticket.status === 'pending_assign' && (admin || (user.role === 'manager' && scopeManager)),
      transfer: ['assigned', 'in_progress', 'pending_assign'].includes(ticket.status) && (assigneeSelf || scopeManager || admin),
      changeCategory: active && ticket.status !== 'draft' && (assigneeSelf || scopeManager || admin),
      changePriority: active && ticket.status !== 'draft' && (assigneeSelf || scopeManager || admin),
      rate: ticket.status === 'closed' && requesterSelf,
      deleteDraft: ticket.status === 'draft' && (requesterSelf || admin),
    }
  })()
}

async function toDetail(db: DbClient, user: SessionUser, row: TicketListRow, locale: Locale): Promise<TicketDetail> {
  const summary = await toSummary(db, row, locale)
  const can = await computeCan(db, user, row)
  return {
    ...summary,
    description: row.description,
    slaFirstResponseDeadline: row.sla_first_response_deadline,
    slaResolutionDeadline: row.sla_resolution_deadline,
    can,
  }
}

async function reloadDetail(db: DbClient, user: SessionUser, ticketId: number, locale: Locale): Promise<TicketDetail> {
  const row = await getTicketRow(db, ticketId)
  if (!row) throw notFound(locale === 'zh' ? '工单不存在' : 'Ticket not found')
  return toDetail(db, user, row, locale)
}

// --- Drafts ---

export interface TicketDraftInput {
  subjectZh: string
  subjectEn?: string | null
  description: string
  categoryId: number
  subCategoryId?: number | null
  priority: string
  attachmentIds?: number[]
}

function validateDraftInput(input: TicketDraftInput, locale: Locale): void {
  const fields: string[] = []
  if (!input.subjectZh || !input.subjectZh.trim()) fields.push('subjectZh')
  if (!input.description || !input.description.trim()) fields.push('description')
  if (input.categoryId === undefined || !Number.isInteger(input.categoryId)) fields.push('categoryId')
  if (!['low', 'medium', 'high', 'urgent'].includes(input.priority)) fields.push('priority')
  if (fields.length > 0) throw validation(locale === 'zh' ? '请求字段缺失或格式不正确' : 'Request fields are invalid', fields)
}

async function assertCategoryUsable(db: DbClient, categoryId: number, locale: Locale): Promise<{ department_id: number | null }> {
  const category = await db.queryOne<{ id: number; status: number; is_skeleton: number; department_id: number | null }>({
    text: 'SELECT id, status, is_skeleton, department_id FROM categories WHERE id = ?',
    params: [categoryId],
  })
  if (!category || category.status !== 1 || category.is_skeleton === 1) {
    throw validation(locale === 'zh' ? '分类不可用' : 'Category is not usable', ['categoryId'])
  }
  return category
}

async function assertSubCategoryUsable(db: DbClient, subCategoryId: number, categoryId: number, locale: Locale): Promise<void> {
  const sub = await db.queryOne<{ id: number; category_id: number; status: number }>({
    text: 'SELECT id, category_id, status FROM subcategories WHERE id = ?',
    params: [subCategoryId],
  })
  if (!sub || sub.status !== 1 || sub.category_id !== categoryId) {
    throw validation(locale === 'zh' ? '二级分类不可用' : 'Subcategory is not usable', ['subCategoryId'])
  }
}

export async function createDraft(
  db: DbClient,
  user: SessionUser,
  input: TicketDraftInput,
  idempotencyKey: string,
  locale: Locale,
): Promise<{ ticket: TicketDetail; replay: boolean }> {
  validateDraftInput(input, locale)
  const category = await assertCategoryUsable(db, input.categoryId, locale)
  if (input.subCategoryId) await assertSubCategoryUsable(db, input.subCategoryId, input.categoryId, locale)
  if (idempotencyKey) {
    const existing = await db.queryOne<TicketRow>({
      text: 'SELECT * FROM tickets WHERE idempotency_key = ?',
      params: [idempotencyKey],
    })
    if (existing) {
      const requester = existing.requester_id === user.id
      if (requester) {
        const row = await getTicketRow(db, existing.id)
        if (row) return { ticket: await toDetail(db, user, row, locale), replay: true }
      }
      // Same key used by another creator: reject to avoid cross-user leakage.
      throw validation(locale === 'zh' ? '幂等键已被使用' : 'Idempotency key already used', ['idempotencyKey'])
    }
  }
  const now = nowIso()
  const ticketId = await db.transaction(async (tx) => {
    await tx.run({
      text: `INSERT INTO tickets
        (subject_zh, subject_en, description, category_id, sub_category_id, priority, status,
         requester_id, department_id, idempotency_key, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)`,
      params: [
        input.subjectZh.trim(),
        input.subjectEn?.trim() || null,
        input.description.trim(),
        input.categoryId,
        input.subCategoryId ?? null,
        input.priority,
        user.id,
        category.department_id,
        idempotencyKey || null,
        now,
        now,
      ],
    })
    const inserted = await tx.queryOne<{ id: number }>({ text: 'SELECT last_insert_rowid() AS id' })
    const id = Number(inserted?.id ?? 0)
    if (input.attachmentIds && input.attachmentIds.length > 0) {
      await attachStagedFiles(tx, user, id, input.attachmentIds)
    }
    return id
  })
  const row = await getTicketRow(db, ticketId)
  if (!row) throw notFound(locale === 'zh' ? '工单不存在' : 'Ticket not found')
  return { ticket: await toDetail(db, user, row, locale), replay: false }
}

async function attachStagedFiles(db: DbClient, user: SessionUser, ticketId: number, attachmentIds: number[]): Promise<void> {
  for (const attachmentId of attachmentIds) {
    const row = await db.queryOne<{ id: string; entity_id: string; uploaded_by_id: string }>({
      text: 'SELECT id, entity_id, uploaded_by_id FROM attachments WHERE id = ?',
      params: [String(attachmentId)],
    })
    if (!row) continue
    const stagedForSelf = row.entity_id === `draft-${user.id}`
    const alreadyOnTicket = row.entity_id === `ticket-${ticketId}`
    if (stagedForSelf || (alreadyOnTicket && row.uploaded_by_id === user.credentialId)) {
      await db.run({
        text: 'UPDATE attachments SET entity_id = ? WHERE id = ?',
        params: [`ticket-${ticketId}`, row.id],
      })
    }
  }
}

export async function updateDraft(
  db: DbClient,
  user: SessionUser,
  ticketId: number,
  input: Partial<TicketDraftInput>,
  locale: Locale,
): Promise<TicketDetail> {
  const ticket = await getTicketRow(db, ticketId)
  if (!ticket) throw notFound(locale === 'zh' ? '工单不存在' : 'Ticket not found')
  if (ticket.requester_id !== user.id) throw notFound(locale === 'zh' ? '工单不存在' : 'Ticket not found')
  if (ticket.status !== 'draft') throw ticketNotDraft(locale === 'zh' ? '仅草稿状态的工单支持该操作' : 'Only draft tickets support this operation')
  const updates: string[] = []
  const params: unknown[] = []
  if (input.subjectZh !== undefined) {
    if (!input.subjectZh.trim()) throw validation(locale === 'zh' ? '主题不能为空' : 'Subject is required', ['subjectZh'])
    updates.push('subject_zh = ?')
    params.push(input.subjectZh.trim())
  }
  if (input.subjectEn !== undefined) {
    updates.push('subject_en = ?')
    params.push(input.subjectEn?.trim() || null)
  }
  if (input.description !== undefined) {
    if (!input.description.trim()) throw validation(locale === 'zh' ? '描述不能为空' : 'Description is required', ['description'])
    updates.push('description = ?')
    params.push(input.description.trim())
  }
  if (input.categoryId !== undefined) {
    const category = await assertCategoryUsable(db, input.categoryId, locale)
    updates.push('category_id = ?', 'department_id = ?')
    params.push(input.categoryId, category.department_id)
    if (input.subCategoryId !== undefined && input.subCategoryId) {
      await assertSubCategoryUsable(db, input.subCategoryId, input.categoryId, locale)
      updates.push('sub_category_id = ?')
      params.push(input.subCategoryId)
    } else if (input.subCategoryId === null) {
      updates.push('sub_category_id = NULL')
    }
  } else if (input.subCategoryId !== undefined) {
    if (input.subCategoryId === null) {
      updates.push('sub_category_id = NULL')
    } else {
      await assertSubCategoryUsable(db, input.subCategoryId, ticket.category_id, locale)
      updates.push('sub_category_id = ?')
      params.push(input.subCategoryId)
    }
  }
  if (input.priority !== undefined) {
    if (!['low', 'medium', 'high', 'urgent'].includes(input.priority)) {
      throw validation(locale === 'zh' ? '优先级不合法' : 'Invalid priority', ['priority'])
    }
    updates.push('priority = ?')
    params.push(input.priority)
  }
  updates.push('updated_at = ?')
  params.push(nowIso())
  await db.run({ text: `UPDATE tickets SET ${updates.join(', ')} WHERE id = ?`, params: [...params, ticketId] })
  if (input.attachmentIds && input.attachmentIds.length > 0) {
    await attachStagedFiles(db, user, ticketId, input.attachmentIds)
  }
  const row = await getTicketRow(db, ticketId)
  if (!row) throw notFound(locale === 'zh' ? '工单不存在' : 'Ticket not found')
  return toDetail(db, user, row, locale)
}

export async function deleteDraft(db: DbClient, user: SessionUser, ticketId: number, locale: Locale): Promise<void> {
  const ticket = await getTicketRow(db, ticketId)
  if (!ticket) throw notFound(locale === 'zh' ? '工单不存在' : 'Ticket not found')
  const isOwner = ticket.requester_id === user.id
  const isAdmin = user.role === 'admin'
  // Anti-enumeration: non-owner non-admin deletion of a foreign draft looks like 404.
  if (!isOwner && !(isAdmin && ticket.status === 'draft')) {
    throw notFound(locale === 'zh' ? '工单不存在' : 'Ticket not found')
  }
  if (ticket.status !== 'draft') {
    throw ticketNotDraft(locale === 'zh' ? '仅草稿状态的工单支持该操作' : 'Only draft tickets support this operation')
  }
  await db.run({ text: 'DELETE FROM tickets WHERE id = ?', params: [ticketId] })
}

// --- Submit (single auto-assignment run) ---

export interface SubmitOutcome {
  ticket: TicketDetail
  assignment: AssignmentResult
  replay: boolean
}

export async function submitTicket(
  db: DbClient,
  user: SessionUser,
  ticketId: number,
  idempotencyKey: string,
  locale: Locale,
): Promise<SubmitOutcome> {
  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    throw validation(locale === 'zh' ? '缺少幂等键' : 'idempotencyKey is required', ['idempotencyKey'])
  }
  const ticket = await getTicketRow(db, ticketId)
  if (!ticket) throw notFound(locale === 'zh' ? '工单不存在' : 'Ticket not found')
  if (ticket.status !== 'draft') {
    // Idempotent replay of an already-submitted ticket.
    if (ticket.submit_idempotency_key === idempotencyKey && ticket.requester_id === user.id) {
      const row = await getTicketRow(db, ticketId)
      if (!row) throw notFound(locale === 'zh' ? '工单不存在' : 'Ticket not found')
      const detail = await toDetail(db, user, row, locale)
      const assignment = await buildAssignmentResult(
        db,
        {
          status: ticket.status === 'assigned' ? 'assigned' : 'pending_assign',
          teamId: ticket.team_id,
          assigneeId: ticket.assignee_id,
          fallback: null,
          reasonZh: '幂等重放：返回原分配结果',
          reasonEn: 'Idempotent replay: original assignment result',
        },
        locale,
      )
      return { ticket: detail, assignment, replay: true }
    }
    throw ticketNotDraft(locale === 'zh' ? '仅草稿状态的工单支持该操作' : 'Only draft tickets support this operation')
  }
  if (ticket.requester_id !== user.id) {
    throw notFound(locale === 'zh' ? '工单不存在' : 'Ticket not found')
  }

  const now = nowIso()
  const calendar = await loadCalendar(db)
  const policy = await loadSlaPolicyForCategory(db, ticket.category_id)
  // First-response clock starts at submission (contract §7.1).
  const frDeadline = policy ? addWorkingMinutes(now, policy.first_response_minutes, calendar) : null

  const outcome = await db.transaction(async (tx) => {
    const executed = await runAssignment(tx, ticket.category_id, now)
    const ticketNo = await nextTicketNo(tx, calendar.config.timezone, now)
    await tx.run({
      text: `UPDATE tickets SET status = ?, ticket_no = ?, department_id = COALESCE(?, department_id),
        team_id = ?, assignee_id = ?, submitted_at = ?, submit_idempotency_key = ?,
        sla_first_response_deadline = ?, updated_at = ?
        WHERE id = ?`,
      params: [
        executed.status,
        ticketNo,
        executed.teamId ? (await txDepartmentOf(tx, executed.teamId)) : null,
        executed.teamId,
        executed.assigneeId,
        now,
        idempotencyKey,
        frDeadline,
        now,
        ticketId,
      ],
    })
    await insertActivity(
      tx,
      {
        ticketId,
        actorId: user.id,
        action: 'submit',
        fromStatus: 'draft',
        toStatus: executed.status,
        fieldChanges: [],
        remarkZh:
          executed.status === 'assigned'
            ? `工单提交并自动分配${executed.fallback ? '（回退部门经理）' : ''}`
            : `工单提交，暂未分配：${executed.reasonZh}`,
        remarkEn:
          executed.status === 'assigned'
            ? `Ticket submitted and auto-assigned${executed.fallback ? ' (manager fallback)' : ''}`
            : `Ticket submitted, pending assignment: ${executed.reasonEn}`,
        source: 'user',
      },
      now,
    )
    return executed
  })

  const row = await getTicketRow(db, ticketId)
  if (!row) throw notFound(locale === 'zh' ? '工单不存在' : 'Ticket not found')
  const detail = await toDetail(db, user, row, locale)
  const assignment = await buildAssignmentResult(db, outcome, locale)
  // Async mails after commit: requester confirmation + on-the-spot assignee notice.
  notifyTicketSubmitted(db, row)
  return { ticket: detail, assignment, replay: false }
}

async function txDepartmentOf(tx: DbClient, teamId: number): Promise<number | null> {
  const row = await tx.queryOne<{ department_id: number }>({
    text: 'SELECT department_id FROM teams WHERE id = ?',
    params: [teamId],
  })
  return row?.department_id ?? null
}

async function nextTicketNo(db: DbClient, timezone: string, nowIsoValue: string): Promise<string> {
  const key = dateKeyOf(new Date(nowIsoValue), timezone)
  const compact = key.replace(/-/g, '')
  const row = await db.queryOne<{ total: number }>({
    text: "SELECT COUNT(*) AS total FROM tickets WHERE ticket_no LIKE ?",
    params: [`HD-${compact}-%`],
  })
  const sequence = (Number(row?.total ?? 0) + 1).toString().padStart(4, '0')
  return `HD-${compact}-${sequence}`
}

// --- Replies ---

export interface ReplyInput {
  body: string
}

export async function addReply(
  db: DbClient,
  user: SessionUser,
  ticketId: number,
  input: ReplyInput,
  locale: Locale,
  source: 'user' | 'mcp' = 'user',
): Promise<{ reply: { id: number; author: ReturnType<typeof serializeUserRef>; body: string; kind: ReplyKind; createdAt: string }; ticket: TicketDetail }> {
  if (!input.body || !input.body.trim()) {
    throw validation(locale === 'zh' ? '回复内容不能为空' : 'Reply body is required', ['body'])
  }
  const ticket = await getTicketRow(db, ticketId)
  if (!ticket) throw notFound(locale === 'zh' ? '工单不存在' : 'Ticket not found')
  await assertTicketVisible(db, user, ticket, locale === 'zh' ? '工单不存在' : 'Ticket not found')
  if (['closed', 'cancelled', 'draft'].includes(ticket.status)) {
    throw stateConflict(locale === 'zh' ? '工单当前状态不允许该操作' : 'The ticket status does not allow this operation', { status: ticket.status })
  }
  const isRequester = ticket.requester_id === user.id
  const isAssignee = ticket.assignee_id === user.id
  const isManagerScope = user.role === 'manager' && (await isDepartmentManagerOf(db, user.id, ticket.department_id ?? -1))
  const isTeamMember = user.role === 'manager' && ticket.team_id !== null
    ? (await db.queryOne<{ user_id: number }>({
        text: 'SELECT user_id FROM team_members WHERE team_id = ? AND user_id = ?',
        params: [ticket.team_id, user.id],
      })) !== null
    : false
  const managerInScope = isManagerScope || isTeamMember
  if (!isRequester && !isAssignee && !managerInScope && user.role !== 'admin') {
    throw forbidden(locale === 'zh' ? '没有权限执行该操作' : 'You are not allowed to reply on this ticket')
  }

  const now = nowIso()
  const calendar = await loadCalendar(db)
  const policy = await loadSlaPolicyForCategory(db, ticket.category_id)
  const updates: { columns: string[]; params: unknown[] } = { columns: ['updated_at'], params: [now] }
  let statusChanged: { from: TicketStatus; to: TicketStatus } | null = null
  let claimManager = false

  // Exception side effects (contract §3.4):
  // - assignee reply on assigned → in_progress (and resolution clock starts)
  // - manager reply on pending_assign → claim (assignee = manager, in_progress)
  if (ticket.status === 'assigned' && isAssignee) {
    statusChanged = { from: 'assigned', to: 'in_progress' }
    updates.columns.push('status')
    updates.params.push('in_progress')
  } else if (ticket.status === 'pending_assign' && (managerInScope || user.role === 'admin')) {
    statusChanged = { from: 'pending_assign', to: 'in_progress' }
    claimManager = true
    updates.columns.push('status', 'assignee_id')
    updates.params.push('in_progress', user.id)
  }

  let resolutionStart: string | null = ticket.resolution_start_at
  let resolutionDeadline: string | null = ticket.sla_resolution_deadline
  if (statusChanged && statusChanged.to === 'in_progress' && !resolutionStart) {
    resolutionStart = now
    resolutionDeadline = policy ? addWorkingMinutes(now, policy.resolution_minutes, calendar) : null
    updates.columns.push('resolution_start_at', 'sla_resolution_deadline')
    updates.params.push(resolutionStart, resolutionDeadline)
  }
  // First response clock: handling-side reply marks the first response.
  let firstResponseAt: string | null = ticket.first_response_at
  if ((isAssignee || claimManager || (user.role === 'admin' && !isRequester)) && !firstResponseAt) {
    firstResponseAt = now
    updates.columns.push('first_response_at')
    updates.params.push(now)
    if (policy && !ticket.sla_first_response_deadline) {
      const deadline = addWorkingMinutes(now, policy.first_response_minutes, calendar)
      updates.columns.push('sla_first_response_deadline')
      updates.params.push(deadline)
    }
  }

  const replyId = await db.transaction(async (tx) => {
    await tx.run({
      text: `INSERT INTO replies (ticket_id, author_id, body, kind, created_at) VALUES (?, ?, ?, 'normal', ?)`,
      params: [ticketId, user.id, input.body.trim(), now],
    })
    await tx.run({
      text: `UPDATE tickets SET ${updates.columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
      params: [...updates.params, ticketId],
    })
    if (statusChanged || claimManager) {
      await insertActivity(
        tx,
        {
          ticketId,
          actorId: user.id,
          action: claimManager ? 'claim' : 'reply_state_change',
          fromStatus: statusChanged?.from ?? null,
          toStatus: statusChanged?.to ?? null,
          remarkZh: claimManager ? '部门经理回复即认领，工单转入处理中' : '处理人首次回复，工单转入处理中',
          remarkEn: claimManager
            ? 'Manager claimed the ticket by replying; moved to in progress'
            : 'Assignee first reply moved the ticket to in progress',
          source,
        },
        now,
      )
    }
    const row = await tx.queryOne<{ id: number }>({ text: 'SELECT last_insert_rowid() AS id' })
    return row?.id ?? 0
  })

  const row = await getTicketRow(db, ticketId)
  if (!row) throw notFound(locale === 'zh' ? '工单不存在' : 'Ticket not found')
  const detail = await toDetail(db, user, row, locale)
  const author = await userBrief(db, user.id)
  notifyReply(db, row, user.id)
  return {
    reply: {
      id: replyId,
      author: serializeUserRef(locale, author) as NonNullable<ReturnType<typeof serializeUserRef>>,
      body: input.body.trim(),
      kind: 'normal',
      createdAt: now,
    },
    ticket: detail,
  }
}

// --- State transitions ---

async function transitionGuard(
  db: DbClient,
  user: SessionUser,
  ticketId: number,
  allowedFrom: TicketStatus[],
  locale: Locale,
): Promise<TicketListRow> {
  const ticket = await getTicketRow(db, ticketId)
  if (!ticket) throw notFound(locale === 'zh' ? '工单不存在' : 'Ticket not found')
  // Write-path guard: role/object mismatch surfaces as 403 (contract §1
  // reserves 404 for reads and object-level anti-enumeration).
  if (!(await ticketVisibleTo(db, user, ticket))) {
    throw forbidden(locale === 'zh' ? '没有权限执行该操作' : 'You are not allowed to perform this operation')
  }
  if (!allowedFrom.includes(ticket.status)) {
    throw stateConflict(locale === 'zh' ? '工单当前状态不允许该操作' : 'The ticket status does not allow this operation', { status: ticket.status })
  }
  return ticket
}

async function requireHandlingSide(db: DbClient, user: SessionUser, ticket: TicketListRow, locale: Locale): Promise<void> {
  if (user.role === 'admin') return
  if (ticket.assignee_id === user.id) return
  if (user.role === 'manager') {
    const inDepartment = ticket.department_id !== null && (await isDepartmentManagerOf(db, user.id, ticket.department_id))
    const inTeam =
      ticket.team_id !== null &&
      (await db.queryOne<{ user_id: number }>({
        text: 'SELECT user_id FROM team_members WHERE team_id = ? AND user_id = ?',
        params: [ticket.team_id, user.id],
      })) !== null
    if (inDepartment || inTeam) return
  }
  throw forbidden(locale === 'zh' ? '没有权限执行该操作' : 'You are not allowed to perform this operation')
}

export async function startProcessing(db: DbClient, user: SessionUser, ticketId: number, locale: Locale): Promise<TicketDetail> {
  const ticket = await transitionGuard(db, user, ticketId, ['assigned'], locale)
  if (ticket.assignee_id !== user.id && user.role !== 'admin') {
    throw forbidden(locale === 'zh' ? '没有权限执行该操作' : 'Only the assignee can start handling')
  }
  const now = nowIso()
  const calendar = await loadCalendar(db)
  const policy = await loadSlaPolicyForCategory(db, ticket.category_id)
  const updates: { columns: string[]; params: unknown[] } = { columns: ['status', 'updated_at'], params: ['in_progress', now] }
  if (!ticket.resolution_start_at) {
    updates.columns.push('resolution_start_at', 'sla_resolution_deadline')
    updates.params.push(now, policy ? addWorkingMinutes(now, policy.resolution_minutes, calendar) : null)
  }
  if (!ticket.first_response_at) {
    updates.columns.push('first_response_at')
    updates.params.push(now)
    if (policy && !ticket.sla_first_response_deadline) {
      updates.columns.push('sla_first_response_deadline')
      updates.params.push(addWorkingMinutes(now, policy.first_response_minutes, calendar))
    }
  }
  await db.transaction(async (tx) => {
    await tx.run({
      text: `UPDATE tickets SET ${updates.columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
      params: [...updates.params, ticketId],
    })
    await insertActivity(
      tx,
      {
        ticketId,
        actorId: user.id,
        action: 'start',
        fromStatus: 'assigned',
        toStatus: 'in_progress',
        remarkZh: '处理人开始处理工单（解决 SLA 时钟起算）',
        remarkEn: 'Assignee started handling (resolution SLA clock started)',
        source: 'user',
      },
      now,
    )
  })
  return reloadDetail(db, user, ticketId, locale)
}

export async function resolveTicket(db: DbClient, user: SessionUser, ticketId: number, resolutionNote: string, locale: Locale): Promise<TicketDetail> {
  if (!resolutionNote || !resolutionNote.trim()) {
    throw validation(locale === 'zh' ? '处理说明必填' : 'resolutionNote is required', ['resolutionNote'])
  }
  const ticket = await transitionGuard(db, user, ticketId, ['in_progress'], locale)
  // Only the assignee (manager after claiming) or admin may resolve (§2.1).
  if (ticket.assignee_id !== user.id && user.role !== 'admin') {
    throw forbidden(locale === 'zh' ? '没有权限执行该操作' : 'Only the assignee can submit the resolution')
  }
  const now = nowIso()
  await db.transaction(async (tx) => {
    await tx.run({
      text: 'UPDATE tickets SET status = ?, resolved_at = ?, updated_at = ? WHERE id = ?',
      params: ['pending_confirm', now, now, ticketId],
    })
    await tx.run({
      text: `INSERT INTO replies (ticket_id, author_id, body, kind, created_at) VALUES (?, ?, ?, 'resolution', ?)`,
      params: [ticketId, user.id, resolutionNote.trim(), now],
    })
    await insertActivity(
      tx,
      {
        ticketId,
        actorId: user.id,
        action: 'resolve',
        fromStatus: 'in_progress',
        toStatus: 'pending_confirm',
        remarkZh: '处理人提交已解决，等待提交人确认',
        remarkEn: 'Assignee submitted the resolution; waiting for requester confirmation',
        source: 'user',
      },
      now,
    )
  })
  return reloadDetail(db, user, ticketId, locale)
}

export async function confirmTicket(db: DbClient, user: SessionUser, ticketId: number, locale: Locale): Promise<TicketDetail> {
  const ticket = await transitionGuard(db, user, ticketId, ['pending_confirm'], locale)
  if (ticket.requester_id !== user.id) {
    throw forbidden(locale === 'zh' ? '没有权限执行该操作' : 'Only the requester can confirm the resolution')
  }
  const now = nowIso()
  await db.transaction(async (tx) => {
    await tx.run({
      text: 'UPDATE tickets SET status = ?, closed_at = ?, updated_at = ? WHERE id = ?',
      params: ['closed', now, now, ticketId],
    })
    await insertActivity(
      tx,
      {
        ticketId,
        actorId: user.id,
        action: 'confirm',
        fromStatus: 'pending_confirm',
        toStatus: 'closed',
        remarkZh: '提交人确认解决，工单关闭',
        remarkEn: 'Requester confirmed the resolution; ticket closed',
        source: 'user',
      },
      now,
    )
  })
  return reloadDetail(db, user, ticketId, locale)
}

export async function rejectTicket(db: DbClient, user: SessionUser, ticketId: number, reason: string, locale: Locale): Promise<TicketDetail> {
  if (!reason || !reason.trim()) {
    throw validation(locale === 'zh' ? '驳回原因必填' : 'reason is required', ['reason'])
  }
  const ticket = await transitionGuard(db, user, ticketId, ['pending_confirm'], locale)
  if (ticket.requester_id !== user.id) {
    throw forbidden(locale === 'zh' ? '没有权限执行该操作' : 'Only the requester can reject the resolution')
  }
  const now = nowIso()
  await db.transaction(async (tx) => {
    await tx.run({
      text: 'UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?',
      params: ['in_progress', now, ticketId],
    })
    await tx.run({
      text: `INSERT INTO replies (ticket_id, author_id, body, kind, created_at) VALUES (?, ?, ?, 'rejection', ?)`,
      params: [ticketId, user.id, reason.trim(), now],
    })
    await insertActivity(
      tx,
      {
        ticketId,
        actorId: user.id,
        action: 'reject',
        fromStatus: 'pending_confirm',
        toStatus: 'in_progress',
        fieldChanges: [],
        remarkZh: `提交人驳回：${reason.trim()}`,
        remarkEn: `Requester rejected: ${reason.trim()}`,
        source: 'user',
      },
      now,
    )
  })
  return reloadDetail(db, user, ticketId, locale)
}

export async function cancelTicket(db: DbClient, user: SessionUser, ticketId: number, reason: string, locale: Locale): Promise<TicketDetail> {
  if (!reason || !reason.trim()) {
    throw validation(locale === 'zh' ? '取消原因必填' : 'reason is required', ['reason'])
  }
  const ticket = await transitionGuard(db, user, ticketId, ['assigned', 'in_progress'], locale)
  await requireHandlingSide(db, user, ticket, locale)
  const now = nowIso()
  await db.transaction(async (tx) => {
    await tx.run({
      text: 'UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?',
      params: ['cancelled', now, ticketId],
    })
    await insertActivity(
      tx,
      {
        ticketId,
        actorId: user.id,
        action: 'cancel',
        fromStatus: ticket.status,
        toStatus: 'cancelled',
        remarkZh: `工单取消：${reason.trim()}`,
        remarkEn: `Ticket cancelled: ${reason.trim()}`,
        source: 'user',
      },
      now,
    )
  })
  return reloadDetail(db, user, ticketId, locale)
}

export async function holdTicket(
  db: DbClient,
  user: SessionUser,
  ticketId: number,
  input: { reason: string; note?: string; expectedResumeAt?: string },
  locale: Locale,
): Promise<TicketDetail> {
  if (!input.reason || !input.reason.trim()) {
    throw validation(locale === 'zh' ? '挂起原因必填' : 'reason is required', ['reason'])
  }
  const ticket = await transitionGuard(db, user, ticketId, ['assigned', 'in_progress'], locale)
  await requireHandlingSide(db, user, ticket, locale)
  const now = nowIso()
  await db.transaction(async (tx) => {
    await tx.run({
      text: 'UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?',
      params: ['on_hold', now, ticketId],
    })
    await tx.run({
      text: `INSERT INTO ticket_sla_pauses (ticket_id, started_at, reason, expected_resume_at)
             VALUES (?, ?, ?, ?)`,
      params: [ticketId, now, `${input.reason.trim()}${input.note ? ` (${input.note.trim()})` : ''}`, input.expectedResumeAt ?? null],
    })
    await insertActivity(
      tx,
      {
        ticketId,
        actorId: user.id,
        action: 'hold',
        fromStatus: ticket.status,
        toStatus: 'on_hold',
        remarkZh: `工单挂起：${input.reason.trim()}`,
        remarkEn: `Ticket on hold: ${input.reason.trim()}`,
        source: 'user',
      },
      now,
    )
  })
  return reloadDetail(db, user, ticketId, locale)
}

export async function resumeTicket(db: DbClient, user: SessionUser, ticketId: number, locale: Locale): Promise<TicketDetail> {
  const ticket = await transitionGuard(db, user, ticketId, ['on_hold'], locale)
  await requireHandlingSide(db, user, ticket, locale)
  const now = nowIso()
  const calendar = await loadCalendar(db)
  const policy = await loadSlaPolicyForCategory(db, ticket.category_id)

  const pause = await db.queryOne<{ id: number; started_at: string }>({
    text: 'SELECT id, started_at FROM ticket_sla_pauses WHERE ticket_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1',
    params: [ticketId],
  })
  const pausedMs = pause ? new Date(now).getTime() - new Date(pause.started_at).getTime() : 0

  const updates: { columns: string[]; params: unknown[] } = { columns: ['status', 'updated_at'], params: ['in_progress', now] }
  let remarkZh = '工单恢复处理'
  let remarkEn = 'Ticket resumed'
  if (ticket.first_response_at) {
    // Already responded: defer both live deadlines by the paused duration.
    const deferred = deferDeadlinesForHold(ticket, pausedMs)
    updates.columns.push('sla_first_response_deadline', 'sla_resolution_deadline')
    updates.params.push(deferred.firstResponse, deferred.resolution)
    remarkZh = `工单恢复处理，SLA 截止时间按挂起时长顺延 ${Math.round(pausedMs / 60000)} 分钟`
    remarkEn = `Ticket resumed; SLA deadlines deferred by the held duration (${Math.round(pausedMs / 60000)} min)`
  } else {
    // Never responded before the hold: resume back-fills the first response
    // and recomputes both clocks from the resume moment (AC-05).
    const frDeadline = policy ? addWorkingMinutes(now, policy.first_response_minutes, calendar) : null
    const resDeadline = policy ? addWorkingMinutes(now, policy.resolution_minutes, calendar) : null
    updates.columns.push('first_response_at', 'sla_first_response_deadline', 'resolution_start_at', 'sla_resolution_deadline')
    updates.params.push(now, frDeadline, now, resDeadline)
    remarkZh = '工单恢复处理，恢复时刻补记首次响应并重新计算 SLA 截止时间'
    remarkEn = 'Ticket resumed; first response back-filled at resume and SLA deadlines recomputed'
  }

  await db.transaction(async (tx) => {
    await tx.run({
      text: `UPDATE tickets SET ${updates.columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
      params: [...updates.params, ticketId],
    })
    if (pause) {
      await tx.run({
        text: 'UPDATE ticket_sla_pauses SET ended_at = ? WHERE id = ?',
        params: [now, pause.id],
      })
    }
    await insertActivity(
      tx,
      {
        ticketId,
        actorId: user.id,
        action: 'resume',
        fromStatus: 'on_hold',
        toStatus: 'in_progress',
        remarkZh,
        remarkEn,
        source: 'user',
      },
      now,
    )
  })
  return reloadDetail(db, user, ticketId, locale)
}

// --- Assignment / transfer / online edits ---

export async function assignTicket(
  db: DbClient,
  user: SessionUser,
  ticketId: number,
  input: { teamId: number; userId: number },
  locale: Locale,
): Promise<TicketDetail> {
  const ticket = await transitionGuard(db, user, ticketId, ['pending_assign'], locale)
  if (user.role !== 'admin') {
    if (user.role !== 'manager' || ticket.department_id === null || !(await isDepartmentManagerOf(db, user.id, ticket.department_id))) {
      throw forbidden(locale === 'zh' ? '没有权限执行该操作' : 'Only the department manager or admin can assign')
    }
  }
  const team = await db.queryOne<{ id: number; department_id: number; status: number }>({
    text: 'SELECT id, department_id, status FROM teams WHERE id = ?',
    params: [input.teamId],
  })
  const targetUser = await db.queryOne<{ id: number; status: number; role: string }>({
    text: 'SELECT id, status, role FROM biz_users WHERE id = ?',
    params: [input.userId],
  })
  const ticketDepartment = ticket.department_id ?? (team ? team.department_id : null)
  if (!team || team.status !== 1 || !targetUser || targetUser.status !== 1) {
    throw validation(locale === 'zh' ? '目标 Team 或处理人不可用' : 'Target team or assignee is not usable', ['teamId', 'userId'])
  }
  if (ticketDepartment === null || team.department_id !== ticketDepartment) {
    throw assigneeDeptError(locale)
  }
  const membership = await db.queryOne<{ user_id: number }>({
    text: 'SELECT user_id FROM team_members WHERE team_id = ? AND user_id = ?',
    params: [input.teamId, input.userId],
  })
  if (!membership) throw assigneeDeptError(locale)
  const onLeave = await usersOnLeaveToday(db)
  if (onLeave.has(input.userId)) {
    // Fixed message per contract §1 (409 ASSIGNEE_ON_VACATION).
    throw assigneeOnVacation('该处理人正在休假中')
  }
  const now = nowIso()
  await db.transaction(async (tx) => {
    await tx.run({
      text: 'UPDATE tickets SET status = ?, assignee_id = ?, team_id = ?, department_id = ?, updated_at = ? WHERE id = ?',
      params: ['assigned', input.userId, input.teamId, ticketDepartment, now, ticketId],
    })
    const target = await tx.queryOne<{ name_zh: string; name_en: string }>({
      text: 'SELECT name_zh, name_en FROM biz_users WHERE id = ?',
      params: [input.userId],
    })
    await insertActivity(
      tx,
      {
        ticketId,
        actorId: user.id,
        action: 'assign',
        fromStatus: 'pending_assign',
        toStatus: 'assigned',
        fieldChanges: [
          { field: 'assignee', oldValue: '', newValue: `${target?.name_zh ?? ''} (#${input.userId})` },
        ],
        remarkZh: `部门经理指派处理人（Team #${input.teamId}）`,
        remarkEn: `Manager assigned the handler (team #${input.teamId})`,
        source: 'user',
      },
      now,
    )
  })
  return reloadDetail(db, user, ticketId, locale)
}

function assigneeDeptError(locale: Locale): never {
  throw assigneeNotInDepartment(
    locale === 'zh' ? '目标处理人不属于工单所在部门' : 'The target assignee does not belong to the ticket department',
  )
}

export async function transferTicket(
  db: DbClient,
  user: SessionUser,
  ticketId: number,
  input: { targetDepartmentId: number; targetUserId?: number },
  locale: Locale,
): Promise<TicketDetail> {
  const ticket = await getTicketRow(db, ticketId)
  if (!ticket) throw notFound(locale === 'zh' ? '工单不存在' : 'Ticket not found')
  if (!(await ticketVisibleTo(db, user, ticket))) {
    // Write-path authorization: 403 per contract §1 (404 is read-path only).
    throw forbidden(locale === 'zh' ? '没有权限执行该操作' : 'You are not allowed to perform this operation')
  }

  const targetDepartment = await db.queryOne<{ id: number; status: number }>({
    text: 'SELECT id, status FROM departments WHERE id = ?',
    params: [input.targetDepartmentId],
  })
  if (!targetDepartment || targetDepartment.status !== 1) {
    throw validation(locale === 'zh' ? '目标部门不可用' : 'Target department is not usable', ['targetDepartmentId'])
  }

  // Authorization by role for the transfer itself. Runs before the object
  // checks below so role failures surface as 403 (contract §3.5) instead of
  // leaking object-level 409/422 to unauthorized callers.
  if (user.role === 'agent') {
    if (ticket.assignee_id !== user.id) {
      throw forbidden(locale === 'zh' ? '没有权限执行该操作' : 'Only the current assignee can transfer')
    }
  } else if (user.role === 'manager') {
    const inScope =
      (ticket.department_id !== null && (await isDepartmentManagerOf(db, user.id, ticket.department_id))) ||
      (ticket.team_id !== null &&
        (await db.queryOne<{ user_id: number }>({
          text: 'SELECT user_id FROM team_members WHERE team_id = ? AND user_id = ?',
          params: [ticket.team_id, user.id],
        })) !== null)
    if (!inScope) throw forbidden(locale === 'zh' ? '没有权限执行该操作' : 'Only a scope manager can transfer')
  } else if (user.role === 'requester') {
    // Contract §3.5: transfer is a handling-side action (agent/manager/admin).
    throw forbidden(locale === 'zh' ? '没有权限执行该操作' : 'Requesters cannot transfer tickets')
  }

  const now = nowIso()
  const updates: { columns: string[]; params: unknown[] } = { columns: ['department_id', 'updated_at'], params: [input.targetDepartmentId, now] }
  let fromStatus: TicketStatus = ticket.status
  let toStatus: TicketStatus
  let remarkZh = ''
  let remarkEn = ''

  if (ticket.status === 'pending_assign') {
    // Whole-ticket move to another department queue; no concrete person allowed.
    if (input.targetUserId !== undefined) {
      if (user.role === 'manager' || user.role === 'agent') {
        throw forbidden(locale === 'zh' ? '不能指定其他部门的具体处理人' : 'Cannot target a concrete person when moving departments')
      }
    }
    toStatus = 'pending_assign'
    updates.columns.push('status', 'assignee_id', 'team_id')
    updates.params.push('pending_assign', null, null)
    remarkZh = `工单整单转出到其他部门排队（部门 #${input.targetDepartmentId}）`
    remarkEn = `Ticket transferred to another department queue (department #${input.targetDepartmentId})`
  } else if (ticket.status === 'assigned' || ticket.status === 'in_progress') {
    if (input.targetUserId === undefined) {
      // Agent/manager same-department queue move without a person.
      if (ticket.department_id === input.targetDepartmentId) {
        // Same-department transfer without a target keeps the queue semantics.
        toStatus = 'pending_assign'
        updates.columns.push('status', 'assignee_id', 'team_id')
        updates.params.push('pending_assign', null, null)
        remarkZh = '工单转回本部门待分配队列'
        remarkEn = 'Ticket moved back to the department pending queue'
      } else {
        toStatus = 'pending_assign'
        updates.columns.push('status', 'assignee_id', 'team_id')
        updates.params.push('pending_assign', null, null)
        remarkZh = `工单整单转出到其他部门排队（部门 #${input.targetDepartmentId}）`
        remarkEn = `Ticket transferred to another department queue (department #${input.targetDepartmentId})`
      }
    } else {
      // Concrete person: must stay inside the ticket department for agent/manager.
      if (user.role === 'agent' || user.role === 'manager') {
        if (input.targetDepartmentId !== ticket.department_id) {
          throw forbidden(locale === 'zh' ? '不支持跨部门指定具体处理人' : 'Cross-department person targeting is not supported')
        }
      }
      const targetUser = await db.queryOne<{ id: number; status: number; role: string }>({
        text: 'SELECT id, status, role FROM biz_users WHERE id = ?',
        params: [input.targetUserId],
      })
      if (!targetUser || targetUser.status !== 1) {
        throw validation(locale === 'zh' ? '目标处理人不可用' : 'Target user is not usable', ['targetUserId'])
      }
      const membership = await db.queryOne<{ team_id: number }>({
        text: 'SELECT team_id FROM team_members WHERE user_id = ? AND team_id IN (SELECT id FROM teams WHERE department_id = ?)',
        params: [input.targetUserId, input.targetDepartmentId],
      })
      const isDepartmentManager = await isDepartmentManagerOf(db, input.targetUserId, input.targetDepartmentId)
      const departmentUser = await db.queryOne<{ user_id: number }>({
        text: 'SELECT user_id FROM department_users WHERE department_id = ? AND user_id = ?',
        params: [input.targetDepartmentId, input.targetUserId],
      })
      if (!membership && !isDepartmentManager && !departmentUser) {
        throw assigneeNotInDepartment(
          locale === 'zh' ? '目标处理人不属于工单所在部门' : 'The target assignee does not belong to the ticket department',
        )
      }
      const onLeave = await usersOnLeaveToday(db)
      if (onLeave.has(input.targetUserId)) {
        throw assigneeOnVacation(locale === 'zh' ? '该处理人正在休假中' : '该处理人正在休假中')
      }
      toStatus = 'assigned'
      const targetTeamId = membership?.team_id ?? null
      updates.columns.push('status', 'assignee_id')
      updates.params.push('assigned', input.targetUserId)
      if (targetTeamId !== null) {
        updates.columns.push('team_id')
        updates.params.push(targetTeamId)
      }
      const target = await db.queryOne<{ name_zh: string }>({
        text: 'SELECT name_zh FROM biz_users WHERE id = ?',
        params: [input.targetUserId],
      })
      remarkZh = `工单转派给 ${target?.name_zh ?? `#${input.targetUserId}`}`
      remarkEn = `Ticket transferred to ${target?.name_zh ?? `#${input.targetUserId}`}`
    }
  } else {
    throw stateConflict(locale === 'zh' ? '工单当前状态不允许该操作' : 'The ticket status does not allow this operation', { status: ticket.status })
  }

  await db.transaction(async (tx) => {
    await tx.run({
      text: `UPDATE tickets SET ${updates.columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
      params: [...updates.params, ticketId],
    })
    await insertActivity(
      tx,
      {
        ticketId,
        actorId: user.id,
        action: 'transfer',
        fromStatus,
        toStatus,
        remarkZh,
        remarkEn,
        source: 'user',
      },
      now,
    )
  })
  return reloadDetail(db, user, ticketId, locale)
}

export async function changeCategory(db: DbClient, user: SessionUser, ticketId: number, categoryId: number, locale: Locale): Promise<TicketDetail> {
  const ticket = await getTicketRow(db, ticketId)
  if (!ticket) throw notFound(locale === 'zh' ? '工单不存在' : 'Ticket not found')
  await assertTicketVisible(db, user, ticket, locale === 'zh' ? '工单不存在' : 'Ticket not found')
  if (ticket.status === 'draft' || ['closed', 'cancelled'].includes(ticket.status)) {
    throw stateConflict(locale === 'zh' ? '工单当前状态不允许该操作' : 'The ticket status does not allow this operation', { status: ticket.status })
  }
  const isAssignee = ticket.assignee_id === user.id
  let scopeManager = false
  if (user.role === 'manager') {
    scopeManager =
      (ticket.department_id !== null && (await isDepartmentManagerOf(db, user.id, ticket.department_id))) ||
      (ticket.team_id !== null &&
        (await db.queryOne<{ user_id: number }>({
          text: 'SELECT user_id FROM team_members WHERE team_id = ? AND user_id = ?',
          params: [ticket.team_id, user.id],
        })) !== null)
  }
  if (!isAssignee && !scopeManager && user.role !== 'admin') {
    throw forbidden(locale === 'zh' ? '没有权限执行该操作' : 'You are not allowed to change the category')
  }
  const category = await assertCategoryUsable(db, categoryId, locale)
  if (categoryId === ticket.category_id) {
    return reloadDetail(db, user, ticketId, locale)
  }
  const now = nowIso()
  const calendar = await loadCalendar(db)
  const policy = await loadSlaPolicyForCategory(db, categoryId)
  // Recompute both deadlines from the original origin points (AC-08 / contract
  // §3.5); a new category without a policy clears the clocks.
  const deadlines = policy
    ? computeDeadlines(ticket, policy, calendar)
    : { firstResponse: null, resolution: null }
  await db.transaction(async (tx) => {
    await tx.run({
      text: `UPDATE tickets SET category_id = ?, department_id = ?, sla_first_response_deadline = ?,
        sla_resolution_deadline = ?, updated_at = ? WHERE id = ?`,
      params: [categoryId, category.department_id, deadlines.firstResponse, deadlines.resolution, now, ticketId],
    })
    await insertActivity(
      tx,
      {
        ticketId,
        actorId: user.id,
        action: 'change_category',
        fieldChanges: [
          { field: 'category', oldValue: `${ticket.category_name_zh} (#${ticket.category_id})`, newValue: `#${categoryId}` },
        ],
        remarkZh: `在线切换分类并按新分类 SLA 策略重算截止时间（状态与处理人不变）`,
        remarkEn: 'Category switched online; SLA deadlines recomputed from the new policy (status and assignee unchanged)',
        source: 'user',
      },
      now,
    )
  })
  return reloadDetail(db, user, ticketId, locale)
}

export async function changePriority(db: DbClient, user: SessionUser, ticketId: number, priority: string, locale: Locale): Promise<TicketDetail> {
  if (!['low', 'medium', 'high', 'urgent'].includes(priority)) {
    throw validation(locale === 'zh' ? '优先级不合法' : 'Invalid priority', ['priority'])
  }
  const ticket = await getTicketRow(db, ticketId)
  if (!ticket) throw notFound(locale === 'zh' ? '工单不存在' : 'Ticket not found')
  await assertTicketVisible(db, user, ticket, locale === 'zh' ? '工单不存在' : 'Ticket not found')
  if (ticket.status === 'draft' || ['closed', 'cancelled'].includes(ticket.status)) {
    throw stateConflict(locale === 'zh' ? '工单当前状态不允许该操作' : 'The ticket status does not allow this operation', { status: ticket.status })
  }
  const isAssignee = ticket.assignee_id === user.id
  let scopeManager = false
  if (user.role === 'manager') {
    scopeManager =
      (ticket.department_id !== null && (await isDepartmentManagerOf(db, user.id, ticket.department_id))) ||
      (ticket.team_id !== null &&
        (await db.queryOne<{ user_id: number }>({
          text: 'SELECT user_id FROM team_members WHERE team_id = ? AND user_id = ?',
          params: [ticket.team_id, user.id],
        })) !== null)
  }
  if (!isAssignee && !scopeManager && user.role !== 'admin') {
    throw forbidden(locale === 'zh' ? '没有权限执行该操作' : 'You are not allowed to change the priority')
  }
  const now = nowIso()
  await db.transaction(async (tx) => {
    await tx.run({
      text: 'UPDATE tickets SET priority = ?, updated_at = ? WHERE id = ?',
      params: [priority, now, ticketId],
    })
    await insertActivity(
      tx,
      {
        ticketId,
        actorId: user.id,
        action: 'change_priority',
        fieldChanges: [{ field: 'priority', oldValue: ticket.priority, newValue: priority }],
        remarkZh: '在线切换优先级（不影响状态与处理人）',
        remarkEn: 'Priority switched online (status and assignee unchanged)',
        source: 'user',
      },
      now,
    )
  })
  return reloadDetail(db, user, ticketId, locale)
}

// --- Rating ---

export async function rateTicket(
  db: DbClient,
  user: SessionUser,
  ticketId: number,
  input: { score: number; comment?: string },
  locale: Locale,
): Promise<{ score: number; comment: string | null; createdAt: string }> {
  if (!Number.isInteger(input.score) || input.score < 1 || input.score > 5) {
    throw validation(locale === 'zh' ? '评分须为 1-5' : 'score must be 1..5', ['score'])
  }
  const ticket = await getTicketRow(db, ticketId)
  if (!ticket) throw notFound(locale === 'zh' ? '工单不存在' : 'Ticket not found')
  if (ticket.requester_id !== user.id) throw notFound(locale === 'zh' ? '工单不存在' : 'Ticket not found')
  if (ticket.status !== 'closed') {
    throw stateConflict(locale === 'zh' ? '工单当前状态不允许该操作' : 'Only closed tickets can be rated', { status: ticket.status })
  }
  const existing = await db.queryOne<{ id: number; is_system_default: number }>({
    text: 'SELECT id, is_system_default FROM ratings WHERE ticket_id = ?',
    params: [ticketId],
  })
  if (existing && existing.is_system_default === 0) {
    throw ratingExists(locale === 'zh' ? '该工单已评价，不能重复评分' : 'This ticket is already rated')
  }
  const now = nowIso()
  await db.transaction(async (tx) => {
    if (existing) {
      // A system default rating does not occupy the requester's rating slot.
      await tx.run({
        text: 'UPDATE ratings SET score = ?, comment = ?, is_system_default = 0, created_at = ? WHERE id = ?',
        params: [input.score, input.comment?.trim() || null, now, existing.id],
      })
    } else {
      await tx.run({
        text: 'INSERT INTO ratings (ticket_id, score, comment, is_system_default, created_at) VALUES (?, ?, ?, 0, ?)',
        params: [ticketId, input.score, input.comment?.trim() || null, now],
      })
    }
    await insertActivity(
      tx,
      {
        ticketId,
        actorId: user.id,
        action: 'rating',
        remarkZh: `提交人评分：${input.score} 分`,
        remarkEn: `Requester rated ${input.score}/5`,
        source: 'user',
      },
      now,
    )
  })
  return { score: input.score, comment: input.comment?.trim() || null, createdAt: now }
}

// --- Timeline & activities ---

export async function timeline(db: DbClient, user: SessionUser, ticketId: number, locale: Locale): Promise<TimelineItem[]> {
  await loadTicketForUser(db, user, ticketId, locale)
  const replies = await db.queryAll<{ id: number; author_id: number; body: string; kind: ReplyKind; created_at: string }>({
    text: 'SELECT id, author_id, body, kind, created_at FROM replies WHERE ticket_id = ? ORDER BY created_at DESC, id DESC',
    params: [ticketId],
  })
  const activities = await listActivities(db, ticketId)
  const authorCache = new Map<number, Awaited<ReturnType<typeof userBrief>>>()
  const authorOf = async (id: number) => {
    if (!authorCache.has(id)) authorCache.set(id, await userBrief(db, id))
    return authorCache.get(id) ?? null
  }
  const items: TimelineItem[] = []
  for (const reply of replies) {
    const author = await authorOf(reply.author_id)
    items.push({
      kind: 'reply',
      occurredAt: reply.created_at,
      author: serializeUserRef(locale, author) ?? undefined,
      body: reply.body,
      replyKind: reply.kind,
    })
  }
  for (const activity of activities) {
    const actor = activity.actor_id ? await authorOf(activity.actor_id) : null
    items.push({
      kind: 'activity',
      occurredAt: activity.created_at,
      author: serializeUserRef(locale, actor) ?? undefined,
      action: activity.action,
      fromStatus: activity.from_status ?? undefined,
      toStatus: activity.to_status ?? undefined,
      fieldChanges: activity.field_changes ? (JSON.parse(activity.field_changes) as FieldChange[]) : undefined,
      remarkZh: activity.remark_zh,
      remarkEn: activity.remark_en,
      source: activity.source,
    })
  }
  items.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0))
  return items
}

export async function ticketActivities(db: DbClient, user: SessionUser, ticketId: number, locale: Locale) {
  await loadTicketForUser(db, user, ticketId, locale)
  const rows = await listActivities(db, ticketId)
  const authorCache = new Map<number, Awaited<ReturnType<typeof userBrief>>>()
  const authorOf = async (id: number) => {
    if (!authorCache.has(id)) authorCache.set(id, await userBrief(db, id))
    return authorCache.get(id) ?? null
  }
  const items = []
  for (const row of rows) {
    const actor = row.actor_id ? await authorOf(row.actor_id) : null
    items.push({
      id: row.id,
      actor: serializeUserRef(locale, actor),
      action: row.action,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      fieldChanges: row.field_changes ? (JSON.parse(row.field_changes) as FieldChange[]) : undefined,
      remarkZh: row.remark_zh,
      remarkEn: row.remark_en,
      source: row.source,
      createdAt: row.created_at,
    })
  }
  return { items }
}

// --- Listing & export ---

function numericFilter(value: string | undefined, field: string, locale: Locale): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw validation(locale === 'zh' ? '筛选参数不合法' : 'Invalid filter value', [field])
  }
  return parsed
}

export async function listTickets(
  db: DbClient,
  user: SessionUser,
  query: Record<string, string | undefined>,
  locale: Locale,
): Promise<Paginated<TicketSummary>> {
  const page = Math.max(1, Number(query.page ?? 1) || 1)
  const requestedSize = query.pageSize === undefined ? DEFAULT_PAGE_SIZE : Number(query.pageSize)
  if (!TICKET_PAGE_SIZES.includes(requestedSize)) {
    throw validation(locale === 'zh' ? '每页条数仅支持 10/20/50/100' : 'pageSize must be one of 10/20/50/100', ['pageSize'])
  }
  const sort = parseSort(query.sort)
  if (sort.column === '') {
    throw validation(locale === 'zh' ? '排序参数不合法' : 'Invalid sort parameter', ['sort'])
  }
  const filters: TicketFilters = {}
  if (query.status) {
    filters.status = query.status.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
    for (const status of filters.status) {
      if (!['draft', 'pending_assign', 'assigned', 'in_progress', 'on_hold', 'pending_confirm', 'cancelled', 'closed'].includes(status)) {
        throw validation(locale === 'zh' ? '状态不合法' : 'Invalid status', ['status'])
      }
    }
  }
  if (query.category) filters.category = numericFilter(query.category, 'category', locale)
  if (query.priority) {
    if (!['low', 'medium', 'high', 'urgent'].includes(query.priority)) {
      throw validation(locale === 'zh' ? '优先级不合法' : 'Invalid priority', ['priority'])
    }
    filters.priority = query.priority
  }
  if (query.assignee) filters.assignee = numericFilter(query.assignee, 'assignee', locale)
  if (query.requester) filters.requester = numericFilter(query.requester, 'requester', locale)
  if (query.department) filters.department = numericFilter(query.department, 'department', locale)
  if (query.team) filters.team = numericFilter(query.team, 'team', locale)
  if (query.sla === 'alert') filters.slaAlert = true
  if (query.q) filters.q = query.q
  // Requesters always see their own tickets only (server-enforced scope).
  if (user.role === 'requester') filters.requester = user.id
  const scope = await ticketScopeFor(db, user)
  const result = await queryTickets(db, scope, filters, sort, page, requestedSize)
  const items = await Promise.all(result.items.map((row) => toSummary(db, row, locale)))
  return { items, page: result.page, pageSize: result.pageSize, total: result.total }
}

export async function exportTicketsCsv(db: DbClient, user: SessionUser, query: Record<string, string | undefined>, locale: Locale): Promise<string> {
  if (user.role === 'requester') {
    throw forbidden(locale === 'zh' ? '没有权限执行该操作' : 'Requesters cannot export tickets')
  }
  const filters: TicketFilters = {}
  if (query.status) filters.status = query.status.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
  if (query.category) filters.category = numericFilter(query.category, 'category', locale)
  if (query.priority) {
    if (!['low', 'medium', 'high', 'urgent'].includes(query.priority)) {
      throw validation(locale === 'zh' ? '优先级不合法' : 'Invalid priority', ['priority'])
    }
    filters.priority = query.priority
  }
  if (query.assignee) filters.assignee = numericFilter(query.assignee, 'assignee', locale)
  if (query.department) filters.department = numericFilter(query.department, 'department', locale)
  if (query.team) filters.team = numericFilter(query.team, 'team', locale)
  if (query.sla === 'alert') filters.slaAlert = true
  if (query.q) filters.q = query.q
  const scope = await ticketScopeFor(db, user)
  const sort = parseSort(query.sort)
  const result = await queryTickets(db, scope, filters, sort, 1, 100_000)
  const header = [
    'id',
    'ticketNo',
    'subjectZh',
    'subjectEn',
    'category',
    'subCategory',
    'priority',
    'status',
    'requester',
    'assignee',
    'team',
    'department',
    'submittedAt',
    'firstResponseAt',
    'resolvedAt',
    'closedAt',
    'createdAt',
    'updatedAt',
    'slaFirstResponse',
    'slaResolution',
  ]
  const rows = result.items.map((row) => [
    row.id,
    row.ticket_no ?? '',
    row.subject_zh,
    row.subject_en ?? '',
    row.category_name_zh,
    row.sub_category_name_zh ?? '',
    row.priority,
    row.status,
    row.requester_id,
    row.assignee_id ?? '',
    row.team_name_zh ?? '',
    row.department_name_zh ?? '',
    row.submitted_at ?? '',
    row.first_response_at ?? '',
    row.resolved_at ?? '',
    row.closed_at ?? '',
    row.created_at,
    row.updated_at,
    row.sla_first_response_deadline ?? '',
    row.sla_resolution_deadline ?? '',
  ])
  return csvDocument(header, rows)
}

export async function getTicketDetail(db: DbClient, user: SessionUser, ticketId: number, locale: Locale): Promise<TicketDetail> {
  const row = await loadTicketForUser(db, user, ticketId, locale)
  return toDetail(db, user, row, locale)
}

export type { TicketListRow }
