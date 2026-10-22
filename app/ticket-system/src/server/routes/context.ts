import type { Hono } from 'hono'
import { handler } from '../platform/http'
import { toMeContext } from '../tickets/service'
import { anyActor, type Platform } from './support'

export function registerContextRoutes(app: Hono, platform: Platform): void {
  app.get('/api/me/context', handler(async (context) => context.json(toMeContext(await anyActor(context, platform)))))
}
