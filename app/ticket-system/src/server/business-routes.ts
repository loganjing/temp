import type { Hono } from 'hono'
import type { initializePlatform } from './platform/bootstrap'
import type { AuthUser } from '@commonapp/userkit'
import { createTicketService } from './services/ticket-service'
import type { SlaPriority, TicketStatus } from '../shared/types'

type Platform = Awaited<ReturnType<typeof initializePlatform>>
const errorBody = (code: string, message: string) => ({ error: { code, message } })
const currentUser = (context: unknown) => (context as { get(name: string): unknown }).get('currentUser') as AuthUser
const PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'P4'] as const
const isPriority = (v: unknown): v is SlaPriority => typeof v === 'string' && (PRIORITIES as readonly string[]).includes(v)

const NOT_FOUND_CODES = new Set(['TICKET_NOT_FOUND', 'CATEGORY_NOT_FOUND', 'GROUP_NOT_FOUND', 'SUBMITTER_NOT_FOUND'])

/**
 * 注册全部工单系统业务路由。所有路由在公司隔离下按 user_profiles.company_id 过滤。
 * 角色权限通过 permissionkit 检查；公司范围来自服务端可信的用户档案。
 */
export function registerBusinessRoutes(app: Hono, platform: Platform) {
  const service = createTicketService({ db: platform.db, audit: platform.audit, email: platform.email })

  // 解析当前用户档案（公司隔离的信任来源）。无档案则 403。
  const resolveProfile = async (context: unknown) => {
    const user = currentUser(context)
    const profile = await service.loadProfile(user.id)
    if (!profile) return null
    return { user, profile }
  }

  const requirePermission = async (userId: string, permission: string) => {
    const ok = await platform.permission.can(userId, permission)
    return ok
  }

  // ===== 工单管理 =====

  app.post('/api/tickets', async (context) => {
    const ctx = await resolveProfile(context)
    if (!ctx) return context.json(errorBody('FORBIDDEN', 'No ticket-system profile'), 403)
    if (!(await requirePermission(ctx.user.id, 'ticket.create'))) return context.json(errorBody('FORBIDDEN', 'Missing ticket.create permission'), 403)

    const body = await context.req.json().catch(() => ({}))
    const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
    const description = typeof body.description === 'string' ? body.description.trim() : ''
    const categoryId = typeof body.categoryId === 'string' ? body.categoryId.trim() : ''
    if (!subject || !description || !categoryId) return context.json(errorBody('VALIDATION_ERROR', 'subject, description and categoryId are required'), 400)
    if (!isPriority(body.slaPriority)) return context.json(errorBody('VALIDATION_ERROR', 'slaPriority must be one of P0-P4'), 400)

    const result = await service.createTicket(ctx.profile, { subject, description, categoryId, slaPriority: body.slaPriority })
    if ('error' in result) return context.json(errorBody(result.error, 'Category not found'), 400)
    return context.json(result, 201)
  })

  app.get('/api/tickets', async (context) => {
    const ctx = await resolveProfile(context)
    if (!ctx) return context.json(errorBody('FORBIDDEN', 'No ticket-system profile'), 403)
    if (!(await requirePermission(ctx.user.id, 'ticket.view'))) return context.json(errorBody('FORBIDDEN', 'Missing ticket.view permission'), 403)

    const q = (key: string) => context.req.query(key)
    const isAdmin = await requirePermission(ctx.user.id, 'audit.view')
    // 普通用户强制按所属公司过滤；管理员可指定 companyId。
    const companyId = isAdmin && q('companyId') ? q('companyId')! : ctx.profile.companyId
    const result = await service.listTickets(companyId, {
      status: q('status') || undefined,
      categoryId: q('categoryId') || undefined,
      slaPriority: q('slaPriority') || undefined,
      search: q('search') || undefined,
      sort: q('sort') || undefined,
      order: q('order') || undefined,
      page: Number(q('page')) || undefined,
      pageSize: Number(q('pageSize')) || undefined,
    })
    return context.json(result)
  })

  app.get('/api/tickets/:id', async (context) => {
    const ctx = await resolveProfile(context)
    if (!ctx) return context.json(errorBody('FORBIDDEN', 'No ticket-system profile'), 403)
    if (!(await requirePermission(ctx.user.id, 'ticket.view'))) return context.json(errorBody('FORBIDDEN', 'Missing ticket.view permission'), 403)

    const detail = await service.getTicketDetail(ctx.profile.companyId, context.req.param('id')!)
    if (!detail) return context.json(errorBody('TICKET_NOT_FOUND', 'Ticket not found'), 404)
    return context.json(detail)
  })

  app.patch('/api/tickets/:id', async (context) => {
    const ctx = await resolveProfile(context)
    if (!ctx) return context.json(errorBody('FORBIDDEN', 'No ticket-system profile'), 403)
    if (!(await requirePermission(ctx.user.id, 'ticket.update'))) return context.json(errorBody('FORBIDDEN', 'Missing ticket.update permission'), 403)

    const body = await context.req.json().catch(() => ({}))
    const input: { slaPriority?: SlaPriority; assignedGroupId?: string | null; status?: TicketStatus } = {}
    if (body.slaPriority !== undefined) {
      if (!isPriority(body.slaPriority)) return context.json(errorBody('VALIDATION_ERROR', 'slaPriority must be one of P0-P4'), 400)
      input.slaPriority = body.slaPriority
    }
    if (body.assignedGroupId !== undefined) input.assignedGroupId = typeof body.assignedGroupId === 'string' ? body.assignedGroupId : null
    if (body.status !== undefined) input.status = body.status as TicketStatus

    const result = await service.updateTicket(ctx.profile, context.req.param('id')!, input)
    if ('error' in result) return context.json(errorBody(result.error, NOT_FOUND_CODES.has(result.error) ? 'Resource not found' : 'Invalid state'), NOT_FOUND_CODES.has(result.error) ? 404 : 400)
    const detail = await service.getTicketDetail(ctx.profile.companyId, context.req.param('id')!)
    return context.json(detail)
  })

  app.post('/api/tickets/:id/replies', async (context) => {
    const ctx = await resolveProfile(context)
    if (!ctx) return context.json(errorBody('FORBIDDEN', 'No ticket-system profile'), 403)
    if (!(await requirePermission(ctx.user.id, 'ticket.reply'))) return context.json(errorBody('FORBIDDEN', 'Missing ticket.reply permission'), 403)

    const body = await context.req.json().catch(() => ({}))
    const content = typeof body.content === 'string' ? body.content.trim() : ''
    if (!content) return context.json(errorBody('VALIDATION_ERROR', 'content is required'), 400)
    const result = await service.addReply(ctx.profile, context.req.param('id')!, content)
    if ('error' in result) return context.json(errorBody(result.error, 'Ticket not found'), 404)
    return context.json(result, 201)
  })

  // ===== 工单协作 =====

  app.post('/api/tickets/:id/transfer', async (context) => {
    const ctx = await resolveProfile(context)
    if (!ctx) return context.json(errorBody('FORBIDDEN', 'No ticket-system profile'), 403)
    if (!(await requirePermission(ctx.user.id, 'ticket.transfer'))) return context.json(errorBody('FORBIDDEN', 'Missing ticket.transfer permission'), 403)

    const body = await context.req.json().catch(() => ({}))
    const toGroupId = typeof body.toGroupId === 'string' ? body.toGroupId.trim() : ''
    if (!toGroupId) return context.json(errorBody('VALIDATION_ERROR', 'toGroupId is required'), 400)
    const reason = typeof body.reason === 'string' ? body.reason.trim() || null : null
    const result = await service.transferTicket(ctx.profile, context.req.param('id')!, toGroupId, reason)
    if ('error' in result) {
      const code = result.error
      const status = code === 'TICKET_NOT_PENDING_PROCESSING' ? 400 : NOT_FOUND_CODES.has(code) ? 404 : 400
      return context.json(errorBody(code, code === 'TICKET_NOT_PENDING_PROCESSING' ? 'Ticket is not pending processing' : 'Resource not found'), status)
    }
    return context.json(result)
  })

  app.post('/api/tickets/:id/complete', async (context) => {
    const ctx = await resolveProfile(context)
    if (!ctx) return context.json(errorBody('FORBIDDEN', 'No ticket-system profile'), 403)
    if (!(await requirePermission(ctx.user.id, 'ticket.complete'))) return context.json(errorBody('FORBIDDEN', 'Missing ticket.complete permission'), 403)

    const body = await context.req.json().catch(() => ({}))
    const summary = typeof body.summary === 'string' ? body.summary.trim() || null : null
    const result = await service.completeTicket(ctx.profile, context.req.param('id')!, summary)
    if ('error' in result) {
      const code = result.error
      const status = code === 'TICKET_NOT_PENDING_PROCESSING' ? 400 : NOT_FOUND_CODES.has(code) ? 404 : 400
      return context.json(errorBody(code, code === 'TICKET_NOT_PENDING_PROCESSING' ? 'Ticket is not pending processing' : 'Resource not found'), status)
    }
    return context.json(result)
  })

  // ===== 工单处理 =====

  app.get('/api/tickets/:id/submitter', async (context) => {
    const ctx = await resolveProfile(context)
    if (!ctx) return context.json(errorBody('FORBIDDEN', 'No ticket-system profile'), 403)
    if (!(await requirePermission(ctx.user.id, 'ticket.view_submitter'))) return context.json(errorBody('FORBIDDEN', 'Missing ticket.view_submitter permission'), 403)

    const result = await service.getSubmitterInfo(ctx.profile, context.req.param('id')!)
    if ('error' in result) return context.json(errorBody(result.error, 'Resource not found'), 404)
    return context.json(result)
  })

  // ===== 用户评价 =====

  app.post('/api/tickets/:id/rating', async (context) => {
    const ctx = await resolveProfile(context)
    if (!ctx) return context.json(errorBody('FORBIDDEN', 'No ticket-system profile'), 403)
    if (!(await requirePermission(ctx.user.id, 'ticket.rate'))) return context.json(errorBody('FORBIDDEN', 'Missing ticket.rate permission'), 403)

    const body = await context.req.json().catch(() => ({}))
    const rating = Number(body.rating)
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return context.json(errorBody('VALIDATION_ERROR', 'rating must be an integer between 1 and 5'), 400)
    const comment = typeof body.comment === 'string' ? body.comment.trim() || null : null
    const result = await service.createRating(ctx.profile, context.req.param('id')!, rating, comment)
    if ('error' in result) {
      const code = result.error
      const status = code === 'TICKET_NOT_COMPLETED' ? 400 : code === 'RATING_ALREADY_EXISTS' ? 409 : code === 'FORBIDDEN' ? 403 : 404
      return context.json(errorBody(code, code), status)
    }
    return context.json(result, 201)
  })

  // ===== 分配管理 =====

  app.get('/api/business-groups', async (context) => {
    const ctx = await resolveProfile(context)
    if (!ctx) return context.json(errorBody('FORBIDDEN', 'No ticket-system profile'), 403)
    if (!(await requirePermission(ctx.user.id, 'ticket.view'))) return context.json(errorBody('FORBIDDEN', 'Missing ticket.view permission'), 403)
    const result = await service.listBusinessGroups(ctx.profile.companyId)
    return context.json(result)
  })

  app.post('/api/business-groups', async (context) => {
    const ctx = await resolveProfile(context)
    if (!ctx) return context.json(errorBody('FORBIDDEN', 'No ticket-system profile'), 403)
    if (!(await requirePermission(ctx.user.id, 'group.manage'))) return context.json(errorBody('FORBIDDEN', 'Missing group.manage permission'), 403)
    const body = await context.req.json().catch(() => ({}))
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) return context.json(errorBody('VALIDATION_ERROR', 'name is required'), 400)
    const result = await service.createBusinessGroup(ctx.profile, name)
    return context.json(result, 201)
  })

  app.patch('/api/business-groups/:id/members', async (context) => {
    const ctx = await resolveProfile(context)
    if (!ctx) return context.json(errorBody('FORBIDDEN', 'No ticket-system profile'), 403)
    if (!(await requirePermission(ctx.user.id, 'group.manage'))) return context.json(errorBody('FORBIDDEN', 'Missing group.manage permission'), 403)
    const body = await context.req.json().catch(() => ({}))
    const memberUserIds = Array.isArray(body.memberUserIds) ? body.memberUserIds.filter((u: unknown): u is string => typeof u === 'string') : null
    if (!memberUserIds) return context.json(errorBody('VALIDATION_ERROR', 'memberUserIds must be an array'), 400)
    const result = await service.updateBusinessGroupMembers(ctx.profile, context.req.param('id')!, memberUserIds)
    if ('error' in result) return context.json(errorBody(result.error, 'Business group not found'), 404)
    return context.json(result)
  })

  app.get('/api/category-rules', async (context) => {
    const ctx = await resolveProfile(context)
    if (!ctx) return context.json(errorBody('FORBIDDEN', 'No ticket-system profile'), 403)
    if (!(await requirePermission(ctx.user.id, 'ticket.view'))) return context.json(errorBody('FORBIDDEN', 'Missing ticket.view permission'), 403)
    const result = await service.listCategoryRules(ctx.profile.companyId)
    return context.json(result)
  })

  app.post('/api/category-rules', async (context) => {
    const ctx = await resolveProfile(context)
    if (!ctx) return context.json(errorBody('FORBIDDEN', 'No ticket-system profile'), 403)
    if (!(await requirePermission(ctx.user.id, 'category_rule.manage'))) return context.json(errorBody('FORBIDDEN', 'Missing category_rule.manage permission'), 403)
    const body = await context.req.json().catch(() => ({}))
    const categoryId = typeof body.categoryId === 'string' ? body.categoryId.trim() : ''
    const targetGroupId = typeof body.targetGroupId === 'string' ? body.targetGroupId.trim() : ''
    if (!categoryId || !targetGroupId) return context.json(errorBody('VALIDATION_ERROR', 'categoryId and targetGroupId are required'), 400)
    const result = await service.createCategoryRule(ctx.profile, categoryId, targetGroupId)
    if ('error' in result) {
      const code = result.error
      const status = code === 'RULE_ALREADY_EXISTS' ? 409 : code === 'GROUP_NOT_FOUND' ? 404 : 400
      return context.json(errorBody(code, code), status)
    }
    return context.json(result, 201)
  })

  app.get('/api/categories', async (context) => {
    const ctx = await resolveProfile(context)
    if (!ctx) return context.json(errorBody('FORBIDDEN', 'No ticket-system profile'), 403)
    if (!(await requirePermission(ctx.user.id, 'ticket.view'))) return context.json(errorBody('FORBIDDEN', 'Missing ticket.view permission'), 403)
    const result = await service.listCategories()
    return context.json(result)
  })

  // ===== 统计与工作台 =====

  app.get('/api/statistics/distribution', async (context) => {
    const ctx = await resolveProfile(context)
    if (!ctx) return context.json(errorBody('FORBIDDEN', 'No ticket-system profile'), 403)
    if (!(await requirePermission(ctx.user.id, 'statistics.view'))) return context.json(errorBody('FORBIDDEN', 'Missing statistics.view permission'), 403)
    const dimension = context.req.query('dimension')
    if (dimension !== 'company' && dimension !== 'department') return context.json(errorBody('VALIDATION_ERROR', 'dimension must be company or department'), 400)
    const isAdmin = await requirePermission(ctx.user.id, 'audit.view')
    const result = await service.statisticsDistribution(ctx.profile, dimension, context.req.query('status') || null, isAdmin, context.req.query('companyId') || null)
    return context.json(result)
  })

  app.get('/api/statistics/dashboard', async (context) => {
    const ctx = await resolveProfile(context)
    if (!ctx) return context.json(errorBody('FORBIDDEN', 'No ticket-system profile'), 403)
    if (!(await requirePermission(ctx.user.id, 'statistics.view'))) return context.json(errorBody('FORBIDDEN', 'Missing statistics.view permission'), 403)
    const isAdmin = await requirePermission(ctx.user.id, 'audit.view')
    const result = await service.statisticsDashboard(ctx.profile, isAdmin, context.req.query('companyId') || null, context.req.query('startDate') || null, context.req.query('endDate') || null)
    return context.json(result)
  })

  app.get('/api/workbench/tickets', async (context) => {
    const ctx = await resolveProfile(context)
    if (!ctx) return context.json(errorBody('FORBIDDEN', 'No ticket-system profile'), 403)
    if (!(await requirePermission(ctx.user.id, 'workbench.view'))) return context.json(errorBody('FORBIDDEN', 'Missing workbench.view permission'), 403)
    const q = (key: string) => context.req.query(key)
    const isAdmin = await requirePermission(ctx.user.id, 'audit.view')
    const companyId = isAdmin && q('companyId') ? q('companyId')! : ctx.profile.companyId
    const result = await service.listWorkbench(companyId, {
      assignedGroupId: q('assignedGroupId') || undefined,
      slaPriority: q('slaPriority') || undefined,
      search: q('search') || undefined,
      sort: q('sort') || undefined,
      order: q('order') || undefined,
      page: Number(q('page')) || undefined,
      pageSize: Number(q('pageSize')) || undefined,
    })
    return context.json(result)
  })

  // ===== 操作日志 =====

  app.get('/api/audit-logs', async (context) => {
    const ctx = await resolveProfile(context)
    if (!ctx) return context.json(errorBody('FORBIDDEN', 'No ticket-system profile'), 403)
    if (!(await requirePermission(ctx.user.id, 'audit.view'))) return context.json(errorBody('FORBIDDEN', 'Missing audit.view permission'), 403)
    const q = (key: string) => context.req.query(key)
    const result = await service.listAuditLogs({
      ticketId: q('ticketId') || undefined,
      eventType: q('eventType') || undefined,
      actorId: q('actorId') || undefined,
      page: Number(q('page')) || undefined,
      pageSize: Number(q('pageSize')) || undefined,
    })
    return context.json(result)
  })
}
