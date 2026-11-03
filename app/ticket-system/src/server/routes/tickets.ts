import type { Hono } from 'hono'
import type { initializePlatform } from '../platform/bootstrap'
import { getUser, isHandler, getCompanyScope, handleServiceError, requireString } from './helpers'
import { createServices } from '../services'

type Platform = Awaited<ReturnType<typeof initializePlatform>>
type Services = ReturnType<typeof createServices>

export function registerTicketRoutes(app: Hono, _platform: Platform, services: Services) {
  app.post('/api/tickets', async (c) => {
    try {
      const user = getUser(c)
      const body = await c.req.json().catch(() => ({}))
      const result = await services.ticket.createTicket({
        title: requireString(body.title, 'title'),
        description: requireString(body.description, 'description', 10000),
        categoryId: requireString(body.categoryId, 'categoryId'),
        slaPriority: requireString(body.slaPriority, 'slaPriority'),
        submitterId: user.id,
        companyId: getCompanyScope(user),
      })
      return c.json(result, 201)
    } catch (error) { return handleServiceError(c, error) }
  })

  app.get('/api/tickets', async (c) => {
    try {
      const user = getUser(c)
      const result = await services.ticket.listTickets({
        companyId: getCompanyScope(user, c.req.query('companyId')),
        status: c.req.query('status'), slaPriority: c.req.query('slaPriority'),
        categoryId: c.req.query('categoryId'), search: c.req.query('search'),
        sortBy: c.req.query('sortBy'), sortOrder: c.req.query('sortOrder'),
        page: Number(c.req.query('page')), pageSize: Number(c.req.query('pageSize')),
      })
      return c.json(result)
    } catch (error) { return handleServiceError(c, error) }
  })

  app.get('/api/tickets/:ticketId', async (c) => {
    try {
      const user = getUser(c)
      const result = await services.ticket.getTicket(c.req.param('ticketId'), getCompanyScope(user))
      return c.json(result)
    } catch (error) { return handleServiceError(c, error) }
  })

  app.post('/api/tickets/:ticketId/replies', async (c) => {
    try {
      const user = getUser(c)
      const body = await c.req.json().catch(() => ({}))
      const result = await services.ticket.addReply(
        c.req.param('ticketId'), requireString(body.content, 'content', 10000),
        user.id, getCompanyScope(user),
      )
      return c.json(result, 201)
    } catch (error) { return handleServiceError(c, error) }
  })

  app.post('/api/tickets/:ticketId/transfer', async (c) => {
    try {
      const user = getUser(c)
      if (!isHandler(user)) return c.json({ error: { code: 'forbidden', message: 'Handler or admin access required' } }, 403)
      const body = await c.req.json().catch(() => ({}))
      const result = await services.ticket.transferTicket(
        c.req.param('ticketId'), requireString(body.toBusinessGroupId, 'toBusinessGroupId'),
        typeof body.reason === 'string' ? body.reason : undefined,
        user.id, getCompanyScope(user),
      )
      return c.json(result)
    } catch (error) { return handleServiceError(c, error) }
  })

  app.post('/api/tickets/:ticketId/complete', async (c) => {
    try {
      const user = getUser(c)
      if (!isHandler(user)) return c.json({ error: { code: 'forbidden', message: 'Handler or admin access required' } }, 403)
      const body = await c.req.json().catch(() => ({}))
      const result = await services.ticket.completeTicket(
        c.req.param('ticketId'), typeof body.summary === 'string' ? body.summary : undefined,
        user.id, getCompanyScope(user),
      )
      return c.json(result)
    } catch (error) { return handleServiceError(c, error) }
  })

  app.post('/api/tickets/:ticketId/cancel', async (c) => {
    try {
      const user = getUser(c)
      const body = await c.req.json().catch(() => ({}))
      const result = await services.ticket.cancelTicket(
        c.req.param('ticketId'), typeof body.reason === 'string' ? body.reason : undefined,
        user.id, getCompanyScope(user),
      )
      return c.json(result)
    } catch (error) { return handleServiceError(c, error) }
  })

  app.post('/api/tickets/:ticketId/satisfaction', async (c) => {
    try {
      const user = getUser(c)
      const body = await c.req.json().catch(() => ({}))
      const result = await services.ticket.addSatisfaction(
        c.req.param('ticketId'), Number(body.rating),
        typeof body.comment === 'string' ? body.comment : undefined,
        user.id, getCompanyScope(user),
      )
      return c.json(result, 201)
    } catch (error) { return handleServiceError(c, error) }
  })

  app.get('/api/workbench/tickets', async (c) => {
    try {
      const user = getUser(c)
      if (!isHandler(user)) return c.json({ error: { code: 'forbidden', message: 'Handler or admin access required' } }, 403)
      const result = await services.ticket.listTickets({
        companyId: getCompanyScope(user, c.req.query('companyId')),
        status: c.req.query('status') ?? 'pending_processing',
        slaPriority: c.req.query('slaPriority'), categoryId: c.req.query('categoryId'),
        search: c.req.query('search'), sortBy: c.req.query('sortBy'), sortOrder: c.req.query('sortOrder'),
        page: Number(c.req.query('page')), pageSize: Number(c.req.query('pageSize')),
      })
      return c.json(result)
    } catch (error) { return handleServiceError(c, error) }
  })
}
