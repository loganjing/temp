import { randomUUID } from 'node:crypto'
import type { Hono, MiddlewareHandler } from 'hono'
import type { initializePlatform } from './platform/bootstrap'
import type { AuthUser } from '@commonapp/userkit'

type Platform = Awaited<ReturnType<typeof initializePlatform>>

// ── helpers ──

const errorBody = (code: string, message: string) => ({ error: { code, message } })
const getUser = (context: unknown): AuthUser => (context as { get(name: string): AuthUser }).get('currentUser')
const currentUserId = (context: unknown) => getUser(context).id
const hasAnyRole = (context: unknown, ...roles: string[]) => roles.some((r) => getUser(context).roles.includes(r))
const isAdmin = (context: unknown) => hasAnyRole(context, 'admin')

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

type TicketRow = {
  id: string; company_id: string; title: string; description: string
  category_id: string | null; category_name: string | null
  status: string; priority: string
  submitter_id: string; submitter_name: string; submitter_email: string
  assigned_group_id: string | null; assigned_group_name: string | null
  assigned_user_id: string | null; processed_by: string | null; processed_at: string | null
  created_at: string; updated_at: string
}

const TICKET_SELECT = `SELECT t.id, t.company_id, t.title, t.description, t.category_id, tc.name AS category_name,
  t.status, t.priority, t.submitter_id, u.name AS submitter_name, t.submitter_email,
  t.assigned_group_id, bg.name AS assigned_group_name, t.assigned_user_id,
  t.processed_by, t.processed_at, t.created_at, t.updated_at
  FROM tickets t
  LEFT JOIN users u ON u.id = t.submitter_id
  LEFT JOIN ticket_categories tc ON tc.id = t.category_id
  LEFT JOIN business_groups bg ON bg.id = t.assigned_group_id`

const fetchTicket = async (db: Platform['db'], id: string): Promise<TicketRow | null> =>
  db.queryOne<TicketRow>({ text: `${TICKET_SELECT} WHERE t.id = ?`, params: [id] })

const mapTicket = (row: TicketRow) => ({
  id: row.id, company_id: row.company_id, title: row.title, description: row.description,
  category_id: row.category_id, category_name: row.category_name,
  status: row.status, priority: row.priority,
  submitter_id: row.submitter_id, submitter_name: row.submitter_name, submitter_email: row.submitter_email,
  assigned_group_id: row.assigned_group_id, assigned_group_name: row.assigned_group_name,
  assigned_user_id: row.assigned_user_id, processed_by: row.processed_by, processed_at: row.processed_at,
  created_at: row.created_at, updated_at: row.updated_at,
})

const recordAudit = async (platform: Platform, type: string, actorUserId: string | null, metadata: Record<string, unknown> = {}) => {
  try {
    await platform.auditKit.record({ type, actorUserId: actorUserId ?? undefined, occurredAt: new Date().toISOString(), metadata })
  } catch (error) {
    console.error('[audit] failed to record', type, error)
  }
}

const checkCompanyAccess = (companyId: string, user: AuthUser) => companyId === user.companyId || user.roles.includes('admin')

const VALID_SORTS = ['created_at', 'priority', 'updated_at']
const VALID_PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'P4']
const VALID_STATUSES = ['created', 'pending_assignment', 'pending_processing', 'completed', 'cancelled']

const parseLimit = (v: unknown, def = 20) => Math.min(Math.max(Number(v) || def, 1), 100)
const parseOffset = (v: unknown) => Math.max(Number(v) || 0, 0)

// ── public routes ──

