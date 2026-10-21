import type { Context, Hono } from 'hono'
import type { initializePlatform } from '../platform/bootstrap'
import { contextUser, intParam, readJson, wrap } from '../http'
import { validationError } from '../errors'
import { loadSession } from '../session'
import {
  addReply,
  cancelTicket,
  completeTicket,
  createTicket,
  getTicketDetail,
  getTicketLogs,
  listTickets,
  PRIORITIES,
  rateTicket,
  STATUSES,
  transferTicket,
} from '../services/ticket'
import { optionalInt, parsePagination, requireEnum, requireInt, requireString } from '../validation'

type Platform = Awaited<ReturnType<typeof initializePlatform>>

/** ticket 域（契约 §6）：工单全生命周期接口。授权与隔离全部在本层与服务层强制。 */

export function registerTicketRoutes(app: Hono, platform: Platform) {
  const sessionOf = (c: Context) => loadSession(platform.db, contextUser(c))
  const ticketId = (c: Context) => intParam(c, 'ticketId', 'Ticket')

  app.post('/api/tickets', wrap(async (c) => {
    const session = await sessionOf(c)
    const body = await readJson(c)
    const detail = await createTicket(platform.db, session, {
      subject: requireString(body.subject, 'subject', 1, 200),
      description: requireString(body.description, 'description', 1, 5000),
      categoryId: requireInt(body.categoryId, 'categoryId'),
      priority: requireEnum(body.priority, 'priority', PRIORITIES),
    })
    return c.json(detail, 201)
  }))

  app.get('/api/tickets', wrap(async (c) => {
    const session = await sessionOf(c)
    const query = c.req.query()
    const { page, pageSize } = parsePagination(query)
    const search = (query.search ?? '').trim()
    const result = await listTickets(platform.db, session, {
      status: query.status === undefined || query.status === '' ? undefined : requireEnum(query.status, 'status', STATUSES),
      priority: query.priority === undefined || query.priority === '' ? undefined : requireEnum(query.priority, 'priority', PRIORITIES),
      categoryId: optionalInt(query.categoryId, 'categoryId'),
      companyId: optionalInt(query.companyId, 'companyId'),
      search: search === '' ? undefined : search,
      sort: query.sort === undefined || query.sort === '' ? 'createdAt' : requireEnum(query.sort, 'sort', ['createdAt', 'priority', 'ticketNo'] as const),
      order: query.order === undefined || query.order === '' ? 'desc' : requireEnum(query.order, 'order', ['asc', 'desc'] as const),
      page,
      pageSize,
    })
    return c.json(result)
  }))

  app.get('/api/tickets/:ticketId', wrap(async (c) => c.json(await getTicketDetail(platform.db, await sessionOf(c), ticketId(c)))))

  app.post('/api/tickets/:ticketId/replies', wrap(async (c) => {
    const body = await readJson(c)
    return c.json(await addReply(platform.db, await sessionOf(c), ticketId(c), requireString(body.content, 'content', 1, 5000)), 201)
  }))

  app.post('/api/tickets/:ticketId/transfer', wrap(async (c) => {
    const body = await readJson(c)
    return c.json(await transferTicket(platform.db, await sessionOf(c), ticketId(c), requireInt(body.targetGroupId, 'targetGroupId')))
  }))

  app.post('/api/tickets/:ticketId/complete', wrap(async (c) =>
    c.json(await completeTicket(platform.db, platform.email, await sessionOf(c), ticketId(c))),
  ))

  app.post('/api/tickets/:ticketId/cancel', wrap(async (c) => c.json(await cancelTicket(platform.db, await sessionOf(c), ticketId(c)))))

  app.post('/api/tickets/:ticketId/satisfaction', wrap(async (c) => {
    const body = await readJson(c)
    const rating = requireInt(body.rating, 'rating')
    if (rating < 1 || rating > 5) throw validationError('rating must be between 1 and 5')
    const comment = body.comment === undefined || body.comment === null ? null : (body.comment as string).trim() || null
    if (comment !== null && comment.length > 500) throw validationError('comment must be at most 500 characters')
    return c.json(await rateTicket(platform.db, await sessionOf(c), ticketId(c), { rating, comment }), 201)
  }))

  app.get('/api/tickets/:ticketId/logs', wrap(async (c) => {
    const { page, pageSize } = parsePagination(c.req.query())
    return c.json(await getTicketLogs(platform.db, await sessionOf(c), ticketId(c), page, pageSize))
  }))
}
