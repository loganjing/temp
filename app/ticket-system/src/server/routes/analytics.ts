import type { Hono } from 'hono'
import { PERMISSIONS } from '../../shared/contracts'
import { FieldCollector, enumField, handler, isoDateTime, queryString } from '../platform/http'
import { authorizedActor, type Platform } from './support'

const BOUNDARIES = ['company', 'department'] as const

export function registerAnalyticsRoutes(app: Hono, platform: Platform): void {
  app.get('/api/analytics/distribution', handler(async (context) => {
    const actor = await authorizedActor(context, platform, PERMISSIONS.ANALYTICS_READ)
    const collector = new FieldCollector()
    const by = enumField(collector, 'by', context.req.query('by'), BOUNDARIES)
    const from = isoDateTime(collector, 'from', queryString(context, 'from'))
    const to = isoDateTime(collector, 'to', queryString(context, 'to'))
    collector.assertEmpty()
    const result = await platform.analytics.distribution(actor.member.companyId, actor.member.companyName, {
      by: by as 'company' | 'department',
      from: from ?? undefined,
      to: to ?? undefined,
    })
    return context.json(result)
  }))

  app.get('/api/analytics/overview', handler(async (context) => {
    const actor = await authorizedActor(context, platform, PERMISSIONS.ANALYTICS_READ)
    const collector = new FieldCollector()
    const from = isoDateTime(collector, 'from', queryString(context, 'from'))
    const to = isoDateTime(collector, 'to', queryString(context, 'to'))
    collector.assertEmpty()
    const result = await platform.analytics.overview(actor.member.companyId, {
      from: from ?? undefined,
      to: to ?? undefined,
      groupId: queryString(context, 'groupId') ?? undefined,
      category: queryString(context, 'category') ?? undefined,
    })
    return context.json(result)
  }))
}