export function registerPublicRoutes(app: Hono, platform: Platform) {
  app.get('/api/auth/bootstrap-status', async (context) => context.json({ required: (await platform.auth.userStore.count()) === 0 }))
  app.post('/api/auth/bootstrap', platform.auth.loginRateLimit, async (context) => {
    const body = await context.req.json().catch(() => ({}))
    let name: string, email: string, password: string
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
          text: 'INSERT INTO users (id, name, email, phone, enabled, company_id, password_hash, password_change_required, created_at, updated_at) VALUES (?, ?, ?, NULL, 1, NULL, ?, 0, ?, ?)',
          params: [id, name, email, passwordHash, timestamp, timestamp],
        })
        await platform.permissionKit.assignRole(id, 'admin')
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

// ── protected routes ──

export function registerProtectedRoutes(app: Hono, platform: Platform) {
  // ── auth ──
  app.get('/api/auth/me', (context) => context.json(getUser(context)))
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

  // ── user management ──
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

  // PATCH /api/admin/users/:id/company — set company and department
  app.patch('/api/admin/users/:id/company', async (context) => {
    if (!isAdmin(context)) return context.json(errorBody('FORBIDDEN', 'Admin permission required'), 403)
    const body = await context.req.json().catch(() => ({}))
    const companyId = typeof body.company_id === 'string' ? body.company_id : null
    const departmentId = typeof body.department_id === 'string' ? body.department_id : null
    const result = await platform.db.run({
      text: 'UPDATE users SET company_id = ?, department_id = ?, updated_at = ? WHERE id = ?',
      params: [companyId, departmentId, new Date().toISOString(), context.req.param('id')],
    })
    if (result.changes !== 1) return context.json(errorBody('NOT_FOUND', 'User not found'), 404)
    return context.json({ ok: true })
  })

  // ── companies & departments ──
  app.get('/api/companies', async (context) => {
    const rows = await platform.db.queryAll<{ id: string; name: string; created_at: string }>({ text: 'SELECT id, name, created_at FROM companies ORDER BY name' })
    return context.json({ companies: rows })
  })

  app.post('/api/companies', async (context) => {
    if (!isAdmin(context)) return context.json(errorBody('FORBIDDEN', 'Admin permission required'), 403)
    const body = await context.req.json().catch(() => ({}))
    let name: string
    try { name = requiredString(body.name, 'name') } catch (error) {
      return context.json(errorBody('INVALID_INPUT', error instanceof Error ? error.message : 'Invalid input'), 400)
    }
    const id = randomUUID()
    const now = new Date().toISOString()
    try {
      await platform.db.run({ text: 'INSERT INTO companies (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)', params: [id, name, now, now] })
    } catch (error) {
      if (error instanceof Error && /unique constraint/i.test(error.message)) return context.json(errorBody('DUPLICATE', 'Company name already exists'), 409)
      throw error
    }
    return context.json({ company: { id, name, created_at: now } }, 201)
  })

  app.get('/api/companies/:id/departments', async (context) => {
    const rows = await platform.db.queryAll<{ id: string; company_id: string; name: string; created_at: string }>({
      text: 'SELECT id, company_id, name, created_at FROM departments WHERE company_id = ? ORDER BY name',
      params: [context.req.param('id')],
    })
    return context.json({ departments: rows })
  })

  app.post('/api/companies/:id/departments', async (context) => {
    if (!isAdmin(context)) return context.json(errorBody('FORBIDDEN', 'Admin permission required'), 403)
    const body = await context.req.json().catch(() => ({}))
    let name: string
    try { name = requiredString(body.name, 'name') } catch (error) {
      return context.json(errorBody('INVALID_INPUT', error instanceof Error ? error.message : 'Invalid input'), 400)
    }
    const companyId = context.req.param('id')
    const id = randomUUID()
    const now = new Date().toISOString()
    try {
      await platform.db.run({ text: 'INSERT INTO departments (id, company_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', params: [id, companyId, name, now, now] })
    } catch (error) {
      if (error instanceof Error && /unique constraint/i.test(error.message)) return context.json(errorBody('DUPLICATE', 'Department name already exists'), 409)
      throw error
    }
    return context.json({ department: { id, company_id: companyId, name, created_at: now } }, 201)
  })

  // ── ticket categories ──
  app.get('/api/companies/:companyId/categories', async (context) => {
    const rows = await platform.db.queryAll<{ id: string; company_id: string; name: string; created_at: string }>({
      text: 'SELECT id, company_id, name, created_at FROM ticket_categories WHERE company_id = ? ORDER BY name',
      params: [context.req.param('companyId')],
    })
    return context.json({ categories: rows })
  })

  app.post('/api/companies/:companyId/categories', async (context) => {
    if (!isAdmin(context)) return context.json(errorBody('FORBIDDEN', 'Admin permission required'), 403)
    const body = await context.req.json().catch(() => ({}))
    let name: string
    try { name = requiredString(body.name, 'name') } catch (error) {
      return context.json(errorBody('INVALID_INPUT', error instanceof Error ? error.message : 'Invalid input'), 400)
    }
    const companyId = context.req.param('companyId')
    const id = randomUUID()
    const now = new Date().toISOString()
    try {
      await platform.db.run({ text: 'INSERT INTO ticket_categories (id, company_id, name, created_at) VALUES (?, ?, ?, ?)', params: [id, companyId, name, now] })
    } catch (error) {
      if (error instanceof Error && /unique constraint/i.test(error.message)) return context.json(errorBody('DUPLICATE', 'Category name already exists'), 409)
      throw error
    }
    return context.json({ category: { id, company_id: companyId, name, created_at: now } }, 201)
  })

  // ── business groups ──
  app.get('/api/companies/:companyId/groups', async (context) => {
    const rows = await platform.db.queryAll<{ id: string; company_id: string; name: string; created_at: string }>({
      text: 'SELECT id, company_id, name, created_at FROM business_groups WHERE company_id = ? ORDER BY name',
      params: [context.req.param('companyId')],
    })
    return context.json({ groups: rows })
  })

  app.post('/api/companies/:companyId/groups', async (context) => {
    if (!isAdmin(context)) return context.json(errorBody('FORBIDDEN', 'Admin permission required'), 403)
    const body = await context.req.json().catch(() => ({}))
    let name: string
    try { name = requiredString(body.name, 'name') } catch (error) {
      return context.json(errorBody('INVALID_INPUT', error instanceof Error ? error.message : 'Invalid input'), 400)
    }
    const companyId = context.req.param('companyId')
    const id = randomUUID()
    const now = new Date().toISOString()
    try {
      await platform.db.run({ text: 'INSERT INTO business_groups (id, company_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', params: [id, companyId, name, now, now] })
    } catch (error) {
      if (error instanceof Error && /unique constraint/i.test(error.message)) return context.json(errorBody('DUPLICATE', 'Group name already exists'), 409)
      throw error
    }
    return context.json({ group: { id, company_id: companyId, name, created_at: now } }, 201)
  })

  app.get('/api/groups/:id/members', async (context) => {
    const rows = await platform.db.queryAll<{ user_id: string; name: string; email: string; created_at: string }>({
      text: 'SELECT m.user_id, u.name, u.email, m.created_at FROM business_group_members m JOIN users u ON u.id = m.user_id WHERE m.group_id = ? ORDER BY u.name',
      params: [context.req.param('id')],
    })
    return context.json({ members: rows })
  })

  app.post('/api/groups/:id/members', async (context) => {
    if (!isAdmin(context)) return context.json(errorBody('FORBIDDEN', 'Admin permission required'), 403)
    const body = await context.req.json().catch(() => ({}))
    const groupId = context.req.param('id')
    const userId = typeof body.user_id === 'string' ? body.user_id.trim() : ''
    if (!userId) return context.json(errorBody('INVALID_INPUT', 'user_id is required'), 400)
    const group = await platform.db.queryOne({ text: 'SELECT id FROM business_groups WHERE id = ?', params: [groupId] })
    if (!group) return context.json(errorBody('NOT_FOUND', 'Group not found'), 404)
    const user = await platform.db.queryOne({ text: 'SELECT id FROM users WHERE id = ?', params: [userId] })
    if (!user) return context.json(errorBody('NOT_FOUND', 'User not found'), 404)
    try {
      await platform.db.run({ text: 'INSERT INTO business_group_members (group_id, user_id, created_at) VALUES (?, ?, ?)', params: [groupId, userId, new Date().toISOString()] })
    } catch (error) {
      if (error instanceof Error && /unique constraint/i.test(error.message)) return context.json(errorBody('DUPLICATE', 'Member already exists'), 409)
      throw error
    }
    return context.json({ ok: true }, 201)
  })

  app.delete('/api/groups/:id/members/:userId', async (context) => {
    if (!isAdmin(context)) return context.json(errorBody('FORBIDDEN', 'Admin permission required'), 403)
    const result = await platform.db.run({
      text: 'DELETE FROM business_group_members WHERE group_id = ? AND user_id = ?',
      params: [context.req.param('id'), context.req.param('userId')],
    })
    if (result.changes !== 1) return context.json(errorBody('NOT_FOUND', 'Member not found'), 404)
    return context.json({ ok: true })
  })

  // ── assignment rules ──
  app.get('/api/companies/:companyId/assignment-rules', async (context) => {
    const rows = await platform.db.queryAll<{ id: string; company_id: string; category_id: string; category_name: string; target_group_id: string; target_group_name: string; created_at: string }>({
      text: `SELECT r.id, r.company_id, r.category_id, tc.name AS category_name, r.target_group_id, bg.name AS target_group_name, r.created_at
        FROM assignment_rules r
        JOIN ticket_categories tc ON tc.id = r.category_id
        JOIN business_groups bg ON bg.id = r.target_group_id
        WHERE r.company_id = ? ORDER BY tc.name`,
      params: [context.req.param('companyId')],
    })
    return context.json({ rules: rows })
  })

  app.post('/api/companies/:companyId/assignment-rules', async (context) => {
    if (!isAdmin(context)) return context.json(errorBody('FORBIDDEN', 'Admin permission required'), 403)
    const body = await context.req.json().catch(() => ({}))
    const categoryId = typeof body.category_id === 'string' ? body.category_id.trim() : ''
    const targetGroupId = typeof body.target_group_id === 'string' ? body.target_group_id.trim() : ''
    if (!categoryId || !targetGroupId) return context.json(errorBody('INVALID_INPUT', 'category_id and target_group_id are required'), 400)
    const companyId = context.req.param('companyId')
    const id = randomUUID()
    const now = new Date().toISOString()
    try {
      await platform.db.run({ text: 'INSERT INTO assignment_rules (id, company_id, category_id, target_group_id, created_at) VALUES (?, ?, ?, ?, ?)', params: [id, companyId, categoryId, targetGroupId, now] })
    } catch (error) {
      if (error instanceof Error && /unique constraint/i.test(error.message)) return context.json(errorBody('DUPLICATE', 'Rule already exists for this category'), 409)
      throw error
    }
    return context.json({ rule: { id, company_id: companyId, category_id: categoryId, target_group_id: targetGroupId, created_at: now } }, 201)
  })

  // ── tickets ──
  app.post('/api/tickets', async (context) => {
    if (!hasAnyRole(context, 'submitter', 'admin')) return context.json(errorBody('FORBIDDEN', 'Submitter permission required'), 403)
    const user = getUser(context)
    if (!user.companyId) return context.json(errorBody('INVALID_INPUT', 'User must belong to a company to create tickets'), 400)
    const body = await context.req.json().catch(() => ({}))
    let title: string, description: string, priority = 'P2'
    try {
      title = requiredString(body.title, 'title', 500)
      description = requiredString(body.description, 'description', 10000)
      if (body.priority !== undefined && body.priority !== null) {
        if (!VALID_PRIORITIES.includes(body.priority)) throw new TypeError('Invalid priority')
        priority = body.priority
      }
    } catch (error) {
      return context.json(errorBody('INVALID_INPUT', error instanceof Error ? error.message : 'Invalid input'), 400)
    }
    const categoryId = typeof body.category_id === 'string' && body.category_id.trim() ? body.category_id.trim() : null
    // validate category belongs to user's company
    if (categoryId) {
      const cat = await platform.db.queryOne<{ company_id: string }>({ text: 'SELECT company_id FROM ticket_categories WHERE id = ?', params: [categoryId] })
      if (!cat || cat.company_id !== user.companyId) return context.json(errorBody('INVALID_INPUT', 'Invalid category for this company'), 400)
    }
    const ticketId = randomUUID()
    const now = new Date().toISOString()
    await platform.db.transaction(async (tx) => {
      await tx.run({
        text: 'INSERT INTO tickets (id, company_id, title, description, category_id, status, priority, submitter_id, submitter_email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        params: [ticketId, user.companyId, title, description, categoryId, 'pending_assignment', priority, user.id, user.email, now, now],
      })
      if (categoryId) {
        const rule = await tx.queryOne<{ target_group_id: string }>({ text: 'SELECT target_group_id FROM assignment_rules WHERE company_id = ? AND category_id = ?', params: [user.companyId, categoryId] })
        if (rule) {
          await tx.run({ text: "UPDATE tickets SET status = 'pending_processing', assigned_group_id = ?, updated_at = ? WHERE id = ?", params: [rule.target_group_id, new Date().toISOString(), ticketId] })
        }
      }
    })
    await recordAudit(platform, 'ticket.created', user.id, { ticket_id: ticketId, company_id: user.companyId, title, priority })
    if (categoryId) {
      const rule = await platform.db.queryOne<{ target_group_id: string }>({ text: 'SELECT target_group_id FROM assignment_rules WHERE company_id = ? AND category_id = ?', params: [user.companyId, categoryId] })
      if (rule) await recordAudit(platform, 'ticket.assigned', user.id, { ticket_id: ticketId, auto: true, group_id: rule.target_group_id })
    }
    const ticket = await fetchTicket(platform.db, ticketId)
    return context.json({ ticket: mapTicket(ticket!) }, 201)
  })

  app.get('/api/tickets', async (context) => {
    const user = getUser(context)
    const q = context.req.query.bind(context.req)
    const status = q('status')
    const priority = q('priority')
    const categoryId = q('category_id')
    const companyId = q('company_id')
    const search = q('search')
    const sort = VALID_SORTS.includes(q('sort') ?? '') ? q('sort')! : 'created_at'
    const order = q('order') === 'asc' ? 'ASC' : 'DESC'
    const limit = parseLimit(q('limit'))
    const offset = parseOffset(q('offset'))

    const where: string[] = []
    const params: unknown[] = []
    if (status && VALID_STATUSES.includes(status)) { where.push('t.status = ?'); params.push(status) }
    if (priority && VALID_PRIORITIES.includes(priority)) { where.push('t.priority = ?'); params.push(priority) }
    if (categoryId) { where.push('t.category_id = ?'); params.push(categoryId) }
    if (!isAdmin(context)) { where.push('t.company_id = ?'); params.push(user.companyId) }
    else if (companyId) { where.push('t.company_id = ?'); params.push(companyId) }
    if (search) { where.push('(lower(t.title) LIKE ? OR lower(t.description) LIKE ?)'); const s = `%${search.toLowerCase()}%`; params.push(s, s) }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : ''
    const sortCol = sort === 'priority' ? 't.priority' : sort === 'updated_at' ? 't.updated_at' : 't.created_at'

    const tickets = await platform.db.queryAll<TicketRow>({ text: `${TICKET_SELECT} ${whereSql} ORDER BY ${sortCol} ${order} LIMIT ? OFFSET ?`, params: [...params, limit, offset] })
    const total = await platform.db.queryOne<{ total: number }>({ text: `SELECT COUNT(*) AS total FROM tickets t ${whereSql}`, params })
    return context.json({ tickets: tickets.map(mapTicket), total: Number(total?.total ?? 0) })
  })

  app.get('/api/tickets/:id', async (context) => {
    const ticket = await fetchTicket(platform.db, context.req.param('id'))
    if (!ticket || !checkCompanyAccess(ticket.company_id, getUser(context))) return context.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    return context.json({ ticket: mapTicket(ticket) })
  })

  app.get('/api/tickets/:id/replies', async (context) => {
    const ticket = await fetchTicket(platform.db, context.req.param('id'))
    if (!ticket || !checkCompanyAccess(ticket.company_id, getUser(context))) return context.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    const rows = await platform.db.queryAll<{ id: string; ticket_id: string; author_id: string; author_name: string; content: string; created_at: string }>({
      text: 'SELECT r.id, r.ticket_id, r.author_id, u.name AS author_name, r.content, r.created_at FROM ticket_replies r JOIN users u ON u.id = r.author_id WHERE r.ticket_id = ? ORDER BY r.created_at ASC',
      params: [context.req.param('id')],
    })
    return context.json({ replies: rows })
  })

  app.post('/api/tickets/:id/replies', async (context) => {
    const ticket = await fetchTicket(platform.db, context.req.param('id'))
    if (!ticket || !checkCompanyAccess(ticket.company_id, getUser(context))) return context.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    if (ticket.status === 'completed' || ticket.status === 'cancelled') return context.json(errorBody('CONFLICT', 'Cannot reply to a completed or cancelled ticket'), 409)
    const body = await context.req.json().catch(() => ({}))
    let content: string
    try { content = requiredString(body.content, 'content', 10000) } catch (error) {
      return context.json(errorBody('INVALID_INPUT', error instanceof Error ? error.message : 'Invalid input'), 400)
    }
    const user = getUser(context)
    const id = randomUUID()
    const now = new Date().toISOString()
    await platform.db.run({ text: 'INSERT INTO ticket_replies (id, ticket_id, author_id, content, created_at) VALUES (?, ?, ?, ?, ?)', params: [id, ticket.id, user.id, content, now] })
    await recordAudit(platform, 'ticket.replied', user.id, { ticket_id: ticket.id })
    return context.json({ reply: { id, ticket_id: ticket.id, author_id: user.id, author_name: user.name, content, created_at: now } }, 201)
  })

  app.post('/api/tickets/:id/assign', async (context) => {
    if (!hasAnyRole(context, 'admin', 'handler')) return context.json(errorBody('FORBIDDEN', 'Admin or handler permission required'), 403)
    const ticket = await fetchTicket(platform.db, context.req.param('id'))
    if (!ticket || !checkCompanyAccess(ticket.company_id, getUser(context))) return context.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    if (ticket.status !== 'pending_assignment' && ticket.status !== 'pending_processing') return context.json(errorBody('CONFLICT', 'Ticket is not in an assignable status'), 409)
    const body = await context.req.json().catch(() => ({}))
    const groupId = typeof body.group_id === 'string' ? body.group_id.trim() : null
    const userId = typeof body.user_id === 'string' ? body.user_id.trim() : null
    if (!groupId && !userId) return context.json(errorBody('INVALID_INPUT', 'At least one of group_id or user_id must be provided'), 400)
    const now = new Date().toISOString()
    await platform.db.run({
      text: 'UPDATE tickets SET status = ?, assigned_group_id = COALESCE(?, assigned_group_id), assigned_user_id = COALESCE(?, assigned_user_id), updated_at = ? WHERE id = ?',
      params: ['pending_processing', groupId, userId, now, ticket.id],
    })
    await recordAudit(platform, 'ticket.assigned', currentUserId(context), { ticket_id: ticket.id, group_id: groupId, user_id: userId })
    const updated = await fetchTicket(platform.db, ticket.id)
    return context.json({ ticket: mapTicket(updated!) })
  })

  app.post('/api/tickets/:id/transfer', async (context) => {
    if (!hasAnyRole(context, 'handler', 'admin')) return context.json(errorBody('FORBIDDEN', 'Handler permission required'), 403)
    const user = getUser(context)
    const ticket = await fetchTicket(platform.db, context.req.param('id'))
    if (!ticket || !checkCompanyAccess(ticket.company_id, user)) return context.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    if (ticket.status !== 'pending_processing') return context.json(errorBody('CONFLICT', 'Ticket is not in pending_processing status'), 409)
    if (ticket.assigned_user_id !== user.id && !user.roles.includes('admin')) return context.json(errorBody('FORBIDDEN', 'Only the current handler can transfer'), 403)
    const body = await context.req.json().catch(() => ({}))
    const targetUserId = typeof body.target_user_id === 'string' ? body.target_user_id.trim() : null
    const targetGroupId = typeof body.target_group_id === 'string' ? body.target_group_id.trim() : null
    if (!targetUserId && !targetGroupId) return context.json(errorBody('INVALID_INPUT', 'At least one of target_user_id or target_group_id must be provided'), 400)
    const now = new Date().toISOString()
    await platform.db.run({
      text: 'UPDATE tickets SET assigned_user_id = COALESCE(?, assigned_user_id), assigned_group_id = COALESCE(?, assigned_group_id), updated_at = ? WHERE id = ?',
      params: [targetUserId, targetGroupId, now, ticket.id],
    })
    await recordAudit(platform, 'ticket.transferred', user.id, { ticket_id: ticket.id, target_user_id: targetUserId, target_group_id: targetGroupId })
    const updated = await fetchTicket(platform.db, ticket.id)
    return context.json({ ticket: mapTicket(updated!) })
  })

  app.post('/api/tickets/:id/complete', async (context) => {
    if (!hasAnyRole(context, 'handler', 'admin')) return context.json(errorBody('FORBIDDEN', 'Handler permission required'), 403)
    const user = getUser(context)
    const ticket = await fetchTicket(platform.db, context.req.param('id'))
    if (!ticket || !checkCompanyAccess(ticket.company_id, user)) return context.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    if (ticket.status !== 'pending_processing') return context.json(errorBody('CONFLICT', 'Ticket is not in pending_processing status'), 409)
    if (ticket.assigned_user_id !== user.id && !user.roles.includes('admin')) return context.json(errorBody('FORBIDDEN', 'Only the current handler can complete'), 403)
    const now = new Date().toISOString()
    await platform.db.run({ text: "UPDATE tickets SET status = 'completed', processed_by = ?, processed_at = ?, updated_at = ? WHERE id = ?", params: [user.id, now, now, ticket.id] })
    // email notification — failure does not block completion
    let emailMetadata: Record<string, unknown> = { ticket_id: ticket.id }
    try {
      const emailResult = await platform.emailClient.send({ to: ticket.submitter_email, subject: `工单已完成: ${ticket.title}`, text: `您的工单 "${ticket.title}" 已处理完成。` })
      if (emailResult.status === 'failed') emailMetadata = { ticket_id: ticket.id, email_error: emailResult.message }
    } catch (error) {
      emailMetadata = { ticket_id: ticket.id, email_error: error instanceof Error ? error.message : 'email send failed' }
    }
    await recordAudit(platform, 'ticket.completed', user.id, emailMetadata)
    const updated = await fetchTicket(platform.db, ticket.id)
    return context.json({ ticket: mapTicket(updated!) })
  })

  app.post('/api/tickets/:id/cancel', async (context) => {
    if (!hasAnyRole(context, 'submitter', 'admin')) return context.json(errorBody('FORBIDDEN', 'Submitter or admin permission required'), 403)
    const user = getUser(context)
    const ticket = await fetchTicket(platform.db, context.req.param('id'))
    if (!ticket || !checkCompanyAccess(ticket.company_id, user)) return context.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    if (ticket.status === 'completed' || ticket.status === 'cancelled') return context.json(errorBody('CONFLICT', 'Cannot cancel a completed or cancelled ticket'), 409)
    if (ticket.submitter_id !== user.id && !user.roles.includes('admin')) return context.json(errorBody('FORBIDDEN', 'Only the submitter can cancel'), 403)
    const body = await context.req.json().catch(() => ({}))
    await platform.db.run({ text: "UPDATE tickets SET status = 'cancelled', updated_at = ? WHERE id = ?", params: [new Date().toISOString(), ticket.id] })
    await recordAudit(platform, 'ticket.cancelled', user.id, { ticket_id: ticket.id, reason: body.reason ?? null })
    const updated = await fetchTicket(platform.db, ticket.id)
    return context.json({ ticket: mapTicket(updated!) })
  })

  app.get('/api/tickets/:id/submitter-info', async (context) => {
    if (!hasAnyRole(context, 'handler', 'admin')) return context.json(errorBody('FORBIDDEN', 'Handler or admin permission required'), 403)
    const ticket = await fetchTicket(platform.db, context.req.param('id'))
    if (!ticket || !checkCompanyAccess(ticket.company_id, getUser(context))) return context.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    const submitter = await platform.db.queryOne<{ id: string; name: string; email: string; phone: string | null; company_id: string | null; company_name: string | null; department_id: string | null; department_name: string | null }>({
      text: `SELECT u.id, u.name, u.email, u.phone, u.company_id, c.name AS company_name, u.department_id, d.name AS department_name
        FROM users u LEFT JOIN companies c ON c.id = u.company_id LEFT JOIN departments d ON d.id = u.department_id WHERE u.id = ?`,
      params: [ticket.submitter_id],
    })
    if (!submitter) return context.json(errorBody('NOT_FOUND', 'Submitter not found'), 404)
    const history = await platform.db.queryAll<{ id: string; title: string; status: string; priority: string; created_at: string; completed_at: string | null }>({
      text: 'SELECT id, title, status, priority, created_at, processed_at AS completed_at FROM tickets WHERE submitter_id = ? AND id != ? ORDER BY created_at DESC',
      params: [ticket.submitter_id, ticket.id],
    })
    return context.json({ submitter, history_tickets: history })
  })

  // ── satisfaction rating ──
  app.get('/api/tickets/:id/rating', async (context) => {
    const ticket = await fetchTicket(platform.db, context.req.param('id'))
    if (!ticket || !checkCompanyAccess(ticket.company_id, getUser(context))) return context.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    const rating = await platform.db.queryOne<{ id: string; ticket_id: string; rating: number; comment: string | null; created_at: string }>({
      text: 'SELECT id, ticket_id, rating, comment, created_at FROM satisfaction_ratings WHERE ticket_id = ?',
      params: [ticket.id],
    })
    return context.json({ rating })
  })

  app.post('/api/tickets/:id/rating', async (context) => {
    if (!hasAnyRole(context, 'submitter', 'admin')) return context.json(errorBody('FORBIDDEN', 'Submitter permission required'), 403)
    const user = getUser(context)
    const ticket = await fetchTicket(platform.db, context.req.param('id'))
    if (!ticket || !checkCompanyAccess(ticket.company_id, user)) return context.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    if (ticket.status !== 'completed') return context.json(errorBody('CONFLICT', 'Can only rate completed tickets'), 409)
    if (ticket.submitter_id !== user.id && !user.roles.includes('admin')) return context.json(errorBody('FORBIDDEN', 'Only the submitter can rate'), 403)
    const body = await context.req.json().catch(() => ({}))
    const rating = Number(body.rating)
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return context.json(errorBody('INVALID_INPUT', 'rating must be an integer from 1 to 5'), 400)
    const comment = typeof body.comment === 'string' ? body.comment : null
    const id = randomUUID()
    const now = new Date().toISOString()
    try {
      await platform.db.run({ text: 'INSERT INTO satisfaction_ratings (id, ticket_id, submitter_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)', params: [id, ticket.id, user.id, rating, comment, now] })
    } catch (error) {
      if (error instanceof Error && /unique constraint/i.test(error.message)) return context.json(errorBody('DUPLICATE', 'Ticket already rated'), 409)
      throw error
    }
    await recordAudit(platform, 'ticket.rated', user.id, { ticket_id: ticket.id, rating })
    return context.json({ rating: { id, ticket_id: ticket.id, rating, comment, created_at: now } }, 201)
  })

  // ── workbench ──
  app.get('/api/workbench/tickets', async (context) => {
    if (!hasAnyRole(context, 'handler', 'admin')) return context.json(errorBody('FORBIDDEN', 'Handler permission required'), 403)
    const user = getUser(context)
    if (!user.companyId) return context.json({ tickets: [], total: 0 })
    const q = context.req.query.bind(context.req)
    const status = q('status') ?? 'pending_processing'
    const priority = q('priority')
    const categoryId = q('category_id')
    const search = q('search')
    const sort = VALID_SORTS.includes(q('sort') ?? '') ? q('sort')! : 'priority'
    const order = sort === 'priority' ? (q('order') === 'desc' ? 'DESC' : 'ASC') : (q('order') === 'asc' ? 'ASC' : 'DESC')
    const limit = parseLimit(q('limit'))
    const offset = parseOffset(q('offset'))

    const where = ['t.company_id = ?', '(t.assigned_user_id = ? OR t.assigned_group_id IN (SELECT group_id FROM business_group_members WHERE user_id = ?))']
    const params: unknown[] = [user.companyId, user.id, user.id]
    if (VALID_STATUSES.includes(status)) { where.push('t.status = ?'); params.push(status) }
    if (priority && VALID_PRIORITIES.includes(priority)) { where.push('t.priority = ?'); params.push(priority) }
    if (categoryId) { where.push('t.category_id = ?'); params.push(categoryId) }
    if (search) { where.push('(lower(t.title) LIKE ? OR lower(t.description) LIKE ?)'); const s = `%${search.toLowerCase()}%`; params.push(s, s) }
    const whereSql = 'WHERE ' + where.join(' AND ')
    const sortCol = sort === 'priority' ? 't.priority' : sort === 'updated_at' ? 't.updated_at' : 't.created_at'

    const tickets = await platform.db.queryAll<TicketRow>({ text: `${TICKET_SELECT} ${whereSql} ORDER BY ${sortCol} ${order} LIMIT ? OFFSET ?`, params: [...params, limit, offset] })
    const total = await platform.db.queryOne<{ total: number }>({ text: `SELECT COUNT(*) AS total FROM tickets t ${whereSql}`, params })
    return context.json({ tickets: tickets.map(mapTicket), total: Number(total?.total ?? 0) })
  })

  // ── statistics ──
  app.get('/api/stats/distribution', async (context) => {
    if (!isAdmin(context)) return context.json(errorBody('FORBIDDEN', 'Admin permission required'), 403)
    const dimension = context.req.query('dimension')
    if (dimension !== 'company' && dimension !== 'department') return context.json(errorBody('INVALID_INPUT', 'dimension must be company or department'), 400)
    const companyId = context.req.query('company_id')
    const startDate = context.req.query('start_date')
    const endDate = context.req.query('end_date')
    const dateFilter: string[] = []
    const dateParams: unknown[] = []
    if (startDate) { dateFilter.push('t.created_at >= ?'); dateParams.push(startDate) }
    if (endDate) { dateFilter.push('t.created_at <= ?'); dateParams.push(endDate + 'T23:59:59.999Z') }
    const companyFilter = companyId ? 'AND t.company_id = ?' : ''
    const companyParams = companyId ? [companyId] : []
    const dateAndCompany = dateFilter.length ? 'AND ' + dateFilter.join(' AND ') : ''
    const statusCases = `SUM(CASE WHEN t.status = 'created' THEN 1 ELSE 0 END) AS s_created, SUM(CASE WHEN t.status = 'pending_assignment' THEN 1 ELSE 0 END) AS s_pa, SUM(CASE WHEN t.status = 'pending_processing' THEN 1 ELSE 0 END) AS s_pp, SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) AS s_completed, SUM(CASE WHEN t.status = 'cancelled' THEN 1 ELSE 0 END) AS s_cancelled`

    if (dimension === 'company') {
      const rows = await platform.db.queryAll<{ key: string; label: string; total: number; s_created: number; s_pa: number; s_pp: number; s_completed: number; s_cancelled: number }>({
        text: `SELECT c.id AS key, c.name AS label, COUNT(*) AS total, ${statusCases} FROM tickets t LEFT JOIN companies c ON c.id = t.company_id WHERE 1=1 ${companyFilter} ${dateAndCompany} GROUP BY c.id, c.name ORDER BY total DESC`,
        params: [...companyParams, ...dateParams],
      })
      return context.json({ dimension, items: rows.map((r) => ({ key: r.key, label: r.label, total: r.total, by_status: { created: r.s_created, pending_assignment: r.s_pa, pending_processing: r.s_pp, completed: r.s_completed, cancelled: r.s_cancelled } })) })
    } else {
      const rows = await platform.db.queryAll<{ key: string | null; label: string | null; total: number; s_created: number; s_pa: number; s_pp: number; s_completed: number; s_cancelled: number }>({
        text: `SELECT d.id AS key, d.name AS label, COUNT(*) AS total, ${statusCases} FROM tickets t JOIN users u ON u.id = t.submitter_id LEFT JOIN departments d ON d.id = u.department_id WHERE 1=1 ${companyFilter} ${dateAndCompany} GROUP BY d.id, d.name ORDER BY total DESC`,
        params: [...companyParams, ...dateParams],
      })
      return context.json({ dimension, items: rows.map((r) => ({ key: r.key ?? '', label: r.label ?? '未分配部门', total: r.total, by_status: { created: r.s_created, pending_assignment: r.s_pa, pending_processing: r.s_pp, completed: r.s_completed, cancelled: r.s_cancelled } })) })
    }
  })

  app.get('/api/stats/dashboard', async (context) => {
    if (!isAdmin(context)) return context.json(errorBody('FORBIDDEN', 'Admin permission required'), 403)
    const companyId = context.req.query('company_id')
    const startDate = context.req.query('start_date')
    const endDate = context.req.query('end_date')
    const where: string[] = []
    const params: unknown[] = []
    if (companyId) { where.push('t.company_id = ?'); params.push(companyId) }
    if (startDate) { where.push('t.created_at >= ?'); params.push(startDate) }
    if (endDate) { where.push('t.created_at <= ?'); params.push(endDate + 'T23:59:59.999Z') }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : ''

    const totals = await platform.db.queryOne<{ total: number; s_created: number; s_pa: number; s_pp: number; s_completed: number; s_cancelled: number; p0: number; p1: number; p2: number; p3: number; p4: number }>({
      text: `SELECT COUNT(*) AS total, SUM(CASE WHEN t.status = 'created' THEN 1 ELSE 0 END) AS s_created, SUM(CASE WHEN t.status = 'pending_assignment' THEN 1 ELSE 0 END) AS s_pa, SUM(CASE WHEN t.status = 'pending_processing' THEN 1 ELSE 0 END) AS s_pp, SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) AS s_completed, SUM(CASE WHEN t.status = 'cancelled' THEN 1 ELSE 0 END) AS s_cancelled, SUM(CASE WHEN t.priority = 'P0' THEN 1 ELSE 0 END) AS p0, SUM(CASE WHEN t.priority = 'P1' THEN 1 ELSE 0 END) AS p1, SUM(CASE WHEN t.priority = 'P2' THEN 1 ELSE 0 END) AS p2, SUM(CASE WHEN t.priority = 'P3' THEN 1 ELSE 0 END) AS p3, SUM(CASE WHEN t.priority = 'P4' THEN 1 ELSE 0 END) AS p4 FROM tickets t ${whereSql}`,
      params,
    })
    const responseTime = await platform.db.queryOne<{ avg_ms: number | null }>({
      text: `SELECT AVG(CAST((julianday(fr.first_reply_at) - julianday(t.created_at)) * 86400000 AS REAL)) AS avg_ms FROM tickets t JOIN (SELECT tr.ticket_id, MIN(tr.created_at) AS first_reply_at FROM ticket_replies tr JOIN tickets t2 ON t2.id = tr.ticket_id WHERE tr.author_id != t2.submitter_id GROUP BY tr.ticket_id) fr ON fr.ticket_id = t.id ${whereSql}`,
      params,
    })
    const satisfaction = await platform.db.queryOne<{ avg: number | null; count: number }>({
      text: `SELECT AVG(sr.rating) AS avg, COUNT(*) AS count FROM satisfaction_ratings sr JOIN tickets t ON t.id = sr.ticket_id ${whereSql}`,
      params,
    })
    const hotCategories = await platform.db.queryAll<{ category_id: string; category_name: string; count: number }>({
      text: `SELECT tc.id AS category_id, tc.name AS category_name, COUNT(*) AS count FROM tickets t JOIN ticket_categories tc ON tc.id = t.category_id ${whereSql ? whereSql + ' AND t.category_id IS NOT NULL' : 'WHERE t.category_id IS NOT NULL'} GROUP BY tc.id, tc.name ORDER BY count DESC LIMIT 5`,
      params,
    })

    return context.json({
      total_tickets: Number(totals?.total ?? 0),
      by_status: { created: totals?.s_created ?? 0, pending_assignment: totals?.s_pa ?? 0, pending_processing: totals?.s_pp ?? 0, completed: totals?.s_completed ?? 0, cancelled: totals?.s_cancelled ?? 0 },
      by_priority: { P0: totals?.p0 ?? 0, P1: totals?.p1 ?? 0, P2: totals?.p2 ?? 0, P3: totals?.p3 ?? 0, P4: totals?.p4 ?? 0 },
      avg_response_time_ms: responseTime?.avg_ms ?? null,
      avg_satisfaction: satisfaction?.avg ?? null,
      satisfaction_count: Number(satisfaction?.count ?? 0),
      hot_categories: hotCategories.map((c) => ({ category_id: c.category_id, category_name: c.category_name, count: c.count })),
    })
  })

  // ── audit log ──
  app.get('/api/audit/tickets/:id', async (context) => {
    if (!hasAnyRole(context, 'handler', 'admin')) return context.json(errorBody('FORBIDDEN', 'Handler or admin permission required'), 403)
    const ticket = await fetchTicket(platform.db, context.req.param('id'))
    if (!ticket || !checkCompanyAccess(ticket.company_id, getUser(context))) return context.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    const rows = await platform.db.queryAll<{ id: string; occurred_at: string; event_type: string; actor_user_id: string | null; metadata_json: string }>({
      text: `SELECT id, occurred_at, event_type, actor_user_id, metadata_json FROM audit_events WHERE event_type LIKE 'ticket.%' AND json_extract(metadata_json, '$.ticket_id') = ? ORDER BY occurred_at ASC`,
      params: [ticket.id],
    })
    return context.json({ events: rows })
  })
}
