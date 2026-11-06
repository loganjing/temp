import { Hono } from 'hono'
import type { DbClient } from '@commonapp/dbkit'
import * as service from '../services/video-sources-service'

export function registerVideoSourceRoutes(app: Hono, db: DbClient) {
  app.get('/api/video-sources', async (c) => c.json({ data: await service.listVideoSources(db) }))
}
