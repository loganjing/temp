import type { Context, Hono } from 'hono'
import type { initializePlatform } from './platform/bootstrap'
import type { ApplicationAuth, AppEnv } from './platform/auth'
import { invalidRequest } from './errors'
import { createConfigService } from './services/config'
import { createNotifyService } from './services/notify'
import { createStatsService } from './services/stats'
import { createTicketService } from './services/tickets'
import { createUserService } from './services/users'

type Platform = Awaited<ReturnType<typeof initializePlatform>>

async function readJsonBody(c: Context<AppEnv>): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await c.req.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

// 登录等公开端点只在此注册；不得加入业务读写路由。
export function registerPublicRoutes(app: Hono<AppEnv>, auth: ApplicationAuth) {
  app.post('/api/auth/login', auth.loginRateLimit, auth.loginHandler)
}

// 业务路由在认证边界后注册；platform 包含已选模块的运行时资源。
export function registerProtectedRoutes(app: Hono<AppEnv>, platform: Platform) {
  const users = createUserService(platform.db)
  const config = createConfigService(platform.db)
  const notify = createNotifyService(platform.db, platform.email)
  const tickets = createTicketService(platform.db, notify)
  const stats = createStatsService(platform.db)

  // 身份与用户（契约 §2）
  app.get('/api/me', async (c) => c.json(await users.getMe(c.get('currentUser'))))
  app.get('/api/users', async (c) =>
    c.json(
      await users.listUsers(c.get('currentUser'), {
        companyId: c.req.query('companyId') || undefined,
        q: c.req.query('q') || undefined,
      }),
    ),
  )

  // 公司与配置管理（契约 §3）
  app.get('/api/companies', async (c) => c.json(await config.listCompanies(c.get('currentUser'))))
  app.post('/api/groups', async (c) => {
    const body = await readJsonBody(c)
    return c.json(
      await config.createGroup(c.get('currentUser'), {
        companyId: body?.companyId,
        name: body?.name,
        memberIds: body?.memberIds,
      }),
      201,
    )
  })
  app.get('/api/groups', async (c) => {
    const companyId = c.req.query('companyId')
    if (!companyId || !companyId.trim()) throw invalidRequest()
    return c.json(await config.listGroups(c.get('currentUser'), companyId.trim()))
  })
  app.put('/api/groups/:id', async (c) => {
    const body = await readJsonBody(c)
    return c.json(
      await config.updateGroup(c.get('currentUser'), c.req.param('id'), {
        name: body?.name,
        memberIds: body?.memberIds,
      }),
    )
  })
  app.post('/api/category-rules', async (c) => {
    const body = await readJsonBody(c)
    return c.json(
      await config.createRule(c.get('currentUser'), {
        companyId: body?.companyId,
        category: body?.category,
        groupId: body?.groupId,
      }),
      201,
    )
  })
  app.get('/api/category-rules', async (c) => {
    const companyId = c.req.query('companyId')
    if (!companyId || !companyId.trim()) throw invalidRequest()
    return c.json(await config.listRules(c.get('currentUser'), companyId.trim()))
  })
  app.delete('/api/category-rules/:id', async (c) => {
    await config.deleteRule(c.get('currentUser'), c.req.param('id'))
    return c.body(null, 204)
  })

  // 工单（契约 §4）
  app.post('/api/tickets', async (c) => {
    const body = await readJsonBody(c)
    return c.json(
      await tickets.createTicket(c.get('currentUser'), {
        title: body?.title,
        description: body?.description,
        category: body?.category,
        priority: body?.priority,
      }),
      201,
    )
  })
  app.get('/api/tickets', async (c) =>
    c.json(
      await tickets.listTickets(c.get('currentUser'), {
        status: c.req.query('status'),
        company: c.req.query('company'),
        category: c.req.query('category'),
        priority: c.req.query('priority'),
        q: c.req.query('q'),
        sort: c.req.query('sort'),
        order: c.req.query('order'),
        page: c.req.query('page'),
        pageSize: c.req.query('pageSize'),
      }),
    ),
  )
  app.get('/api/tickets/:id', async (c) => c.json(await tickets.getTicket(c.get('currentUser'), c.req.param('id'))))
  app.post('/api/tickets/:id/assign', async (c) => {
    const body = await readJsonBody(c)
    return c.json(
      await tickets.assignTicket(c.get('currentUser'), c.req.param('id'), {
        groupId: body?.groupId,
        assigneeId: body?.assigneeId,
      }),
    )
  })
  app.post('/api/tickets/:id/reassign', async (c) => {
    const body = await readJsonBody(c)
    return c.json(
      await tickets.reassignTicket(c.get('currentUser'), c.req.param('id'), {
        groupId: body?.groupId,
        assigneeId: body?.assigneeId,
      }),
    )
  })
  app.post('/api/tickets/:id/complete', async (c) => {
    const body = await readJsonBody(c)
    return c.json(
      await tickets.completeTicket(c.get('currentUser'), c.req.param('id'), { resolution: body?.resolution }),
    )
  })
  app.post('/api/tickets/:id/cancel', async (c) => {
    const body = await readJsonBody(c)
    return c.json(await tickets.cancelTicket(c.get('currentUser'), c.req.param('id'), { reason: body?.reason }))
  })
  app.get('/api/tickets/:id/submitter', async (c) =>
    c.json(await tickets.getSubmitterInfo(c.get('currentUser'), c.req.param('id'))),
  )

  // 回复、评价、日志、通知（契约 §5）
  app.get('/api/tickets/:id/replies', async (c) =>
    c.json(await tickets.listReplies(c.get('currentUser'), c.req.param('id'))),
  )
  app.post('/api/tickets/:id/replies', async (c) => {
    const body = await readJsonBody(c)
    return c.json(
      await tickets.addReply(c.get('currentUser'), c.req.param('id'), { content: body?.content }),
      201,
    )
  })
  app.post('/api/tickets/:id/rating', async (c) => {
    const body = await readJsonBody(c)
    return c.json(
      await tickets.addRating(c.get('currentUser'), c.req.param('id'), {
        score: body?.score,
        comment: body?.comment,
      }),
      201,
    )
  })
  app.get('/api/tickets/:id/logs', async (c) =>
    c.json(await tickets.listLogs(c.get('currentUser'), c.req.param('id'))),
  )
  app.get('/api/tickets/:id/notifications', async (c) =>
    c.json(await tickets.listNotifications(c.get('currentUser'), c.req.param('id'))),
  )

  // 统计分析（契约 §7）
  app.get('/api/stats/distribution', async (c) =>
    c.json(
      await stats.distribution(c.get('currentUser'), c.req.query('dimension'), {
        company: c.req.query('company') || undefined,
      }),
    ),
  )
  app.get('/api/stats/dashboard', async (c) =>
    c.json(await stats.dashboard(c.get('currentUser'), { company: c.req.query('company') || undefined })),
  )
}
