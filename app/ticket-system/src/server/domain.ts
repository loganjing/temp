import { randomUUID } from 'node:crypto'
import type { DbClient } from '@commonapp/dbkit'
import { createAuditKit } from '@commonapp/auditkit'
import type { EmailClient } from '@commonapp/emailkit'
import { AuditAction } from '../shared/constants'
import type { Ticket, TicketDetail, TicketReply, TicketEvaluation, TicketLogEntry, StatisticsOverview, StatisticsDistribution, UserProfile } from '../shared/types'

export interface DomainContext {
  userId: string
  profileId: string | null
  companyId: string | null
  role: string
}

const now = () => new Date().toISOString()

export class DomainError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message)
  }
}

const sql = (text: string, params?: readonly unknown[]) => ({ text, params })

// ─── Company management ───

export async function createCompany(db: DbClient, name: string) {
  const id = randomUUID()
  const ts = now()
  await db.run(sql('INSERT INTO companies (id, name, created_at) VALUES (?, ?, ?)', [id, name, ts]))
  return { id, name, createdAt: ts }
}

export async function listCompanies(db: DbClient) {
  return db.queryAll<{ id: string; name: string; created_at: string }>(sql('SELECT id, name, created_at FROM companies ORDER BY created_at DESC'))
}

// ─── Department management ───

export async function createDepartment(db: DbClient, companyId: string, name: string) {
  const id = randomUUID()
  const ts = now()
  await db.run(sql('INSERT INTO departments (id, company_id, name, created_at) VALUES (?, ?, ?, ?)', [id, companyId, name, ts]))
  return { id, companyId, name, createdAt: ts }
}

export async function listDepartments(db: DbClient, companyId: string) {
  return db.queryAll<{ id: string; company_id: string; name: string; created_at: string }>(
    sql('SELECT id, company_id, name, created_at FROM departments WHERE company_id = ? ORDER BY created_at DESC', [companyId]),
  )
}

// ─── User profile management ───

