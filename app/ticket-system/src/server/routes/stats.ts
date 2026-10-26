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

export function registerStatsRoutes(app: Hono, ctx: RouteContext) {
  app.get('/api/stats/dashboard', handle(async (c) => {
    const s = await session(ctx, c)
    const q: Record<string, string | undefined> = {
      company_id: c.req.query('company_id') || undefined,
      department_id: c.req.query('department_id') || undefined,
      start_date: c.req.query('start_date') || undefined,
      end_date: c.req.query('end_date') || undefined,
    }
    return ctx.ticket.getDashboard(s, q)
  }))

  app.get('/api/stats/distribution', handle(async (c) => {
    const s = await session(ctx, c)
    return ctx.ticket.getDistribution(s, c.req.query('group_by') || 'company')
  }))

  app.get('/api/workbench/tickets', handle(async (c) => {
    const s = await session(ctx, c)
    const q: Record<string, string | undefined> = {
      status: c.req.query('status') || undefined,
      category: c.req.query('category') || undefined,
      priority: c.req.query('priority') || undefined,
      search: c.req.query('search') || undefined,
      sort: c.req.query('sort') || undefined,
      order: c.req.query('order') || undefined,
      page: c.req.query('page') || undefined,
      limit: c.req.query('limit') || undefined,
      company_id: c.req.query('company_id') || undefined,
    }
    const result = await ctx.ticket.getWorkbenchTickets(s, q)
    return { data: result.rows, pagination: { page: result.page, limit: result.limit, total: result.total } }
  }))
}
