// Embed workbench routes (contract §11): requester-only summary/kanban; the
// service enforces the role so agents/managers get 403.
import type { Hono } from 'hono'
import { requestLocale, requireSession, type AppEnv } from '../core/session'
import type { Platform } from '../platform/bootstrap'
import { embedKanban, embedSummary } from '../services/embed'

export function registerEmbedRoutes(app: Hono<AppEnv>, platform: Platform): void {
  const db = platform.db

  app.get('/api/embed/summary', async (c) => {
    const user = requireSession(c)
    return c.json(await embedSummary(db, user, requestLocale(c)))
  })

  app.get('/api/embed/kanban', async (c) => {
    const user = requireSession(c)
    return c.json(await embedKanban(db, user, requestLocale(c)))
  })
}
