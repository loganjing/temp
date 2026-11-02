import { randomUUID } from 'node:crypto'
import type { Hono, MiddlewareHandler } from 'hono'
import type { initializePlatform } from './platform/bootstrap'
import type { AuthUser } from '@commonapp/userkit'
import type { SLAPriority, TransferTargetType } from '../shared/types'
import { currentUser, requireCompanyBound, requireCompanyMatch, requireRole, type TicketUser } from './middleware'
import * as svc from './services'
import type { ServiceContext } from './services'

type Platform = Awaited<ReturnType<typeof initializePlatform>>
const errorBody = (code: string, message: string) => ({ error: { code, message } })
const currentUserId = (context: unknown) => ((context as { get(name: string): unknown }).get('currentUser') as AuthUser).id
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

const SLA_VALUES = ['P0', 'P1', 'P2', 'P3', 'P4']
const TRANSFER_TARGETS = ['user', 'group']

function serviceContext(platform: Platform): ServiceContext {
  return { db: platform.db, audit: platform.audit, emailClient: platform.emailClient }
}

/** 将 ServiceError 转为 HTTP 响应；非 ServiceError 返回 null 由全局 onError 处理。 */
function handleServiceError(error: unknown): Response | null {
  if (error instanceof svc.ServiceError) {
    return new Response(JSON.stringify(errorBody(error.code, error.message)), { status: error.status, headers: { 'content-type': 'application/json' } })
  }
  return null
}

/** 包装业务处理函数，统一捕获 ServiceError。 */
async function handle<T>(fn: () => Promise<T>): Promise<T | Response> {
  try {
    return await fn()
  } catch (error) {
    const res = handleServiceError(error)
    if (res) return res
    throw error
  }
}

