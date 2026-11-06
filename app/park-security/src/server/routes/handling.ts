import { Hono } from 'hono'
import type { DbClient } from '@commonapp/dbkit'
import * as alertsService from '../services/alerts-service'

export function registerHandlingRoutes(app: Hono, db: DbClient) {
  app.post('/api/alerts/:id/handling', async (c) => {
    const result = await alertsService.handleAlert(db, c.req.param('id'), await c.req.json())
    return c.json({ data: result })
  })
}