export async function createUserProfile(db: DbClient, userId: string, companyId: string, departmentId: string | null, name: string, email: string) {
  const existing = await db.queryOne<{ id: string }>(sql('SELECT id FROM user_profiles WHERE user_id = ?', [userId]))
  if (existing) throw new DomainError('validation_error', 'User profile already exists')
  const id = randomUUID()
  const ts = now()
  await db.run(sql('INSERT INTO user_profiles (id, user_id, company_id, department_id, name, email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, userId, companyId, departmentId, name, email, ts]))
  return { id, userId, companyId, departmentId, name, email, createdAt: ts }
}

export async function getUserProfileByUserId(db: DbClient, userId: string) {
  return db.queryOne<{ id: string; user_id: string; company_id: string; department_id: string | null; name: string; email: string; created_at: string }>(
    sql('SELECT id, user_id, company_id, department_id, name, email, created_at FROM user_profiles WHERE user_id = ?', [userId]),
  )
}

// ─── Ticket row mapper ───

interface TicketRow {
  id: string; subject: string; description: string; category: string; priority: string; status: string
  submitter_id: string; submitter_name: string; submitter_email: string; assigned_group_id: string | null
  handler_id: string | null; company_id: string; created_at: string; completed_at: string | null; cancelled_at: string | null
}

function mapTicket(r: TicketRow): Ticket {
  return {
    id: r.id, subject: r.subject, description: r.description, category: r.category, priority: r.priority as Ticket['priority'],
    status: r.status as Ticket['status'], submitterId: r.submitter_id, submitterName: r.submitter_name, submitterEmail: r.submitter_email,
    assignedGroupId: r.assigned_group_id, handlerId: r.handler_id, companyId: r.company_id, createdAt: r.created_at,
    completedAt: r.completed_at, cancelledAt: r.cancelled_at,
  }
}

// ─── Role-based ticket visibility ───

function ticketVisibilityCondition(ctx: DomainContext): { condition: string; params: unknown[] } {
  if (ctx.role === 'admin' && ctx.companyId) {
    return { condition: 'company_id = ?', params: [ctx.companyId] }
  }
  if (ctx.role === 'submitter' && ctx.profileId) {
    return { condition: 'company_id = ? AND submitter_id = ?', params: [ctx.companyId, ctx.profileId] }
  }
  // handler — tickets assigned to groups the user is a member of
  if (ctx.profileId) {
    return {
      condition: 'company_id = ? AND assigned_group_id IN (SELECT group_id FROM business_group_members WHERE user_id = ?)',
      params: [ctx.companyId, ctx.profileId],
    }
  }
  return { condition: '1=0', params: [] }
}

// ─── Ticket CRUD ───

type AuditService = ReturnType<typeof createAuditKit>

export async function createTicket(db: DbClient, auditKit: AuditService, ctx: DomainContext, input: { subject: string; description: string; category: string; priority: string }) {
  if (!ctx.profileId || !ctx.companyId) throw new DomainError('forbidden', 'User profile not configured', 403)
  const id = randomUUID()
  const ts = now()

  // Look up submitter profile info
  const profile = await db.queryOne<{ name: string; email: string }>(sql('SELECT name, email FROM user_profiles WHERE id = ?', [ctx.profileId]))
  if (!profile) throw new DomainError('not_found', 'Submitter profile not found', 404)

  // Auto-assignment: match company_id + category
  const rule = await db.queryOne<{ target_group_id: string }>(
    sql('SELECT target_group_id FROM assignment_rules WHERE company_id = ? AND category = ?', [ctx.companyId, input.category]),
  )

  const assignedGroupId = rule?.target_group_id ?? null
  const status = rule ? 'pending_processing' : 'pending_assignment'

  await db.run(sql(
    `INSERT INTO tickets (id, company_id, subject, description, category, priority, status, submitter_id, submitter_name, submitter_email, assigned_group_id, handler_id, created_at, completed_at, cancelled_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, NULL)`,
    [id, ctx.companyId, input.subject, input.description, input.category, input.priority, status, ctx.profileId, profile.name, profile.email, assignedGroupId, ts],
  ))

  await auditKit.record({ type: AuditAction.TICKET_CREATED, occurredAt: ts, actorUserId: ctx.userId, metadata: { ticketId: id, companyId: ctx.companyId } })
  if (assignedGroupId) {
    await auditKit.record({ type: AuditAction.TICKET_ASSIGNED, occurredAt: ts, actorUserId: ctx.userId, metadata: { ticketId: id, groupId: assignedGroupId } })
  }

  const ticket = await getTicketById(db, ctx, id)
  return ticket!
}

export async function listTickets(db: DbClient, ctx: DomainContext, filters: { status?: string; category?: string; companyId?: string; keyword?: string; sort?: string; order?: string; page?: number; pageSize?: number }) {
  if (!ctx.companyId) return { items: [] as Ticket[], total: 0, page: 1, pageSize: 20 }

  const vis = ticketVisibilityCondition(ctx)

  // admin can override company filter
  let baseCondition = vis.condition
  let baseParams = vis.params
  if (ctx.role === 'admin' && filters.companyId) {
    baseCondition = 'company_id = ?'
    baseParams = [filters.companyId]
  }

  const conditions: string[] = [baseCondition]
  const params: unknown[] = [...baseParams]

  if (filters.status) { conditions.push('status = ?'); params.push(filters.status) }
  if (filters.category) { conditions.push('category = ?'); params.push(filters.category) }
  if (filters.keyword) {
    conditions.push('(subject LIKE ? OR description LIKE ?)')
    const kw = `%${filters.keyword}%`
    params.push(kw, kw)
  }

  const where = conditions.join(' AND ')
  const sortField = ['created_at', 'priority', 'status'].includes(filters.sort ?? '') ? filters.sort : 'created_at'
  const orderDir = filters.order === 'asc' ? 'ASC' : 'DESC'
  const page = Math.max(filters.page ?? 1, 1)
  const pageSize = Math.min(Math.max(filters.pageSize ?? 20, 1), 100)
  const offset = (page - 1) * pageSize

  const totalRow = await db.queryOne<{ total: number }>(sql(`SELECT COUNT(*) AS total FROM tickets WHERE ${where}`, params))
  const total = totalRow?.total ?? 0

  const rows = await db.queryAll<TicketRow>(
    sql(`SELECT * FROM tickets WHERE ${where} ORDER BY ${sortField} ${orderDir} LIMIT ? OFFSET ?`, [...params, pageSize, offset]),
  )

  return { items: rows.map(mapTicket), total, page, pageSize }
}

export async function getTicketById(db: DbClient, ctx: DomainContext, ticketId: string): Promise<Ticket | null> {
  const row = await db.queryOne<TicketRow>(sql('SELECT * FROM tickets WHERE id = ?', [ticketId]))
  if (!row) return null
  return mapTicket(row)
}

export async function getTicketDetail(db: DbClient, ctx: DomainContext, ticketId: string): Promise<TicketDetail | null> {
  const ticket = await getTicketById(db, ctx, ticketId)
  if (!ticket) return null

  // Company isolation check
  if (ctx.companyId && ticket.companyId !== ctx.companyId) throw new DomainError('company_isolation', 'Cross-company access denied', 403)

  // Role-based access check
  if (ctx.role === 'submitter' && ctx.profileId && ticket.submitterId !== ctx.profileId) throw new DomainError('forbidden', 'Access denied', 403)
  if (ctx.role === 'handler' && ctx.profileId) {
    const member = await db.queryOne<{ id: string }>(sql(
      'SELECT 1 AS id FROM business_group_members WHERE group_id = ? AND user_id = ?',
      [ticket.assignedGroupId, ctx.profileId],
    ))
    if (!member && ticket.assignedGroupId) throw new DomainError('forbidden', 'Access denied', 403)
  }

  const replies = await db.queryAll<{ id: string; ticket_id: string; replier_id: string; content: string; created_at: string; replier_name: string }>(
    sql(`SELECT r.id, r.ticket_id, r.replier_id, r.content, r.created_at, p.name AS replier_name
         FROM ticket_replies r JOIN user_profiles p ON r.replier_id = p.id
         WHERE r.ticket_id = ? ORDER BY r.created_at ASC`, [ticketId]),
  )

  const evaluation = await db.queryOne<{ id: string; ticket_id: string; rating: number; comment: string | null; created_at: string }>(
    sql('SELECT id, ticket_id, rating, comment, created_at FROM ticket_evaluations WHERE ticket_id = ?', [ticketId]),
  )

  const logEvents = await db.queryAll<{ id: string; event_type: string; actor_user_id: string | null; occurred_at: string }>(
    sql(`SELECT id, event_type, actor_user_id, occurred_at FROM audit_events
         WHERE event_type IN ('ticket_created', 'ticket_assigned', 'ticket_transferred', 'ticket_processed', 'ticket_completed', 'ticket_cancelled')
         AND metadata_json LIKE ?
         ORDER BY occurred_at DESC LIMIT 10`, [`%${ticketId}%`]),
  )

  const recentLogs = []
  for (const e of logEvents) {
    let operatorName = ''
    if (e.actor_user_id) {
      const actorProfile = await getUserProfileByUserId(db, e.actor_user_id)
      operatorName = actorProfile?.name ?? ''
    }
    recentLogs.push({ id: e.id, action: e.event_type, operatorName, createdAt: e.occurred_at })
  }

  return {
    ...ticket,
    replies: replies.map(r => ({ id: r.id, ticketId: r.ticket_id, replierId: r.replier_id, replierName: r.replier_name, content: r.content, createdAt: r.created_at })),
    evaluation: evaluation ? { id: evaluation.id, ticketId: evaluation.ticket_id, rating: evaluation.rating, comment: evaluation.comment, createdAt: evaluation.created_at } : null,
    recentLogs,
  }
}

export async function updateTicketStatus(db: DbClient, auditKit: AuditService, ctx: DomainContext, ticketId: string, newStatus: string) {
  const ticket = await getTicketById(db, ctx, ticketId)
  if (!ticket) throw new DomainError('not_found', 'Ticket not found', 404)
  if (ctx.companyId && ticket.companyId !== ctx.companyId) throw new DomainError('company_isolation', 'Cross-company access denied', 403)

  const validTransitions: Record<string, string[]> = {
    created: ['pending_assignment'],
    pending_assignment: ['pending_processing', 'cancelled'],
    pending_processing: ['completed', 'cancelled'],
    completed: [],
    cancelled: [],
  }
  if (!validTransitions[ticket.status]?.includes(newStatus)) throw new DomainError('invalid_transition', `Cannot transition from ${ticket.status} to ${newStatus}`)

  const ts = now()
  const updates: string[] = ['status = ?']
  const params: unknown[] = [newStatus]

  if (newStatus === 'completed') {
    updates.push('handler_id = ?', 'completed_at = ?')
    params.push(ctx.profileId, ts)
    await auditKit.record({ type: AuditAction.TICKET_COMPLETED, occurredAt: ts, actorUserId: ctx.userId, metadata: { ticketId } })
  }
  if (newStatus === 'cancelled') {
    updates.push('cancelled_at = ?')
    params.push(ts)
    await auditKit.record({ type: AuditAction.TICKET_CANCELLED, occurredAt: ts, actorUserId: ctx.userId, metadata: { ticketId } })
  }
  if (newStatus === 'pending_processing') {
    await auditKit.record({ type: AuditAction.TICKET_PROCESSED, occurredAt: ts, actorUserId: ctx.userId, metadata: { ticketId } })
  }

  params.push(ticketId)
  await db.run(sql(`UPDATE tickets SET ${updates.join(', ')} WHERE id = ?`, params))

  return await getTicketById(db, ctx, ticketId)
}

// ─── Ticket replies ───

export async function addReply(db: DbClient, ctx: DomainContext, ticketId: string, content: string) {
  if (!ctx.profileId) throw new DomainError('forbidden', 'User profile not configured', 403)
  const ticket = await getTicketById(db, ctx, ticketId)
  if (!ticket) throw new DomainError('not_found', 'Ticket not found', 404)
  if (ctx.companyId && ticket.companyId !== ctx.companyId) throw new DomainError('company_isolation', 'Cross-company access denied', 403)

  // Role-based access
  if (ctx.role === 'submitter' && ticket.submitterId !== ctx.profileId) throw new DomainError('forbidden', 'Access denied', 403)
  if (ctx.role === 'handler' && ticket.assignedGroupId) {
    const member = await db.queryOne<{ id: string }>(sql('SELECT 1 AS id FROM business_group_members WHERE group_id = ? AND user_id = ?', [ticket.assignedGroupId, ctx.profileId]))
    if (!member) throw new DomainError('forbidden', 'Access denied', 403)
  }

  const id = randomUUID()
  const ts = now()
  const profile = await db.queryOne<{ name: string }>(sql('SELECT name FROM user_profiles WHERE id = ?', [ctx.profileId]))
  await db.run(sql('INSERT INTO ticket_replies (id, ticket_id, replier_id, content, created_at) VALUES (?, ?, ?, ?, ?)', [id, ticketId, ctx.profileId, content, ts]))

  return { id, ticketId, replierId: ctx.profileId, replierName: profile?.name ?? '', content, createdAt: ts }
}

// ─── Ticket transfer ───

export async function transferTicket(db: DbClient, auditKit: AuditService, ctx: DomainContext, ticketId: string, targetGroupId: string) {
  if (!ctx.profileId) throw new DomainError('forbidden', 'User profile not configured', 403)
  const ticket = await getTicketById(db, ctx, ticketId)
  if (!ticket) throw new DomainError('not_found', 'Ticket not found', 404)
  if (ctx.companyId && ticket.companyId !== ctx.companyId) throw new DomainError('company_isolation', 'Cross-company access denied', 403)

  // Validate target group exists and belongs to same company
  const targetGroup = await db.queryOne<{ id: string; company_id: string }>(sql('SELECT id, company_id FROM business_groups WHERE id = ?', [targetGroupId]))
  if (!targetGroup || targetGroup.company_id !== ticket.companyId) throw new DomainError('invalid_target_group', 'Target group does not exist or does not belong to the same company')

  const fromGroupId = ticket.assignedGroupId
  const ts = now()
  await db.run(sql('UPDATE tickets SET assigned_group_id = ?, status = ? WHERE id = ?', [targetGroupId, 'pending_processing', ticketId]))

  const recordId = randomUUID()
  await db.run(sql('INSERT INTO ticket_transfer_records (id, ticket_id, from_group_id, to_group_id, transferred_by, created_at) VALUES (?, ?, ?, ?, ?, ?)', [recordId, ticketId, fromGroupId, targetGroupId, ctx.profileId, ts]))

  await auditKit.record({ type: AuditAction.TICKET_TRANSFERRED, occurredAt: ts, actorUserId: ctx.userId, metadata: { ticketId, fromGroupId, toGroupId: targetGroupId } })

  return await getTicketById(db, ctx, ticketId)
}

// ─── Ticket complete ───

export async function completeTicket(db: DbClient, auditKit: AuditService, emailClient: EmailClient | null, ctx: DomainContext, ticketId: string) {
  if (!ctx.profileId) throw new DomainError('forbidden', 'User profile not configured', 403)
  const ticket = await getTicketById(db, ctx, ticketId)
  if (!ticket) throw new DomainError('not_found', 'Ticket not found', 404)
  if (ctx.companyId && ticket.companyId !== ctx.companyId) throw new DomainError('company_isolation', 'Cross-company access denied', 403)

  if (ticket.status !== 'pending_processing') throw new DomainError('invalid_transition', 'Ticket must be in pending_processing state to complete')

  const ts = now()
  await db.run(sql('UPDATE tickets SET status = ?, handler_id = ?, completed_at = ? WHERE id = ?', ['completed', ctx.profileId, ts, ticketId]))

  await auditKit.record({ type: AuditAction.TICKET_COMPLETED, occurredAt: ts, actorUserId: ctx.userId, metadata: { ticketId } })

  // Send email notification — failure does not rollback
  if (emailClient) {
    try {
      await emailClient.send({
        to: ticket.submitterEmail,
        subject: `工单已完成: ${ticket.subject}`,
        text: `您的工单 "${ticket.subject}" (ID: ${ticket.id}) 已处理完成。`,
      })
    } catch (error) {
      console.error(`[email] failed to send completion notification for ticket ${ticket.id}:`, error)
    }
  } else {
    console.log(`[email] SMTP not configured, skipping notification for ticket ${ticket.id}`)
  }

  return await getTicketById(db, ctx, ticketId)
}

// ─── Evaluations ───

export async function createEvaluation(db: DbClient, ctx: DomainContext, ticketId: string, rating: number, comment: string | null) {
  if (!ctx.profileId) throw new DomainError('forbidden', 'User profile not configured', 403)
  const ticket = await getTicketById(db, ctx, ticketId)
  if (!ticket) throw new DomainError('not_found', 'Ticket not found', 404)
  if (ctx.companyId && ticket.companyId !== ctx.companyId) throw new DomainError('company_isolation', 'Cross-company access denied', 403)

  if (ticket.status !== 'completed') throw new DomainError('invalid_transition', 'Can only evaluate completed tickets')
  if (ticket.submitterId !== ctx.profileId) throw new DomainError('forbidden', 'Only the submitter can evaluate', 403)

  const existing = await db.queryOne<{ id: string }>(sql('SELECT id FROM ticket_evaluations WHERE ticket_id = ?', [ticketId]))
  if (existing) throw new DomainError('already_evaluated', 'Ticket already evaluated')

  const id = randomUUID()
  const ts = now()
  await db.run(sql('INSERT INTO ticket_evaluations (id, ticket_id, evaluator_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)', [id, ticketId, ctx.profileId, rating, comment, ts]))

  return { id, ticketId, rating, comment, createdAt: ts }
}

export async function getEvaluation(db: DbClient, ticketId: string) {
  const row = await db.queryOne<{ id: string; ticket_id: string; rating: number; comment: string | null; created_at: string }>(
    sql('SELECT id, ticket_id, rating, comment, created_at FROM ticket_evaluations WHERE ticket_id = ?', [ticketId]),
  )
  if (!row) throw new DomainError('not_evaluated', 'Ticket has not been evaluated', 404)
  return { id: row.id, ticketId: row.ticket_id, rating: row.rating, comment: row.comment, createdAt: row.created_at }
}

// ─── Submitter profile ───

export async function getSubmitterProfile(db: DbClient, ctx: DomainContext, userId: string): Promise<UserProfile> {
  const profile = await db.queryOne<{ id: string; name: string; email: string; company_id: string; department_id: string | null }>(
    sql('SELECT id, name, email, company_id, department_id FROM user_profiles WHERE id = ?', [userId]),
  )
  if (!profile) throw new DomainError('not_found', 'User profile not found', 404)

  // Company isolation
  if (ctx.companyId && profile.company_id !== ctx.companyId) throw new DomainError('company_isolation', 'Cross-company access denied', 403)

  const company = await db.queryOne<{ name: string }>(sql('SELECT name FROM companies WHERE id = ?', [profile.company_id]))
  const department = profile.department_id ? await db.queryOne<{ name: string }>(sql('SELECT name FROM departments WHERE id = ?', [profile.department_id])) : null

  const tickets = await db.queryAll<{ id: string; subject: string; status: string; created_at: string }>(
    sql('SELECT id, subject, status, created_at FROM tickets WHERE submitter_id = ? ORDER BY created_at DESC', [profile.id]),
  )

  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    companyName: company?.name ?? '',
    departmentName: department?.name ?? null,
    ticketHistory: tickets.map(t => ({ id: t.id, subject: t.subject, status: t.status, createdAt: t.created_at })),
  }
}

// ─── Business groups ───

export async function listBusinessGroups(db: DbClient, ctx: DomainContext, companyId?: string) {
  const targetCompany = companyId ?? ctx.companyId
  if (!targetCompany) return { items: [] }
  const groups = await db.queryAll<{ id: string; name: string; company_id: string; created_at: string; member_count: number }>(
    sql(`SELECT g.id, g.name, g.company_id, g.created_at, COUNT(m.id) AS member_count
         FROM business_groups g LEFT JOIN business_group_members m ON m.group_id = g.id
         WHERE g.company_id = ? GROUP BY g.id ORDER BY g.created_at DESC`, [targetCompany]),
  )
  return {
    items: groups.map(g => ({ id: g.id, name: g.name, companyId: g.company_id, memberCount: g.member_count, createdAt: g.created_at })),
  }
}

export async function createBusinessGroup(db: DbClient, ctx: DomainContext, name: string) {
  if (!ctx.companyId) throw new DomainError('forbidden', 'User profile not configured', 403)
  const id = randomUUID()
  const ts = now()
  await db.run(sql('INSERT INTO business_groups (id, company_id, name, created_at) VALUES (?, ?, ?, ?)', [id, ctx.companyId, name, ts]))
  return { id, name, companyId: ctx.companyId, createdAt: ts }
}

export async function addGroupMember(db: DbClient, ctx: DomainContext, groupId: string, userId: string) {
  const group = await db.queryOne<{ id: string; company_id: string }>(sql('SELECT id, company_id FROM business_groups WHERE id = ?', [groupId]))
  if (!group) throw new DomainError('not_found', 'Business group not found', 404)
  if (ctx.companyId && group.company_id !== ctx.companyId) throw new DomainError('company_isolation', 'Cross-company access denied', 403)

  // userId here is a user_id (from users table), find the profile
  const profile = await db.queryOne<{ id: string }>(sql('SELECT id FROM user_profiles WHERE user_id = ?', [userId]))
  if (!profile) throw new DomainError('not_found', 'User profile not found', 404)

  const existing = await db.queryOne<{ id: string }>(sql('SELECT id FROM business_group_members WHERE group_id = ? AND user_id = ?', [groupId, profile.id]))
  if (existing) throw new DomainError('already_member', 'User is already a member')

  const id = randomUUID()
  const ts = now()
  await db.run(sql('INSERT INTO business_group_members (id, group_id, user_id, created_at) VALUES (?, ?, ?, ?)', [id, groupId, profile.id, ts]))
  return { id, groupId, userId: profile.id, createdAt: ts }
}

export async function removeGroupMember(db: DbClient, ctx: DomainContext, groupId: string, userId: string) {
  const group = await db.queryOne<{ id: string; company_id: string }>(sql('SELECT id, company_id FROM business_groups WHERE id = ?', [groupId]))
  if (!group) throw new DomainError('not_found', 'Business group not found', 404)
  if (ctx.companyId && group.company_id !== ctx.companyId) throw new DomainError('company_isolation', 'Cross-company access denied', 403)

  await db.run(sql('DELETE FROM business_group_members WHERE group_id = ? AND user_id = ?', [groupId, userId]))
  return { ok: true }
}

// ─── Assignment rules ───

export async function listAssignmentRules(db: DbClient, ctx: DomainContext) {
  if (!ctx.companyId) return { items: [] }
  const rules = await db.queryAll<{ id: string; company_id: string; category: string; target_group_id: string; target_group_name: string; created_at: string }>(
    sql(`SELECT r.id, r.company_id, r.category, r.target_group_id, g.name AS target_group_name, r.created_at
         FROM assignment_rules r JOIN business_groups g ON r.target_group_id = g.id
         WHERE r.company_id = ? ORDER BY r.created_at DESC`, [ctx.companyId]),
  )
  return {
    items: rules.map(r => ({ id: r.id, companyId: r.company_id, category: r.category, targetGroupId: r.target_group_id, targetGroupName: r.target_group_name, createdAt: r.created_at })),
  }
}

export async function createAssignmentRule(db: DbClient, ctx: DomainContext, category: string, targetGroupId: string) {
  if (!ctx.companyId) throw new DomainError('forbidden', 'User profile not configured', 403)
  const group = await db.queryOne<{ id: string; company_id: string }>(sql('SELECT id, company_id FROM business_groups WHERE id = ?', [targetGroupId]))
  if (!group || group.company_id !== ctx.companyId) throw new DomainError('invalid_target_group', 'Target group does not exist or does not belong to the same company')

  const existing = await db.queryOne<{ id: string }>(sql('SELECT id FROM assignment_rules WHERE company_id = ? AND category = ?', [ctx.companyId, category]))
  if (existing) throw new DomainError('duplicate_rule', 'Assignment rule already exists for this category')

  const id = randomUUID()
  const ts = now()
  await db.run(sql('INSERT INTO assignment_rules (id, company_id, category, target_group_id, created_at) VALUES (?, ?, ?, ?, ?)', [id, ctx.companyId, category, targetGroupId, ts]))
  return { id, companyId: ctx.companyId, category, targetGroupId, createdAt: ts }
}

export async function deleteAssignmentRule(db: DbClient, ctx: DomainContext, ruleId: string) {
  const rule = await db.queryOne<{ id: string; company_id: string }>(sql('SELECT id, company_id FROM assignment_rules WHERE id = ?', [ruleId]))
  if (!rule) throw new DomainError('not_found', 'Assignment rule not found', 404)
  if (ctx.companyId && rule.company_id !== ctx.companyId) throw new DomainError('company_isolation', 'Cross-company access denied', 403)
  await db.run(sql('DELETE FROM assignment_rules WHERE id = ?', [ruleId]))
  return { ok: true }
}

// ─── Statistics ───

export async function getStatisticsOverview(db: DbClient, ctx: DomainContext, companyId?: string): Promise<StatisticsOverview> {
  const targetCompany = (ctx.role === 'admin' && companyId) ? companyId : ctx.companyId
  if (!targetCompany) {
    return { totalTickets: 0, pendingTickets: 0, completedTickets: 0, cancelledTickets: 0, avgResponseTimeHours: null, avgSatisfaction: null, hotCategories: [] }
  }
  const c = (condition: string) => sql(`SELECT COUNT(*) AS total FROM tickets WHERE company_id = ? AND ${condition}`, [targetCompany])

  const [totalRow, pendingRow, completedRow, cancelledRow] = await Promise.all([
    db.queryOne<{ total: number }>(sql('SELECT COUNT(*) AS total FROM tickets WHERE company_id = ?', [targetCompany])),
    db.queryOne<{ total: number }>(c("status IN ('pending_assignment', 'pending_processing')")),
    db.queryOne<{ total: number }>(c("status = 'completed'")),
    db.queryOne<{ total: number }>(c("status = 'cancelled'")),
  ])

  // Average response time: from ticket creation to first reply
  const responseTimeRow = await db.queryOne<{ avg_hours: number | null }>(
    sql(`SELECT AVG(CAST((julianday(r.created_at) - julianday(t.created_at)) * 24 AS REAL)) AS avg_hours
         FROM ticket_replies r JOIN tickets t ON r.ticket_id = t.id
         WHERE t.company_id = ? AND r.id = (SELECT id FROM ticket_replies WHERE ticket_id = t.id ORDER BY created_at ASC LIMIT 1)`, [targetCompany]),
  )

  const satisfactionRow = await db.queryOne<{ avg_rating: number | null }>(
    sql(`SELECT AVG(e.rating) AS avg_rating FROM ticket_evaluations e JOIN tickets t ON e.ticket_id = t.id WHERE t.company_id = ?`, [targetCompany]),
  )

  const hotCategories = await db.queryAll<{ category: string; count: number }>(
    sql('SELECT category, COUNT(*) AS count FROM tickets WHERE company_id = ? GROUP BY category ORDER BY count DESC LIMIT 5', [targetCompany]),
  )

  return {
    totalTickets: totalRow?.total ?? 0,
    pendingTickets: pendingRow?.total ?? 0,
    completedTickets: completedRow?.total ?? 0,
    cancelledTickets: cancelledRow?.total ?? 0,
    avgResponseTimeHours: responseTimeRow?.avg_hours ?? null,
    avgSatisfaction: satisfactionRow?.avg_rating ?? null,
    hotCategories: hotCategories.map(c => ({ category: c.category, count: c.count })),
  }
}

export async function getStatisticsDistribution(db: DbClient, ctx: DomainContext, dimension: string, companyId?: string): Promise<StatisticsDistribution> {
  const targetCompany = (ctx.role === 'admin' && companyId) ? companyId : ctx.companyId
  if (!targetCompany) return { dimension, items: [] }

  if (dimension === 'company') {
    const rows = await db.queryAll<{ key: string; label: string; count: number }>(
      sql(`SELECT t.company_id AS key, c.name AS label, COUNT(*) AS count
           FROM tickets t JOIN companies c ON t.company_id = c.id
           WHERE t.company_id = ? GROUP BY t.company_id`, [targetCompany]),
    )
    return { dimension, items: rows.map(r => ({ key: r.key, label: r.label, count: r.count })) }
  }

  // department dimension
  const rows = await db.queryAll<{ key: string; label: string; count: number }>(
    sql(`SELECT p.department_id AS key, d.name AS label, COUNT(*) AS count
         FROM tickets t JOIN user_profiles p ON t.submitter_id = p.id
         LEFT JOIN departments d ON p.department_id = d.id
         WHERE t.company_id = ? GROUP BY p.department_id`, [targetCompany]),
  )
  return { dimension, items: rows.map(r => ({ key: r.key ?? '', label: r.label ?? '未分配部门', count: r.count })) }
}

// ─── Ticket logs (audit events) ───

export async function getTicketLogs(db: DbClient, ctx: DomainContext, ticketId: string): Promise<{ items: TicketLogEntry[] }> {
  const ticket = await getTicketById(db, ctx, ticketId)
  if (!ticket) throw new DomainError('not_found', 'Ticket not found', 404)
  if (ctx.companyId && ticket.companyId !== ctx.companyId) throw new DomainError('company_isolation', 'Cross-company access denied', 403)

  const events = await db.queryAll<{ id: string; event_type: string; actor_user_id: string | null; occurred_at: string; metadata_json: string }>(
    sql(`SELECT id, event_type, actor_user_id, occurred_at, metadata_json FROM audit_events
         WHERE event_type IN ('ticket_created', 'ticket_assigned', 'ticket_transferred', 'ticket_processed', 'ticket_completed', 'ticket_cancelled')
         AND metadata_json LIKE ?
         ORDER BY occurred_at ASC`, [`%${ticketId}%`]),
  )

  const items: TicketLogEntry[] = []
  for (const e of events) {
    let operatorName = ''
    if (e.actor_user_id) {
      const profile = await getUserProfileByUserId(db, e.actor_user_id)
      operatorName = profile?.name ?? ''
    }
    let details = ''
    try { details = JSON.stringify(JSON.parse(e.metadata_json)) } catch { details = e.metadata_json }
    items.push({ id: e.id, action: e.event_type, operatorId: e.actor_user_id ?? '', operatorName, createdAt: e.occurred_at, details })
  }

  return { items }
}
