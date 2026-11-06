import { Hono } from 'hono'
import type { DbClient } from '@commonapp/dbkit'
import * as service from '../services/events-service'

export function registerEventRoutes(app: Hono, db: DbClient) {
  app.post('/api/events/recognize', async (c) => {
    const event = await service.recognizeEvent(db)
    return c.json({ data: event }, 201)
  })
  app.get('/api/events', async (c) => {
    const videoSourceId = c.req.query('video_source_id')
    return c.json({ data: await service.listEvents(db, videoSourceId) })
  })
}
