import { Hono, type Context } from 'hono'
import type { MiddlewareHandler } from 'hono'
import type { initializePlatform } from './platform/bootstrap'
import type { PlatformUser } from './platform/auth'
import { parseAuditPagination, parseOptionalId } from './platform/audit'
import { createIdentityService } from './services/identity'
import { createAssignmentService } from './services/assignment'
import { createTicketService } from './services/tickets'
import { createStatsService } from './services/stats'
import type { Actor } from './services/actor'
import { forbidden, validationFailed } from './api-error'
import { PRIORITIES, ROLES, TICKET_STATUSES, type Priority, type Role, type TicketStatus } from '../shared/tickets'

type Platform = Awaited<ReturnType<typeof initializePlatform>>

const errorBody = (code: string, message: string) => ({ error: { code, message } })
const currentUserOf = (context: Context): PlatformUser =>
  (context as unknown as { get(key: string): unknown }).get('currentUser') as PlatformUser
const actorOf = (context: Context): Actor => {
  const user = currentUserOf(context)
  return {
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    companyId: user.companyId,
    department: user.department,
    role: user.role,
  }
}
const bodyOf = async (context: Context): Promise<Record<string, unknown>> => {
  const value: unknown = await context.req.json().catch(() => ({}))
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

// 必填字符串：trim 后长度 [min, max]。
const requireString = (
  body: Record<string, unknown>,
  name: string,
  options: { min?: number; max: number } = { max: 200 },
): string => {
  const raw = body[name]
  if (raw == null) throw validationFailed(`${name} 为必填字段`)
  if (typeof raw !== 'string') throw validationFailed(`${name} 必须为字符串`)
  const value = raw.trim()
  const min = options.min ?? 1
  if (value.length < min || value.length > options.max) {
    throw validationFailed(`${name} 长度须在 ${min}-${options.max} 之间`)
  }
  return value
}

// 可选字符串：字段缺失 → undefined（保持不变）；null 或空串 → null（清空）。
const optionalString = (body: Record<string, unknown>, name: string, max: number): string | null | undefined => {
  if (!(name in body)) return undefined
  const raw = body[name]
  if (raw == null) return null
  if (typeof raw !== 'string') throw validationFailed(`${name} 必须为字符串`)
  const value = raw.trim()
  if (value.length > max) throw validationFailed(`${name} 长度不得超过 ${max}`)
  return value === '' ? null : value
}
const requireInt = (body: Record<string, unknown>, name: string): number => {
  const raw = body[name]
  if (raw == null) throw validationFailed(`${name} 为必填字段`)
  if (typeof raw !== 'number' || !Number.isInteger(raw)) throw validationFailed(`${name} 必须为整数`)
  return raw
}
const optionalInt = (body: Record<string, unknown>, name: string): number | null => {
  const raw = body[name]
  if (raw == null) return null
  if (typeof raw !== 'number' || !Number.isInteger(raw)) throw validationFailed(`${name} 必须为整数`)
  return raw
}
const requireRole = (raw: unknown, name: string): Role => {
  if (typeof raw !== 'string' || !(ROLES as readonly string[]).includes(raw)) {
    throw validationFailed(`${name} 必须为 submitter/handler/ops 之一`)
  }
  return raw as Role
}
const requirePriority = (raw: unknown, name: string): Priority => {
  if (typeof raw !== 'string' || !(PRIORITIES as readonly string[]).includes(raw)) {
    throw validationFailed(`${name} 必须为 P0-P4 之一`)
  }
  return raw as Priority
}
const requirePassword = (body: Record<string, unknown>, name: string, minLength: number): string => {
  const raw = body[name]
  if (typeof raw !== 'string' || raw.length < minLength) throw validationFailed(`${name} 长度不得少于 ${minLength} 位`)
  return raw
}
// 可选用户 ID：userkit 平台用户主键为 TEXT(UUID)。
const optionalUserId = (body: Record<string, unknown>, name: string): string | null => {
  const raw = body[name]
  if (raw == null) return null
  if (typeof raw !== 'string' || raw.trim() === '') throw validationFailed(`${name} 必须为用户 ID`)
  return raw.trim()
}
const intQuery = (context: Context, name: string, options: { required?: boolean } = {}): number | null => {
  const raw = context.req.query(name)
  if (raw == null || raw === '') {
    if (options.required) throw validationFailed(`${name} 为必填参数`)
    return null
  }
  const value = Number(raw)
  if (!Number.isInteger(value)) throw validationFailed(`${name} 必须为整数`)
  return value
}

export function registerPublicRoutes(app: Hono, platform: Platform) {
  app.get('/api/auth/bootstrap-status', async (context) => context.json({ required: (await platform.auth.userStore.count()) === 0 }))

  // 首个账户初始化遵循 starter 生成流程；同一事务内创建初始公司与 ops 档案，
  // 保证首个账户具备完整的公司/角色数据域（契约第 4 节）。
  app.post('/api/auth/bootstrap', platform.auth.loginRateLimit, async (context) => {
    const body = await bodyOf(context)
    let name: string
    let email: string
    let password: string
    try {
      name = requireString(body, 'name', { max: 100 })
      email = requireString(body, 'email', { max: 320 }).toLowerCase()
      password = requireString(body, 'password', { max: 256 })
      if (!email.includes('@') || password.length < 12) {
        throw new TypeError('Enter a valid email and a password with at least 12 characters')
      }
    } catch (error) {
      return context.json(errorBody('VALIDATION_FAILED', error instanceof Error ? error.message : 'Invalid input'), 400)
    }
    const { randomUUID } = await import('node:crypto')
    const userId = randomUUID()
    const passwordHash = platform.auth.hashPassword(password)
    try {
      await platform.db.transaction(async (tx) => {
        const count = await tx.queryOne<{ total: number }>({ text: 'SELECT COUNT(*) AS total FROM users' })
        if (Number(count?.total ?? 0) !== 0) throw new Error('BOOTSTRAP_CLOSED')
        const timestamp = new Date().toISOString()
        await tx.run({ text: "INSERT INTO companies (name, created_at) VALUES ('初始公司', ?)", params: [timestamp] })
        const company = await tx.queryOne<{ id: number }>({ text: 'SELECT last_insert_rowid() AS id' })
        await tx.run({
          text: 'INSERT INTO users (id, name, email, phone, enabled, company_id, password_hash, password_change_required, created_at, updated_at) VALUES (?, ?, ?, NULL, 1, NULL, ?, 0, ?, ?)',
          params: [userId, name, email, passwordHash, timestamp, timestamp],
        })
        await tx.run({
          text: "INSERT INTO user_profiles (user_id, company_id, display_name, department, role, created_at, updated_at) VALUES (?, ?, ?, NULL, 'ops', ?, ?)",
          params: [userId, company?.id ?? 0, name, timestamp, timestamp],
        })
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'BOOTSTRAP_CLOSED') {
        return context.json(errorBody('BOOTSTRAP_CLOSED', 'An account already exists'), 409)
      }
      console.error('[bootstrap] failed', error)
      return context.json(errorBody('BOOTSTRAP_FAILED', 'Could not create the first account'), 500)
    }
    return context.json({ ok: true }, 201)
  })

  app.post('/api/auth/login', platform.auth.loginRateLimit, platform.auth.loginRoute as MiddlewareHandler)
  app.get('/api/auth/sso/start', (context) => platform.auth.sso.start(context))
  app.get('/api/auth/sso/callback', (context) => platform.auth.sso.callback(context))
  app.post('/api/auth/sso/exchange', (context) => platform.auth.sso.exchange(context))
}

export function registerProtectedRoutes(app: Hono, platform: Platform) {
  const identity = createIdentityService(platform.db, { hashPassword: platform.auth.hashPassword })
  const assignment = createAssignmentService(platform.db)
  const tickets = createTicketService(platform.db, { audit: platform.audit, notify: platform.email })
  const stats = createStatsService(platform.db)

  // ---- 认证与当前用户（契约第 4 节）----

  app.get('/api/auth/me', (context) => {
    const user = currentUserOf(context)
    return context.json({
      id: user.id,
      email: user.email,
      display_name: user.displayName,
      company_id: user.companyId,
      department: user.department,
      role: user.role,
    })
  })
  app.post('/api/auth/logout', (context) => context.body(null, 204))
  app.post('/api/auth/password', async (context) => {
    const body = await bodyOf(context)
    let password: string
    try {
      password = requireString(body, 'password', { max: 256 })
      if (password.length < 12) throw new TypeError('Password must contain at least 12 characters')
    } catch (error) {
      return context.json(errorBody('VALIDATION_FAILED', error instanceof Error ? error.message : 'Invalid password'), 400)
    }
    const userId = currentUserOf(context).id
    if (!(await platform.auth.userStore.updatePassword(userId, platform.auth.hashPassword(password)))) {
      return context.json(errorBody('NOT_FOUND', 'User not found'), 404)
    }
    return context.json({ ok: true, passwordChangeRequired: false })
  })

  // ---- 管理端：公司与用户档案（契约第 5 节，仅 ops，其他角色 403）----

  app.get('/api/admin/companies', async (context) => context.json({ items: await identity.listCompanies(actorOf(context)) }))
  app.post('/api/admin/companies', async (context) => {
    const actor = actorOf(context)
    const body = await bodyOf(context)
    const name = requireString(body, 'name', { max: 100 })
    return context.json(await identity.createCompany(actor, name), 201)
  })
  app.get('/api/admin/users', async (context) => {
    const actor = actorOf(context)
    const companyId = intQuery(context, 'company_id', { required: true })
    if (companyId == null) throw validationFailed('company_id 为必填参数')
    return context.json({ items: await identity.listAdminUsers(actor, companyId) })
  })
  app.post('/api/admin/users', async (context) => {
    const actor = actorOf(context)
    const body = await bodyOf(context)
    const email = requireString(body, 'email', { max: 320 }).toLowerCase()
    if (!email.includes('@')) throw validationFailed('email 格式不正确')
    const password = requirePassword(body, 'password', 8)
    const displayName = requireString(body, 'display_name', { max: 100 })
    const companyId = requireInt(body, 'company_id')
    const department = optionalString(body, 'department', 100) ?? null
    const role = requireRole(body.role, 'role')
    return context.json(await identity.createAdminUser(actor, { email, password, displayName, companyId, department, role }), 201)
  })
  app.patch('/api/admin/users/:user_id', async (context) => {
    const actor = actorOf(context)
    const body = await bodyOf(context)
    if ('company_id' in body) throw validationFailed('company_id 不可变更')
    const displayName = 'display_name' in body ? requireString(body, 'display_name', { max: 100 }) : undefined
    const department = optionalString(body, 'department', 100)
    const role = 'role' in body ? requireRole(body.role, 'role') : undefined
    return context.json(await identity.patchAdminUser(actor, context.req.param('user_id'), { displayName, department, role }))
  })

  // ---- 业务组与成员（契约第 6 节）----

  app.get('/api/business-groups', async (context) => {
    const actor = actorOf(context)
    const companyId = intQuery(context, 'company_id', { required: true })
    if (companyId == null) throw validationFailed('company_id 为必填参数')
    return context.json({ items: await assignment.listBusinessGroups(actor, companyId) })
  })
  app.post('/api/business-groups', async (context) => {
    const actor = actorOf(context)
    const body = await bodyOf(context)
    const companyId = requireInt(body, 'company_id')
    const name = requireString(body, 'name', { max: 100 })
    return context.json(await assignment.createBusinessGroup(actor, companyId, name), 201)
  })
  app.patch('/api/business-groups/:id', async (context) => {
    const actor = actorOf(context)
    const body = await bodyOf(context)
    const name = requireString(body, 'name', { max: 100 })
    return context.json(await assignment.patchBusinessGroup(actor, Number(context.req.param('id')), name))
  })
  app.delete('/api/business-groups/:id', async (context) => {
    await assignment.deleteBusinessGroup(actorOf(context), Number(context.req.param('id')))
    return context.body(null, 204)
  })
  app.post('/api/business-groups/:id/members', async (context) => {
    const actor = actorOf(context)
    const body = await bodyOf(context)
    const rawUserId = body.user_id
    if (typeof rawUserId !== 'string' || rawUserId === '') throw validationFailed('user_id 为必填字段')
    return context.json(await assignment.addGroupMember(actor, Number(context.req.param('id')), rawUserId), 201)
  })
  app.delete('/api/business-groups/:id/members/:user_id', async (context) => {
    await assignment.removeGroupMember(actorOf(context), Number(context.req.param('id')), context.req.param('user_id'))
    return context.body(null, 204)
  })

  // ---- 分配规则（契约第 6 节）----

  app.get('/api/assignment-rules', async (context) => {
    const actor = actorOf(context)
    const companyId = intQuery(context, 'company_id', { required: true })
    if (companyId == null) throw validationFailed('company_id 为必填参数')
    return context.json({ items: await assignment.listAssignmentRules(actor, companyId) })
  })
  app.put('/api/assignment-rules', async (context) => {
    const actor = actorOf(context)
    const body = await bodyOf(context)
    const companyId = requireInt(body, 'company_id')
    const category = requireString(body, 'category', { max: 50 })
    const groupId = requireInt(body, 'group_id')
    const { created, rule } = await assignment.putAssignmentRule(actor, { companyId, category, groupId })
    return context.json(rule, created ? 201 : 200)
  })
  app.delete('/api/assignment-rules/:id', async (context) => {
    await assignment.deleteAssignmentRule(actorOf(context), Number(context.req.param('id')))
    return context.body(null, 204)
  })

  // ---- 工单（契约第 7 节）----

  app.post('/api/tickets', async (context) => {
    const actor = actorOf(context)
    const body = await bodyOf(context)
    const subject = requireString(body, 'subject', { max: 200 })
    const description = requireString(body, 'description', { max: 5000 })
    const category = requireString(body, 'category', { max: 50 })
    const priority = requirePriority(body.priority, 'priority')
    return context.json(await tickets.createTicket(actor, { subject, description, category, priority }), 201)
  })

  app.get('/api/tickets', async (context) => {
    const actor = actorOf(context)
    const searchParams = new URL(context.req.url).searchParams
    const scope = searchParams.get('scope') ?? 'mine'
    if (scope !== 'mine' && scope !== 'workbench') throw validationFailed('scope 必须为 mine 或 workbench')
    const rawCompanyId = intQuery(context, 'company_id')
    // 非 ops 传入 company_id → 403（明确拒绝越域筛选，不静默忽略，契约 7.2）。
    if (rawCompanyId != null && actor.role !== 'ops') throw forbidden('仅运营可按公司筛选')
    if (scope === 'workbench' && actor.role === 'submitter') throw forbidden('提交人无权访问工作台')
    let statuses: TicketStatus[] | null = null
    const rawStatus = context.req.query('status')
    if (rawStatus != null && rawStatus !== '') {
      const values = rawStatus.split(',').map((value) => value.trim()).filter((value) => value !== '')
      const invalid = values.find((value) => !(TICKET_STATUSES as readonly string[]).includes(value))
      if (invalid) throw validationFailed(`status 含非法值：${invalid}`)
      statuses = values as TicketStatus[]
    }
    // scope=workbench 默认 in_progress（契约 7.2）。
    if (scope === 'workbench' && statuses === null) statuses = ['in_progress']
    const rawPriority = context.req.query('priority')
    if (rawPriority != null && rawPriority !== '' && !(PRIORITIES as readonly string[]).includes(rawPriority)) {
      throw validationFailed('priority 必须为 P0-P4 之一')
    }
    const sort = searchParams.get('sort') ?? 'created_at'
    if (sort !== 'created_at' && sort !== 'priority') throw validationFailed('sort 必须为 created_at 或 priority')
    const order = searchParams.get('order') ?? 'desc'
    if (order !== 'asc' && order !== 'desc') throw validationFailed('order 必须为 asc 或 desc')
    const page = Math.max(1, Math.trunc(Number(searchParams.get('page') ?? '1')) || 1)
    const pageSize = Math.min(100, Math.max(1, Math.trunc(Number(searchParams.get('page_size') ?? '20')) || 20))
    return context.json(
      await tickets.listTickets(actor, {
        scope,
        statuses,
        category: context.req.query('category') || null,
        priority: (rawPriority || null) as Priority | null,
        companyId: rawCompanyId,
        search: context.req.query('q') || null,
        sort,
        order,
        page,
        pageSize,
      }),
    )
  })

  const ticketIdOf = (context: Context): number => {
    const value = Number(context.req.param('id'))
    if (!Number.isInteger(value) || value < 1) throw validationFailed('工单 ID 必须为正整数')
    return value
  }

  app.get('/api/tickets/:id', async (context) => context.json(await tickets.getTicketDetail(actorOf(context), ticketIdOf(context))))
  // 可见性预检先于请求体验证（契约第 5 节：公司隔离 404 不泄露存在性）。
  app.post('/api/tickets/:id/replies', async (context) => {
    await tickets.requireTicketScope(actorOf(context), ticketIdOf(context))
    const body = await bodyOf(context)
    const content = requireString(body, 'content', { max: 5000 })
    return context.json(await tickets.replyTicket(actorOf(context), ticketIdOf(context), { content }), 201)
  })
  app.post('/api/tickets/:id/assign', async (context) => {
    await tickets.requireTicketScope(actorOf(context), ticketIdOf(context))
    const body = await bodyOf(context)
    const groupId = requireInt(body, 'group_id')
    const handlerId = optionalUserId(body, 'handler_id')
    return context.json(await tickets.assignTicket(actorOf(context), ticketIdOf(context), { groupId, handlerId }))
  })
  app.post('/api/tickets/:id/transfer', async (context) => {
    await tickets.requireTicketScope(actorOf(context), ticketIdOf(context))
    const body = await bodyOf(context)
    const toGroupId = requireInt(body, 'to_group_id')
    const toHandlerId = optionalUserId(body, 'to_handler_id')
    const reason = optionalString(body, 'reason', 500) ?? null
    return context.json(await tickets.transferTicket(actorOf(context), ticketIdOf(context), { toGroupId, toHandlerId, reason }))
  })
  app.post('/api/tickets/:id/complete', async (context) => {
    await tickets.requireTicketScope(actorOf(context), ticketIdOf(context))
    const body = await bodyOf(context)
    const resolution = optionalString(body, 'resolution', 2000) ?? null
    return context.json(await tickets.completeTicket(actorOf(context), ticketIdOf(context), { resolution }))
  })
  app.post('/api/tickets/:id/cancel', async (context) => {
    await tickets.requireTicketScope(actorOf(context), ticketIdOf(context))
    const body = await bodyOf(context)
    const reason = optionalString(body, 'reason', 500) ?? null
    return context.json(await tickets.cancelTicket(actorOf(context), ticketIdOf(context), { reason }))
  })
  app.post('/api/tickets/:id/rating', async (context) => {
    await tickets.requireTicketScope(actorOf(context), ticketIdOf(context))
    const body = await bodyOf(context)
    const score = requireInt(body, 'score')
    if (score < 1 || score > 5) throw validationFailed('score 必须为 1-5')
    const comment = optionalString(body, 'comment', 1000) ?? null
    return context.json(await tickets.rateTicket(actorOf(context), ticketIdOf(context), { score, comment }), 201)
  })
  app.get('/api/tickets/:id/submitter', async (context) => context.json(await tickets.getSubmitterView(actorOf(context), ticketIdOf(context))))

  // ---- 统计（契约第 8 节）----

  app.get('/api/statistics/distribution', async (context) => {
    const actor = actorOf(context)
    const dimension = context.req.query('dimension')
    if (dimension !== 'company' && dimension !== 'department') throw validationFailed('dimension 必须为 company 或 department')
    const companyId = intQuery(context, 'company_id')
    // ops 全量或按公司过滤；handler 本公司（传入须等于本公司，否则 403）；submitter 403。
    if (actor.role === 'submitter') throw forbidden('无权查看统计数据')
    if (actor.role === 'handler' && companyId != null && companyId !== actor.companyId) {
      throw forbidden('无权查看其他公司的统计数据')
    }
    return context.json(await stats.distribution(actor, dimension, companyId))
  })
  app.get('/api/statistics/dashboard', async (context) => {
    const actor = actorOf(context)
    const companyId = intQuery(context, 'company_id')
    if (actor.role === 'submitter') throw forbidden('无权查看统计数据')
    if (actor.role === 'handler' && companyId != null && companyId !== actor.companyId) {
      throw forbidden('无权查看其他公司的统计数据')
    }
    return context.json(await stats.dashboard(actor, companyId))
  })

  // ---- 审计检索（契约第 9.1 节）----

  app.get('/api/audit-events', async (context) => {
    const actor = actorOf(context)
    if (actor.role === 'submitter') throw forbidden('无权查看审计日志')
    const searchParams = new URL(context.req.url).searchParams
    let companyId = parseOptionalId(searchParams, 'company_id')
    // handler 强制本公司（契约 9.1）；传入其他公司 → 403。
    if (actor.role === 'handler') {
      if (companyId != null && companyId !== actor.companyId) throw forbidden('无权查看其他公司的审计日志')
      companyId = actor.companyId
    }
    const ticketId = parseOptionalId(searchParams, 'ticket_id')
    const action = context.req.query('action') || null
    const { page, pageSize } = parseAuditPagination(searchParams)
    return context.json(await platform.audit.list({ ticketId, companyId, action, page, pageSize }))
  })
}
