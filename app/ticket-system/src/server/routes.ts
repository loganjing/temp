import type { Context, Hono } from 'hono'
import type { initializePlatform } from './platform/bootstrap'
import type { AppEnv } from './platform/auth'
import { notFound, validationError } from './errors'
import * as identity from './services/identity'
import * as assignment from './services/assignment'
import * as notification from './services/notification'
import * as stats from './services/stats'
import * as ticket from './services/ticket'

type Platform = Awaited<ReturnType<typeof initializePlatform>>

// 登录等公开端点只在此注册；不得加入业务读写路由。
export function registerPublicRoutes(app: Hono<AppEnv>, platform: Platform) {
  app.post('/api/auth/login', async (c) => {
    const body = await readJsonBody(c)
    const result = await identity.login(platform.db, requireString(body, 'username'), requireString(body, 'password'))
    return c.json(result)
  })
}

// 业务路由在认证边界后注册。
export function registerProtectedRoutes(app: Hono<AppEnv>, platform: Platform) {
  const db = platform.db

  app.post('/api/auth/logout', async (c) => {
    await identity.logout(db, c.get('token'))
    return c.body(null, 204)
  })
  app.get('/api/auth/me', (c) => c.json(c.get('user')))

  app.get('/api/tickets', async (c) => {
    const user = c.get('user')
    const query = c.req.query()
    const pagination = parsePagination(query)
    const scope = parseScope(query)
    let status: ticket.TicketStatus | undefined
    const statusRaw = query.status
    if (statusRaw !== undefined && statusRaw !== '') {
      if (!ticket.TICKET_STATUSES.includes(statusRaw as ticket.TicketStatus)) throw validationError('status 取值非法')
      if (scope === 'company' && !ticket.WORKBENCH_STATUSES.includes(statusRaw as ticket.TicketStatus)) {
        throw validationError('scope=company 时 status 仅支持 pending_process / pending_assignment')
      }
      status = statusRaw as ticket.TicketStatus
    } else if (scope === 'company') {
      status = 'pending_process'
    }
    const priorityRaw = query.priority
    let priority: ticket.Priority | undefined
    if (priorityRaw !== undefined && priorityRaw !== '') {
      if (!ticket.PRIORITIES.includes(priorityRaw as ticket.Priority)) throw validationError('priority 取值非法')
      priority = priorityRaw as ticket.Priority
    }
    const result = await ticket.listTickets(db, user, {
      scope,
      status,
      categoryId: optionalQueryInt(query, 'categoryId'),
      priority,
      companyId: optionalQueryInt(query, 'companyId'),
      q: query.q !== undefined && query.q !== '' ? query.q : undefined,
      sort: parseChoice(query, 'sort', ['createdAt', 'priority'] as const, 'createdAt'),
      order: parseChoice(query, 'order', ['asc', 'desc'] as const, 'desc'),
      ...pagination,
    })
    return c.json(result)
  })

  app.post('/api/tickets', async (c) => {
    const user = c.get('user')
    const body = await readJsonBody(c)
    const ticketId = await ticket.createTicket(db, user, {
      subject: requireString(body, 'subject', 200),
      categoryId: requireInt(body, 'categoryId'),
      priority: requireEnum(body, 'priority', ticket.PRIORITIES),
      description: optionalString(body, 'description', 5000),
    })
    return c.json(await ticket.getTicketDetail(db, ticketId, user.companyId))
  })

  app.get('/api/tickets/:id', async (c) => {
    const user = c.get('user')
    return c.json(await ticket.getTicketDetail(db, parseTicketId(c), user.companyId))
  })

  app.post('/api/tickets/:id/replies', async (c) => {
    const user = c.get('user')
    const body = await readJsonBody(c)
    const reply = await ticket.addReply(db, user, parseTicketId(c), requireString(body, 'content', 5000))
    return c.json({ reply })
  })

  app.post('/api/tickets/:id/assign', async (c) => {
    const user = c.get('user')
    const body = await readJsonBody(c)
    await ticket.assignTicket(db, user, parseTicketId(c), requireInt(body, 'groupId'))
    return c.json({ ticket: (await ticket.getTicketDetail(db, parseTicketId(c), user.companyId)).ticket })
  })

  app.post('/api/tickets/:id/transfer', async (c) => {
    const user = c.get('user')
    const body = await readJsonBody(c)
    await ticket.transferTicket(db, user, parseTicketId(c), requireInt(body, 'toGroupId'))
    return c.json({ ticket: (await ticket.getTicketDetail(db, parseTicketId(c), user.companyId)).ticket })
  })

  app.post('/api/tickets/:id/complete', async (c) => {
    const user = c.get('user')
    await ticket.completeTicket(db, user, parseTicketId(c))
    return c.json({ ticket: (await ticket.getTicketDetail(db, parseTicketId(c), user.companyId)).ticket })
  })

  app.post('/api/tickets/:id/cancel', async (c) => {
    const user = c.get('user')
    await ticket.cancelTicket(db, user, parseTicketId(c))
    return c.json({ ticket: (await ticket.getTicketDetail(db, parseTicketId(c), user.companyId)).ticket })
  })

  app.post('/api/tickets/:id/rating', async (c) => {
    const user = c.get('user')
    const body = await readJsonBody(c)
    const rating = await ticket.rateTicket(db, user, parseTicketId(c), requireRating(body))
    return c.json({ rating })
  })

  app.get('/api/groups', async (c) => c.json({ items: await assignment.listGroups(db, c.get('user').companyId) }))

  app.post('/api/groups', async (c) => {
    const body = await readJsonBody(c)
    const group = await assignment.createGroup(db, c.get('user').companyId, {
      name: requireString(body, 'name', 50),
      description: optionalString(body, 'description', 200),
    })
    return c.json({ group })
  })

  app.post('/api/groups/:id/members', async (c) => {
    const body = await readJsonBody(c)
    const group = await assignment.addGroupMembers(db, c.get('user').companyId, parsePathId(c, 'id', '业务组不存在或无权限'), requireIntArray(body, 'userIds'))
    return c.json({ group })
  })

  app.delete('/api/groups/:id/members/:userId', async (c) => {
    await assignment.removeGroupMember(db, c.get('user').companyId, parsePathId(c, 'id', '业务组不存在或无权限'), parsePathId(c, 'userId', '成员关系不存在或无权限'))
    return c.body(null, 204)
  })

  app.get('/api/assignment-rules', async (c) => c.json({ items: await assignment.listRules(db, c.get('user').companyId) }))

  app.put('/api/assignment-rules', async (c) => {
    const body = await readJsonBody(c)
    const rule = await assignment.upsertRule(db, c.get('user').companyId, requireInt(body, 'categoryId'), requireInt(body, 'groupId'))
    return c.json({ rule })
  })

  app.delete('/api/assignment-rules/:categoryId', async (c) => {
    await assignment.deleteRule(db, c.get('user').companyId, parsePathId(c, 'categoryId', '分配规则不存在'))
    return c.body(null, 204)
  })

  app.get('/api/categories', async (c) => c.json({ items: await assignment.listCategories(db) }))
  app.get('/api/users', async (c) => c.json({ items: await assignment.listCompanyUsers(db, c.get('user').companyId) }))

  app.get('/api/stats/dashboard', async (c) => {
    const query = c.req.query()
    return c.json(
      await stats.getDashboard(db, {
        companyId: optionalQueryInt(query, 'companyId'),
        department: query.department !== undefined && query.department !== '' ? query.department : undefined,
      }),
    )
  })

  app.get('/api/mail-outbox', async (c) => {
    const query = c.req.query()
    return c.json(
      await notification.listMailOutbox(db, c.get('user').companyId, {
        ticketId: optionalQueryInt(query, 'ticketId'),
        ...parsePagination(query),
      }),
    )
  })
}

