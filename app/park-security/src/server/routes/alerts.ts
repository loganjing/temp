import { Hono } from 'hono'
import type { DbClient } from '@commonapp/dbkit'
import * as service from '../services/alerts-service'

export function registerAlertRoutes(app: Hono, db: DbClient) {
  app.get('/api/alerts', async (c) => {
    const status = c.req.query('status')
    return c.json({ data: await service.listAlerts(db, status) })
  })
  app.get('/api/alerts/:id', async (c) => {
    const detail = await service.getAlertDetail(db, c.req.param('id'))
    return c.json({ data: detail })
  })
}
