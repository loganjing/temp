import type { Hono } from 'hono'
import type { initializePlatform } from '../platform/bootstrap'
import { getUser, isAdmin, getCompanyScope, handleServiceError } from './helpers'
import { createServices } from '../services'

type Platform = Awaited<ReturnType<typeof initializePlatform>>
type Services = ReturnType<typeof createServices>

export function registerStatsRoutes(app: Hono, _platform: Platform, services: Services) {
  app.get('/api/statistics/distribution', async (c) => {
    try {
      const user = getUser(c)
      if (!isAdmin(user)) return c.json({ error: { code: 'forbidden', message: 'Admin access required' } }, 403)
      const dimension = c.req.query('dimension') ?? 'company'
      const result = await services.query.getDistribution(dimension, getCompanyScope(user, c.req.query('companyId')))
      return c.json(result)
    } catch (error) { return handleServiceError(c, error) }
  })

  app.get('/api/statistics/dashboard', async (c) => {
    try {
      const user = getUser(c)
      if (!isAdmin(user)) return c.json({ error: { code: 'forbidden', message: 'Admin access required' } }, 403)
      const result = await services.query.getDashboard(
        getCompanyScope(user, c.req.query('companyId')),
        c.req.query('startDate'), c.req.query('endDate'),
      )
      return c.json(result)
    } catch (error) { return handleServiceError(c, error) }
  })

  app.get('/api/logs', async (c) => {
    try {
      const user = getUser(c)
      if (!isAdmin(user)) return c.json({ error: { code: 'forbidden', message: 'Admin access required' } }, 403)
      const page = Math.max(1, Number(c.req.query('page')) || 1)
      const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize')) || 20))
      const result = await services.query.getLogs({
        ticketId: c.req.query('ticketId'), action: c.req.query('action'),
        startDate: c.req.query('startDate'), endDate: c.req.query('endDate'),
        page, pageSize,
      })
      return c.json(result)
    } catch (error) { return handleServiceError(c, error) }
  })
}
