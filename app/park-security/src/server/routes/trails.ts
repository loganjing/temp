import { Hono } from 'hono'
import type { DbClient } from '@commonapp/dbkit'
import * as service from '../services/trails-service'

export function registerTrailRoutes(app: Hono, db: DbClient) {
  app.get('/api/trails', async (c) => {
    const operationType = c.req.query('operation_type')
    return c.json({ data: await service.listTrails(db, operationType) })
  })
}
