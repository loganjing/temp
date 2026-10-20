import { randomUUID } from 'node:crypto'
import type { Context, Hono, MiddlewareHandler } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { initializePlatform } from './platform/bootstrap'
import type { AuthUser } from '@commonapp/userkit'
import { loadTicketUser, toUserProfile, type Role, type TicketUser } from './context'
import { ApiError, errorBody, notFound, validation } from './http'
import { createNotificationService } from './notifications'
import { createTicketService, PRIORITIES, TICKET_STATUSES, type ListQuery } from './tickets'
import * as assignment from './assignment'
import { getDashboard, getDistribution } from './stats'

type Platform = Awaited<ReturnType<typeof initializePlatform>>

const ROLES: Role[] = ['submitter', 'agent', 'company_admin']

const getAuthUser = (context: Context): AuthUser => (context as unknown as { get(key: string): unknown }).get('currentUser') as AuthUser
const getTicketUser = (context: Context): TicketUser => (context as unknown as { get(key: string): unknown }).get('ticketUser') as TicketUser

async function readBody(context: Context): Promise<Record<string, unknown>> {
  return (await context.req.json().catch(() => ({}))) as Record<string, unknown>
}

// 统一把业务 ApiError 转换为契约 §1 错误结构；未捕获错误交给 app.onError 兜底 500。
async function handle<T>(context: Context, fn: () => Promise<T>, status: ContentfulStatusCode = 200) {
  try {
    return context.json(await fn(), status)
  } catch (error) {
    if (error instanceof ApiError) return context.json(errorBody(error.code, error.message), error.status)
    throw error
  }
}

async function handleNoContent(context: Context, fn: () => Promise<void>) {
  try {
    await fn()
    return context.body(null, 204)
  } catch (error) {
    if (error instanceof ApiError) return context.json(errorBody(error.code, error.message), error.status)
    throw error
  }
}

const requiredString = (value: unknown, name: string, maxLength = 200) => {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) throw validation(`${name} is required`)
  return value.trim()
}

const userMutationError = (error: unknown): ApiError => {
  if (error instanceof ApiError) return error
  if (error instanceof TypeError) return validation(error.message)
  if (error instanceof Error && /unique constraint/i.test(error.message)) return new ApiError(409, 'CONFLICT', 'Email or phone is already in use')
  throw error
}

const parseTicketId = (context: Context): number => {
  const id = Number(context.req.param('id'))
  if (!Number.isInteger(id) || id < 1) throw notFound('Ticket not found')
  return id
}

const parseListQuery = (context: Context): ListQuery => {
  const view = context.req.query('view') ?? 'mine'
  if (view !== 'mine' && view !== 'workbench' && view !== 'company') throw validation('view must be mine, workbench or company')
  const statusRaw = context.req.query('status')
  const statuses = statusRaw ? statusRaw.split(',').map((value) => value.trim()).filter(Boolean) : []
  if (statuses.some((status) => !TICKET_STATUSES.includes(status as (typeof TICKET_STATUSES)[number]))) {
    throw validation(`status must be a comma-separated list of ${TICKET_STATUSES.join(', ')}`)
  }
  const priority = context.req.query('priority')
  if (priority && !PRIORITIES.includes(priority as (typeof PRIORITIES)[number])) throw validation('priority must be one of P0, P1, P2, P3, P4')
  const groupRaw = context.req.query('group')
  const group = groupRaw ? Number(groupRaw) : null
  if (group !== null && (!Number.isInteger(group) || group < 1)) throw validation('group must be a group id')
  const sort = context.req.query('sort') ?? 'created_at'
  if (sort !== 'created_at' && sort !== 'priority' && sort !== 'status') throw validation('sort must be created_at, priority or status')
  const order = context.req.query('order') ?? 'desc'
  if (order !== 'asc' && order !== 'desc') throw validation('order must be asc or desc')
  const page = Number(context.req.query('page') ?? 1)
  if (!Number.isInteger(page) || page < 1) throw validation('page must be an integer greater than or equal to 1')
  const pageSize = Number(context.req.query('pageSize') ?? 20)
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw validation('pageSize must be between 1 and 100')
  return {
    view,
    statuses,
    category: context.req.query('category')?.trim() || null,
    priority: priority || null,
    group,
    q: context.req.query('q')?.trim() ?? '',
    sort,
    order,
    page,
    pageSize,
  }
}

