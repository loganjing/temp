import type { Hono } from 'hono'
import type { RouteContext } from './tickets'
import { BusinessError, resolveSession } from '../services/modules'

type JsonStatus = 200 | 201 | 400 | 401 | 403 | 404 | 409 | 500

const errorBody = (code: string, message: string) => ({ error: { code, message } })

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

export function registerLogRoutes(app: Hono, ctx: RouteContext) {
  app.get('/api/tickets/:id/logs', handle(async (c) => {
    const s = await session(ctx, c)
    const logs = await ctx.ticket.getTicketLogs(s, c.req.param('id') as string)
    return { data: logs }
  }))

  app.get('/api/logs', handle(async (c) => {
    const s = await session(ctx, c)
    const q: Record<string, string | undefined> = {
      action: c.req.query('action') || undefined,
      page: c.req.query('page') || undefined,
      limit: c.req.query('limit') || undefined,
    }
    const result = await ctx.ticket.listLogs(s, q)
    return { data: result.rows, pagination: { page: result.page, limit: result.limit, total: result.total } }
  }))
}
