import { Hono, type Env, type MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { serveStatic } from '@hono/node-server/serve-static'
import { localeMiddleware } from './platform/locale'

// 业务路由由实现阶段注册。平台边界在初始化后即可运行和验证。
export function createApp<E extends Env = Env>(options: {
  registerPublicRoutes?: (app: Hono<E>) => void
  registerProtectedRoutes?: (app: Hono<E>) => void
  protect?: MiddlewareHandler<E>
} = {}) {
  const app = new Hono<E>()

  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      return c.json({ error: { code: 'HTTP_ERROR', message: error.message } }, error.status)
    }
    console.error('[server] unhandled request error', error)
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500)
  })

  app.use('/api/*', localeMiddleware)
  app.get('/api/health', (c) => c.json({ ok: true, app: 'ticketing' }))
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
