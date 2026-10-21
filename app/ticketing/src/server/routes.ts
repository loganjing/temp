import { randomUUID } from 'node:crypto'
import type { Hono, MiddlewareHandler } from 'hono'
import type { initializePlatform } from './platform/bootstrap'
import type { AuthUser } from '@commonapp/userkit'
import type { EmailClient } from '@commonapp/emailkit'
import { isAuditAction, isPriority } from '../shared/contracts'
import type { AuditAction, Priority } from '../shared/contracts'
import { loadSessionUser, type SessionUser } from './modules/session'
import { recordAudit, listCompanyAudit, listTicketAudit } from './modules/audit'
import { sendCompletionNotification, listTicketNotifications } from './modules/notification'
import {
  addMember,
  createGroup,
  createRule,
  deleteGroup,
  deleteRule,
  findGroup,
  findRule,
  isGroupMember,
  listGroups,
  listRules,
  removeMember,
  updateGroupName,
  updateRule,
} from './modules/assignment'
import {
  addReply,
  cancelTicket,
  completeTicket,
  createTicket,
  getSubmitterInfo,
  getTicketDetail,
  getTicketRowByNo,
  listTickets,
  rateTicket,
  transferTicket,
} from './modules/ticket'
import { listWorkbench } from './modules/workbench'
import { dashboard, distribution } from './modules/stats'
import { boundedString, positiveInt } from './modules/util'

type Platform = Awaited<ReturnType<typeof initializePlatform>>
const errorBody = (code: string, message: string) => ({ error: { code, message } })
const authUserOf = (context: unknown): AuthUser => (context as { get(name: string): unknown }).get('currentUser') as AuthUser
const currentUserId = (context: unknown) => authUserOf(context).id

async function sessionOf(context: unknown, platform: Platform): Promise<SessionUser> {
  return loadSessionUser(platform.db, authUserOf(context))
}

const requireCompany = (session: SessionUser): number | null => session.companyId

const requiredString = (value: unknown, name: string, maxLength = 200) => {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) throw new TypeError(`${name} is required`)
  return value.trim()
}

const userMutationError = (error: unknown, fallback: string) => {
  if (error instanceof TypeError) return error.message
  if (error instanceof Error && /unique constraint/i.test(error.message)) return 'Email or phone is already in use'
  console.error('[users] mutation failed')
  return fallback
}

const COMPANY_REQUIRED_MSG = 'Current user has no company'

