import type { Hono } from 'hono'
import type { initializePlatform } from './platform/bootstrap'
import * as svc from './services'

type Platform = Awaited<ReturnType<typeof initializePlatform>>

// 工单系统无认证要求（架构基线未选择 authkit）；业务路由全部注册为公开路由。
export function registerPublicRoutes(app: Hono, platform: Platform) {
  const { db } = platform

  // ── 公司 ──────────────────────────────────────────────────────
  app.get('/api/companies', async (c) => c.json({ companies: await svc.listCompanies(db) }))
  app.post('/api/companies', async (c) => {
    const { name } = await c.req.json()
    return c.json({ company: await svc.createCompany(db, name) }, 201)
  })

  // ── 业务组 ────────────────────────────────────────────────────
  app.get('/api/companies/:companyId/business-groups', async (c) => {
    const companyId = Number(c.req.param('companyId'))
    return c.json({ groups: await svc.listBusinessGroups(db, companyId) })
  })
  app.post('/api/companies/:companyId/business-groups', async (c) => {
    const companyId = Number(c.req.param('companyId'))
    const { name } = await c.req.json()
    return c.json({ group: await svc.createBusinessGroup(db, companyId, name) }, 201)
  })

  // ── 业务组成员 ────────────────────────────────────────────────
  app.get('/api/business-groups/:id/members', async (c) => {
    const groupId = Number(c.req.param('id'))
    return c.json({ members: await svc.listGroupMembers(db, groupId) })
  })
  app.post('/api/business-groups/:id/members', async (c) => {
    const groupId = Number(c.req.param('id'))
    const { userId } = await c.req.json()
    return c.json({ member: await svc.addGroupMember(db, groupId, userId) }, 201)
  })
  app.delete('/api/business-groups/:id/members/:userId', async (c) => {
    const groupId = Number(c.req.param('id'))
    const userId = Number(c.req.param('userId'))
    const changes = await svc.removeGroupMember(db, groupId, userId)
    if (changes === 0) return c.json({ error: { code: 'MEMBER_NOT_FOUND', message: 'Member not found' } }, 404)
    return c.body(null, 204)
  })

  // ── 分类 ──────────────────────────────────────────────────────
  app.get('/api/categories', async (c) => c.json({ categories: await svc.listCategories(db) }))
  app.post('/api/categories', async (c) => {
    const { name } = await c.req.json()
    return c.json({ category: await svc.createCategory(db, name) }, 201)
  })

  // ── 分类→业务组映射规则 ──────────────────────────────────────
  app.get('/api/category-group-rules', async (c) => {
    const companyIdStr = c.req.query('companyId')
    const companyId = companyIdStr ? Number(companyIdStr) : undefined
    return c.json({ rules: await svc.listRules(db, companyId) })
  })
  app.post('/api/category-group-rules', async (c) => {
    const { companyId, categoryId, groupId } = await c.req.json()
    return c.json({ rule: await svc.createRule(db, companyId, categoryId, groupId) }, 201)
  })
  app.delete('/api/category-group-rules/:id', async (c) => {
    const id = Number(c.req.param('id'))
    const changes = await svc.deleteRule(db, id)
    if (changes === 0) return c.json({ error: { code: 'RULE_NOT_FOUND', message: 'Rule not found' } }, 404)
    return c.body(null, 204)
  })

  // ── 用户 ──────────────────────────────────────────────────────
  app.get('/api/users/:id', async (c) => {
    const id = Number(c.req.param('id'))
    return c.json({ user: await svc.getUserDetail(db, id) })
  })

  // ── 工单 ──────────────────────────────────────────────────────
  app.post('/api/tickets', async (c) => {
    const body = await c.req.json()
    return c.json({ ticket: await svc.createTicket(db, body) }, 201)
  })
  app.get('/api/tickets', async (c) => {
    const filters = {
      status: c.req.query('status'),
      categoryId: c.req.query('categoryId') ? Number(c.req.query('categoryId')) : undefined,
      priority: c.req.query('priority'),
      assigneeId: c.req.query('assigneeId') ? Number(c.req.query('assigneeId')) : undefined,
      submitterId: c.req.query('submitterId') ? Number(c.req.query('submitterId')) : undefined,
    }
    return c.json({ tickets: await svc.listTickets(db, filters) })
  })
  app.get('/api/tickets/:id', async (c) => {
    const id = Number(c.req.param('id'))
    return c.json({ ticket: await svc.getTicketDetail(db, id) })
  })
  app.patch('/api/tickets/:id/status', async (c) => {
    const id = Number(c.req.param('id'))
    const body = await c.req.json()
    return c.json({ ticket: await svc.updateTicketStatus(db, id, body) })
  })

  // ── 回复 ──────────────────────────────────────────────────────
  app.post('/api/tickets/:id/replies', async (c) => {
    const id = Number(c.req.param('id'))
    const body = await c.req.json()
    return c.json({ reply: await svc.addReply(db, id, body) }, 201)
  })
  app.get('/api/tickets/:id/replies', async (c) => {
    const id = Number(c.req.param('id'))
    // Reuse ticket detail's reply fetch via a lightweight path
    const detail = await svc.getTicketDetail(db, id)
    return c.json({ replies: detail.replies })
  })

  // ── 转派 ──────────────────────────────────────────────────────
  app.post('/api/tickets/:id/transfer', async (c) => {
    const id = Number(c.req.param('id'))
    const body = await c.req.json()
    return c.json({ ticket: await svc.transferTicket(db, id, body) })
  })
  app.get('/api/tickets/:id/transfers', async (c) => {
    const id = Number(c.req.param('id'))
    const detail = await svc.getTicketDetail(db, id)
    return c.json({ transfers: detail.transfers })
  })

  // ── 评价 ──────────────────────────────────────────────────────
  app.post('/api/tickets/:id/evaluation', async (c) => {
    const id = Number(c.req.param('id'))
    const body = await c.req.json()
    return c.json({ evaluation: await svc.createEvaluation(db, id, body) }, 201)
  })
  app.get('/api/tickets/:id/evaluation', async (c) => {
    const id = Number(c.req.param('id'))
    const detail = await svc.getTicketDetail(db, id)
    if (!detail.evaluation) return c.json({ error: { code: 'EVALUATION_NOT_FOUND', message: 'No evaluation found' } }, 404)
    return c.json({ evaluation: detail.evaluation })
  })
}

// 受保护路由占位（未选择 authkit，当前无受保护业务路由）。
export function registerProtectedRoutes(_app: Hono, _platform: Platform) {}