export function registerPublicRoutes(app: Hono, platform: Platform) {
  app.get('/api/auth/bootstrap-status', async (context) => context.json({ required: (await platform.auth.userStore.count()) === 0 }))
  app.post('/api/auth/bootstrap', platform.auth.loginRateLimit, async (context) => {
    const body = await readBody(context)
    let name: string
    let email: string
    let password: string
    try {
      name = requiredString(body.name, 'name')
      email = requiredString(body.email, 'email', 320).toLowerCase()
      password = requiredString(body.password, 'password', 256)
      if (!email.includes('@') || password.length < 12) throw validation('Enter a valid email and a password with at least 12 characters')
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      return context.json(errorBody('INVALID_INPUT', error.message), 400)
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

  // 登录（契约 §4.1）：{ username, password } → { token, user: UserProfile }。
  app.post('/api/auth/login', platform.auth.loginRateLimit, async (context) => {
    const body = await readBody(context)
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    if (!username || !password) return context.json(errorBody('VALIDATION', 'username and password are required'), 400)
    const result = await platform.auth.login(username, password)
    if (!result) return context.json(errorBody('UNAUTHORIZED', 'Invalid username or password'), 401)
    return context.json({ token: result.token, user: toUserProfile(result.profile) })
  })

  app.get('/api/auth/sso/start', (context) => platform.auth.sso.start(context as never))
  app.get('/api/auth/sso/callback', (context) => platform.auth.sso.callback(context as never))
  app.post('/api/auth/sso/exchange', (context) => platform.auth.sso.exchange(context as never))
}

export function registerProtectedRoutes(app: Hono, platform: Platform) {
  const db = platform.db
  const tickets = createTicketService(db, createNotificationService(db, platform.email))

  // —— 通用账户路由（允许临时密码阶段访问） ——
  app.get('/api/auth/me', async (context) => {
    const profile = await loadTicketUser(db, getAuthUser(context).id)
    if (!profile) return context.json(errorBody('FORBIDDEN', 'User has no company context in this application'), 403)
    return context.json({ user: toUserProfile(profile) })
  })
  app.post('/api/auth/password', async (context) => {
    const body = await readBody(context)
    let password: string
    try {
      password = requiredString(body.password, 'password', 256)
      if (password.length < 12) throw validation('Password must contain at least 12 characters')
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      return context.json(errorBody('INVALID_INPUT', error.message), 400)
    }
    const userId = getAuthUser(context).id
    if (!(await platform.auth.userStore.updatePassword(userId, platform.auth.hashPassword(password)))) return context.json(errorBody('NOT_FOUND', 'User not found'), 404)
    return context.json({ ok: true, passwordChangeRequired: false })
  })

  // —— 其余 API 一律需要公司上下文（公司隔离第一边界） ——
  const requireTicketUser: MiddlewareHandler = async (context, next) => {
    const user = await loadTicketUser(db, getAuthUser(context).id)
    if (!user) return context.json(errorBody('FORBIDDEN', 'User has no company context in this application'), 403)
    ;(context as unknown as { set(key: string, value: unknown): void }).set('ticketUser', user)
    await next()
  }
  app.use('/api/*', requireTicketUser)

  // —— 用户管理（userkit starter 路由 + 契约 §4.5 固定约束：company_admin 角色守卫与 user_profiles 同步） ——
  const guardCompanyAdmin: MiddlewareHandler = async (context, next) => {
    if (getTicketUser(context).role !== 'company_admin') return context.json(errorBody('FORBIDDEN', 'Company admin role is required'), 403)
    await next()
  }

  type AdminUserRow = {
    id: string
    name: string
    email: string
    phone: string | null
    enabled: number
    display_name: string
    department: string | null
    role: string
    company_name: string
  }
  const adminUserJson = (row: AdminUserRow, companyId: number) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    enabled: Boolean(row.enabled),
    displayName: row.display_name,
    department: row.department,
    role: row.role,
    companyId,
    companyName: row.company_name,
  })

  app.get('/api/admin/users', guardCompanyAdmin, (context) => handle(context, async () => {
    const me = getTicketUser(context)
    const search = (context.req.query('search') ?? '').trim().toLowerCase()
    const limit = Math.min(Math.max(Number(context.req.query('limit') ?? 50) || 50, 1), 100)
    const offset = Math.max(Number(context.req.query('offset') ?? 0) || 0, 0)
    const like = `%${search}%`
    const where = 'p.company_id = ? AND (lower(u.name) LIKE ? OR lower(u.email) LIKE ? OR lower(p.display_name) LIKE ?)'
    const params = [me.companyId, like, like, like]
    const [rows, total] = await Promise.all([
      db.queryAll<AdminUserRow>({
        text: `SELECT u.id, u.name, u.email, u.phone, u.enabled, p.display_name, p.department, p.role, c.name AS company_name
               FROM users u JOIN user_profiles p ON p.user_id = u.id JOIN companies c ON c.id = p.company_id
               WHERE ${where} ORDER BY u.name, u.id LIMIT ? OFFSET ?`,
        params: [...params, limit, offset],
      }),
      db.queryOne<{ total: number }>({
        text: `SELECT COUNT(*) AS total FROM users u JOIN user_profiles p ON p.user_id = u.id JOIN companies c ON c.id = p.company_id WHERE ${where}`,
        params,
      }),
    ])
    return { users: rows.map((row) => adminUserJson(row, me.companyId)), total: Number(total?.total ?? 0) }
  }))

  app.post('/api/admin/users', guardCompanyAdmin, async (context) => {
    const me = getTicketUser(context)
    const body = await readBody(context)
    let name: string
    let email: string
    let password: string
    let role: string
    try {
      name = requiredString(body.name, 'name')
      email = requiredString(body.email, 'email', 320).toLowerCase()
      password = requiredString(body.password, 'password', 256)
      if (!email.includes('@') || password.length < 12) throw validation('Enter a valid email and a password with at least 12 characters')
      role = typeof body.role === 'string' && body.role.trim() ? body.role.trim() : 'submitter'
      if (!ROLES.includes(role as Role)) throw validation('role must be one of submitter, agent, company_admin')
      if (body.companyId !== undefined && Number(body.companyId) !== me.companyId) throw validation('Users can only be created for your own company')
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      return context.json(errorBody('VALIDATION', error.message), 400)
    }
    const displayName = typeof body.displayName === 'string' && body.displayName.trim() ? body.displayName.trim() : name
    const department = typeof body.department === 'string' && body.department.trim() ? body.department.trim() : null
    try {
      const created = await platform.auth.userStore.create(
        { name, email, phone: typeof body.phone === 'string' ? body.phone : null, passwordChangeRequired: true },
        platform.auth.hashPassword(password),
      )
      await db.run({
        text: 'INSERT INTO user_profiles (user_id, display_name, email, company_id, department, role) VALUES (?, ?, ?, ?, ?, ?)',
        params: [created.id, displayName, email, me.companyId, department, role],
      })
      return context.json({ user: { id: created.id, name, email, phone: created.phone, enabled: true, displayName, department, role, companyId: me.companyId, companyName: me.companyName } }, 201)
    } catch (error) {
      const apiError = userMutationError(error)
      if (apiError) return context.json(errorBody(apiError.code, apiError.message), apiError.status)
      throw error
    }
  })

  app.patch('/api/admin/users/:id', guardCompanyAdmin, async (context) => {
    const me = getTicketUser(context)
    const userId = context.req.param('id')
    const body = await readBody(context)
    const profile = await db.queryOne<{ user_id: string }>({
      text: 'SELECT user_id FROM user_profiles WHERE user_id = ? AND company_id = ?',
      params: [userId, me.companyId],
    })
    if (!profile) return context.json(errorBody('NOT_FOUND', 'User not found'), 404)
    let name: string
    let email: string
    let role: string
    try {
      name = requiredString(body.name, 'name')
      email = requiredString(body.email, 'email', 320).toLowerCase()
      if (!email.includes('@')) throw validation('Enter a valid email address')
      role = typeof body.role === 'string' && body.role.trim() ? body.role.trim() : 'submitter'
      if (!ROLES.includes(role as Role)) throw validation('role must be one of submitter, agent, company_admin')
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      return context.json(errorBody('VALIDATION', error.message), 400)
    }
    const displayName = typeof body.displayName === 'string' && body.displayName.trim() ? body.displayName.trim() : name
    const department = typeof body.department === 'string' && body.department.trim() ? body.department.trim() : null
    try {
      const user = await platform.auth.userStore.update(userId, { name, email, phone: typeof body.phone === 'string' ? body.phone : null })
      if (!user) return context.json(errorBody('NOT_FOUND', 'User not found'), 404)
      await db.run({
        text: 'UPDATE user_profiles SET display_name = ?, email = ?, department = ?, role = ? WHERE user_id = ? AND company_id = ?',
        params: [displayName, email, department, role, userId, me.companyId],
      })
      return context.json({ user: { id: user.id, name: user.name, email: user.email, phone: user.phone, displayName, department, role, companyId: me.companyId, companyName: me.companyName } })
    } catch (error) {
      const apiError = userMutationError(error)
      if (apiError) return context.json(errorBody(apiError.code, apiError.message), apiError.status)
      throw error
    }
  })

  app.patch('/api/admin/users/:id/status', guardCompanyAdmin, async (context) => {
    const me = getTicketUser(context)
    const userId = context.req.param('id')
    const body = await readBody(context)
    if (typeof body.enabled !== 'boolean') return context.json(errorBody('VALIDATION', 'enabled must be a boolean'), 400)
    const profile = await db.queryOne<{ user_id: string }>({
      text: 'SELECT user_id FROM user_profiles WHERE user_id = ? AND company_id = ?',
      params: [userId, me.companyId],
    })
    if (!profile) return context.json(errorBody('NOT_FOUND', 'User not found'), 404)
    const changed = await db.transaction(async (tx) => {
      const result = await tx.run({ text: 'UPDATE users SET enabled = ?, updated_at = ? WHERE id = ?', params: [body.enabled ? 1 : 0, new Date().toISOString(), userId] })
      return result.changes === 1
    })
    if (!changed) return context.json(errorBody('NOT_FOUND', 'User not found'), 404)
    return context.json({ ok: true })
  })

  app.post('/api/admin/users/:id/password', guardCompanyAdmin, async (context) => {
    const me = getTicketUser(context)
    const userId = context.req.param('id')
    const body = await readBody(context)
    let password: string
    try {
      password = requiredString(body.password, 'password', 256)
      if (password.length < 12) throw validation('Password must contain at least 12 characters')
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      return context.json(errorBody('VALIDATION', error.message), 400)
    }
    const profile = await db.queryOne<{ user_id: string }>({
      text: 'SELECT user_id FROM user_profiles WHERE user_id = ? AND company_id = ?',
      params: [userId, me.companyId],
    })
    if (!profile) return context.json(errorBody('NOT_FOUND', 'User not found'), 404)
    if (!(await platform.auth.userStore.updatePassword(userId, platform.auth.hashPassword(password), true))) {
      return context.json(errorBody('NOT_FOUND', 'User not found'), 404)
    }
    return context.json({ ok: true })
  })

  // —— 工单域（契约 §4.2） ——
  app.post('/api/tickets', (context) => handle(context, async () => {
    const body = await readBody(context)
    const ticket = await tickets.createTicket(getTicketUser(context), {
      subject: body.subject as string,
      description: body.description as string,
      category: body.category as string,
      priority: body.priority as string,
    })
    return { ticket }
  }, 201))

  app.post('/api/tickets/:id/dispatch', (context) => handle(context, async () => {
    const ticket = await tickets.dispatchTicket(getTicketUser(context), parseTicketId(context))
    return { ticket }
  }))

  app.get('/api/tickets', (context) => handle(context, () => tickets.listTickets(getTicketUser(context), parseListQuery(context))))

  app.get('/api/tickets/:id', (context) => handle(context, () => tickets.getTicketDetail(getTicketUser(context), parseTicketId(context))))

  app.post('/api/tickets/:id/replies', (context) => handle(context, async () => {
    const body = await readBody(context)
    const reply = await tickets.addReply(getTicketUser(context), parseTicketId(context), body.content as string)
    return { reply }
  }, 201))

  app.post('/api/tickets/:id/transfer', (context) => handle(context, async () => {
    const body = await readBody(context)
    const targetGroupId = Number(body.targetGroupId)
    const ticket = await tickets.transferTicket(getTicketUser(context), parseTicketId(context), {
      targetGroupId,
      targetUserId: typeof body.targetUserId === 'string' ? body.targetUserId : null,
      reason: typeof body.reason === 'string' ? body.reason : null,
    })
    return { ticket }
  }))

  app.post('/api/tickets/:id/complete', (context) => handle(context, async () => {
    const body = await readBody(context)
    const result = await tickets.completeTicket(getTicketUser(context), parseTicketId(context), typeof body.resolution === 'string' ? body.resolution : null)
    return result
  }))

  app.post('/api/tickets/:id/cancel', (context) => handle(context, async () => {
    const body = await readBody(context)
    const ticket = await tickets.cancelTicket(getTicketUser(context), parseTicketId(context), typeof body.reason === 'string' ? body.reason : null)
    return { ticket }
  }))

  app.post('/api/tickets/:id/rating', (context) => handle(context, async () => {
    const body = await readBody(context)
    const rating = await tickets.rateTicket(getTicketUser(context), parseTicketId(context), Number(body.score), typeof body.comment === 'string' ? body.comment : null)
    return { rating }
  }, 201))

  app.get('/api/tickets/:id/activity', (context) => handle(context, async () => {
    const items = await tickets.listActivity(getTicketUser(context), parseTicketId(context))
    return { items }
  }))

  // —— 分配配置（契约 §4.3：变更操作限 company_admin；清单/规则读取对本公司登录用户开放，
  //     以支撑提交人创建工单的选择分类与处理人工作台筛选，公司隔离过滤不放宽） ——
  app.get('/api/groups', (context) => handle(context, async () => ({ items: await assignment.listGroups(db, getTicketUser(context).companyId) })))
  app.post('/api/groups', guardCompanyAdmin, (context) => handle(context, async () => {
    const body = await readBody(context)
    const group = await assignment.createGroup(db, getTicketUser(context).companyId, requiredString(body.name, 'name', 100))
    return { group }
  }, 201))
  app.put('/api/groups/:id/members', guardCompanyAdmin, (context) => handle(context, async () => {
    const body = await readBody(context)
    const groupId = Number(context.req.param('id'))
    if (!Number.isInteger(groupId) || groupId < 1) throw notFound('Group not found')
    const group = await assignment.setGroupMembers(db, getTicketUser(context).companyId, groupId, body.userIds as string[])
    return { group }
  }))
  app.delete('/api/groups/:id', guardCompanyAdmin, (context) => handleNoContent(context, async () => {
    const groupId = Number(context.req.param('id'))
    if (!Number.isInteger(groupId) || groupId < 1) throw notFound('Group not found')
    await assignment.deleteGroup(db, getTicketUser(context).companyId, groupId)
  }))

  app.get('/api/categories', (context) => handle(context, async () => ({ items: await assignment.listCategories(db, getTicketUser(context).companyId) })))
  app.post('/api/categories', guardCompanyAdmin, (context) => handle(context, async () => {
    const body = await readBody(context)
    const category = await assignment.addCategory(db, getTicketUser(context).companyId, requiredString(body.category, 'category', 50))
    return { category }
  }, 201))
  app.delete('/api/categories/:category', guardCompanyAdmin, (context) => handleNoContent(context, async () => {
    await assignment.deleteCategory(db, getTicketUser(context).companyId, decodeURIComponent(context.req.param('category')))
  }))

  app.get('/api/category-rules', (context) => handle(context, async () => ({ items: await assignment.listRules(db, getTicketUser(context).companyId) })))
  app.put('/api/category-rules/:category', guardCompanyAdmin, (context) => handle(context, async () => {
    const body = await readBody(context)
    const groupId = Number(body.groupId)
    if (!Number.isInteger(groupId) || groupId < 1) throw validation('groupId must be an integer')
    const rule = await assignment.upsertRule(db, getTicketUser(context).companyId, decodeURIComponent(context.req.param('category')), groupId)
    return { rule }
  }))
  app.delete('/api/category-rules/:category', guardCompanyAdmin, (context) => handleNoContent(context, async () => {
    await assignment.deleteRule(db, getTicketUser(context).companyId, decodeURIComponent(context.req.param('category')))
  }))

  // —— 统计（契约 §4.4：本公司登录用户） ——
  app.get('/api/stats/dashboard', (context) => handle(context, () => getDashboard(db, getTicketUser(context).companyId)))
  app.get('/api/stats/distribution', (context) => handle(context, () => getDistribution(db, getTicketUser(context).companyId, context.req.query('dimension') ?? 'department')))
}
