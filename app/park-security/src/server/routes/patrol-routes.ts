import { Hono } from 'hono'
import type { DbClient } from '@commonapp/dbkit'
import * as service from '../services/patrol-routes-service'

export function registerPatrolRoutes(app: Hono, db: DbClient) {
  app.get('/api/patrol-routes', async (c) => c.json({ data: await service.listPatrolRoutes(db) }))
  app.get('/api/patrol-routes/:id', async (c) => c.json({ data: await service.getPatrolRoute(db, c.req.param('id')) }))
  app.post('/api/patrol-routes', async (c) => {
    const route = await service.createPatrolRoute(db, await c.req.json())
    return c.json({ data: route }, 201)
  })
  app.put('/api/patrol-routes/:id', async (c) => {
    const route = await service.updatePatrolRoute(db, c.req.param('id'), await c.req.json())
    return c.json({ data: route })
  })
  app.delete('/api/patrol-routes/:id', async (c) => {
    const result = await service.deletePatrolRoute(db, c.req.param('id'))
    return c.json({ data: result })
  })
}
