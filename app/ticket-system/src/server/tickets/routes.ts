import type { Context, Hono } from 'hono'
import type { initializePlatform } from '../platform/bootstrap'
import { SLA_PRIORITIES, type TicketListQuery } from './repository'
import { createTicketService, ApiError, type TicketActor } from './service'
import { asHandler } from './http'

type Platform = Awaited<ReturnType<typeof initializePlatform>>

const currentUserId = (context: Context): string => {
  const user = (context as unknown as { get(key: string): { id?: string } | undefined }).get('currentUser')
  if (!user?.id) throw new ApiError(401, 'NOT_AUTHENTICATED', 'Authentication required')
  return user.id
}

const bodyOf = async (context: Context): Promise<Record<string, unknown>> => {
  const body = await context.req.json().catch(() => ({}))
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'INVALID_INPUT', 'A JSON object body is required')
  }
  return body as Record<string, unknown>
}

const requiredString = (value: unknown, name: string, maxLength = 200): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new ApiError(400, 'INVALID_INPUT', `${name} is required`)
  }
  return value.trim()
}

const optionalText = (value: unknown, name: string, maxLength = 4000): string | null => {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || value.length > maxLength) throw new ApiError(400, 'INVALID_INPUT', `${name} must be a string`)
  return value.trim() || null
}

const requiredId = (value: unknown, name: string): number => {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, 'INVALID_INPUT', `${name} must be a positive integer`)
  return id
}

const optionalId = (value: unknown, name: string): number | null => (value === undefined || value === null || value === '' ? null : requiredId(value, name))

const userIdOf = (value: unknown): string => {
  if (typeof value === 'number' && Number.isInteger(value)) return String(value)
  if (typeof value === 'string' && value.trim()) return value.trim()
  throw new ApiError(400, 'INVALID_INPUT', 'userId is required')
}

const paginationOf = (context: Context): { page: number; size: number } => {
  const page = Math.max(Number(context.req.query('page') ?? 1) || 1, 1)
  const size = Math.min(Math.max(Number(context.req.query('size') ?? 20) || 20, 1), 100)
  return { page, size }
}

const sortOf = (value: string | undefined): TicketListQuery['sort'] =>
  value === 'slaPriority' || value === 'status' ? value : 'createdAt'

