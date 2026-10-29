import { Hono } from 'hono'
import type { Platform } from './services/helpers.js'
import { toCamel } from './services/helpers.js'
import * as org from './services/organization.js'
import * as cat from './services/categories.js'
import * as ticketSvc from './services/tickets.js'
import * as userSvc from './services/users.js'

// 工单系统按批准设计不引入独立认证基础设施；角色职责通过 API 入口区分。
// 业务路由注册为公开路由，在认证边界之前生效。
export function registerPublicRoutes(app: Hono, platform: Platform) {
  // 公司管理
  app.post('/api/companies', async (c) => {
    const body = await c.req.json()
    if (!body?.name?.trim()) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'name 不能为空' } }, 400)
    }
    const company = await org.createCompany(platform.db, body.name.trim())
    return c.json(toCamel(company), 201)
  })

  app.get('/api/companies', async (c) => {
    const items = await org.listCompanies(platform.db)
    return c.json({ items: toCamel(items) })
  })

  // 业务组管理
  app.get('/api/companies/:companyId/business-groups', async (c) => {
    const companyId = c.req.param('companyId')
    const items = await org.listBusinessGroups(platform.db, companyId)
    return c.json({ items: toCamel(items) })
  })

  app.post('/api/companies/:companyId/business-groups', async (c) => {
    const companyId = c.req.param('companyId')
    const body = await c.req.json()
    if (!body?.name?.trim()) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'name 不能为空' } }, 400)
    }
    const group = await org.createBusinessGroup(platform.db, companyId, body.name.trim())
    return c.json(toCamel(group), 201)
  })

  // 业务组成员管理
  app.get('/api/business-groups/:groupId/members', async (c) => {
    const groupId = c.req.param('groupId')
    const items = await org.listMembers(platform.db, groupId)
    return c.json({ items: toCamel(items) })
  })

  app.post('/api/business-groups/:groupId/members', async (c) => {
    const groupId = c.req.param('groupId')
    const body = await c.req.json()
    if (!body?.userId) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'userId 不能为空' } }, 400)
    }
    const member = await org.addMember(platform.db, groupId, body.userId)
    return c.json(toCamel(member), 201)
  })

  app.delete('/api/business-groups/:groupId/members/:userId', async (c) => {
    const groupId = c.req.param('groupId')
    const userId = c.req.param('userId')
    const result = await org.removeMember(platform.db, groupId, userId)
    return c.json(result)
  })

  // 分类管理
  app.get('/api/categories', async (c) => {
    const items = await cat.listCategories(platform.db)
    return c.json({ items: toCamel(items) })
  })

  app.post('/api/categories', async (c) => {
    const body = await c.req.json()
    if (!body?.name?.trim()) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'name 不能为空' } }, 400)
    }
    const category = await cat.createCategory(platform.db, body.name.trim())
    return c.json(toCamel(category), 201)
  })

  // 分类分配规则
  app.get('/api/companies/:companyId/assignment-rules', async (c) => {
    const companyId = c.req.param('companyId')
    const items = await cat.listAssignmentRules(platform.db, companyId)
    return c.json({ items: toCamel(items) })
  })

  app.post('/api/companies/:companyId/assignment-rules', async (c) => {
    const companyId = c.req.param('companyId')
    const body = await c.req.json()
    if (!body?.categoryId || !body?.groupId) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'categoryId 和 groupId 不能为空' } }, 400)
    }
    const rule = await cat.createAssignmentRule(platform.db, companyId, body.categoryId, body.groupId)
    return c.json(toCamel(rule), 201)
  })

  // 工单管理
  app.get('/api/tickets', async (c) => {
    const filters = {
      status: c.req.query('status'),
      priority: c.req.query('priority'),
      categoryId: c.req.query('categoryId'),
      submitterId: c.req.query('submitterId'),
      assignedGroupId: c.req.query('assignedGroupId'),
    }
    const items = await ticketSvc.listTickets(platform.db, filters)
    return c.json({ items: toCamel(items) })
  })

  app.post('/api/tickets', async (c) => {
    const body = await c.req.json()
    const ticket = await ticketSvc.createTicket(platform.db, {
      title: body?.title,
      description: body?.description,
      categoryId: body?.categoryId,
      submitterId: body?.submitterId,
      priority: body?.priority,
    })
    return c.json(toCamel(ticket), 201)
  })

  app.get('/api/tickets/:id', async (c) => {
    const id = c.req.param('id')
    const ticket = await ticketSvc.getTicketDetail(platform.db, id)
    return c.json(toCamel(ticket))
  })

  // 工单回复
  app.post('/api/tickets/:ticketId/replies', async (c) => {
    const ticketId = c.req.param('ticketId')
    const body = await c.req.json()
    const reply = await ticketSvc.addReply(platform.db, ticketId, body?.replierId, body?.content)
    return c.json(toCamel(reply), 201)
  })

  // 工单分配
  app.post('/api/tickets/:ticketId/assign', async (c) => {
    const ticketId = c.req.param('ticketId')
    const body = await c.req.json()
    const result = await ticketSvc.assignTicket(platform.db, ticketId, body?.groupId, body?.handlerId)
    return c.json(toCamel(result))
  })

  // 工单转派
  app.post('/api/tickets/:ticketId/transfer', async (c) => {
    const ticketId = c.req.param('ticketId')
    const body = await c.req.json()
    const result = await ticketSvc.transferTicket(platform.db, ticketId, body?.transferredBy, body?.toGroupId, body?.toHandlerId)
    return c.json(toCamel(result))
  })

  // 工单完成
  app.post('/api/tickets/:ticketId/complete', async (c) => {
    const ticketId = c.req.param('ticketId')
    const body = await c.req.json()
    const result = await ticketSvc.completeTicket(platform.db, ticketId, body?.processedBy)
    return c.json(toCamel(result))
  })

  // 工单取消
  app.post('/api/tickets/:ticketId/cancel', async (c) => {
    const ticketId = c.req.param('ticketId')
    const result = await ticketSvc.cancelTicket(platform.db, ticketId)
    return c.json(toCamel(result))
  })

  // 工单评价
  app.post('/api/tickets/:ticketId/evaluation', async (c) => {
    const ticketId = c.req.param('ticketId')
    const body = await c.req.json()
    const result = await ticketSvc.createEvaluation(platform.db, ticketId, body?.submitterId, body?.rating, body?.comment)
    return c.json(toCamel(result), 201)
  })

  app.get('/api/tickets/:ticketId/evaluation', async (c) => {
    const ticketId = c.req.param('ticketId')
    const result = await ticketSvc.getEvaluation(platform.db, ticketId)
    return c.json(toCamel(result))
  })

  // 用户信息
  app.get('/api/users/:userId', async (c) => {
    const userId = c.req.param('userId')
    const user = await userSvc.getUser(platform.db, userId)
    return c.json(toCamel(user))
  })

  app.get('/api/users/:userId/tickets', async (c) => {
    const userId = c.req.param('userId')
    const items = await userSvc.listUserTickets(platform.db, userId)
    return c.json({ items: toCamel(items) })
  })
}

// 受保护路由占位：工单系统不使用独立认证边界，业务路由已在公开层注册。
export function registerProtectedRoutes(_app: Hono, _platform: Platform) {}
