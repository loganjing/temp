import 'dotenv/config'
import { serve } from '@hono/node-server'
import { createApp } from './app'
import { initializePlatform } from './platform/bootstrap'
import { registerPublicRoutes, registerProtectedRoutes } from './routes'

// 本项目未引入认证模块，业务 API 不挂载认证边界，直接对外开放。
const platform = await initializePlatform()
const app = createApp({
  registerPublicRoutes: (routes) => registerPublicRoutes(routes, platform),
  registerProtectedRoutes: (routes) => registerProtectedRoutes(routes, platform),
})
const port = Number(process.env.PORT ?? 3000)
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer from 0 to 65535')
const server = serve({ fetch: app.fetch, port }, () => {
  const address = server.address()
  console.log(`[k12-robot] server listening on :${typeof address === 'string' ? address : address?.port ?? port}`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => server.close(() => { void platform.close() }))
}
