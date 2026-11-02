import { Hono, type Env, type MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { serveStatic } from '@hono/node-server/serve-static'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { localeMiddleware } from './platform/locale'
import { ApiError } from './services/errors'

// 业务路由由实现阶段注册。平台边界在初始化后即可运行和验证。
export function createApp<E extends Env = Env>(options: {
  registerPublicRoutes?: (app: Hono<E>) => void
  registerProtectedRoutes?: (app: Hono<E>) => void
  protect?: MiddlewareHandler<E>
} = {}) {
  const app = new Hono<E>()

  app.onError((error, c) => {
    if (error instanceof ApiError) {
      const body = { error: { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}) } }
      return c.json(body, error.status as ContentfulStatusCode)
    }
    if (error instanceof HTTPException) {
      return c.json({ error: { code: 'HTTP_ERROR', message: error.message } }, error.status)
    }
    console.error('[server] unhandled request error', error)
    return c.json({ error: { code: 'internal_error', message: 'Internal server error' } }, 500)
  })

  app.use('/api/*', localeMiddleware)
  app.get('/api/health', (c) => c.json({ ok: true, app: 'ticket-system', ...(process.env.QA_RUN_ID ? { qaRunId: process.env.QA_RUN_ID } : {}) }))
  options.registerPublicRoutes?.(app)
  if (options.protect) app.use('/api/*', options.protect)
  options.registerProtectedRoutes?.(app)
  app.all('/api/*', (c) => c.json({ error: { code: 'not_found', message: 'API route not found' } }, 404))

  // 生产模式托管前端构建产物；开发时前端走 Vite 代理。
  app.use('/*', serveStatic({ root: './dist' }))
  app.get('*', serveStatic({ path: './dist/index.html' }))
  return app
}

export const app = createApp()
