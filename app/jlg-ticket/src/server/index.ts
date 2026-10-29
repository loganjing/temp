import 'dotenv/config'
import { serve } from '@hono/node-server'
import { createApp } from './app'
import { authBoundary } from './platform/auth'
import { initializePlatform } from './platform/bootstrap'
import { registerPublicRoutes, registerProtectedRoutes } from './routes'

const platform = await initializePlatform()
const app = createApp({
  registerPublicRoutes: (routes) => registerPublicRoutes(routes, platform),
  registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
  protect: authBoundary,
})
const port = Number(process.env.PORT ?? 3000)
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer from 0 to 65535')
const server = serve({ fetch: app.fetch, port }, () => {
  const address = server.address()
  console.log(`[jlg-ticket] server listening on :${typeof address === 'string' ? address : address?.port ?? port}`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => server.close(() => { void platform.close() }))
}
