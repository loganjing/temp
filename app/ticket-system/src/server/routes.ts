import { randomUUID } from 'node:crypto'
import type { Hono, MiddlewareHandler } from 'hono'
import type { initializePlatform } from './platform/bootstrap'
import type { AppAuthUser } from './platform/auth'

type Platform = Awaited<ReturnType<typeof initializePlatform>>

const errorBody = (code: string, message: string) => ({ error: { code, message } })
const getCurrentUser = (c: { get(name: string): unknown }) => c.get('currentUser') as AppAuthUser
const requiredString = (value: unknown, name: string, maxLength = 200) => {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) throw new TypeError(`${name} is required`)
  return value.trim()
}
const parseLimit = (v: string | undefined, def = 50) => Math.min(Math.max(Number(v ?? def) || def, 1), 100)
const parseOffset = (v: string | undefined, def = 0) => Math.max(Number(v ?? def) || def, 0)

function requireRoles(...roles: string[]): MiddlewareHandler {
  return async (c, next) => {
    const user = getCurrentUser(c as { get(name: string): unknown })
    if (!user.roles.some((r) => roles.includes(r) || r === 'admin'))
      return c.json(errorBody('FORBIDDEN', 'Insufficient role'), 403)
    await next()
  }
}

/** 公司隔离校验：admin 可跨公司，非 admin 仅限同公司 */
function ensureCompanyAccess(user: AppAuthUser, companyId: string): boolean {
  return user.roles.includes('admin') || user.companyId === companyId
}

async function recordAudit(platform: Platform, eventType: string, actorUserId: string, ticketId: string, extra?: Record<string, unknown>) {
  await platform.auditKit.record({
    type: eventType,
    actorUserId,
    metadata: { ticketId, ...extra },
  }).catch((e) => console.error('[audit] record failed', e))
}

interface TicketRow {
  id: string; company_id: string; subject: string; description: string
  category_id: string | null; category_name: string | null
  submitter_id: string; submitter_name: string; submitter_email: string; submitter_department: string | null
  sla_priority: string; status: string
  group_id: string | null; group_name: string | null
  handler_id: string | null; handler_name: string | null
  assigned_at: string | null; handled_at: string | null
  created_at: string; updated_at: string
}

function mapTicket(row: TicketRow, replies: unknown[] = []) {
  return {
    id: row.id, companyId: row.company_id, subject: row.subject, description: row.description,
    categoryId: row.category_id, categoryName: row.category_name,
    submitterId: row.submitter_id, submitterName: row.submitter_name,
    submitterEmail: row.submitter_email, submitterDepartment: row.submitter_department,
    slaPriority: row.sla_priority, status: row.status,
    groupId: row.group_id, groupName: row.group_name,
    handlerId: row.handler_id, handlerName: row.handler_name,
    assignedAt: row.assigned_at, handledAt: row.handled_at,
    createdAt: row.created_at, updatedAt: row.updated_at,
    replies,
  }
}

function mapListItem(row: TicketRow) {
  const { description, replies, ...item } = mapTicket(row)
  return item
}