export function registerPublicRoutes(app: Hono, platform: Platform) {
  app.get('/api/auth/bootstrap-status', async (context) => context.json({ required: (await platform.auth.userStore.count()) === 0 }))
  app.post('/api/auth/bootstrap', platform.auth.loginRateLimit, async (context) => {
    const body = await context.req.json().catch(() => ({}))
    let name: string
    let email: string
    let password: string
    try {
      name = requiredString(body.name, 'name')
      email = requiredString(body.email, 'email', 320).toLowerCase()
      password = requiredString(body.password, 'password', 256)
      if (!email.includes('@') || password.length < 12) throw new TypeError('Enter a valid email and a password with at least 12 characters')
    } catch (error) {
      return context.json(errorBody('INVALID_INPUT', error instanceof Error ? error.message : 'Invalid input'), 400)
    }
    const passwordHash = platform.auth.hashPassword(password)
    const id = randomUUID()
    try {
      await platform.db.transaction(async (tx) => {
        const count = await tx.queryOne<{ total: number }>({ text: 'SELECT COUNT(*) AS total FROM users' })
        if (Number(count?.total ?? 0) !== 0) throw new Error('BOOTSTRAP_CLOSED')
        const timestamp = new Date().toISOString()
        await tx.run({
          text: 'INSERT INTO users (id, name, email, phone, enabled, company_id, password_hash, created_at, updated_at) VALUES (?, ?, ?, NULL, 1, NULL, ?, ?, ?)',
          params: [id, name, email, passwordHash, timestamp, timestamp],
        })
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'BOOTSTRAP_CLOSED') return context.json(errorBody('BOOTSTRAP_CLOSED', 'An account already exists'), 409)
      console.error('[bootstrap] failed')
      return context.json(errorBody('BOOTSTRAP_FAILED', 'Could not create the first account'), 500)
    }
    return context.json({ ok: true }, 201)
  })
  app.post('/api/auth/login', platform.auth.loginRateLimit, platform.auth.loginRoute as MiddlewareHandler)
  app.get('/api/auth/sso/start', (context) => platform.auth.sso.start(context as never))
  app.get('/api/auth/sso/callback', (context) => platform.auth.sso.callback(context as never))
  app.post('/api/auth/sso/exchange', (context) => platform.auth.sso.exchange(context as never))
}

export function registerProtectedRoutes(app: Hono, platform: Platform) {
  app.get('/api/auth/me', async (context) => {
    const session = await sessionOf(context, platform)
    if (session.companyId == null) {
      return context.json(errorBody('forbidden', 'Current user has no company'), 403)
    }
    return context.json({
      id: session.id,
      name: session.name,
      email: session.email,
      company: { id: session.companyId, name: session.companyName ?? '' },
      department: session.department,
      groupIds: session.groupIds,
    })
  })

  app.post('/api/auth/password', async (context) => {
    const body = await context.req.json().catch(() => ({}))
    let password: string
    try {
      password = requiredString(body.password, 'password', 256)
      if (password.length < 12) throw new TypeError('Password must contain at least 12 characters')
    } catch (error) {
      return context.json(errorBody('INVALID_INPUT', error instanceof Error ? error.message : 'Invalid password'), 400)
    }
    const userId = currentUserId(context)
    if (!await platform.auth.userStore.updatePassword(userId, platform.auth.hashPassword(password))) return context.json(errorBody('NOT_FOUND', 'User not found'), 404)
    return context.json({ ok: true, passwordChangeRequired: false })
  })

  app.get('/api/admin/users', async (context) => {
    const search = context.req.query('search') ?? ''
    const limit = Math.min(Math.max(Number(context.req.query('limit') ?? 50), 1), 100)
    const offset = Math.max(Number(context.req.query('offset') ?? 0), 0)
    const [users, total] = await Promise.all([
      platform.auth.userStore.list({ search, limit, offset }),
      platform.auth.userStore.count({ search }),
    ])
    return context.json({ users, total })
  })

  app.post('/api/admin/users', async (context) => {
    const body = await context.req.json().catch(() => ({}))
    try {
      const name = requiredString(body.name, 'name')
      const email = requiredString(body.email, 'email', 320).toLowerCase()
      const password = requiredString(body.password, 'password', 256)
      if (!email.includes('@') || password.length < 12) throw new TypeError('Enter a valid email and a password with at least 12 characters')
      const user = await platform.auth.userStore.create({ name, email, phone: typeof body.phone === 'string' ? body.phone : null, passwordChangeRequired: true }, platform.auth.hashPassword(password))
      return context.json({ user }, 201)
    } catch (error) {
      return context.json(errorBody('INVALID_USER', userMutationError(error, 'Could not create user')), error instanceof TypeError ? 400 : 409)
    }
  })

  app.patch('/api/admin/users/:id', async (context) => {
    const body = await context.req.json().catch(() => ({}))
    try {
      const email = requiredString(body.email, 'email', 320).toLowerCase()
      if (!email.includes('@')) throw new TypeError('Enter a valid email address')
      const user = await platform.auth.userStore.update(context.req.param('id'), {
        name: requiredString(body.name, 'name'),
        email,
        phone: typeof body.phone === 'string' ? body.phone : null,
      })
      if (!user) return context.json(errorBody('NOT_FOUND', 'User not found'), 404)
      return context.json({ user: { id: user.id, name: user.name, email: user.email, phone: user.phone } })
    } catch (error) {
      return context.json(errorBody('INVALID_USER', userMutationError(error, 'Could not update user')), error instanceof TypeError ? 400 : 409)
    }
  })

  app.patch('/api/admin/users/:id/status', async (context) => {
    const body = await context.req.json().catch(() => ({}))
    if (typeof body.enabled !== 'boolean') return context.json(errorBody('INVALID_INPUT', 'enabled must be a boolean'), 400)
    const userId = context.req.param('id')
    const changed = await platform.db.transaction(async (tx) => {
      const result = await tx.run({ text: 'UPDATE users SET enabled = ?, updated_at = ? WHERE id = ?', params: [body.enabled ? 1 : 0, new Date().toISOString(), userId] })
      return result.changes === 1
    })
    if (!changed) return context.json(errorBody('NOT_FOUND', 'User not found'), 404)
    return context.json({ ok: true })
  })

  app.post('/api/admin/users/:id/password', async (context) => {
    const body = await context.req.json().catch(() => ({}))
    let password: string
    try {
      password = requiredString(body.password, 'password', 256)
      if (password.length < 12) throw new TypeError('Password must contain at least 12 characters')
    } catch (error) {
      return context.json(errorBody('INVALID_INPUT', error instanceof Error ? error.message : 'Invalid password'), 400)
    }
    const userId = context.req.param('id')
    const changed = await platform.auth.userStore.updatePassword(userId, platform.auth.hashPassword(password), true)
    if (!changed) return context.json(errorBody('NOT_FOUND', 'User not found'), 404)
    return context.json({ ok: true })
  })

  registerTicketRoutes(app, platform)
  registerWorkbenchRoutes(app, platform)
  registerAssignmentRoutes(app, platform)
  registerStatsRoutes(app, platform)
  registerAuditRoutes(app, platform)
}

function currentUserRef(session: SessionUser) {
  return { id: session.id, name: session.name }
}

async function resolveCompanyTicket(
  platform: Platform,
  context: { req: { param: (name: string) => string }; json: (body: unknown, status?: number) => Response },
  session: SessionUser,
  ticketNo: string,
): Promise<{ ok: false; response: Response } | { ok: true; row: NonNullable<Awaited<ReturnType<typeof getTicketRowByNo>>> }> {
  if (session.companyId == null) return { ok: false, response: context.json(errorBody('forbidden', COMPANY_REQUIRED_MSG), 403) }
  const row = await getTicketRowByNo(platform.db, ticketNo, session.companyId)
  if (!row) return { ok: false, response: context.json(errorBody('not_found', 'Ticket not found'), 404) }
  return { ok: true, row }
}

function validationCatch(error: unknown, fallback: string): { code: string; message: string } {
  if (error instanceof TypeError) return { code: 'validation_failed', message: error.message }
  return { code: 'validation_failed', message: fallback }
}

function isUniqueConstraint(error: unknown, fragment: string): boolean {
  return error instanceof Error && new RegExp(`unique constraint.*${fragment}`, 'i').test(error.message)
}

function registerTicketRoutes(app: Hono, platform: Platform) {
  app.post('/api/tickets', async (context) => {
    const session = await sessionOf(context, platform)
    if (session.companyId == null) return context.json(errorBody('forbidden', COMPANY_REQUIRED_MSG), 403)
    const body = await context.req.json().catch(() => ({}))
    let subject: string
    let description: string
    let category: string
    let priority: Priority
    try {
      subject = boundedString(body.subject, 'subject', 1, 200)
      description = boundedString(body.description, 'description', 1, 5000)
      category = boundedString(body.category, 'category', 1, 64)
      if (!isPriority(body.priority)) throw new TypeError('priority must be P0-P4')
      priority = body.priority
    } catch (error) {
      const e = validationCatch(error, 'Invalid ticket input')
      return context.json(errorBody(e.code, e.message), 400)
    }
    const ticket = await createTicket(platform.db, { subject, description, category, priority }, session.companyId, session.id, session.name)
    return context.json({ ticket }, 201)
  })

  app.get('/api/tickets', async (context) => {
    const session = await sessionOf(context, platform)
    if (session.companyId == null) return context.json({ items: [] })
    const q = context.req.query.bind(context.req)
    const items = await listTickets(platform.db, session.companyId, {
      status: q('status'),
      category: q('category'),
      priority: q('priority'),
      companyId: q('companyId'),
      q: q('q'),
      sort: q('sort'),
      order: q('order'),
      mine: q('mine') === 'true',
      userId: session.id,
    })
    return context.json({ items })
  })

  app.get('/api/tickets/:ticketNo', async (context) => {
    const session = await sessionOf(context, platform)
    const resolved = await resolveCompanyTicket(platform, context, session, context.req.param('ticketNo'))
    if (!resolved.ok) return resolved.response
    const detail = await getTicketDetail(platform.db, resolved.row)
    return context.json(detail)
  })

  app.post('/api/tickets/:ticketNo/replies', async (context) => {
    const session = await sessionOf(context, platform)
    const resolved = await resolveCompanyTicket(platform, context, session, context.req.param('ticketNo'))
    if (!resolved.ok) return resolved.response
    const row = resolved.row
    const isMember = row.current_group_id != null && session.groupIds.includes(row.current_group_id)
    if (row.submitter_id !== session.id && !isMember) return context.json(errorBody('forbidden', 'Not allowed to reply'), 403)
    if (row.status !== 'pending_assignment' && row.status !== 'processing') return context.json(errorBody('invalid_status', 'Ticket is not open for replies'), 409)
    const body = await context.req.json().catch(() => ({}))
    let content: string
    try {
      content = boundedString(body.content, 'content', 1, 5000)
    } catch (error) {
      const e = validationCatch(error, 'Invalid reply')
      return context.json(errorBody(e.code, e.message), 400)
    }
    const reply = await addReply(platform.db, row, session.id, session.name, content)
    return context.json({ reply }, 201)
  })

  app.post('/api/tickets/:ticketNo/transfer', async (context) => {
    const session = await sessionOf(context, platform)
    const resolved = await resolveCompanyTicket(platform, context, session, context.req.param('ticketNo'))
    if (!resolved.ok) return resolved.response
    const row = resolved.row
    const isMember = row.current_group_id != null && session.groupIds.includes(row.current_group_id)
    if (!isMember) return context.json(errorBody('forbidden', 'Only the current group can transfer'), 403)
    if (row.status !== 'processing') return context.json(errorBody('invalid_status', 'Only processing tickets can be transferred'), 409)
    const body = await context.req.json().catch(() => ({}))
    let toGroupId: number
    try {
      toGroupId = positiveInt(body.toGroupId, 'toGroupId')
    } catch (error) {
      const e = validationCatch(error, 'Invalid transfer target')
      return context.json(errorBody(e.code, e.message), 400)
    }
    const target = await findGroup(platform.db, toGroupId, session.companyId!)
    if (!target) return context.json(errorBody('validation_failed', 'Target group does not exist in this company'), 400)
    if (row.current_group_id === toGroupId) return context.json(errorBody('validation_failed', 'Target group is the same as current group'), 400)
    const ticket = await transferTicket(platform.db, row, toGroupId, session.id, session.name)
    return context.json({ ticket })
  })

  app.post('/api/tickets/:ticketNo/complete', async (context) => {
    const session = await sessionOf(context, platform)
    const resolved = await resolveCompanyTicket(platform, context, session, context.req.param('ticketNo'))
    if (!resolved.ok) return resolved.response
    const row = resolved.row
    const isMember = row.current_group_id != null && session.groupIds.includes(row.current_group_id)
    if (!isMember) return context.json(errorBody('forbidden', 'Only the current group can complete'), 403)
    if (row.status !== 'processing') return context.json(errorBody('invalid_status', 'Only processing tickets can be completed'), 409)
    const ticket = await completeTicket(platform.db, row, session.id, session.name)
    // 事务提交后发送邮件并写 notification_log；发送失败记录 failed，不回滚工单状态。
    await sendCompletionNotification(platform.db, platform.email as EmailClient | null, {
      ticketId: row.id,
      ticketNo: row.ticket_no,
      subject: row.subject,
      submitterEmail: row.submitter_email,
      handlerName: session.name,
      handledAt: ticket.handledAt ?? new Date().toISOString(),
    })
    return context.json({ ticket })
  })

  app.post('/api/tickets/:ticketNo/cancel', async (context) => {
    const session = await sessionOf(context, platform)
    const resolved = await resolveCompanyTicket(platform, context, session, context.req.param('ticketNo'))
    if (!resolved.ok) return resolved.response
    const row = resolved.row
    if (row.submitter_id !== session.id) return context.json(errorBody('forbidden', 'Only the submitter can cancel'), 403)
    if (row.status !== 'pending_assignment' && row.status !== 'processing') return context.json(errorBody('invalid_status', 'Only open tickets can be cancelled'), 409)
    const ticket = await cancelTicket(platform.db, row, session.id, session.name)
    return context.json({ ticket })
  })

  app.post('/api/tickets/:ticketNo/rating', async (context) => {
    const session = await sessionOf(context, platform)
    const resolved = await resolveCompanyTicket(platform, context, session, context.req.param('ticketNo'))
    if (!resolved.ok) return resolved.response
    const row = resolved.row
    if (row.submitter_id !== session.id) return context.json(errorBody('forbidden', 'Only the submitter can rate'), 403)
    if (row.status !== 'completed') return context.json(errorBody('invalid_status', 'Only completed tickets can be rated'), 409)
    const body = await context.req.json().catch(() => ({}))
    let score: number
    let comment: string | null = null
    try {
      score = positiveInt(body.score, 'score')
      if (score < 1 || score > 5) throw new TypeError('score must be 1-5')
      if (body.comment != null) comment = boundedString(body.comment, 'comment', 0, 1000)
    } catch (error) {
      const e = validationCatch(error, 'Invalid rating')
      return context.json(errorBody(e.code, e.message), 400)
    }
    try {
      const rating = await rateTicket(platform.db, row, session.id, session.name, score, comment)
      return context.json({ rating }, 201)
    } catch (error) {
      if (isUniqueConstraint(error, 'ticket_id')) return context.json(errorBody('already_rated', 'Ticket already rated'), 409)
      throw error
    }
  })

  app.get('/api/tickets/:ticketNo/submitter', async (context) => {
    const session = await sessionOf(context, platform)
    const resolved = await resolveCompanyTicket(platform, context, session, context.req.param('ticketNo'))
    if (!resolved.ok) return resolved.response
    const info = await getSubmitterInfo(platform.db, resolved.row)
    return context.json(info)
  })

  app.get('/api/tickets/:ticketNo/audit-logs', async (context) => {
    const session = await sessionOf(context, platform)
    const resolved = await resolveCompanyTicket(platform, context, session, context.req.param('ticketNo'))
    if (!resolved.ok) return resolved.response
    const items = await listTicketAudit(platform.db, resolved.row.ticket_no)
    return context.json({ items })
  })

  app.get('/api/tickets/:ticketNo/notifications', async (context) => {
    const session = await sessionOf(context, platform)
    const resolved = await resolveCompanyTicket(platform, context, session, context.req.param('ticketNo'))
    if (!resolved.ok) return resolved.response
    const items = await listTicketNotifications(platform.db, resolved.row.id)
    return context.json({ items })
  })
}

function registerWorkbenchRoutes(app: Hono, platform: Platform) {
  app.get('/api/workbench/tickets', async (context) => {
    const session = await sessionOf(context, platform)
    if (session.companyId == null) return context.json({ items: [] })
    const q = context.req.query.bind(context.req)
    const items = await listWorkbench(platform.db, session.companyId, session.groupIds, {
      companyId: q('companyId'),
      category: q('category'),
      priority: q('priority'),
      q: q('q'),
      sort: q('sort'),
      order: q('order'),
      group: q('group'),
    })
    return context.json({ items })
  })
}

function registerAssignmentRoutes(app: Hono, platform: Platform) {
  app.get('/api/groups', async (context) => {
    const session = await sessionOf(context, platform)
    if (session.companyId == null) return context.json({ items: [] })
    const items = await listGroups(platform.db, session.companyId)
    return context.json({ items })
  })

  app.post('/api/groups', async (context) => {
    const session = await sessionOf(context, platform)
    if (session.companyId == null) return context.json(errorBody('forbidden', COMPANY_REQUIRED_MSG), 403)
    const body = await context.req.json().catch(() => ({}))
    let name: string
    try {
      name = boundedString(body.name, 'name', 1, 64)
    } catch (error) {
      const e = validationCatch(error, 'Invalid group name')
      return context.json(errorBody(e.code, e.message), 400)
    }
    try {
      const group = await createGroup(platform.db, session.companyId, name)
      return context.json({ group }, 201)
    } catch (error) {
      if (isUniqueConstraint(error, 'company_id')) return context.json(errorBody('group_exists', 'Group name already exists in this company'), 409)
      throw error
    }
  })

  app.put('/api/groups/:id', async (context) => {
    const session = await sessionOf(context, platform)
    if (session.companyId == null) return context.json(errorBody('forbidden', COMPANY_REQUIRED_MSG), 403)
    const body = await context.req.json().catch(() => ({}))
    let name: string
    let groupId: number
    try {
      groupId = positiveInt(context.req.param('id'), 'id')
      name = boundedString(body.name, 'name', 1, 64)
    } catch (error) {
      const e = validationCatch(error, 'Invalid group')
      return context.json(errorBody(e.code, e.message), 400)
    }
    try {
      const group = await updateGroupName(platform.db, groupId, session.companyId, name)
      if (!group) return context.json(errorBody('not_found', 'Group not found'), 404)
      return context.json({ group })
    } catch (error) {
      if (isUniqueConstraint(error, 'company_id')) return context.json(errorBody('group_exists', 'Group name already exists in this company'), 409)
      throw error
    }
  })

  app.delete('/api/groups/:id', async (context) => {
    const session = await sessionOf(context, platform)
    if (session.companyId == null) return context.json(errorBody('forbidden', COMPANY_REQUIRED_MSG), 403)
    let groupId: number
    try {
      groupId = positiveInt(context.req.param('id'), 'id')
    } catch (error) {
      const e = validationCatch(error, 'Invalid group id')
      return context.json(errorBody(e.code, e.message), 400)
    }
    const deleted = await deleteGroup(platform.db, groupId, session.companyId)
    if (!deleted) {
      const exists = await findGroup(platform.db, groupId, session.companyId)
      if (!exists) return context.json(errorBody('not_found', 'Group not found'), 404)
      return context.json(errorBody('group_in_use', 'Group still has open tickets'), 409)
    }
    return context.json({ ok: true })
  })

  app.post('/api/groups/:id/members', async (context) => {
    const session = await sessionOf(context, platform)
    if (session.companyId == null) return context.json(errorBody('forbidden', COMPANY_REQUIRED_MSG), 403)
    let groupId: number
    const body = await context.req.json().catch(() => ({}))
    try {
      groupId = positiveInt(context.req.param('id'), 'id')
      boundedString(body.userId, 'userId', 1, 255)
    } catch (error) {
      const e = validationCatch(error, 'Invalid member input')
      return context.json(errorBody(e.code, e.message), 400)
    }
    const group = await findGroup(platform.db, groupId, session.companyId)
    if (!group) return context.json(errorBody('not_found', 'Group not found'), 404)
    const userId = String(body.userId)
    const target = await platform.auth.userStore.findById(userId)
    if (!target) return context.json(errorBody('validation_failed', 'User does not exist'), 400)
    const targetCompany = target.companyId != null && target.companyId !== '' ? Number(target.companyId) : null
    if (targetCompany !== session.companyId) return context.json(errorBody('validation_failed', 'User belongs to another company'), 400)
    if (await isGroupMember(platform.db, groupId, userId)) return context.json(errorBody('already_member', 'User is already a member'), 409)
    await addMember(platform.db, groupId, userId)
    const updated = await listGroups(platform.db, session.companyId)
    const result = updated.find((g) => g.id === groupId)!
    return context.json({ group: result }, 201)
  })

  app.delete('/api/groups/:id/members/:userId', async (context) => {
    const session = await sessionOf(context, platform)
    if (session.companyId == null) return context.json(errorBody('forbidden', COMPANY_REQUIRED_MSG), 403)
    let groupId: number
    try {
      groupId = positiveInt(context.req.param('id'), 'id')
    } catch (error) {
      const e = validationCatch(error, 'Invalid group id')
      return context.json(errorBody(e.code, e.message), 400)
    }
    const userId = context.req.param('userId')
    const group = await findGroup(platform.db, groupId, session.companyId)
    if (!group) return context.json(errorBody('not_found', 'Group not found'), 404)
    await removeMember(platform.db, groupId, userId)
    const updated = await listGroups(platform.db, session.companyId)
    const result = updated.find((g) => g.id === groupId)!
    return context.json({ group: result })
  })

  app.get('/api/assignment-rules', async (context) => {
    const session = await sessionOf(context, platform)
    if (session.companyId == null) return context.json({ items: [] })
    const items = await listRules(platform.db, session.companyId)
    return context.json({ items })
  })

  app.post('/api/assignment-rules', async (context) => {
    const session = await sessionOf(context, platform)
    if (session.companyId == null) return context.json(errorBody('forbidden', COMPANY_REQUIRED_MSG), 403)
    const body = await context.req.json().catch(() => ({}))
    let category: string
    let groupId: number
    try {
      category = boundedString(body.category, 'category', 1, 64)
      groupId = positiveInt(body.groupId, 'groupId')
    } catch (error) {
      const e = validationCatch(error, 'Invalid rule input')
      return context.json(errorBody(e.code, e.message), 400)
    }
    const group = await findGroup(platform.db, groupId, session.companyId)
    if (!group) return context.json(errorBody('validation_failed', 'Group does not exist in this company'), 400)
    try {
      const rule = await createRule(platform.db, session.companyId, category, groupId)
      return context.json({ rule }, 201)
    } catch (error) {
      if (isUniqueConstraint(error, 'company_id')) return context.json(errorBody('rule_exists', 'Rule for this category already exists'), 409)
      throw error
    }
  })

  app.put('/api/assignment-rules/:id', async (context) => {
    const session = await sessionOf(context, platform)
    if (session.companyId == null) return context.json(errorBody('forbidden', COMPANY_REQUIRED_MSG), 403)
    const body = await context.req.json().catch(() => ({}))
    let ruleId: number
    let category: string
    let groupId: number
    try {
      ruleId = positiveInt(context.req.param('id'), 'id')
      category = boundedString(body.category, 'category', 1, 64)
      groupId = positiveInt(body.groupId, 'groupId')
    } catch (error) {
      const e = validationCatch(error, 'Invalid rule input')
      return context.json(errorBody(e.code, e.message), 400)
    }
    const group = await findGroup(platform.db, groupId, session.companyId)
    if (!group) return context.json(errorBody('validation_failed', 'Group does not exist in this company'), 400)
    try {
      const rule = await updateRule(platform.db, ruleId, session.companyId, category, groupId)
      if (!rule) return context.json(errorBody('not_found', 'Rule not found'), 404)
      return context.json({ rule })
    } catch (error) {
      if (isUniqueConstraint(error, 'company_id')) return context.json(errorBody('rule_exists', 'Rule for this category already exists'), 409)
      throw error
    }
  })

  app.delete('/api/assignment-rules/:id', async (context) => {
    const session = await sessionOf(context, platform)
    if (session.companyId == null) return context.json(errorBody('forbidden', COMPANY_REQUIRED_MSG), 403)
    let ruleId: number
    try {
      ruleId = positiveInt(context.req.param('id'), 'id')
    } catch (error) {
      const e = validationCatch(error, 'Invalid rule id')
      return context.json(errorBody(e.code, e.message), 400)
    }
    const deleted = await deleteRule(platform.db, ruleId, session.companyId)
    if (!deleted) return context.json(errorBody('not_found', 'Rule not found'), 404)
    return context.json({ ok: true })
  })
}

function registerStatsRoutes(app: Hono, platform: Platform) {
  app.get('/api/stats/distribution', async (context) => {
    const session = await sessionOf(context, platform)
    if (session.companyId == null) return context.json({ dimension: 'company', rows: [] })
    const dimensionParam = context.req.query('dimension')
    const dimension = dimensionParam === 'department' ? 'department' : 'company'
    const result = await distribution(platform.db, session.companyId, dimension)
    return context.json(result)
  })

  app.get('/api/stats/dashboard', async (context) => {
    const session = await sessionOf(context, platform)
    if (session.companyId == null) return context.json({ ticketCount: 0, avgResponseMinutes: null, satisfaction: null, topCategories: [] })
    const result = await dashboard(platform.db, session.companyId)
    return context.json(result)
  })
}

function registerAuditRoutes(app: Hono, platform: Platform) {
  app.get('/api/audit-logs', async (context) => {
    const session = await sessionOf(context, platform)
    if (session.companyId == null) return context.json({ items: [] })
    const action = context.req.query('action')
    if (action && !isAuditAction(action)) return context.json(errorBody('validation_failed', 'Invalid action filter'), 400)
    const items = await listCompanyAudit(platform.db, session.companyId, {
      action: action as AuditAction | undefined,
      ticketNo: context.req.query('ticketNo') || undefined,
      from: context.req.query('from') || undefined,
      to: context.req.query('to') || undefined,
    })
    return context.json({ items })
  })
}

// 显式导出供 routes 内部使用的 audit 写入辅助（业务事件统一经事务内 recordAudit）。
export { recordAudit }
