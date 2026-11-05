import type { Hono } from 'hono'
import type { initializePlatform } from './platform/bootstrap'
import { createIdentityService } from './services/identity'
import { createNotificationService } from './services/notifications'
import { createOrgService } from './services/org'
import { createStatsService } from './services/stats'
import { createTicketService } from './services/tickets'
import { registerAuthRoutes, registerIdentityRoutes } from './routes/auth-routes'
import { registerOrgRoutes } from './routes/org-routes'
import { registerStatsRoutes } from './routes/stats-routes'
import { registerTicketRoutes } from './routes/ticket-routes'

type Platform = Awaited<ReturnType<typeof initializePlatform>>

export function registerPublicRoutes(app: Hono, platform: Platform) {
  const identity = createIdentityService(platform.db, platform.permissions)
  registerAuthRoutes(app, platform, identity)
}

export function registerProtectedRoutes(app: Hono, platform: Platform) {
  const identity = createIdentityService(platform.db, platform.permissions)
  const org = createOrgService(platform.db)
  const tickets = createTicketService(platform.db, identity, org)
  const notifications = createNotificationService(platform.db, identity, tickets)
  const stats = createStatsService(platform.db)

  registerIdentityRoutes(app, platform, identity)
  registerTicketRoutes(app, identity, tickets, notifications)
  registerOrgRoutes(app, identity, org)
  registerStatsRoutes(app, identity, stats)
}
