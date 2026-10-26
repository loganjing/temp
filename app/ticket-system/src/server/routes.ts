import { randomUUID } from 'node:crypto'
import type { Hono, MiddlewareHandler } from 'hono'
import type { initializePlatform } from './platform/bootstrap'
import type { AuthUser } from '@commonapp/userkit'
import { TicketStatus, Priority, Role, AuditEventType, VALID_PRIORITIES, MIN_RATING, MAX_RATING } from '../shared/enums'

type Platform = Awaited<ReturnType<typeof initializePlatform>>
const errorBody = (code: string, message: string) => ({ error: { code, message } })
const getCurrentUser = (context: unknown) => ((context as { get(name: string): unknown }).get('currentUser') as AuthUser)
const currentUserId = (context: unknown) => getCurrentUser(context).id
const hasRole = (user: AuthUser, role: string) => user.roles.includes(role)
const now = () => new Date().toISOString()

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
        const timestamp = now()
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
  // ── 认证与用户 ──
  app.get('/api/auth/me', (context) => context.json(getCurrentUser(context)))
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

  app.get('/api/users/me', async (context) => {
    const user = getCurrentUser(context)
    const deptRow = await platform.db.queryOne<{ department: string | null }>({ text: 'SELECT department FROM users WHERE id = ?', params: [user.id] })
    return context.json({
      id: user.id,
      name: user.name,
      email: user.email,
      companyId: user.companyId,
      department: deptRow?.department ?? null,
      role: user.role,
      roles: user.roles,
      phone: user.phone,
    })
  })

  // ── 用户管理（既有） ──
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
      const user = await platform.auth.userStore.create({ name, email, phone: typeof body.phone === 'string' ? body.phone : null, companyId: typeof body.companyId === 'string' ? body.companyId : null, passwordChangeRequired: true }, platform.auth.hashPassword(password))
      if (typeof body.department === 'string' && body.department.trim()) {
        await platform.db.run({ text: 'UPDATE users SET department = ? WHERE id = ?', params: [body.department.trim(), user.id] })
      }
      if (typeof body.role === 'string' && body.role.trim()) {
        await platform.permission.assignRole(user.id, body.role.trim())
      }
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
      if (typeof body.department === 'string') {
        await platform.db.run({ text: 'UPDATE users SET department = ?, updated_at = ? WHERE id = ?', params: [body.department.trim() || null, now(), context.req.param('id')] })
      }
      if (typeof body.role === 'string' && body.role.trim()) {
        await platform.permission.assignRole(context.req.param('id'), body.role.trim())
      }
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
      const result = await tx.run({ text: 'UPDATE users SET enabled = ?, updated_at = ? WHERE id = ?', params: [body.enabled ? 1 : 0, now(), userId] })
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

  // ── 工单 CRUD ──

  app.get('/api/tickets', async (context) => {
    const user = getCurrentUser(context)
    const companyId = user.companyId
    if (!companyId) return context.json(errorBody('FORBIDDEN', 'User has no company'), 403)
    const page = Math.max(Number(context.req.query('page') ?? 1), 1)
    const pageSize = Math.min(Math.max(Number(context.req.query('pageSize') ?? 20), 1), 100)
    const search = context.req.query('search')?.trim() ?? ''
    const status = context.req.query('status')?.trim() ?? ''
    const categoryId = context.req.query('categoryId')?.trim() ?? ''
    const priority = context.req.query('priority')?.trim() ?? ''
    const sort = context.req.query('sort')?.trim() || 'created_desc'

    const where: string[] = ['t.company_id = ?']
    const params: unknown[] = [companyId]
    if (search) {
      where.push('(lower(t.title) LIKE ? OR t.id = ?)')
      params.push(`%${search.toLowerCase()}%`, search)
    }
    if (status) { where.push('t.status = ?'); params.push(status) }
    if (categoryId) { where.push('t.category_id = ?'); params.push(categoryId) }
    if (priority) { where.push('t.priority = ?'); params.push(priority) }
    const whereSql = where.join(' AND ')

    const orderBy = sort === 'priority_desc'
      ? `CASE t.priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 WHEN 'P4' THEN 4 ELSE 9 END, t.created_at DESC`
      : 't.created_at DESC'

    const totalRow = await platform.db.queryOne<{ total: number }>({ text: `SELECT COUNT(*) AS total FROM tickets t WHERE ${whereSql}`, params })
    const total = Number(totalRow?.total ?? 0)
    const rows = await platform.db.queryAll<{
      id: string; title: string; category_id: string; category_name: string; priority: string; status: string
      submitter_id: string; submitter_name: string; assigned_group_id: string | null; assignee_id: string | null
      created_at: string; processed_at: string | null
    }>({
      text: `SELECT t.id, t.title, t.category_id, c.name AS category_name, t.priority, t.status,
              t.submitter_id, u.name AS submitter_name, t.assigned_group_id, t.assignee_id,
              t.created_at, t.processed_at
             FROM tickets t
             JOIN categories c ON c.id = t.category_id
             JOIN users u ON u.id = t.submitter_id
             WHERE ${whereSql}
             ORDER BY ${orderBy}
             LIMIT ? OFFSET ?`,
      params: [...params, pageSize, (page - 1) * pageSize],
    })
    return context.json({
      items: rows.map((r) => ({
        id: r.id, title: r.title, categoryId: r.category_id, categoryName: r.category_name,
        priority: r.priority, status: r.status, submitterId: r.submitter_id, submitterName: r.submitter_name,
        assignedGroupId: r.assigned_group_id, assigneeId: r.assignee_id, createdAt: r.created_at, processedAt: r.processed_at,
      })),
      total, page, pageSize,
    })
  })

  app.post('/api/tickets', async (context) => {
    const user = getCurrentUser(context)
    if (!hasRole(user, Role.Submitter) && !hasRole(user, Role.Admin))
      return context.json(errorBody('FORBIDDEN', 'Only submitters or admins can create tickets'), 403)
    if (!user.companyId) return context.json(errorBody('FORBIDDEN', 'User has no company'), 403)

    const body = await context.req.json().catch(() => ({}))
    let title: string, description: string, categoryId: string, priority: string
    try {
      title = requiredString(body.title, 'title', 500)
      description = requiredString(body.description, 'description', 10000)
      categoryId = requiredString(body.categoryId, 'categoryId')
      priority = requiredString(body.priority, 'priority', 4)
      if (!VALID_PRIORITIES.includes(priority as Priority)) throw new TypeError('Priority must be one of P0-P4')
    } catch (error) {
      return context.json(errorBody('INVALID_INPUT', error instanceof Error ? error.message : 'Invalid input'), 400)
    }

    const category = await platform.db.queryOne<{ id: string }>({ text: 'SELECT id FROM categories WHERE id = ?', params: [categoryId] })
    if (!category) return context.json(errorBody('NOT_FOUND', 'Category not found'), 404)

    const id = randomUUID()
    const ts = now()

    const rule = await platform.db.queryOne<{ target_group_id: string }>({
      text: 'SELECT target_group_id FROM assignment_rules WHERE company_id = ? AND category_id = ?',
      params: [user.companyId, categoryId],
    })

    const status = rule ? TicketStatus.PendingProcessing : TicketStatus.PendingAssignment
    const assignedGroupId = rule?.target_group_id ?? null

    await platform.db.run({
      text: `INSERT INTO tickets (id, title, description, category_id, priority, status, submitter_id, company_id, assigned_group_id, assignee_id, processor_id, processed_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?)`,
      params: [id, title, description, categoryId, priority, status, user.id, user.companyId, assignedGroupId, ts],
    })

    await platform.audit.record({ type: AuditEventType.TicketCreated, occurredAt: ts, actorUserId: user.id, metadata: { companyId: user.companyId, ticketId: id, categoryId, priority } })
    if (rule) {
      await platform.audit.record({ type: AuditEventType.TicketAssigned, occurredAt: ts, actorUserId: user.id, metadata: { companyId: user.companyId, ticketId: id, targetGroupId: assignedGroupId, auto: true } })
    }

    return context.json({
      id, title, description, categoryId, priority, status, submitterId: user.id, companyId: user.companyId, assignedGroupId, createdAt: ts,
    }, 201)
  })

  app.get('/api/tickets/:id', async (context) => {
    const user = getCurrentUser(context)
    const ticketId = context.req.param('id')

    const ticket = await platform.db.queryOne<{
      id: string; title: string; description: string; category_id: string; category_name: string; priority: string
      status: string; submitter_id: string; submitter_name: string; company_id: string
      assigned_group_id: string | null; assignee_id: string | null; processor_id: string | null; processor_name: string | null
      created_at: string; processed_at: string | null
    }>({
      text: `SELECT t.id, t.title, t.description, t.category_id, c.name AS category_name, t.priority, t.status,
              t.submitter_id, su.name AS submitter_name, t.company_id, t.assigned_group_id, t.assignee_id,
              t.processor_id, pu.name AS processor_name, t.created_at, t.processed_at
             FROM tickets t
             JOIN categories c ON c.id = t.category_id
             JOIN users su ON su.id = t.submitter_id
             LEFT JOIN users pu ON pu.id = t.processor_id
             WHERE t.id = ?`,
      params: [ticketId],
    })
    if (!ticket) return context.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    if (ticket.company_id !== user.companyId) return context.json(errorBody('FORBIDDEN', 'Not authorized to access this ticket'), 403)

    const replies = await platform.db.queryAll<{ id: string; replier_id: string; replier_name: string; content: string; created_at: string }>({
      text: `SELECT r.id, r.replier_id, u.name AS replier_name, r.content, r.created_at
             FROM ticket_replies r JOIN users u ON u.id = r.replier_id
             WHERE r.ticket_id = ? ORDER BY r.created_at ASC`,
      params: [ticketId],
    })
    const ratingRow = await platform.db.queryOne<{ rating: number }>({ text: 'SELECT rating FROM satisfaction_ratings WHERE ticket_id = ?', params: [ticketId] })

    return context.json({
      id: ticket.id, title: ticket.title, description: ticket.description, categoryId: ticket.category_id, categoryName: ticket.category_name,
      priority: ticket.priority, status: ticket.status, submitterId: ticket.submitter_id, submitterName: ticket.submitter_name,
      companyId: ticket.company_id, assignedGroupId: ticket.assigned_group_id, assigneeId: ticket.assignee_id,
      processorId: ticket.processor_id, processorName: ticket.processor_name, createdAt: ticket.created_at, processedAt: ticket.processed_at,
      replies: replies.map((r) => ({ id: r.id, replierId: r.replier_id, replierName: r.replier_name, content: r.content, createdAt: r.created_at })),
      rating: ratingRow?.rating ?? null,
    })
  })

  // ── 工单回复 ──

  app.post('/api/tickets/:id/replies', async (context) => {
    const user = getCurrentUser(context)
    const ticketId = context.req.param('id')

    const ticket = await platform.db.queryOne<{ company_id: string; status: string }>({ text: 'SELECT company_id, status FROM tickets WHERE id = ?', params: [ticketId] })
    if (!ticket) return context.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    if (ticket.company_id !== user.companyId) return context.json(errorBody('FORBIDDEN', 'Not authorized'), 403)
    if (ticket.status === TicketStatus.Cancelled || ticket.status === TicketStatus.Completed)
      return context.json(errorBody('CONFLICT', 'Ticket is closed'), 409)

    const body = await context.req.json().catch(() => ({}))
    let content: string
    try { content = requiredString(body.content, 'content', 5000) } catch (error) {
      return context.json(errorBody('INVALID_INPUT', error instanceof Error ? error.message : 'Invalid input'), 400)
    }

    const id = randomUUID()
    const ts = now()
    await platform.db.run({
      text: 'INSERT INTO ticket_replies (id, ticket_id, replier_id, content, created_at) VALUES (?, ?, ?, ?, ?)',
      params: [id, ticketId, user.id, content, ts],
    })
    return context.json({ id, ticketId, replierId: user.id, replierName: user.name, content, createdAt: ts }, 201)
  })

  // ── 工单转派 ──

  app.post('/api/tickets/:id/transfer', async (context) => {
    const user = getCurrentUser(context)
    if (!hasRole(user, Role.Processor) && !hasRole(user, Role.Admin))
      return context.json(errorBody('FORBIDDEN', 'Only processors or admins can transfer'), 403)
    const ticketId = context.req.param('id')

    const ticket = await platform.db.queryOne<{ company_id: string; status: string; assigned_group_id: string | null }>({ text: 'SELECT company_id, status, assigned_group_id FROM tickets WHERE id = ?', params: [ticketId] })
    if (!ticket) return context.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    if (ticket.company_id !== user.companyId) return context.json(errorBody('FORBIDDEN', 'Not authorized'), 403)

    const body = await context.req.json().catch(() => ({}))
    const targetGroupId = typeof body.targetGroupId === 'string' ? body.targetGroupId.trim() : ''
    const targetUserId = typeof body.targetUserId === 'string' ? body.targetUserId.trim() : ''
    if (!targetGroupId && !targetUserId) return context.json(errorBody('INVALID_INPUT', 'Provide targetGroupId or targetUserId'), 400)

    let newGroupId = ticket.assigned_group_id
    let newAssigneeId: string | null = null

    if (targetGroupId) {
      const group = await platform.db.queryOne<{ id: string; company_id: string }>({ text: 'SELECT id, company_id FROM business_groups WHERE id = ?', params: [targetGroupId] })
      if (!group) return context.json(errorBody('NOT_FOUND', 'Target group not found'), 404)
      if (group.company_id !== user.companyId) return context.json(errorBody('FORBIDDEN', 'Cannot transfer to another company'), 403)
      newGroupId = targetGroupId
    }
    if (targetUserId) {
      const targetUser = await platform.db.queryOne<{ id: string; company_id: string }>({ text: 'SELECT id, company_id FROM users WHERE id = ?', params: [targetUserId] })
      if (!targetUser) return context.json(errorBody('NOT_FOUND', 'Target user not found'), 404)
      if (targetUser.company_id !== user.companyId) return context.json(errorBody('FORBIDDEN', 'Cannot transfer to another company'), 403)
      newAssigneeId = targetUserId
    }

    const ts = now()
    await platform.db.run({
      text: 'UPDATE tickets SET assigned_group_id = ?, assignee_id = ?, status = ? WHERE id = ?',
      params: [newGroupId, newAssigneeId, TicketStatus.PendingProcessing, ticketId],
    })
    await platform.audit.record({
      type: AuditEventType.TicketTransferred, occurredAt: ts, actorUserId: user.id,
      metadata: { companyId: user.companyId, ticketId, fromGroupId: ticket.assigned_group_id, toGroupId: newGroupId, targetUserId: newAssigneeId },
    })
    return context.json({ id: ticketId, assignedGroupId: newGroupId, assigneeId: newAssigneeId, status: TicketStatus.PendingProcessing })
  })

  // ── 工单完成 ──

  app.post('/api/tickets/:id/complete', async (context) => {
    const user = getCurrentUser(context)
    if (!hasRole(user, Role.Processor) && !hasRole(user, Role.Admin))
      return context.json(errorBody('FORBIDDEN', 'Only processors or admins can complete tickets'), 403)
    const ticketId = context.req.param('id')

    const ticket = await platform.db.queryOne<{ company_id: string; status: string; submitter_id: string; title: string }>({ text: 'SELECT company_id, status, submitter_id, title FROM tickets WHERE id = ?', params: [ticketId] })
    if (!ticket) return context.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    if (ticket.company_id !== user.companyId) return context.json(errorBody('FORBIDDEN', 'Not authorized'), 403)
    if (ticket.status !== TicketStatus.PendingProcessing)
      return context.json(errorBody('CONFLICT', 'Ticket cannot be completed in current state'), 409)

    const ts = now()
    await platform.db.run({ text: 'UPDATE tickets SET status = ?, processor_id = ?, processed_at = ? WHERE id = ?', params: [TicketStatus.Completed, user.id, ts, ticketId] })
    await platform.audit.record({ type: AuditEventType.TicketCompleted, occurredAt: ts, actorUserId: user.id, metadata: { companyId: user.companyId, ticketId, processorId: user.id } })

    // 邮件通知（尽力而为）
    const submitter = await platform.db.queryOne<{ email: string; name: string }>({ text: 'SELECT email, name FROM users WHERE id = ?', params: [ticket.submitter_id] })
    if (submitter?.email) {
      try {
        await platform.email.send({
          to: submitter.email,
          subject: `工单已完成: ${ticket.title}`,
          text: `您的工单 (ID: ${ticketId}) 已由 ${user.name} 完成处理。完成时间: ${ts}`,
          html: `<p>您的工单 <strong>${ticket.title}</strong> (ID: ${ticketId}) 已由 ${user.name} 完成处理。</p><p>完成时间: ${ts}</p>`,
        })
      } catch (error) {
        console.error('[email] failed to send completion notification', error)
      }
    }

    return context.json({ id: ticketId, status: TicketStatus.Completed, processorId: user.id, processorName: user.name, processedAt: ts })
  })

  // ── 工单取消 ──

  app.post('/api/tickets/:id/cancel', async (context) => {
    const user = getCurrentUser(context)
    if (!hasRole(user, Role.Submitter) && !hasRole(user, Role.Admin))
      return context.json(errorBody('FORBIDDEN', 'Only submitters or admins can cancel tickets'), 403)
    const ticketId = context.req.param('id')

    const ticket = await platform.db.queryOne<{ company_id: string; status: string }>({ text: 'SELECT company_id, status FROM tickets WHERE id = ?', params: [ticketId] })
    if (!ticket) return context.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    if (ticket.company_id !== user.companyId) return context.json(errorBody('FORBIDDEN', 'Not authorized'), 403)
    if (ticket.status !== TicketStatus.PendingAssignment && ticket.status !== TicketStatus.PendingProcessing)
      return context.json(errorBody('CONFLICT', 'Ticket cannot be cancelled in current state'), 409)

    const ts = now()
    await platform.db.run({ text: 'UPDATE tickets SET status = ? WHERE id = ?', params: [TicketStatus.Cancelled, ticketId] })
    await platform.audit.record({ type: AuditEventType.TicketCancelled, occurredAt: ts, actorUserId: user.id, metadata: { companyId: user.companyId, ticketId } })
    return context.json({ id: ticketId, status: TicketStatus.Cancelled })
  })

  // ── 满意度评价 ──

  app.post('/api/tickets/:id/rating', async (context) => {
    const user = getCurrentUser(context)
    if (!hasRole(user, Role.Submitter))
      return context.json(errorBody('FORBIDDEN', 'Only submitters can rate'), 403)
    const ticketId = context.req.param('id')

    const ticket = await platform.db.queryOne<{ company_id: string; status: string; submitter_id: string }>({ text: 'SELECT company_id, status, submitter_id FROM tickets WHERE id = ?', params: [ticketId] })
    if (!ticket) return context.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    if (ticket.company_id !== user.companyId) return context.json(errorBody('FORBIDDEN', 'Not authorized'), 403)
    if (ticket.submitter_id !== user.id) return context.json(errorBody('FORBIDDEN', 'Only the ticket submitter can rate'), 403)
    if (ticket.status !== TicketStatus.Completed)
      return context.json(errorBody('CONFLICT', 'Ticket must be completed before rating'), 409)

    const body = await context.req.json().catch(() => ({}))
    const rating = Number(body.rating)
    if (!Number.isInteger(rating) || rating < MIN_RATING || rating > MAX_RATING)
      return context.json(errorBody('INVALID_INPUT', `Rating must be an integer between ${MIN_RATING} and ${MAX_RATING}`), 400)

    const existing = await platform.db.queryOne<{ id: string }>({ text: 'SELECT id FROM satisfaction_ratings WHERE ticket_id = ?', params: [ticketId] })
    if (existing) return context.json(errorBody('CONFLICT', 'Ticket already rated'), 409)

    const id = randomUUID()
    const ts = now()
    await platform.db.run({ text: 'INSERT INTO satisfaction_ratings (id, ticket_id, rating, submitted_at) VALUES (?, ?, ?, ?)', params: [id, ticketId, rating, ts] })
    return context.json({ id, ticketId, rating, submittedAt: ts }, 201)
  })

  // ── 提交人信息 ──

  app.get('/api/tickets/:id/submitter-info', async (context) => {
    const user = getCurrentUser(context)
    if (!hasRole(user, Role.Processor) && !hasRole(user, Role.Admin))
      return context.json(errorBody('FORBIDDEN', 'Only processors or admins can view submitter info'), 403)
    const ticketId = context.req.param('id')

    const ticket = await platform.db.queryOne<{ submitter_id: string; company_id: string }>({ text: 'SELECT submitter_id, company_id FROM tickets WHERE id = ?', params: [ticketId] })
    if (!ticket) return context.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    if (ticket.company_id !== user.companyId) return context.json(errorBody('FORBIDDEN', 'Not authorized'), 403)

    const submitter = await platform.db.queryOne<{ name: string; department: string | null; company_name: string }>({
      text: `SELECT u.name, u.department, c.name AS company_name FROM users u LEFT JOIN companies c ON c.id = u.company_id WHERE u.id = ?`,
      params: [ticket.submitter_id],
    })
    if (!submitter) return context.json(errorBody('NOT_FOUND', 'Submitter not found'), 404)

    const history = await platform.db.queryAll<{ id: string; title: string; status: string; created_at: string }>({
      text: 'SELECT id, title, status, created_at FROM tickets WHERE submitter_id = ? ORDER BY created_at DESC LIMIT 20',
      params: [ticket.submitter_id],
    })
    return context.json({
      name: submitter.name,
      companyName: submitter.company_name ?? '',
      department: submitter.department,
      historyTickets: history.map((h) => ({ id: h.id, title: h.title, status: h.status, createdAt: h.created_at })),
    })
  })

  // ── 业务组管理 ──

  app.get('/api/business-groups', async (context) => {
    const user = getCurrentUser(context)
    if (!hasRole(user, Role.Admin)) return context.json(errorBody('FORBIDDEN', 'Admin only'), 403)
    if (!user.companyId) return context.json(errorBody('FORBIDDEN', 'User has no company'), 403)

    const groups = await platform.db.queryAll<{ id: string; name: string; company_id: string }>({
      text: 'SELECT id, name, company_id FROM business_groups WHERE company_id = ? ORDER BY name',
      params: [user.companyId],
    })
    const members = await platform.db.queryAll<{ group_id: string; user_id: string; user_name: string }>({
      text: `SELECT m.group_id, m.user_id, u.name AS user_name FROM business_group_members m JOIN users u ON u.id = m.user_id JOIN business_groups g ON g.id = m.group_id WHERE g.company_id = ?`,
      params: [user.companyId],
    })
    const membersByGroup = new Map<string, { id: string; name: string }[]>()
    for (const m of members) {
      if (!membersByGroup.has(m.group_id)) membersByGroup.set(m.group_id, [])
      membersByGroup.get(m.group_id)!.push({ id: m.user_id, name: m.user_name })
    }
    return context.json({ items: groups.map((g) => ({ id: g.id, name: g.name, companyId: g.company_id, members: membersByGroup.get(g.id) ?? [] })) })
  })

  app.post('/api/business-groups', async (context) => {
    const user = getCurrentUser(context)
    if (!hasRole(user, Role.Admin)) return context.json(errorBody('FORBIDDEN', 'Admin only'), 403)
    if (!user.companyId) return context.json(errorBody('FORBIDDEN', 'User has no company'), 403)

    const body = await context.req.json().catch(() => ({}))
    let name: string
    try { name = requiredString(body.name, 'name', 200) } catch (error) {
      return context.json(errorBody('INVALID_INPUT', error instanceof Error ? error.message : 'Invalid input'), 400)
    }
    const id = randomUUID()
    const ts = now()
    await platform.db.run({ text: 'INSERT INTO business_groups (id, company_id, name, created_at) VALUES (?, ?, ?, ?)', params: [id, user.companyId, name, ts] })
    return context.json({ id, name, companyId: user.companyId }, 201)
  })

  app.post('/api/business-groups/:id/members', async (context) => {
    const user = getCurrentUser(context)
    if (!hasRole(user, Role.Admin)) return context.json(errorBody('FORBIDDEN', 'Admin only'), 403)
    const groupId = context.req.param('id')

    const group = await platform.db.queryOne<{ id: string; company_id: string }>({ text: 'SELECT id, company_id FROM business_groups WHERE id = ?', params: [groupId] })
    if (!group) return context.json(errorBody('NOT_FOUND', 'Group not found'), 404)
    if (group.company_id !== user.companyId) return context.json(errorBody('FORBIDDEN', 'Not authorized'), 403)

    const body = await context.req.json().catch(() => ({}))
    const userId = typeof body.userId === 'string' ? body.userId.trim() : ''
    if (!userId) return context.json(errorBody('INVALID_INPUT', 'userId is required'), 400)

    const targetUser = await platform.db.queryOne<{ id: string; name: string }>({ text: 'SELECT id, name FROM users WHERE id = ?', params: [userId] })
    if (!targetUser) return context.json(errorBody('NOT_FOUND', 'User not found'), 404)

    try {
      const id = randomUUID()
      const ts = now()
      await platform.db.run({ text: 'INSERT INTO business_group_members (id, group_id, user_id, created_at) VALUES (?, ?, ?, ?)', params: [id, groupId, userId, ts] })
      return context.json({ id, groupId, userId, userName: targetUser.name }, 201)
    } catch (error) {
      if (error instanceof Error && /unique constraint/i.test(error.message)) return context.json(errorBody('CONFLICT', 'User is already a member'), 409)
      throw error
    }
  })

  app.delete('/api/business-groups/:id/members/:userId', async (context) => {
    const user = getCurrentUser(context)
    if (!hasRole(user, Role.Admin)) return context.json(errorBody('FORBIDDEN', 'Admin only'), 403)
    const groupId = context.req.param('id')
    const userId = context.req.param('userId')

    const group = await platform.db.queryOne<{ id: string; company_id: string }>({ text: 'SELECT id, company_id FROM business_groups WHERE id = ?', params: [groupId] })
    if (!group) return context.json(errorBody('NOT_FOUND', 'Group not found'), 404)
    if (group.company_id !== user.companyId) return context.json(errorBody('FORBIDDEN', 'Not authorized'), 403)

    await platform.db.run({ text: 'DELETE FROM business_group_members WHERE group_id = ? AND user_id = ?', params: [groupId, userId] })
    return context.json({ ok: true })
  })

  // ── 分类自动分配规则 ──

  app.get('/api/assignment-rules', async (context) => {
    const user = getCurrentUser(context)
    if (!hasRole(user, Role.Admin)) return context.json(errorBody('FORBIDDEN', 'Admin only'), 403)
    if (!user.companyId) return context.json(errorBody('FORBIDDEN', 'User has no company'), 403)

    const rules = await platform.db.queryAll<{ id: string; company_id: string; category_id: string; category_name: string; target_group_id: string; target_group_name: string }>({
      text: `SELECT r.id, r.company_id, r.category_id, c.name AS category_name, r.target_group_id, g.name AS target_group_name
             FROM assignment_rules r
             JOIN categories c ON c.id = r.category_id
             JOIN business_groups g ON g.id = r.target_group_id
             WHERE r.company_id = ? ORDER BY c.name`,
      params: [user.companyId],
    })
    return context.json({ items: rules.map((r) => ({ id: r.id, companyId: r.company_id, categoryId: r.category_id, categoryName: r.category_name, targetGroupId: r.target_group_id, targetGroupName: r.target_group_name })) })
  })

  app.post('/api/assignment-rules', async (context) => {
    const user = getCurrentUser(context)
    if (!hasRole(user, Role.Admin)) return context.json(errorBody('FORBIDDEN', 'Admin only'), 403)
    if (!user.companyId) return context.json(errorBody('FORBIDDEN', 'User has no company'), 403)

    const body = await context.req.json().catch(() => ({}))
    const categoryId = typeof body.categoryId === 'string' ? body.categoryId.trim() : ''
    const targetGroupId = typeof body.targetGroupId === 'string' ? body.targetGroupId.trim() : ''
    if (!categoryId || !targetGroupId) return context.json(errorBody('INVALID_INPUT', 'categoryId and targetGroupId are required'), 400)

    const group = await platform.db.queryOne<{ id: string; company_id: string }>({ text: 'SELECT id, company_id FROM business_groups WHERE id = ?', params: [targetGroupId] })
    if (!group) return context.json(errorBody('NOT_FOUND', 'Target group not found'), 404)
    if (group.company_id !== user.companyId) return context.json(errorBody('FORBIDDEN', 'Not authorized'), 403)

    const category = await platform.db.queryOne<{ id: string }>({ text: 'SELECT id FROM categories WHERE id = ?', params: [categoryId] })
    if (!category) return context.json(errorBody('NOT_FOUND', 'Category not found'), 404)

    try {
      const id = randomUUID()
      const ts = now()
      await platform.db.run({ text: 'INSERT INTO assignment_rules (id, company_id, category_id, target_group_id, created_at) VALUES (?, ?, ?, ?, ?)', params: [id, user.companyId, categoryId, targetGroupId, ts] })
      return context.json({ id, companyId: user.companyId, categoryId, targetGroupId }, 201)
    } catch (error) {
      if (error instanceof Error && /unique constraint/i.test(error.message)) return context.json(errorBody('CONFLICT', 'Assignment rule already exists for this category'), 409)
      throw error
    }
  })

  app.delete('/api/assignment-rules/:id', async (context) => {
    const user = getCurrentUser(context)
    if (!hasRole(user, Role.Admin)) return context.json(errorBody('FORBIDDEN', 'Admin only'), 403)
    const ruleId = context.req.param('id')

    const rule = await platform.db.queryOne<{ company_id: string }>({ text: 'SELECT company_id FROM assignment_rules WHERE id = ?', params: [ruleId] })
    if (!rule) return context.json(errorBody('NOT_FOUND', 'Rule not found'), 404)
    if (rule.company_id !== user.companyId) return context.json(errorBody('FORBIDDEN', 'Not authorized'), 403)

    await platform.db.run({ text: 'DELETE FROM assignment_rules WHERE id = ?', params: [ruleId] })
    return context.json({ ok: true })
  })

  // ── 统计仪表盘 ──

  app.get('/api/statistics/dashboard', async (context) => {
    const user = getCurrentUser(context)
    if (!hasRole(user, Role.Admin)) return context.json(errorBody('FORBIDDEN', 'Admin only'), 403)
    const companyId = user.companyId ?? context.req.query('companyId')?.trim() ?? ''
    if (!companyId) return context.json(errorBody('FORBIDDEN', 'User has no company'), 403)

    const totalRow = await platform.db.queryOne<{ total: number }>({ text: 'SELECT COUNT(*) AS total FROM tickets WHERE company_id = ?', params: [companyId] })
    const avgRow = await platform.db.queryOne<{ avg_hours: number | null }>({
      text: `SELECT AVG((julianday(processed_at) - julianday(created_at)) * 24) AS avg_hours FROM tickets WHERE company_id = ? AND status = 'completed' AND processed_at IS NOT NULL`,
      params: [companyId],
    })
    const satRow = await platform.db.queryOne<{ avg_rating: number | null }>({
      text: `SELECT AVG(sr.rating) AS avg_rating FROM satisfaction_ratings sr JOIN tickets t ON t.id = sr.ticket_id WHERE t.company_id = ?`,
      params: [companyId],
    })
    const hotRows = await platform.db.queryAll<{ category_id: string; category_name: string; ticket_count: number }>({
      text: `SELECT t.category_id, c.name AS category_name, COUNT(*) AS ticket_count
             FROM tickets t JOIN categories c ON c.id = t.category_id
             WHERE t.company_id = ? GROUP BY t.category_id, c.name ORDER BY ticket_count DESC LIMIT 10`,
      params: [companyId],
    })
    return context.json({
      totalTickets: Number(totalRow?.total ?? 0),
      avgResponseTimeHours: avgRow?.avg_hours != null ? Math.round(Number(avgRow.avg_hours) * 100) / 100 : 0,
      avgSatisfaction: satRow?.avg_rating != null ? Math.round(Number(satRow.avg_rating) * 100) / 100 : null,
      hotCategories: hotRows.map((h) => ({ categoryId: h.category_id, categoryName: h.category_name, ticketCount: Number(h.ticket_count) })),
    })
  })

  // ── 工单分布 ──

  app.get('/api/statistics/distribution', async (context) => {
    const user = getCurrentUser(context)
    if (!hasRole(user, Role.Admin)) return context.json(errorBody('FORBIDDEN', 'Admin only'), 403)
    const companyId = user.companyId ?? context.req.query('companyId')?.trim() ?? ''
    if (!companyId) return context.json(errorBody('FORBIDDEN', 'User has no company'), 403)
    const dimension = context.req.query('dimension')?.trim() ?? ''
    if (dimension !== 'company' && dimension !== 'department')
      return context.json(errorBody('INVALID_INPUT', 'dimension must be company or department'), 400)

    if (dimension === 'company') {
      const rows = await platform.db.queryAll<{ key: string; label: string; ticket_count: number }>({
        text: `SELECT t.company_id AS key, COALESCE(c.name, t.company_id) AS label, COUNT(*) AS ticket_count
               FROM tickets t LEFT JOIN companies c ON c.id = t.company_id
               WHERE t.company_id = ? GROUP BY t.company_id, c.name`,
        params: [companyId],
      })
      return context.json({ dimension, items: rows.map((r) => ({ key: r.key, label: r.label, ticketCount: Number(r.ticket_count) })) })
    }
    const rows = await platform.db.queryAll<{ key: string; label: string; ticket_count: number }>({
      text: `SELECT COALESCE(u.department, '未设置') AS key, COALESCE(u.department, '未设置') AS label, COUNT(*) AS ticket_count
             FROM tickets t JOIN users u ON u.id = t.submitter_id
             WHERE t.company_id = ? GROUP BY u.department ORDER BY ticket_count DESC`,
      params: [companyId],
    })
    return context.json({ dimension, items: rows.map((r) => ({ key: r.key, label: r.label, ticketCount: Number(r.ticket_count) })) })
  })

  // ── 操作日志 ──

  app.get('/api/audit-logs', async (context) => {
    const user = getCurrentUser(context)
    if (!hasRole(user, Role.Admin)) return context.json(errorBody('FORBIDDEN', 'Admin only'), 403)
    const companyId = user.companyId
    if (!companyId) return context.json(errorBody('FORBIDDEN', 'User has no company'), 403)

    const page = Math.max(Number(context.req.query('page') ?? 1), 1)
    const pageSize = Math.min(Math.max(Number(context.req.query('pageSize') ?? 50), 1), 200)
    const ticketId = context.req.query('ticketId')?.trim() ?? ''
    const eventType = context.req.query('eventType')?.trim() ?? ''

    const where = ["json_extract(metadata_json, '$.companyId') = ?"]
    const params: unknown[] = [companyId]
    if (ticketId) { where.push("json_extract(metadata_json, '$.ticketId') = ?"); params.push(ticketId) }
    if (eventType) { where.push('event_type = ?'); params.push(eventType) }
    const whereSql = where.join(' AND ')

    const totalRow = await platform.db.queryOne<{ total: number }>({ text: `SELECT COUNT(*) AS total FROM audit_events WHERE ${whereSql}`, params })
    const total = Number(totalRow?.total ?? 0)
    const rows = await platform.db.queryAll<{ id: string; event_type: string; actor_user_id: string; actor_name: string | null; metadata_json: string; occurred_at: string }>({
      text: `SELECT a.id, a.event_type, a.actor_user_id, u.name AS actor_name, a.metadata_json, a.occurred_at
             FROM audit_events a LEFT JOIN users u ON u.id = a.actor_user_id
             WHERE ${whereSql} ORDER BY a.occurred_at DESC, a.id DESC LIMIT ? OFFSET ?`,
      params: [...params, pageSize, (page - 1) * pageSize],
    })
    return context.json({
      items: rows.map((r) => {
        const detail = JSON.parse(r.metadata_json ?? '{}')
        return { id: r.id, eventType: r.event_type, actorId: r.actor_user_id, actorName: r.actor_name ?? '', ticketId: detail.ticketId ?? null, detail, createdAt: r.occurred_at }
      }),
      total, page, pageSize,
    })
  })
}
