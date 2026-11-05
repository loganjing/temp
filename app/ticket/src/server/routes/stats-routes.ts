import type { Hono } from 'hono'
import type { IdentityService } from '../services/identity'
import type { StatsService } from '../services/stats'
import { currentIdentity, optionalString } from './helpers'

export function registerStatsRoutes(app: Hono, identityService: IdentityService, stats: StatsService) {
  app.get('/api/stats/overview', async (context) => {
    const actor = await currentIdentity(context, identityService)
    return context.json(
      await stats.overview(actor, {
        from: optionalString(context.req.query('from')),
        to: optionalString(context.req.query('to')),
        companyId: optionalString(context.req.query('companyId')),
      }),
    )
  })

  app.get('/api/stats/distribution', async (context) => {
    const actor = await currentIdentity(context, identityService)
    return context.json(
      await stats.distribution(actor, {
        dimension: context.req.query('dimension') ?? '',
        from: optionalString(context.req.query('from')),
        to: optionalString(context.req.query('to')),
        companyId: optionalString(context.req.query('companyId')),
      }),
    )
  })
}
