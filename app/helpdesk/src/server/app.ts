import { Hono, type MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { serveStatic } from '@hono/node-server/serve-static'
import { localeMiddleware } from './platform/locale'
import { ApiError, toErrorResponse } from './core/errors'
import type { AppEnv } from './core/session'

// 业务路由由实现阶段注册。平台边界在初始化后即可运行和验证。
export function createApp(options: {
  registerPublicRoutes?: (app: Hono<AppEnv>) => void
  registerProtectedRoutes?: (app: Hono<AppEnv>) => void
  protect?: MiddlewareHandler<AppEnv>
} = {}) {
  const app = new Hono<AppEnv>()

  app.onError((error, c) => {
    if (error instanceof ApiError) return toErrorResponse(error, c)
    if (error instanceof HTTPException) {
      return c.json({ error: { code: 'HTTP_ERROR', message: error.message } }, error.status)
    }
    console.error('[server] unhandled request error', error)
    return c.json({ error: { code: 'INTERNAL', message: 'Internal server error' } }, 500)
  })

  app.use('/api/*', localeMiddleware)
  app.get('/api/health', (c) => c.json({ ok: true, app: 'helpdesk' }))
  options.registerPublicRoutes?.(app)
  if (options.protect) app.use('/api/*', options.protect)
  options.registerProtectedRoutes?.(app)
  app.all('/api/*', (c) => c.json({ error: { code: 'NOT_FOUND', message: 'API route not found' } }, 404))

  // 生产模式托管前端构建产物；开发时前端走 Vite 代理。
  app.use('/*', serveStatic({ root: './dist' }))
  app.get('*', serveStatic({ path: './dist/index.html' }))
  return app
}

export const app = createApp()
