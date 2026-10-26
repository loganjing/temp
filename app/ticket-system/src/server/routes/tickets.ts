import type { Hono } from 'hono'
import type { TicketService } from '../services/ticket-service'
import type { BusinessServices } from '../services/modules'
import { BusinessError, resolveSession } from '../services/modules'

type JsonStatus = 200 | 201 | 400 | 401 | 403 | 404 | 409 | 500

export interface RouteContext {
  services: BusinessServices
  ticket: TicketService
}

const errorBody = (code: string, message: string) => ({ error: { code, message } })

/** Wrap a handler so BusinessError is rendered with the contract error shape. */
function handle(handler: (c: import('hono').Context) => Promise<unknown>, status: JsonStatus = 200) {
  return async (context: import('hono').Context) => {
    try {
      const result = await handler(context)
      if (result instanceof Response) return result
      return context.json(result, status)
    } catch (error) {
      if (error instanceof BusinessError) return context.json(errorBody(error.code, error.message), error.status as JsonStatus)
      throw error
    }
  }
}

async function session(ctx: RouteContext, context: import('hono').Context) {
  await ctx.ticket.ensureReady()
  return resolveSession(ctx.services, context)
}

function query(context: import('hono').Context): Record<string, string | undefined> {
  const q = context.req.query()
  const out: Record<string, string | undefined> = {}
  for (const key of Object.keys(q)) out[key] = q[key]
  return out
}

export function registerTicketRoutes(app: Hono, ctx: RouteContext) {
  app.post('/api/tickets', handle(async (c) => {
    const s = await session(ctx, c)
    const body = await c.req.json().catch(() => ({}))
    return ctx.ticket.createTicket(s, {
      subject: body.subject,
      description: body.description,
      category: body.category,
      priority: body.priority,
    })
  }, 201))

  app.get('/api/tickets', handle(async (c) => {
    const s = await session(ctx, c)
    const q = query(c)
    const isAdminCrossCompany = s.roles.includes('admin')
    const result = await ctx.ticket.listTickets(s, q, isAdminCrossCompany)
    return { data: result.rows, pagination: { page: result.page, limit: result.limit, total: result.total } }
  }))

  app.get('/api/tickets/:id', handle(async (c) => {
    const s = await session(ctx, c)
    return ctx.ticket.getTicket(s, c.req.param('id') as string)
  }))

  app.put('/api/tickets/:id', handle(async (c) => {
    const s = await session(ctx, c)
    const body = await c.req.json().catch(() => ({}))
    return ctx.ticket.updateTicket(s, c.req.param('id') as string, body)
  }))

  app.patch('/api/tickets/:id/status', handle(async (c) => {
    const s = await session(ctx, c)
    const body = await c.req.json().catch(() => ({}))
    return ctx.ticket.changeStatus(s, c.req.param('id') as string, body.action, { assigned_group_id: body.assigned_group_id, assigned_handler_id: body.assigned_handler_id, reason: body.reason })
  }))

  app.post('/api/tickets/:id/replies', handle(async (c) => {
    const s = await session(ctx, c)
    const body = await c.req.json().catch(() => ({}))
    return ctx.ticket.addReply(s, c.req.param('id') as string, body.content)
  }, 201))

  app.get('/api/tickets/:id/replies', handle(async (c) => {
    const s = await session(ctx, c)
    return ctx.ticket.listReplies(s, c.req.param('id') as string)
  }))

  app.get('/api/tickets/:id/submitter-info', handle(async (c) => {
    const s = await session(ctx, c)
    return ctx.ticket.getSubmitterInfo(s, c.req.param('id') as string)
  }))

  app.post('/api/tickets/:id/transfer', handle(async (c) => {
    const s = await session(ctx, c)
    const body = await c.req.json().catch(() => ({}))
    return ctx.ticket.transferTicket(s, c.req.param('id') as string, { to_handler_id: body.to_handler_id, to_group_id: body.to_group_id, reason: body.reason })
  }))

  app.post('/api/tickets/:id/complete', handle(async (c) => {
    const s = await session(ctx, c)
    return ctx.ticket.completeTicket(s, c.req.param('id') as string)
  }))

  app.post('/api/tickets/:id/cancel', handle(async (c) => {
    const s = await session(ctx, c)
    const body = await c.req.json().catch(() => ({}))
    return ctx.ticket.cancelTicket(s, c.req.param('id') as string, body.reason)
  }))

  app.post('/api/tickets/:id/evaluation', handle(async (c) => {
    const s = await session(ctx, c)
    const body = await c.req.json().catch(() => ({}))
    return ctx.ticket.submitEvaluation(s, c.req.param('id') as string, Number(body.rating), body.comment)
  }, 201))

  app.get('/api/tickets/:id/evaluation', handle(async (c) => {
    const s = await session(ctx, c)
    return ctx.ticket.getEvaluation(s, c.req.param('id') as string)
  }))
}