const TICKET_JOIN = `SELECT t.*, c.name AS category_name, g.name AS group_name
  FROM tickets t
  LEFT JOIN categories c ON t.category_id = c.id
  LEFT JOIN business_groups g ON t.group_id = g.id`

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
        const ts = new Date().toISOString()
        await tx.run({ text: 'INSERT INTO users (id, name, email, phone, enabled, company_id, password_hash, created_at, updated_at) VALUES (?, ?, ?, NULL, 1, NULL, ?, ?, ?)', params: [id, name, email, passwordHash, ts, ts] })
        await tx.run({ text: 'INSERT INTO user_role_assignments (user_id, role_key, scope_type, scope_id, created_at) VALUES (?, ?, ?, ?, ?)', params: [id, 'admin', '', '', ts] })
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
  // ── 认证 ──
  app.get('/api/auth/me', (c) => {
    const u = getCurrentUser(c)
    return c.json({ id: u.id, name: u.name, email: u.email, phone: u.phone, roles: u.roles, passwordChangeRequired: u.passwordChangeRequired, companyId: u.companyId, departmentId: u.departmentId })
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
    const userId = getCurrentUser(context).id
    if (!await platform.auth.userStore.updatePassword(userId, platform.auth.hashPassword(password))) return context.json(errorBody('NOT_FOUND', 'User not found'), 404)
    return context.json({ ok: true, passwordChangeRequired: false })
  })

  // ── 用户管理 ──
  app.get('/api/admin/users', async (context) => {
    const search = context.req.query('search') ?? ''
    const limit = parseLimit(context.req.query('limit'))
    const offset = parseOffset(context.req.query('offset'))
    const [users, total] = await Promise.all([platform.auth.userStore.list({ search, limit, offset }), platform.auth.userStore.count({ search })])
    return context.json({ users, total })
  })
  app.post('/api/admin/users', requireRoles('admin'), async (context) => {
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
  app.patch('/api/admin/users/:id', requireRoles('admin'), async (context) => {
    const body = await context.req.json().catch(() => ({}))
    try {
      const email = requiredString(body.email, 'email', 320).toLowerCase()
      if (!email.includes('@')) throw new TypeError('Enter a valid email address')
      const user = await platform.auth.userStore.update(context.req.param('id'), { name: requiredString(body.name, 'name'), email, phone: typeof body.phone === 'string' ? body.phone : null })
      if (!user) return context.json(errorBody('NOT_FOUND', 'User not found'), 404)
      return context.json({ user: { id: user.id, name: user.name, email: user.email, phone: user.phone } })
    } catch (error) {
      return context.json(errorBody('INVALID_USER', userMutationError(error, 'Could not update user')), error instanceof TypeError ? 400 : 409)
    }
  })
  app.patch('/api/admin/users/:id/status', requireRoles('admin'), async (context) => {
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
  app.post('/api/admin/users/:id/password', requireRoles('admin'), async (context) => {
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

  // ── 公司管理 ──
  app.get('/api/companies', requireRoles('admin'), async (c) => {
    const search = c.req.query('search') ?? ''
    const limit = parseLimit(c.req.query('limit'))
    const offset = parseOffset(c.req.query('offset'))
    const conditions: string[] = []
    const params: unknown[] = []
    if (search) { conditions.push('name LIKE ?'); params.push(`%${search}%`) }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''
    const [rows, totalRow] = await Promise.all([
      platform.db.queryAll<{ id: string; name: string; created_at: string; updated_at: string }>({ text: `SELECT * FROM companies ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, params: [...params, limit, offset] }),
      platform.db.queryOne<{ total: number }>({ text: `SELECT COUNT(*) AS total FROM companies ${where}`, params }),
    ])
    return c.json({ companies: rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at, updatedAt: r.updated_at })), total: totalRow?.total ?? 0 })
  })
  app.post('/api/companies', requireRoles('admin'), async (c) => {
    const body = await c.req.json().catch(() => ({}))
    let name: string
    try { name = requiredString(body.name, 'name') } catch (e) { return c.json(errorBody('INVALID_INPUT', e instanceof Error ? e.message : 'Invalid input'), 400) }
    const ts = new Date().toISOString()
    const id = randomUUID()
    try {
      await platform.db.run({ text: 'INSERT INTO companies (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)', params: [id, name, ts, ts] })
    } catch (e) {
      return c.json(errorBody('CONFLICT', 'Company name may already exist'), 409)
    }
    return c.json({ id, name, createdAt: ts, updatedAt: ts }, 201)
  })
  app.patch('/api/companies/:id', requireRoles('admin'), async (c) => {
    const body = await c.req.json().catch(() => ({}))
    let name: string
    try { name = requiredString(body.name, 'name') } catch (e) { return c.json(errorBody('INVALID_INPUT', e instanceof Error ? e.message : 'Invalid input'), 400) }
    const ts = new Date().toISOString()
    const result = await platform.db.run({ text: 'UPDATE companies SET name = ?, updated_at = ? WHERE id = ?', params: [name, ts, c.req.param('id')] })
    if (result.changes !== 1) return c.json(errorBody('NOT_FOUND', 'Company not found'), 404)
    const row = await platform.db.queryOne<{ id: string; name: string; created_at: string; updated_at: string }>({ text: 'SELECT * FROM companies WHERE id = ?', params: [c.req.param('id')] })
    return c.json({ id: row!.id, name: row!.name, createdAt: row!.created_at, updatedAt: row!.updated_at })
  })

  // ── 部门管理 ──
  app.get('/api/companies/:companyId/departments', async (c) => {
    const user = getCurrentUser(c)
    const companyId = c.req.param('companyId')
    if (!ensureCompanyAccess(user, companyId)) return c.json(errorBody('FORBIDDEN', 'Not your company'), 403)
    const rows = await platform.db.queryAll<{ id: string; company_id: string; name: string; created_at: string; updated_at: string }>({ text: 'SELECT * FROM departments WHERE company_id = ? ORDER BY name', params: [companyId] })
    return c.json({ departments: rows.map((r) => ({ id: r.id, companyId: r.company_id, name: r.name, createdAt: r.created_at, updatedAt: r.updated_at })) })
  })
  app.post('/api/companies/:companyId/departments', requireRoles('admin'), async (c) => {
    const body = await c.req.json().catch(() => ({}))
    let name: string
    try { name = requiredString(body.name, 'name') } catch (e) { return c.json(errorBody('INVALID_INPUT', e instanceof Error ? e.message : 'Invalid input'), 400) }
    const companyId = c.req.param('companyId')
    const ts = new Date().toISOString()
    const id = randomUUID()
    try {
      await platform.db.run({ text: 'INSERT INTO departments (id, company_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', params: [id, companyId, name, ts, ts] })
    } catch {
      return c.json(errorBody('CONFLICT', 'Department name already exists in this company'), 409)
    }
    return c.json({ id, companyId, name, createdAt: ts, updatedAt: ts }, 201)
  })
  app.patch('/api/companies/:companyId/departments/:id', requireRoles('admin'), async (c) => {
    const body = await c.req.json().catch(() => ({}))
    let name: string
    try { name = requiredString(body.name, 'name') } catch (e) { return c.json(errorBody('INVALID_INPUT', e instanceof Error ? e.message : 'Invalid input'), 400) }
    const ts = new Date().toISOString()
    const result = await platform.db.run({ text: 'UPDATE departments SET name = ?, updated_at = ? WHERE id = ? AND company_id = ?', params: [name, ts, c.req.param('id'), c.req.param('companyId')] })
    if (result.changes !== 1) return c.json(errorBody('NOT_FOUND', 'Department not found'), 404)
    const row = await platform.db.queryOne<{ id: string; company_id: string; name: string; created_at: string; updated_at: string }>({ text: 'SELECT * FROM departments WHERE id = ?', params: [c.req.param('id')] })
    return c.json({ id: row!.id, companyId: row!.company_id, name: row!.name, createdAt: row!.created_at, updatedAt: row!.updated_at })
  })

  // ── 业务组管理 ──
  app.get('/api/companies/:companyId/groups', requireRoles('admin'), async (c) => {
    const companyId = c.req.param('companyId')
    const groups = await platform.db.queryAll<{ id: string; company_id: string; name: string; created_at: string; updated_at: string }>({ text: 'SELECT * FROM business_groups WHERE company_id = ? ORDER BY name', params: [companyId] })
    const groupIds = groups.map((g) => g.id)
    let members: { group_id: string; user_id: string; name: string; email: string }[] = []
    if (groupIds.length > 0) {
      members = await platform.db.queryAll({ text: `SELECT m.group_id, m.user_id, u.name, u.email FROM business_group_members m JOIN users u ON m.user_id = u.id WHERE m.group_id IN (${groupIds.map(() => '?').join(',')})`, params: groupIds })
    }
    const memberMap = new Map<string, { userId: string; name: string; email: string }[]>()
    for (const m of members) {
      const arr = memberMap.get(m.group_id) ?? []
      arr.push({ userId: m.user_id, name: m.name, email: m.email })
      memberMap.set(m.group_id, arr)
    }
    return c.json({ groups: groups.map((g) => ({ id: g.id, companyId: g.company_id, name: g.name, members: memberMap.get(g.id) ?? [], createdAt: g.created_at, updatedAt: g.updated_at })) })
  })
  app.post('/api/companies/:companyId/groups', requireRoles('admin'), async (c) => {
    const body = await c.req.json().catch(() => ({}))
    let name: string
    try { name = requiredString(body.name, 'name') } catch (e) { return c.json(errorBody('INVALID_INPUT', e instanceof Error ? e.message : 'Invalid input'), 400) }
    const companyId = c.req.param('companyId')
    const ts = new Date().toISOString()
    const id = randomUUID()
    await platform.db.run({ text: 'INSERT INTO business_groups (id, company_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', params: [id, companyId, name, ts, ts] })
    return c.json({ id, companyId, name, members: [], createdAt: ts, updatedAt: ts }, 201)
  })
  app.patch('/api/groups/:id', requireRoles('admin'), async (c) => {
    const body = await c.req.json().catch(() => ({}))
    let name: string
    try { name = requiredString(body.name, 'name') } catch (e) { return c.json(errorBody('INVALID_INPUT', e instanceof Error ? e.message : 'Invalid input'), 400) }
    const ts = new Date().toISOString()
    const result = await platform.db.run({ text: 'UPDATE business_groups SET name = ?, updated_at = ? WHERE id = ?', params: [name, ts, c.req.param('id')] })
    if (result.changes !== 1) return c.json(errorBody('NOT_FOUND', 'Group not found'), 404)
    const row = await platform.db.queryOne<{ id: string; company_id: string; name: string; created_at: string; updated_at: string }>({ text: 'SELECT * FROM business_groups WHERE id = ?', params: [c.req.param('id')] })
    const members = await platform.db.queryAll<{ user_id: string; name: string; email: string }>({ text: 'SELECT m.user_id, u.name, u.email FROM business_group_members m JOIN users u ON m.user_id = u.id WHERE m.group_id = ?', params: [c.req.param('id')] })
    return c.json({ id: row!.id, companyId: row!.company_id, name: row!.name, members: members.map((m) => ({ userId: m.user_id, name: m.name, email: m.email })), createdAt: row!.created_at, updatedAt: row!.updated_at })
  })
  app.delete('/api/groups/:id', requireRoles('admin'), async (c) => {
    const result = await platform.db.run({ text: 'DELETE FROM business_groups WHERE id = ?', params: [c.req.param('id')] })
    if (result.changes !== 1) return c.json(errorBody('NOT_FOUND', 'Group not found'), 404)
    return c.json({ ok: true })
  })
  app.post('/api/groups/:groupId/members', requireRoles('admin'), async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const userId = typeof body.userId === 'string' ? body.userId.trim() : ''
    if (!userId) return c.json(errorBody('INVALID_INPUT', 'userId is required'), 400)
    const groupId = c.req.param('groupId')
    const ts = new Date().toISOString()
    try {
      await platform.db.run({ text: 'INSERT INTO business_group_members (group_id, user_id, created_at) VALUES (?, ?, ?)', params: [groupId, userId, ts] })
    } catch {
      return c.json(errorBody('CONFLICT', 'Member already exists or invalid'), 409)
    }
    return c.json({ ok: true }, 201)
  })
  app.delete('/api/groups/:groupId/members/:userId', requireRoles('admin'), async (c) => {
    await platform.db.run({ text: 'DELETE FROM business_group_members WHERE group_id = ? AND user_id = ?', params: [c.req.param('groupId'), c.req.param('userId')] })
    return c.json({ ok: true })
  })

  // ── 分类管理 ──
  app.get('/api/companies/:companyId/categories', async (c) => {
    const user = getCurrentUser(c)
    const companyId = c.req.param('companyId')
    if (!ensureCompanyAccess(user, companyId)) return c.json(errorBody('FORBIDDEN', 'Not your company'), 403)
    const rows = await platform.db.queryAll<{ id: string; company_id: string; name: string; created_at: string }>({ text: 'SELECT * FROM categories WHERE company_id = ? ORDER BY name', params: [companyId] })
    return c.json({ categories: rows.map((r) => ({ id: r.id, companyId: r.company_id, name: r.name, createdAt: r.created_at })) })
  })
  app.post('/api/companies/:companyId/categories', requireRoles('admin'), async (c) => {
    const body = await c.req.json().catch(() => ({}))
    let name: string
    try { name = requiredString(body.name, 'name') } catch (e) { return c.json(errorBody('INVALID_INPUT', e instanceof Error ? e.message : 'Invalid input'), 400) }
    const companyId = c.req.param('companyId')
    const ts = new Date().toISOString()
    const id = randomUUID()
    try {
      await platform.db.run({ text: 'INSERT INTO categories (id, company_id, name, created_at) VALUES (?, ?, ?, ?)', params: [id, companyId, name, ts] })
    } catch {
      return c.json(errorBody('CONFLICT', 'Category name already exists in this company'), 409)
    }
    return c.json({ id, companyId, name, createdAt: ts }, 201)
  })
  app.patch('/api/categories/:id', requireRoles('admin'), async (c) => {
    const body = await c.req.json().catch(() => ({}))
    let name: string
    try { name = requiredString(body.name, 'name') } catch (e) { return c.json(errorBody('INVALID_INPUT', e instanceof Error ? e.message : 'Invalid input'), 400) }
    const result = await platform.db.run({ text: 'UPDATE categories SET name = ? WHERE id = ?', params: [name, c.req.param('id')] })
    if (result.changes !== 1) return c.json(errorBody('NOT_FOUND', 'Category not found'), 404)
    const row = await platform.db.queryOne<{ id: string; company_id: string; name: string; created_at: string }>({ text: 'SELECT * FROM categories WHERE id = ?', params: [c.req.param('id')] })
    return c.json({ id: row!.id, companyId: row!.company_id, name: row!.name, createdAt: row!.created_at })
  })
  app.delete('/api/categories/:id', requireRoles('admin'), async (c) => {
    const result = await platform.db.run({ text: 'DELETE FROM categories WHERE id = ?', params: [c.req.param('id')] })
    if (result.changes !== 1) return c.json(errorBody('NOT_FOUND', 'Category not found'), 404)
    return c.json({ ok: true })
  })

  // ── 分配规则 ──
  app.get('/api/companies/:companyId/assignment-rules', requireRoles('admin'), async (c) => {
    const companyId = c.req.param('companyId')
    const rows = await platform.db.queryAll<{ id: string; company_id: string; category_id: string; group_id: string; created_at: string; cat_name: string; grp_name: string }>({
      text: `SELECT ar.*, c.name AS cat_name, g.name AS grp_name FROM assignment_rules ar JOIN categories c ON ar.category_id = c.id JOIN business_groups g ON ar.group_id = g.id WHERE ar.company_id = ? ORDER BY c.name`,
      params: [companyId],
    })
    return c.json({ rules: rows.map((r) => ({ id: r.id, companyId: r.company_id, categoryId: r.category_id, categoryName: r.cat_name, groupId: r.group_id, groupName: r.grp_name, createdAt: r.created_at })) })
  })
  app.post('/api/companies/:companyId/assignment-rules', requireRoles('admin'), async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const categoryId = typeof body.categoryId === 'string' ? body.categoryId.trim() : ''
    const groupId = typeof body.groupId === 'string' ? body.groupId.trim() : ''
    if (!categoryId || !groupId) return c.json(errorBody('INVALID_INPUT', 'categoryId and groupId are required'), 400)
    const companyId = c.req.param('companyId')
    const ts = new Date().toISOString()
    const id = randomUUID()
    try {
      await platform.db.run({ text: 'INSERT INTO assignment_rules (id, company_id, category_id, group_id, created_at) VALUES (?, ?, ?, ?, ?)', params: [id, companyId, categoryId, groupId, ts] })
    } catch {
      return c.json(errorBody('CONFLICT', 'Rule already exists for this category'), 409)
    }
    const row = await platform.db.queryOne<{ cat_name: string; grp_name: string }>({ text: 'SELECT c.name AS cat_name, g.name AS grp_name FROM assignment_rules ar JOIN categories c ON ar.category_id = c.id JOIN business_groups g ON ar.group_id = g.id WHERE ar.id = ?', params: [id] })
    return c.json({ id, companyId, categoryId, categoryName: row?.cat_name ?? '', groupId, groupName: row?.grp_name ?? '', createdAt: ts }, 201)
  })
  app.delete('/api/assignment-rules/:id', requireRoles('admin'), async (c) => {
    const result = await platform.db.run({ text: 'DELETE FROM assignment_rules WHERE id = ?', params: [c.req.param('id')] })
    if (result.changes !== 1) return c.json(errorBody('NOT_FOUND', 'Rule not found'), 404)
    return c.json({ ok: true })
  })

  // ── 工单管理 ──
  app.get('/api/tickets', async (c) => {
    const user = getCurrentUser(c)
    const { companyId, status, priority, categoryId, groupId, search } = c.req.query()
    const sort = c.req.query('sort')
    const order = c.req.query('order')
    const limit = parseLimit(c.req.query('limit'))
    const offset = parseOffset(c.req.query('offset'))

    const conditions: string[] = []
    const params: unknown[] = []
    const isAdmin = user.roles.includes('admin')
    if (!isAdmin) {
      if (user.roles.includes('submitter') && !user.roles.includes('handler')) {
        conditions.push('t.submitter_id = ?'); params.push(user.id)
      } else {
        conditions.push('t.company_id = ?'); params.push(user.companyId)
      }
    }
    if (companyId) { conditions.push('t.company_id = ?'); params.push(companyId) }
    if (status) { conditions.push('t.status = ?'); params.push(status) }
    if (priority) { conditions.push('t.sla_priority = ?'); params.push(priority) }
    if (categoryId) { conditions.push('t.category_id = ?'); params.push(categoryId) }
    if (groupId) { conditions.push('t.group_id = ?'); params.push(groupId) }
    if (search) { conditions.push('(t.subject LIKE ? OR t.description LIKE ?)'); params.push(`%${search}%`, `%${search}%`) }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''
    const sortField = sort === 'updatedAt' ? 't.updated_at' : sort === 'priority' ? 't.sla_priority' : 't.created_at'
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC'

    const [rows, totalRow] = await Promise.all([
      platform.db.queryAll<TicketRow>({ text: `${TICKET_JOIN} ${where} ORDER BY ${sortField} ${sortOrder} LIMIT ? OFFSET ?`, params: [...params, limit, offset] }),
      platform.db.queryOne<{ total: number }>({ text: `SELECT COUNT(*) AS total FROM tickets t ${where}`, params }),
    ])
    return c.json({ tickets: rows.map(mapListItem), total: totalRow?.total ?? 0 })
  })

  app.post('/api/tickets', requireRoles('submitter'), async (c) => {
    const user = getCurrentUser(c)
    if (!user.companyId) return c.json(errorBody('INVALID_INPUT', 'User must belong to a company to create tickets'), 400)
    const body = await c.req.json().catch(() => ({}))
    let subject: string, description: string, categoryId: string
    let slaPriority = 'P3'
    try {
      subject = requiredString(body.subject, 'subject', 500)
      description = requiredString(body.description, 'description', 5000)
      categoryId = requiredString(body.categoryId, 'categoryId')
      if (body.slaPriority && !['P0', 'P1', 'P2', 'P3', 'P4'].includes(body.slaPriority)) throw new TypeError('slaPriority must be P0-P4')
      if (body.slaPriority) slaPriority = body.slaPriority
    } catch (e) {
      return c.json(errorBody('INVALID_INPUT', e instanceof Error ? e.message : 'Invalid input'), 400)
    }

    // 验证分类属于同公司
    const cat = await platform.db.queryOne<{ id: string; company_id: string }>({ text: 'SELECT id, company_id FROM categories WHERE id = ?', params: [categoryId] })
    if (!cat || cat.company_id !== user.companyId) return c.json(errorBody('INVALID_INPUT', 'Category not found in your company'), 400)

    // 查询提交人部门名称
    const dept = user.departmentId ? await platform.db.queryOne<{ name: string }>({ text: 'SELECT name FROM departments WHERE id = ?', params: [user.departmentId] }) : null

    const id = randomUUID()
    const ts = new Date().toISOString()
    const submitterDept = dept?.name ?? null

    // 自动分配：按 (company_id, category_id) 查找规则
    const rule = await platform.db.queryOne<{ group_id: string }>({ text: 'SELECT group_id FROM assignment_rules WHERE company_id = ? AND category_id = ?', params: [user.companyId, categoryId] })

    let status = 'created'
    let groupId: string | null = null
    let assignedAt: string | null = null
    if (rule) {
      status = 'pending_processing'
      groupId = rule.group_id
      assignedAt = ts
    }

    await platform.db.run({
      text: `INSERT INTO tickets (id, company_id, subject, description, category_id, submitter_id, submitter_name, submitter_email, submitter_department, sla_priority, status, group_id, assigned_at, handler_id, handler_name, handled_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)`,
      params: [id, user.companyId, subject, description, categoryId, user.id, user.name, user.email, submitterDept, slaPriority, status, groupId, assignedAt, ts, ts],
    })

    await recordAudit(platform, 'ticket.created', user.id, id, { subject })
    if (rule) await recordAudit(platform, 'ticket.assigned', user.id, id, { groupId: rule.group_id, auto: true })

    const row = await platform.db.queryOne<TicketRow>({ text: `${TICKET_JOIN} WHERE t.id = ?`, params: [id] })
    return c.json(mapTicket(row!, []), 201)
  })

  app.get('/api/tickets/:id', async (c) => {
    const user = getCurrentUser(c)
    const ticket = await platform.db.queryOne<TicketRow>({ text: `${TICKET_JOIN} WHERE t.id = ?`, params: [c.req.param('id')] })
    if (!ticket) return c.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    if (!user.roles.includes('admin') && ticket.company_id !== user.companyId) return c.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    const replies = await platform.db.queryAll<{ id: string; ticket_id: string; replier_id: string; replier_name: string; content: string; created_at: string }>({ text: 'SELECT * FROM ticket_replies WHERE ticket_id = ? ORDER BY created_at ASC', params: [c.req.param('id')] })
    return c.json(mapTicket(ticket, replies.map((r) => ({ id: r.id, ticketId: r.ticket_id, replierId: r.replier_id, replierName: r.replier_name, content: r.content, createdAt: r.created_at }))))
  })

  app.post('/api/tickets/:id/assign', requireRoles('admin', 'handler'), async (c) => {
    const user = getCurrentUser(c)
    const body = await c.req.json().catch(() => ({}))
    const groupId = typeof body.groupId === 'string' ? body.groupId.trim() : ''
    if (!groupId) return c.json(errorBody('INVALID_INPUT', 'groupId is required'), 400)
    const ticket = await platform.db.queryOne<TicketRow>({ text: `${TICKET_JOIN} WHERE t.id = ?`, params: [c.req.param('id')] })
    if (!ticket) return c.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    if (!user.roles.includes('admin') && ticket.company_id !== user.companyId) return c.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    if (!['created', 'pending_assignment'].includes(ticket.status)) return c.json(errorBody('CONFLICT', 'Ticket must be in created or pending_assignment state'), 409)

    const ts = new Date().toISOString()
    const assignedAt = ticket.assigned_at ?? ts
    await platform.db.run({ text: 'UPDATE tickets SET group_id = ?, status = ?, assigned_at = ?, updated_at = ? WHERE id = ?', params: [groupId, 'pending_processing', assignedAt, ts, c.req.param('id')] })
    await recordAudit(platform, 'ticket.assigned', user.id, c.req.param('id'), { groupId, auto: false })
    const row = await platform.db.queryOne<TicketRow>({ text: `${TICKET_JOIN} WHERE t.id = ?`, params: [c.req.param('id')] })
    return c.json(mapTicket(row!))
  })

  app.post('/api/tickets/:id/transfer', requireRoles('handler'), async (c) => {
    const user = getCurrentUser(c)
    const body = await c.req.json().catch(() => ({}))
    const toGroupId = typeof body.toGroupId === 'string' ? body.toGroupId.trim() : null
    const toHandlerId = typeof body.toHandlerId === 'string' ? body.toHandlerId.trim() : null
    if (!toGroupId && !toHandlerId) return c.json(errorBody('INVALID_INPUT', 'At least one of toGroupId or toHandlerId is required'), 400)

    const ticket = await platform.db.queryOne<TicketRow>({ text: `${TICKET_JOIN} WHERE t.id = ?`, params: [c.req.param('id')] })
    if (!ticket) return c.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    if (ticket.company_id !== user.companyId) return c.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    if (ticket.status !== 'pending_processing') return c.json(errorBody('CONFLICT', 'Ticket must be in pending_processing state'), 409)

    // 验证处理人是当前工单组的成员
    const memberRow = await platform.db.queryOne<{ user_id: string }>({ text: 'SELECT user_id FROM business_group_members WHERE group_id = ? AND user_id = ?', params: [ticket.group_id, user.id] })
    if (!memberRow) return c.json(errorBody('FORBIDDEN', 'You are not a handler in this ticket group'), 403)

    const ts = new Date().toISOString()
    const fromGroupId = ticket.group_id
    const fromHandlerId = ticket.handler_id

    let newStatus = 'pending_processing'
    let newGroupId = ticket.group_id
    let newHandlerId = toHandlerId
    let newHandlerName: string | null = null

    if (toGroupId && toGroupId !== ticket.group_id) {
      // 换组 → 回到 pending_assignment
      newStatus = 'pending_assignment'
      newGroupId = toGroupId
      newHandlerId = null
      newHandlerName = null
    } else if (toHandlerId) {
      // 同组换人
      const handler = await platform.db.queryOne<{ name: string }>({ text: 'SELECT name FROM users WHERE id = ?', params: [toHandlerId] })
      newHandlerName = handler?.name ?? null
    }

    const transferId = randomUUID()
    await platform.db.transaction(async (tx) => {
      await tx.run({ text: 'INSERT INTO ticket_transfers (id, ticket_id, from_group_id, from_handler_id, to_group_id, to_handler_id, transferred_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', params: [transferId, c.req.param('id'), fromGroupId, fromHandlerId, toGroupId, toHandlerId, user.id, ts] })
      await tx.run({ text: 'UPDATE tickets SET group_id = ?, handler_id = ?, handler_name = ?, status = ?, updated_at = ? WHERE id = ?', params: [newGroupId, newHandlerId, newHandlerName, newStatus, ts, c.req.param('id')] })
    })

    await recordAudit(platform, 'ticket.transferred', user.id, c.req.param('id'), { fromGroupId, fromHandlerId, toGroupId, toHandlerId })
    const row = await platform.db.queryOne<TicketRow>({ text: `${TICKET_JOIN} WHERE t.id = ?`, params: [c.req.param('id')] })
    return c.json(mapTicket(row!))
  })

  app.post('/api/tickets/:id/complete', requireRoles('handler'), async (c) => {
    const user = getCurrentUser(c)
    const ticket = await platform.db.queryOne<TicketRow>({ text: `${TICKET_JOIN} WHERE t.id = ?`, params: [c.req.param('id')] })
    if (!ticket) return c.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    if (ticket.company_id !== user.companyId) return c.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    if (ticket.status !== 'pending_processing') return c.json(errorBody('CONFLICT', 'Ticket must be in pending_processing state'), 409)

    // 验证处理人是当前工单组的成员
    const memberRow = await platform.db.queryOne<{ user_id: string }>({ text: 'SELECT user_id FROM business_group_members WHERE group_id = ? AND user_id = ?', params: [ticket.group_id, user.id] })
    if (!memberRow) return c.json(errorBody('FORBIDDEN', 'You are not a handler in this ticket group'), 403)

    const ts = new Date().toISOString()
    await platform.db.run({ text: 'UPDATE tickets SET status = ?, handler_id = ?, handler_name = ?, handled_at = ?, updated_at = ? WHERE id = ?', params: ['completed', user.id, user.name, ts, ts, c.req.param('id')] })

    await recordAudit(platform, 'ticket.completed', user.id, c.req.param('id'), {})

    // 发送邮件通知（降级为日志不阻塞）
    platform.emailClient.send({ to: ticket.submitter_email, subject: `工单已完成: ${ticket.subject}`, text: `您的工单 "${ticket.subject}" 已处理完成。` }).catch((e) => console.error('[email] send failed', e))

    const row = await platform.db.queryOne<TicketRow>({ text: `${TICKET_JOIN} WHERE t.id = ?`, params: [c.req.param('id')] })
    return c.json(mapTicket(row!))
  })

  app.post('/api/tickets/:id/cancel', async (c) => {
    const user = getCurrentUser(c)
    const ticket = await platform.db.queryOne<TicketRow>({ text: `${TICKET_JOIN} WHERE t.id = ?`, params: [c.req.param('id')] })
    if (!ticket) return c.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    if (!user.roles.includes('admin') && ticket.company_id !== user.companyId) return c.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    // submitter 仅限自己的工单，admin 可取消任何工单
    if (!user.roles.includes('admin') && ticket.submitter_id !== user.id) return c.json(errorBody('FORBIDDEN', 'You can only cancel your own tickets'), 403)
    if (ticket.status === 'completed') return c.json(errorBody('CONFLICT', 'Completed tickets cannot be cancelled'), 409)

    const ts = new Date().toISOString()
    await platform.db.run({ text: 'UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?', params: ['cancelled', ts, c.req.param('id')] })
    await recordAudit(platform, 'ticket.cancelled', user.id, c.req.param('id'), {})
    const row = await platform.db.queryOne<TicketRow>({ text: `${TICKET_JOIN} WHERE t.id = ?`, params: [c.req.param('id')] })
    return c.json(mapTicket(row!))
  })

  // ── 工单回复 ──
  app.get('/api/tickets/:id/replies', async (c) => {
    const user = getCurrentUser(c)
    const ticket = await platform.db.queryOne<{ company_id: string }>({ text: 'SELECT company_id FROM tickets WHERE id = ?', params: [c.req.param('id')] })
    if (!ticket) return c.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    if (!user.roles.includes('admin') && ticket.company_id !== user.companyId) return c.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    const rows = await platform.db.queryAll<{ id: string; ticket_id: string; replier_id: string; replier_name: string; content: string; created_at: string }>({ text: 'SELECT * FROM ticket_replies WHERE ticket_id = ? ORDER BY created_at ASC', params: [c.req.param('id')] })
    return c.json({ replies: rows.map((r) => ({ id: r.id, ticketId: r.ticket_id, replierId: r.replier_id, replierName: r.replier_name, content: r.content, createdAt: r.created_at })) })
  })
  app.post('/api/tickets/:id/replies', async (c) => {
    const user = getCurrentUser(c)
    const ticket = await platform.db.queryOne<{ company_id: string }>({ text: 'SELECT company_id FROM tickets WHERE id = ?', params: [c.req.param('id')] })
    if (!ticket) return c.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    if (!user.roles.includes('admin') && ticket.company_id !== user.companyId) return c.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    const body = await c.req.json().catch(() => ({}))
    let content: string
    try { content = requiredString(body.content, 'content', 5000) } catch (e) { return c.json(errorBody('INVALID_INPUT', e instanceof Error ? e.message : 'Invalid input'), 400) }
    const id = randomUUID()
    const ts = new Date().toISOString()
    await platform.db.run({ text: 'INSERT INTO ticket_replies (id, ticket_id, replier_id, replier_name, content, created_at) VALUES (?, ?, ?, ?, ?, ?)', params: [id, c.req.param('id'), user.id, user.name, content, ts] })
    await recordAudit(platform, 'ticket.replied', user.id, c.req.param('id'), {})
    return c.json({ id, ticketId: c.req.param('id'), replierId: user.id, replierName: user.name, content, createdAt: ts }, 201)
  })

  // ── 提交人信息 ──
  app.get('/api/tickets/:id/submitter-info', requireRoles('handler', 'admin'), async (c) => {
    const user = getCurrentUser(c)
    const ticket = await platform.db.queryOne<{ company_id: string; submitter_id: string }>({ text: 'SELECT company_id, submitter_id FROM tickets WHERE id = ?', params: [c.req.param('id')] })
    if (!ticket) return c.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    if (!user.roles.includes('admin') && ticket.company_id !== user.companyId) return c.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)

    const u = await platform.db.queryOne<{ id: string; name: string; email: string; phone: string | null; company_id: string | null; department_id: string | null }>({ text: 'SELECT id, name, email, phone, company_id, department_id FROM users WHERE id = ?', params: [ticket.submitter_id] })
    if (!u) return c.json(errorBody('NOT_FOUND', 'Submitter not found'), 404)

    const company = u.company_id ? await platform.db.queryOne<{ name: string }>({ text: 'SELECT name FROM companies WHERE id = ?', params: [u.company_id] }) : null
    const department = u.department_id ? await platform.db.queryOne<{ name: string }>({ text: 'SELECT name FROM departments WHERE id = ?', params: [u.department_id] }) : null

    const historyTickets = await platform.db.queryAll<TicketRow>({
      text: `${TICKET_JOIN} WHERE t.submitter_id = ? AND t.id != ? ORDER BY t.created_at DESC LIMIT 50`,
      params: [ticket.submitter_id, c.req.param('id')],
    })

    return c.json({
      userId: u.id, name: u.name, email: u.email, phone: u.phone,
      companyName: company?.name ?? null, departmentName: department?.name ?? null,
      historyTickets: historyTickets.map(mapListItem),
    })
  })

  // ── 用户评价 ──
  app.get('/api/tickets/:id/evaluation', async (c) => {
    const user = getCurrentUser(c)
    const ticket = await platform.db.queryOne<{ company_id: string }>({ text: 'SELECT company_id FROM tickets WHERE id = ?', params: [c.req.param('id')] })
    if (!ticket) return c.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    if (!user.roles.includes('admin') && ticket.company_id !== user.companyId) return c.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    const row = await platform.db.queryOne<{ id: string; ticket_id: string; submitter_id: string; rating: number; comment: string | null; created_at: string }>({ text: 'SELECT * FROM ticket_evaluations WHERE ticket_id = ?', params: [c.req.param('id')] })
    if (!row) return c.json(errorBody('NOT_FOUND', 'No evaluation found'), 404)
    return c.json({ id: row.id, ticketId: row.ticket_id, submitterId: row.submitter_id, rating: row.rating, comment: row.comment, createdAt: row.created_at })
  })
  app.post('/api/tickets/:id/evaluation', requireRoles('submitter'), async (c) => {
    const user = getCurrentUser(c)
    const ticket = await platform.db.queryOne<{ company_id: string; submitter_id: string; status: string }>({ text: 'SELECT company_id, submitter_id, status FROM tickets WHERE id = ?', params: [c.req.param('id')] })
    if (!ticket) return c.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    if (ticket.company_id !== user.companyId) return c.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    if (ticket.submitter_id !== user.id) return c.json(errorBody('FORBIDDEN', 'You can only evaluate your own tickets'), 403)
    if (ticket.status !== 'completed') return c.json(errorBody('CONFLICT', 'Ticket must be completed to evaluate'), 409)

    const body = await c.req.json().catch(() => ({}))
    const rating = Number(body.rating)
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return c.json(errorBody('INVALID_INPUT', 'rating must be an integer 1-5'), 400)
    const comment = typeof body.comment === 'string' ? body.comment.slice(0, 1000) : null

    const id = randomUUID()
    const ts = new Date().toISOString()
    try {
      await platform.db.run({ text: 'INSERT INTO ticket_evaluations (id, ticket_id, submitter_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)', params: [id, c.req.param('id'), user.id, rating, comment, ts] })
    } catch {
      return c.json(errorBody('CONFLICT', 'Ticket already evaluated'), 409)
    }
    await recordAudit(platform, 'ticket.evaluated', user.id, c.req.param('id'), { rating })
    return c.json({ id, ticketId: c.req.param('id'), submitterId: user.id, rating, comment, createdAt: ts }, 201)
  })

  // ── 统计分析 ──
  app.get('/api/stats/distribution', requireRoles('admin'), async (c) => {
    const dimension = c.req.query('dimension') ?? 'company'
    const companyId = c.req.query('companyId')
    if (dimension === 'department') {
      const companyFilter = companyId ? 'AND t.company_id = ?' : ''
      const params = companyId ? [companyId] : []
      const rows = await platform.db.queryAll<{ key: string; total: number; created: number; pending_assignment: number; pending_processing: number; completed: number; cancelled: number }>({
        text: `SELECT COALESCE(d.name, '未分配') AS key, COUNT(*) AS total,
          SUM(CASE WHEN t.status='created' THEN 1 ELSE 0 END) AS created,
          SUM(CASE WHEN t.status='pending_assignment' THEN 1 ELSE 0 END) AS pending_assignment,
          SUM(CASE WHEN t.status='pending_processing' THEN 1 ELSE 0 END) AS pending_processing,
          SUM(CASE WHEN t.status='completed' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN t.status='cancelled' THEN 1 ELSE 0 END) AS cancelled
          FROM tickets t LEFT JOIN users u ON t.submitter_id = u.id LEFT JOIN departments d ON u.department_id = d.id
          WHERE 1=1 ${companyFilter} GROUP BY d.name ORDER BY total DESC`,
        params,
      })
      return c.json({ dimension, items: rows.map((r) => ({ key: r.key, total: r.total, byStatus: { created: r.created, pending_assignment: r.pending_assignment, pending_processing: r.pending_processing, completed: r.completed, cancelled: r.cancelled } })) })
    } else {
      const companyFilter = companyId ? 'AND t.company_id = ?' : ''
      const params = companyId ? [companyId] : []
      const rows = await platform.db.queryAll<{ key: string; total: number; created: number; pending_assignment: number; pending_processing: number; completed: number; cancelled: number }>({
        text: `SELECT COALESCE(c.name, '未知') AS key, COUNT(*) AS total,
          SUM(CASE WHEN t.status='created' THEN 1 ELSE 0 END) AS created,
          SUM(CASE WHEN t.status='pending_assignment' THEN 1 ELSE 0 END) AS pending_assignment,
          SUM(CASE WHEN t.status='pending_processing' THEN 1 ELSE 0 END) AS pending_processing,
          SUM(CASE WHEN t.status='completed' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN t.status='cancelled' THEN 1 ELSE 0 END) AS cancelled
          FROM tickets t LEFT JOIN companies c ON t.company_id = c.id
          WHERE 1=1 ${companyFilter} GROUP BY c.name ORDER BY total DESC`,
        params,
      })
      return c.json({ dimension: 'company', items: rows.map((r) => ({ key: r.key, total: r.total, byStatus: { created: r.created, pending_assignment: r.pending_assignment, pending_processing: r.pending_processing, completed: r.completed, cancelled: r.cancelled } })) })
    }
  })
  app.get('/api/stats/dashboard', requireRoles('admin'), async (c) => {
    const companyId = c.req.query('companyId')
    const filter = companyId ? 'WHERE company_id = ?' : ''
    const params = companyId ? [companyId] : []
    const totalRow = await platform.db.queryOne<{ total: number }>({ text: `SELECT COUNT(*) AS total FROM tickets ${filter}`, params })
    const avgRow = await platform.db.queryOne<{ avg_hours: number | null }>({ text: `SELECT AVG((julianday(assigned_at) - julianday(created_at)) * 24) AS avg_hours FROM tickets ${filter} AND assigned_at IS NOT NULL`, params })
    const satRow = await platform.db.queryOne<{ avg_rating: number | null }>({ text: `SELECT AVG(e.rating) AS avg_rating FROM ticket_evaluations e JOIN tickets t ON e.ticket_id = t.id ${filter ? 'WHERE t.company_id = ?' : ''}`, params })
    const hotRows = await platform.db.queryAll<{ category_id: string; cat_name: string; count: number }>({
      text: `SELECT t.category_id, c.name AS cat_name, COUNT(*) AS count FROM tickets t LEFT JOIN categories c ON t.category_id = c.id ${filter} AND t.category_id IS NOT NULL GROUP BY t.category_id ORDER BY count DESC LIMIT 5`,
      params,
    })
    return c.json({
      totalTickets: totalRow?.total ?? 0,
      avgResponseTimeHours: Math.round((avgRow?.avg_hours ?? 0) * 100) / 100,
      avgSatisfaction: satRow?.avg_rating != null ? Math.round(satRow.avg_rating * 100) / 100 : null,
      hotCategories: hotRows.map((r) => ({ categoryId: r.category_id, categoryName: r.cat_name ?? '未知', count: r.count })),
    })
  })

  // ── 工单工作台 ──
  app.get('/api/workbench/tickets', requireRoles('handler'), async (c) => {
    const user = getCurrentUser(c)
    const isAdmin = user.roles.includes('admin')
    const { companyId, priority, search } = c.req.query()
    const sort = c.req.query('sort')
    const order = c.req.query('order')
    const limit = parseLimit(c.req.query('limit'))
    const offset = parseOffset(c.req.query('offset'))

    const conditions: string[] = ['t.status = ?']
    const params: unknown[] = ['pending_processing']

    if (isAdmin) {
      if (companyId) { conditions.push('t.company_id = ?'); params.push(companyId) }
    } else {
      // 查找用户所在业务组
      const groupRows = await platform.db.queryAll<{ group_id: string }>({ text: 'SELECT group_id FROM business_group_members WHERE user_id = ?', params: [user.id] })
      const groupIds = groupRows.map((r) => r.group_id)
      if (groupIds.length === 0) return c.json({ tickets: [], total: 0 })
      conditions.push(`t.group_id IN (${groupIds.map(() => '?').join(',')})`)
      params.push(...groupIds)
    }
    if (priority) { conditions.push('t.sla_priority = ?'); params.push(priority) }
    if (search) { conditions.push('(t.subject LIKE ? OR t.description LIKE ?)'); params.push(`%${search}%`, `%${search}%`) }

    const where = 'WHERE ' + conditions.join(' AND ')
    const sortField = sort === 'updatedAt' ? 't.updated_at' : sort === 'priority' ? 't.sla_priority' : 't.created_at'
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC'

    const [rows, totalRow] = await Promise.all([
      platform.db.queryAll<TicketRow>({ text: `${TICKET_JOIN} ${where} ORDER BY ${sortField} ${sortOrder} LIMIT ? OFFSET ?`, params: [...params, limit, offset] }),
      platform.db.queryOne<{ total: number }>({ text: `SELECT COUNT(*) AS total FROM tickets t ${where}`, params }),
    ])
    return c.json({ tickets: rows.map(mapListItem), total: totalRow?.total ?? 0 })
  })

  // ── 工单操作日志 ──
  app.get('/api/tickets/:id/logs', async (c) => {
    const user = getCurrentUser(c)
    const ticket = await platform.db.queryOne<{ company_id: string }>({ text: 'SELECT company_id FROM tickets WHERE id = ?', params: [c.req.param('id')] })
    if (!ticket) return c.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    if (!user.roles.includes('admin') && ticket.company_id !== user.companyId) return c.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)

    const rows = await platform.db.queryAll<{ id: string; event_type: string; actor_user_id: string | null; occurred_at: string; metadata_json: string }>({
      text: `SELECT id, event_type, actor_user_id, occurred_at, metadata_json FROM audit_events WHERE event_type LIKE 'ticket.%' AND json_extract(metadata_json, '$.ticketId') = ? ORDER BY occurred_at DESC, id DESC`,
      params: [c.req.param('id')],
    })

    // 批量获取操作人姓名
    const userIds = [...new Set(rows.map((r) => r.actor_user_id).filter(Boolean))] as string[]
    const userMap = new Map<string, string>()
    if (userIds.length > 0) {
      const users = await platform.db.queryAll<{ id: string; name: string }>({ text: `SELECT id, name FROM users WHERE id IN (${userIds.map(() => '?').join(',')})`, params: userIds })
      for (const u of users) userMap.set(u.id, u.name)
    }

    return c.json({
      logs: rows.map((r) => ({
        id: r.id,
        eventType: r.event_type,
        actorUserId: r.actor_user_id,
        actorName: r.actor_user_id ? userMap.get(r.actor_user_id) ?? null : null,
        occurredAt: r.occurred_at,
        metadata: JSON.parse(r.metadata_json || '{}'),
      })),
    })
  })
}