async function readJsonBody(c: Context<AppEnv>): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await c.req.json()
    if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new Error('not an object')
    return body as Record<string, unknown>
  } catch {
    throw validationError('请求体必须是 JSON 对象')
  }
}

function requireString(body: Record<string, unknown>, field: string, maxLength?: number): string {
  const value = body[field]
  if (typeof value !== 'string') throw validationError(`${field} 必须为字符串`)
  const trimmed = value.trim()
  if (trimmed === '') throw validationError(`${field} 不能为空`)
  if (maxLength !== undefined && trimmed.length > maxLength) throw validationError(`${field} 长度不能超过 ${maxLength}`)
  return trimmed
}

function optionalString(body: Record<string, unknown>, field: string, maxLength: number): string {
  const value = body[field]
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') throw validationError(`${field} 必须为字符串`)
  if (value.length > maxLength) throw validationError(`${field} 长度不能超过 ${maxLength}`)
  return value
}

function requireInt(body: Record<string, unknown>, field: string): number {
  const value = body[field]
  if (typeof value !== 'number' || !Number.isInteger(value)) throw validationError(`${field} 必须为整数`)
  return value
}

function requireIntArray(body: Record<string, unknown>, field: string): number[] {
  const value = body[field]
  if (!Array.isArray(value) || value.length === 0) throw validationError(`${field} 必须为非空整数数组`)
  return value.map((item) => {
    if (typeof item !== 'number' || !Number.isInteger(item)) throw validationError(`${field} 必须为非空整数数组`)
    return item
  })
}

function requireRating(body: Record<string, unknown>): number {
  const value = body.rating
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 5) throw validationError('rating 必须为 1-5 的整数')
  return value
}

function requireEnum<T extends string>(body: Record<string, unknown>, field: string, values: readonly T[]): T {
  const value = body[field]
  if (typeof value !== 'string' || !values.includes(value as T)) throw validationError(`${field} 取值非法`)
  return value as T
}

function parseScope(query: Record<string, string | undefined>): 'company' | 'mine' {
  return parseChoice(query, 'scope', ['company', 'mine'] as const, 'company')
}

function parseChoice<T extends string>(query: Record<string, string | undefined>, field: string, values: readonly T[], fallback: T): T {
  const raw = query[field]
  if (raw === undefined || raw === '') return fallback
  if (!values.includes(raw as T)) throw validationError(`${field} 取值非法`)
  return raw as T
}

function optionalQueryInt(query: Record<string, string | undefined>, field: string): number | undefined {
  const raw = query[field]
  if (raw === undefined || raw === '') return undefined
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1) throw validationError(`${field} 必须为正整数`)
  return value
}

function parsePagination(query: Record<string, string | undefined>): { page: number; pageSize: number } {
  const page = optionalQueryInt(query, 'page') ?? 1
  let pageSize = 20
  const raw = query.pageSize
  if (raw !== undefined && raw !== '') {
    const value = Number(raw)
    if (!Number.isInteger(value) || value < 1 || value > 100) throw validationError('pageSize 必须为 1-100')
    pageSize = value
  }
  return { page, pageSize }
}

function parseTicketId(c: Context<AppEnv>): number {
  return parsePathId(c, 'id', '工单不存在或无权限')
}

function parsePathId(c: Context<AppEnv>, field: string, message: string): number {
  const value = Number(c.req.param(field))
  if (!Number.isInteger(value) || value < 1) throw notFound(message)
  return value
}
