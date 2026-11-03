import type { Hono } from 'hono'
import type { initializePlatform } from '../platform/bootstrap'
import { getUser, isAdmin, getCompanyScope, handleServiceError, requireString } from './helpers'
import { createServices } from '../services'

type Platform = Awaited<ReturnType<typeof initializePlatform>>
type Services = ReturnType<typeof createServices>

export function registerOrgRoutes(app: Hono, _platform: Platform, services: Services) {
  app.get('/api/business-groups', async (c) => {
    try {
      const user = getUser(c)
      const result = await services.org.listBusinessGroups(getCompanyScope(user, c.req.query('companyId')))
      return c.json(result)
    } catch (error) { return handleServiceError(c, error) }
  })

  app.post('/api/business-groups', async (c) => {
    try {
      const user = getUser(c)
      if (!isAdmin(user)) return c.json({ error: { code: 'forbidden', message: 'Admin access required' } }, 403)
      const body = await c.req.json().catch(() => ({}))
      const result = await services.org.createBusinessGroup(requireString(body.name, 'name'), getCompanyScope(user, body.companyId))
      return c.json(result, 201)
    } catch (error) { return handleServiceError(c, error) }
  })

  app.post('/api/business-groups/:groupId/members', async (c) => {
    try {
      const user = getUser(c)
      if (!isAdmin(user)) return c.json({ error: { code: 'forbidden', message: 'Admin access required' } }, 403)
      const body = await c.req.json().catch(() => ({}))
      const result = await services.org.addMember(c.req.param('groupId'), requireString(body.userId, 'userId'), getCompanyScope(user))
      return c.json(result, 201)
    } catch (error) { return handleServiceError(c, error) }
  })

  app.delete('/api/business-groups/:groupId/members/:userId', async (c) => {
    try {
      const user = getUser(c)
      if (!isAdmin(user)) return c.json({ error: { code: 'forbidden', message: 'Admin access required' } }, 403)
      await services.org.removeMember(c.req.param('groupId'), c.req.param('userId'), getCompanyScope(user))
      return c.body(null, 204)
    } catch (error) { return handleServiceError(c, error) }
  })

  app.get('/api/categories', async (c) => {
    try {
      const user = getUser(c)
      const result = await services.org.listCategories(getCompanyScope(user))
      return c.json(result)
    } catch (error) { return handleServiceError(c, error) }
  })

  app.post('/api/categories', async (c) => {
    try {
      const user = getUser(c)
      if (!isAdmin(user)) return c.json({ error: { code: 'forbidden', message: 'Admin access required' } }, 403)
      const body = await c.req.json().catch(() => ({}))
      const result = await services.org.createCategory(requireString(body.name, 'name'), getCompanyScope(user))
      return c.json(result, 201)
    } catch (error) { return handleServiceError(c, error) }
  })

  app.get('/api/assignment-rules', async (c) => {
    try {
      const user = getUser(c)
      const result = await services.org.listAssignmentRules(getCompanyScope(user))
      return c.json(result)
    } catch (error) { return handleServiceError(c, error) }
  })

  app.post('/api/assignment-rules', async (c) => {
    try {
      const user = getUser(c)
      if (!isAdmin(user)) return c.json({ error: { code: 'forbidden', message: 'Admin access required' } }, 403)
      const body = await c.req.json().catch(() => ({}))
      const result = await services.org.createAssignmentRule(
        requireString(body.categoryId, 'categoryId'),
        requireString(body.businessGroupId, 'businessGroupId'),
        getCompanyScope(user),
      )
      return c.json(result, 201)
    } catch (error) { return handleServiceError(c, error) }
  })
}
