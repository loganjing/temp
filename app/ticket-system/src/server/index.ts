import 'dotenv/config'
import { serve } from '@hono/node-server'
import { createApp } from './app'
import { createApplicationAuth } from './platform/auth'
import type { AppEnv } from './platform/auth'
import { initializePlatform } from './platform/bootstrap'
import { registerProtectedRoutes, registerPublicRoutes } from './routes'

const platform = await initializePlatform()
const auth = createApplicationAuth(platform.db)
const app = createApp<AppEnv>({
  registerPublicRoutes: (routes) => registerPublicRoutes(routes, auth),
  registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
  protect: auth.requireAnyAuth,
})
const port = Number(process.env.PORT || 3000)
const server = serve({ fetch: app.fetch, port }, () => {
  console.log(`[ticket-system] server listening on :${port}`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => server.close(() => { void platform.close() }))
}
