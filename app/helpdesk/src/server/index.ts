import 'dotenv/config'
import { serve } from '@hono/node-server'
import { createApp } from './app'
import { initializePlatform } from './platform/bootstrap'
import { registerPublicRoutes, registerProtectedRoutes } from './routes'

const platform = await initializePlatform()
const app = createApp({
  registerPublicRoutes: (routes) => registerPublicRoutes(routes, platform),
  registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
  protect: platform.auth.authBoundary,
})
const port = Number(process.env.PORT || 3000)
const server = serve({ fetch: app.fetch, port }, () => {
  console.log(`[helpdesk] server listening on :${port}`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => server.close(() => { void platform.close() }))
}