export function registerTicketRoutes(app: Hono, platform: Platform) {
  const service = createTicketService(platform)
  const actorOf = (context: Context): Promise<TicketActor> => service.resolveActor(currentUserId(context))
  const route = (handler: (context: Context) => Promise<Response>) => asHandler(handler)

  // ── 用户与业务属性 ────────────────────────────────────────────
  app.get('/api/users', route(async (context) => {
    await actorOf(context)
    return context.json(await service.listUsers())
  }))
  app.post('/api/users', route(async (context) => {
    await actorOf(context)
    const body = await bodyOf(context)
    const password = requiredString(body.password, 'password', 256)
    if (password.length < 8) throw new ApiError(400, 'INVALID_INPUT', 'password must contain at least 8 characters')
    const email = requiredString(body.email, 'email', 320)
    if (!email.includes('@')) throw new ApiError(400, 'INVALID_INPUT', 'Enter a valid email address')
    const user = await service.createUser({
      email,
      password,
      displayName: requiredString(body.displayName, 'displayName'),
      companyId: optionalId(body.companyId, 'companyId'),
      departmentId: optionalId(body.departmentId, 'departmentId'),
    })
    return context.json(user, 201)
  }))
  app.put('/api/users/:id', route(async (context) => {
    await actorOf(context)
    const body = await bodyOf(context)
    const user = await service.updateUserProfile(context.req.param('id') ?? '', {
      displayName: body.displayName === undefined ? undefined : requiredString(body.displayName, 'displayName'),
      companyId: body.companyId === undefined ? undefined : optionalId(body.companyId, 'companyId'),
      departmentId: body.departmentId === undefined ? undefined : optionalId(body.departmentId, 'departmentId'),
    })
    return context.json(user)
  }))

  // ── 基础数据 ──────────────────────────────────────────────────
  app.get('/api/companies', route(async (context) => context.json(await service.listCompanies())))
  app.post('/api/companies', route(async (context) => {
    await actorOf(context)
    const body = await bodyOf(context)
    return context.json(await service.createCompany(requiredString(body.name, 'name')), 201)
  }))
  app.get('/api/companies/:id/departments', route(async (context) => {
    const actor = await actorOf(context)
    return context.json(await service.listDepartments(actor, requiredId(context.req.param('id'), 'companyId')))
  }))
  app.post('/api/companies/:id/departments', route(async (context) => {
    const actor = await actorOf(context)
    const body = await bodyOf(context)
    return context.json(await service.createDepartment(actor, requiredId(context.req.param('id'), 'companyId'), requiredString(body.name, 'name')), 201)
  }))
  app.get('/api/categories', route(async (context) => context.json(await service.listCategories())))
  app.post('/api/categories', route(async (context) => {
    await actorOf(context)
    const body = await bodyOf(context)
    return context.json(await service.createCategory(requiredString(body.name, 'name')), 201)
  }))

  // ── 业务组与分配规则 ──────────────────────────────────────────
  app.get('/api/business-groups', route(async (context) => {
    const actor = await actorOf(context)
    return context.json(await service.listGroups(actor, optionalId(context.req.query('companyId'), 'companyId')))
  }))
  app.post('/api/business-groups', route(async (context) => {
    const actor = await actorOf(context)
    const body = await bodyOf(context)
    return context.json(await service.createGroup(actor, requiredId(body.companyId, 'companyId'), requiredString(body.name, 'name')), 201)
  }))
  app.post('/api/business-groups/:id/members', route(async (context) => {
    const actor = await actorOf(context)
    const body = await bodyOf(context)
    return context.json(await service.addGroupMember(actor, requiredId(context.req.param('id'), 'groupId'), userIdOf(body.userId)), 201)
  }))
  app.delete('/api/business-groups/:id/members/:userId', route(async (context) => {
    const actor = await actorOf(context)
    return context.json(await service.removeGroupMember(actor, requiredId(context.req.param('id'), 'groupId'), userIdOf(context.req.param('userId'))))
  }))
  app.get('/api/assignment-rules', route(async (context) => {
    const actor = await actorOf(context)
    return context.json(await service.listRules(actor, optionalId(context.req.query('companyId'), 'companyId')))
  }))
  app.post('/api/assignment-rules', route(async (context) => {
    const actor = await actorOf(context)
    const body = await bodyOf(context)
    return context.json(await service.upsertRule(actor, {
      companyId: requiredId(body.companyId, 'companyId'),
      categoryId: requiredId(body.categoryId, 'categoryId'),
      targetGroupId: requiredId(body.targetGroupId, 'targetGroupId'),
    }))
  }))

  // ── 工单 ─────────────────────────────────────────────────────
  app.post('/api/tickets', route(async (context) => {
    const actor = await actorOf(context)
    const body = await bodyOf(context)
    const slaPriority = requiredString(body.slaPriority, 'slaPriority', 8)
    if (!SLA_PRIORITIES.includes(slaPriority as (typeof SLA_PRIORITIES)[number])) {
      throw new ApiError(400, 'INVALID_INPUT', 'slaPriority must be one of P0, P1, P2, P3, P4')
    }
    const ticket = await service.createTicket(actor, {
      title: requiredString(body.title, 'title'),
      description: requiredString(body.description, 'description', 10000),
      categoryId: requiredId(body.categoryId, 'categoryId'),
      slaPriority,
    })
    return context.json(ticket, 201)
  }))
  app.get('/api/tickets', route(async (context) => {
    const actor = await actorOf(context)
    const { page, size } = paginationOf(context)
    const categoryId = optionalId(context.req.query('categoryId'), 'categoryId')
    return context.json(await service.listTickets(actor, {
      companyId: optionalId(context.req.query('companyId'), 'companyId'),
      status: context.req.query('status')?.trim() || undefined,
      categoryId: categoryId ?? undefined,
      priority: context.req.query('priority')?.trim() || undefined,
      q: context.req.query('q')?.trim() || undefined,
      sort: sortOf(context.req.query('sort')),
      order: context.req.query('order') === 'asc' ? 'asc' : 'desc',
      page,
      size,
    }))
  }))
  app.get('/api/tickets/:id', route(async (context) => {
    const actor = await actorOf(context)
    return context.json(await service.getTicket(actor, requiredId(context.req.param('id'), 'id')))
  }))
  app.post('/api/tickets/:id/replies', route(async (context) => {
    const actor = await actorOf(context)
    const body = await bodyOf(context)
    const reply = await service.reply(actor, requiredId(context.req.param('id'), 'id'), requiredString(body.content, 'content', 4000))
    return context.json(reply, 201)
  }))
  app.post('/api/tickets/:id/transfer', route(async (context) => {
    const actor = await actorOf(context)
    const body = await bodyOf(context)
    return context.json(await service.transfer(actor, requiredId(context.req.param('id'), 'id'), {
      targetGroupId: optionalId(body.targetGroupId, 'targetGroupId'),
      targetUserId: body.targetUserId === undefined || body.targetUserId === null ? null : userIdOf(body.targetUserId),
    }))
  }))
  app.post('/api/tickets/:id/assign', route(async (context) => {
    const actor = await actorOf(context)
    const body = await bodyOf(context)
    return context.json(await service.assign(actor, requiredId(context.req.param('id'), 'id'), requiredId(body.businessGroupId, 'businessGroupId')))
  }))
  app.post('/api/tickets/:id/complete', route(async (context) => {
    const actor = await actorOf(context)
    return context.json(await service.complete(actor, requiredId(context.req.param('id'), 'id')))
  }))
  app.post('/api/tickets/:id/cancel', route(async (context) => {
    const actor = await actorOf(context)
    return context.json(await service.cancel(actor, requiredId(context.req.param('id'), 'id')))
  }))
  app.get('/api/tickets/:id/submitter-info', route(async (context) => {
    const actor = await actorOf(context)
    return context.json(await service.submitterInfo(actor, requiredId(context.req.param('id'), 'id')))
  }))
  app.get('/api/tickets/:id/logs', route(async (context) => {
    const actor = await actorOf(context)
    return context.json(await service.logs(actor, requiredId(context.req.param('id'), 'id')))
  }))
  app.post('/api/tickets/:id/rating', route(async (context) => {
    const actor = await actorOf(context)
    const body = await bodyOf(context)
    const score = requiredId(body.score, 'score')
    if (score < 1 || score > 5) throw new ApiError(400, 'INVALID_INPUT', 'score must be between 1 and 5')
    const rating = await service.rate(actor, requiredId(context.req.param('id'), 'id'), score, optionalText(body.comment, 'comment', 2000))
    return context.json({ id: rating.id, ticketId: rating.ticketId, score: rating.score, comment: rating.comment, ratedAt: rating.ratedAt }, 201)
  }))

  // ── 统计分析 ─────────────────────────────────────────────────
  app.get('/api/statistics/distribution', route(async (context) => {
    const actor = await actorOf(context)
    const dimension = context.req.query('dimension')
    if (dimension !== 'company' && dimension !== 'department') {
      throw new ApiError(400, 'INVALID_INPUT', 'dimension must be company or department')
    }
    return context.json(await service.distribution(actor, dimension))
  }))
  app.get('/api/statistics/dashboard', route(async (context) => {
    const actor = await actorOf(context)
    return context.json(await service.dashboard(actor))
  }))
}
