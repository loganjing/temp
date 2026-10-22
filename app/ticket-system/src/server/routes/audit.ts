import type { Hono } from 'hono'
import { PERMISSIONS } from '../../shared/contracts'
import { FieldCollector, handler, isoDateTime, pagination, queryString } from '../platform/http'
import { authorizedActor, type Platform } from './support'

export function registerAuditRoutes(app: Hono, platform: Platform): void {
  app.get('/api/audit-events', handler(async (context) => {
    const actor = await authorizedActor(context, platform, PERMISSIONS.AUDIT_READ)
    const collector = new FieldCollector()
    const { pageSize, offset } = pagination(context)
    const from = isoDateTime(collector, 'from', queryString(context, 'from'))
    const to = isoDateTime(collector, 'to', queryString(context, 'to'))
    collector.assertEmpty()
    const result = await platform.audit.list({
      companyId: actor.member.companyId,
      objectType: queryString(context, 'objectType') ?? undefined,
      objectId: queryString(context, 'objectId') ?? undefined,
      actorMemberId: queryString(context, 'actorMemberId') ?? undefined,
      action: queryString(context, 'action') ?? undefined,
      from: from ?? undefined,
      to: to ?? undefined,
      limit: pageSize,
      offset,
    })
    return context.json(result)
  }))
}
