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

export function registerGroupRoutes(app: Hono, ctx: RouteContext) {
  app.post('/api/business-groups', handle(async (c) => {
    const s = await session(ctx, c)
    const body = await c.req.json().catch(() => ({}))
    return ctx.ticket.createBusinessGroup(s, body.company_id, body.name)
  }, 201))

  app.get('/api/business-groups', handle(async (c) => {
    const s = await session(ctx, c)
    return ctx.ticket.listBusinessGroups(s, c.req.query('company_id') || undefined)
  }))

  app.post('/api/business-groups/:id/members', handle(async (c) => {
    const s = await session(ctx, c)
    const body = await c.req.json().catch(() => ({}))
    return ctx.ticket.addGroupMember(s, c.req.param('id') as string, body.user_id)
  }, 201))

  app.get('/api/business-groups/:id/members', handle(async (c) => {
    const s = await session(ctx, c)
    return ctx.ticket.listGroupMembers(s, c.req.param('id') as string)
  }))

  app.delete('/api/business-groups/:id/members/:userId', handle(async (c) => {
    const s = await session(ctx, c)
    await ctx.ticket.removeGroupMember(s, c.req.param('id') as string, c.req.param('userId') as string)
    return new Response(null, { status: 204 })
  }))

  app.post('/api/assignment-rules', handle(async (c) => {
    const s = await session(ctx, c)
    const body = await c.req.json().catch(() => ({}))
    return ctx.ticket.createAssignmentRule(s, body.company_id, body.category, body.business_group_id)
  }, 201))

  app.get('/api/assignment-rules', handle(async (c) => {
    const s = await session(ctx, c)
    return ctx.ticket.listAssignmentRules(s, c.req.query('company_id') || undefined)
  }))

  app.delete('/api/assignment-rules/:id', handle(async (c) => {
    const s = await session(ctx, c)
    await ctx.ticket.deleteAssignmentRule(s, c.req.param('id') as string)
    return new Response(null, { status: 204 })
  }))
}
