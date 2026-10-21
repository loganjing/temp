import 'dotenv/config'
import { serve } from '@hono/node-server'
import { createApp } from './app'
import { createAuthBoundary, type AppEnv } from './platform/auth'
import { initializePlatform } from './platform/bootstrap'
import { registerPublicRoutes, registerProtectedRoutes } from './routes'

const platform = await initializePlatform()
const app = createApp<AppEnv>({
  registerPublicRoutes: (routes) => registerPublicRoutes(routes, platform),
  registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
  protect: createAuthBoundary(platform.db),
})
const port = Number(process.env.PORT || 3000)
const server = serve({ fetch: app.fetch, port }, () => {
  console.log(`[ticket-system] server listening on :${port}`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => server.close(() => { void platform.close() }))
}
