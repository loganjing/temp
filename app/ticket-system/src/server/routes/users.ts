import type { Hono } from 'hono'
import type { initializePlatform } from '../platform/bootstrap'
import { getUser, isAdmin, getCompanyScope, handleServiceError } from './helpers'
import { createServices } from '../services'

type Platform = Awaited<ReturnType<typeof initializePlatform>>
type Services = ReturnType<typeof createServices>

function effectiveRole(roles: string[]): string {
  if (roles.includes('admin')) return 'admin'
  if (roles.includes('handler')) return 'handler'
  return 'submitter'
}

export function registerUserRoutes(app: Hono, platform: Platform, services: Services) {
  app.get('/api/users/:userId', async (c) => {
    try {
      const user = getUser(c)
      const profile = await services.query.getUserProfile(c.req.param('userId'))
      if (!isAdmin(user) && profile.companyId !== user.companyId) {
        return c.json({ error: { code: 'forbidden', message: 'Cannot view users from other companies' } }, 403)
      }
      const roles = await platform.permissionKit.getRoles(c.req.param('userId'))
      return c.json({ ...profile, role: effectiveRole(roles) })
    } catch (error) { return handleServiceError(c, error) }
  })

  app.get('/api/users/:userId/tickets', async (c) => {
    try {
      const user = getUser(c)
      const profile = await services.query.getUserProfile(c.req.param('userId'))
      if (!isAdmin(user) && profile.companyId !== user.companyId) {
        return c.json({ error: { code: 'forbidden', message: 'Cannot view users from other companies' } }, 403)
      }
      const page = Math.max(1, Number(c.req.query('page')) || 1)
      const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize')) || 20))
      const result = await services.query.getUserTickets(c.req.param('userId'), getCompanyScope(user), page, pageSize)
      return c.json(result)
    } catch (error) { return handleServiceError(c, error) }
  })
}