function parsePagination(context: { req: { query: (key: string) => string | undefined } }) {
  return {
    page: Number(context.req.query('page') ?? 1),
    pageSize: Number(context.req.query('pageSize') ?? 20),
  }
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
  const ctx = serviceContext(platform)

  /* ---------- 认证与用户信息 ---------- */
  app.get('/api/auth/me', async (context) => {
    const user = currentUser(context)
    const info = await svc.getUserInfo(ctx, user)
    return context.json({ ...info, passwordChangeRequired: user.passwordChangeRequired })
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
      // 设置工单系统角色（默认 submitter）
      const role = typeof body.role === 'string' && ['submitter', 'handler', 'admin'].includes(body.role) ? body.role : 'submitter'
      await platform.db.run({ text: 'UPDATE users SET role = ? WHERE id = ?', params: [role, user.id] })
      if (typeof body.companyId === 'string' && body.companyId) await platform.db.run({ text: 'UPDATE users SET company_id = ? WHERE id = ?', params: [body.companyId, user.id] })
      if (typeof body.departmentId === 'string' && body.departmentId) await platform.db.run({ text: 'UPDATE users SET department_id = ? WHERE id = ?', params: [body.departmentId, user.id] })
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

  /* ---------- 工单 ---------- */
  app.use('/api/tickets/*', requireCompanyBound)
  app.use('/api/tickets', requireCompanyBound)

  app.post('/api/tickets', requireRole('submitter', 'admin'), async (context) => {
    const body = await context.req.json().catch(() => ({}))
    try {
      const title = requiredString(body.title, 'title')
      const description = requiredString(body.description, 'description')
      const categoryId = requiredString(body.categoryId, 'categoryId')
      const slaPriority = body.slaPriority
      if (!SLA_VALUES.includes(slaPriority)) throw new TypeError('slaPriority must be one of P0-P4')
      const result = await handle(() => svc.createTicket(ctx, currentUser(context), { title, description, categoryId, slaPriority: slaPriority as SLAPriority }))
      if (result instanceof Response) return result
      return context.json(result, 201)
    } catch (error) {
      return context.json(errorBody('INVALID_INPUT', error instanceof Error ? error.message : 'Invalid input'), 400)
    }
  })

  app.get('/api/tickets', async (context) => {
    const result = await handle(() => svc.listTickets(ctx, currentUser(context), {
      ...parsePagination(context),
      status: context.req.query('status'),
      slaPriority: context.req.query('slaPriority'),
      categoryId: context.req.query('categoryId'),
      keyword: context.req.query('keyword'),
      sortBy: context.req.query('sortBy'),
      sortOrder: context.req.query('sortOrder'),
    }))
    if (result instanceof Response) return result
    return context.json(result)
  })

  app.get('/api/tickets/:id', async (context) => {
    const result = await handle(() => svc.getTicket(ctx, currentUser(context), context.req.param('id')))
    if (result instanceof Response) return result
    if (!result) return context.json(errorBody('NOT_FOUND', 'Ticket not found'), 404)
    return context.json(result)
  })

  app.put('/api/tickets/:id', async (context) => {
    const body = await context.req.json().catch(() => ({}))
    try {
      const input: { title?: string; description?: string; categoryId?: string; slaPriority?: SLAPriority } = {}
      if (body.title !== undefined) input.title = requiredString(body.title, 'title')
      if (body.description !== undefined) input.description = requiredString(body.description, 'description')
      if (body.categoryId !== undefined) input.categoryId = requiredString(body.categoryId, 'categoryId')
      if (body.slaPriority !== undefined) {
        if (!SLA_VALUES.includes(body.slaPriority)) throw new TypeError('slaPriority must be one of P0-P4')
        input.slaPriority = body.slaPriority as SLAPriority
      }
      const result = await handle(() => svc.updateTicket(ctx, currentUser(context), context.req.param('id'), input))
      if (result instanceof Response) return result
      return context.json(result)
    } catch (error) {
      return context.json(errorBody('INVALID_INPUT', error instanceof Error ? error.message : 'Invalid input'), 400)
    }
  })

  app.post('/api/tickets/:id/replies', async (context) => {
    const body = await context.req.json().catch(() => ({}))
    try {
      const content = requiredString(body.content, 'content', 10000)
      const result = await handle(() => svc.addReply(ctx, currentUser(context), context.req.param('id'), content))
      if (result instanceof Response) return result
      return context.json(result, 201)
    } catch (error) {
      return context.json(errorBody('INVALID_INPUT', error instanceof Error ? error.message : 'Invalid input'), 400)
    }
  })

  app.get('/api/tickets/:id/replies', async (context) => {
    const result = await handle(() => svc.listReplies(ctx, currentUser(context), context.req.param('id')))
    if (result instanceof Response) return result
    return context.json(result)
  })

  app.post('/api/tickets/:id/assign', requireRole('admin', 'handler'), async (context) => {
    const body = await context.req.json().catch(() => ({}))
    try {
      const targetType = body.targetType
      if (!TRANSFER_TARGETS.includes(targetType)) throw new TypeError('targetType must be user or group')
      const result = await handle(() => svc.assignTicket(ctx, currentUser(context), context.req.param('id'), {
        targetType: targetType as TransferTargetType,
        targetUserId: typeof body.targetUserId === 'string' ? body.targetUserId : undefined,
        targetGroupId: typeof body.targetGroupId === 'string' ? body.targetGroupId : undefined,
      }))
      if (result instanceof Response) return result
      return context.json(result)
    } catch (error) {
      return context.json(errorBody('INVALID_INPUT', error instanceof Error ? error.message : 'Invalid input'), 400)
    }
  })

  app.post('/api/tickets/:id/transfer', requireRole('handler'), async (context) => {
    const body = await context.req.json().catch(() => ({}))
    try {
      const targetType = body.targetType
      if (!TRANSFER_TARGETS.includes(targetType)) throw new TypeError('targetType must be user or group')
      const result = await handle(() => svc.transferTicket(ctx, currentUser(context), context.req.param('id'), {
        targetType: targetType as TransferTargetType,
        targetUserId: typeof body.targetUserId === 'string' ? body.targetUserId : undefined,
        targetGroupId: typeof body.targetGroupId === 'string' ? body.targetGroupId : undefined,
        reason: typeof body.reason === 'string' ? body.reason : undefined,
      }))
      if (result instanceof Response) return result
      return context.json(result)
    } catch (error) {
      return context.json(errorBody('INVALID_INPUT', error instanceof Error ? error.message : 'Invalid input'), 400)
    }
  })

  app.post('/api/tickets/:id/complete', requireRole('handler'), async (context) => {
    const body = await context.req.json().catch(() => ({}))
    const result = await handle(() => svc.completeTicket(ctx, currentUser(context), context.req.param('id'), typeof body.summary === 'string' ? body.summary : undefined))
    if (result instanceof Response) return result
    return context.json(result)
  })

  app.post('/api/tickets/:id/cancel', async (context) => {
    const body = await context.req.json().catch(() => ({}))
    const result = await handle(() => svc.cancelTicket(ctx, currentUser(context), context.req.param('id'), typeof body.reason === 'string' ? body.reason : undefined))
    if (result instanceof Response) return result
    return context.json(result)
  })

  app.get('/api/tickets/:id/submitter-info', requireRole('handler', 'admin'), async (context) => {
    const result = await handle(() => svc.getSubmitterInfo(ctx, currentUser(context), context.req.param('id')))
    if (result instanceof Response) return result
    return context.json(result)
  })

  app.get('/api/tickets/:id/logs', async (context) => {
    const result = await handle(() => svc.listOperationLogs(ctx, currentUser(context), context.req.param('id')))
    if (result instanceof Response) return result
    return context.json(result)
  })

  app.get('/api/tickets/:id/evaluation', async (context) => {
    const result = await handle(() => svc.getEvaluation(ctx, currentUser(context), context.req.param('id')))
    if (result instanceof Response) return result
    if (!result) return context.json(errorBody('NOT_FOUND', 'No evaluation'), 404)
    return context.json(result)
  })

  app.post('/api/tickets/:id/evaluation', async (context) => {
    const body = await context.req.json().catch(() => ({}))
    const rating = Number(body.rating)
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return context.json(errorBody('INVALID_INPUT', 'rating must be an integer between 1 and 5'), 400)
    const result = await handle(() => svc.createEvaluation(ctx, currentUser(context), context.req.param('id'), rating, typeof body.comment === 'string' ? body.comment : undefined))
    if (result instanceof Response) return result
    return context.json(result, 201)
  })

  /* ---------- 业务组与成员（公司隔离：:companyId 须匹配） ---------- */
  app.use('/api/companies/:companyId/*', requireCompanyMatch)

  app.get('/api/companies/:companyId/groups', async (context) => {
    const result = await handle(() => svc.listGroups(ctx, context.req.param('companyId')))
    if (result instanceof Response) return result
    return context.json(result)
  })

  app.post('/api/companies/:companyId/groups', requireRole('admin'), async (context) => {
    const body = await context.req.json().catch(() => ({}))
    try {
      const name = requiredString(body.name, 'name')
      const result = await handle(() => svc.createGroup(ctx, context.req.param('companyId'), name))
      if (result instanceof Response) return result
      return context.json(result, 201)
    } catch (error) {
      return context.json(errorBody('INVALID_INPUT', error instanceof Error ? error.message : 'Invalid input'), 400)
    }
  })

  app.get('/api/companies/:companyId/groups/:groupId/members', async (context) => {
    const result = await handle(() => svc.listMembers(ctx, context.req.param('groupId')))
    if (result instanceof Response) return result
    return context.json(result)
  })

  app.post('/api/companies/:companyId/groups/:groupId/members', requireRole('admin'), async (context) => {
    const body = await context.req.json().catch(() => ({}))
    const userId = typeof body.userId === 'string' && body.userId.trim() ? body.userId.trim() : null
    if (!userId) return context.json(errorBody('INVALID_INPUT', 'userId is required'), 400)
    const result = await handle(() => svc.addMember(ctx, context.req.param('groupId'), userId))
    if (result instanceof Response) return result
    return context.json(result, 201)
  })

  app.delete('/api/companies/:companyId/groups/:groupId/members/:userId', requireRole('admin'), async (context) => {
    const removed = await handle(() => svc.removeMember(ctx, context.req.param('groupId'), context.req.param('userId')))
    if (removed instanceof Response) return removed
    if (!removed) return context.json(errorBody('NOT_FOUND', 'Member not found'), 404)
    return context.json({ success: true })
  })

  /* ---------- 自动分配规则 ---------- */
  app.get('/api/companies/:companyId/auto-assign-rules', requireRole('admin'), async (context) => {
    const result = await handle(() => svc.listAutoAssignRules(ctx, context.req.param('companyId')))
    if (result instanceof Response) return result
    return context.json(result)
  })

  app.post('/api/companies/:companyId/auto-assign-rules', requireRole('admin'), async (context) => {
    const body = await context.req.json().catch(() => ({}))
    try {
      const categoryId = requiredString(body.categoryId, 'categoryId')
      const targetGroupId = requiredString(body.targetGroupId, 'targetGroupId')
      const result = await handle(() => svc.createAutoAssignRule(ctx, context.req.param('companyId'), categoryId, targetGroupId))
      if (result instanceof Response) return result
      return context.json(result, 201)
    } catch (error) {
      return context.json(errorBody('INVALID_INPUT', error instanceof Error ? error.message : 'Invalid input'), 400)
    }
  })

  /* ---------- 问题分类 ---------- */
  app.get('/api/companies/:companyId/categories', async (context) => {
    const result = await handle(() => svc.listCategories(ctx, context.req.param('companyId')))
    if (result instanceof Response) return result
    return context.json(result)
  })

  app.post('/api/companies/:companyId/categories', requireRole('admin'), async (context) => {
    const body = await context.req.json().catch(() => ({}))
    try {
      const name = requiredString(body.name, 'name')
      const result = await handle(() => svc.createCategory(ctx, context.req.param('companyId'), name))
      if (result instanceof Response) return result
      return context.json(result, 201)
    } catch (error) {
      return context.json(errorBody('INVALID_INPUT', error instanceof Error ? error.message : 'Invalid input'), 400)
    }
  })

  /* ---------- 统计分析 ---------- */
  app.get('/api/statistics/distribution', requireRole('admin'), async (context) => {
    const dimension = context.req.query('dimension')
    if (dimension !== 'company' && dimension !== 'department') return context.json(errorBody('INVALID_INPUT', 'dimension must be company or department'), 400)
    const result = await handle(() => svc.distribution(ctx, currentUser(context), dimension))
    if (result instanceof Response) return result
    return context.json(result)
  })

  app.get('/api/statistics/dashboard', requireRole('admin'), async (context) => {
    const companyId = context.req.query('companyId') ?? currentUser(context).companyId!
    const result = await handle(() => svc.dashboard(ctx, companyId))
    if (result instanceof Response) return result
    return context.json(result)
  })

  /* ---------- 工作台 ---------- */
  app.get('/api/workbench/tickets', requireRole('handler', 'admin'), async (context) => {
    const result = await handle(() => svc.workbench(ctx, currentUser(context), {
      ...parsePagination(context),
      status: context.req.query('status'),
      slaPriority: context.req.query('slaPriority'),
      categoryId: context.req.query('categoryId'),
      companyId: context.req.query('companyId'),
      keyword: context.req.query('keyword'),
      sortBy: context.req.query('sortBy'),
      sortOrder: context.req.query('sortOrder'),
    }))
    if (result instanceof Response) return result
    return context.json(result)
  })
}
