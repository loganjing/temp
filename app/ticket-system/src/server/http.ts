import type { Context, MiddlewareHandler } from 'hono'
import type { AuthUser } from '@commonapp/userkit'
import { ApiError, notFound, unauthorized } from './errors'

/** 路由处理包装：领域层抛出的 ApiError 按契约结构返回；其余异常交给 app.onError。 */
export function wrap(handler: (c: Context) => Promise<Response>): MiddlewareHandler {
  return async (c) => {
    try {
      return await handler(c)
    } catch (error) {
      if (error instanceof ApiError) {
        return c.json({ error: { code: error.code, message: error.message } }, error.status)
      }
      throw error
    }
  }
}

export function contextUser(c: Context): AuthUser {
  const user = (c as unknown as { get(key: string): unknown }).get('currentUser')
  if (!user) throw unauthorized()
  return user as AuthUser
}

export async function readJson(c: Context): Promise<Record<string, unknown>> {
  const body = await c.req.json().catch(() => null)
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'VALIDATION', 'Request body must be a JSON object')
  }
  return body as Record<string, unknown>
}

/** 数字路径参数：非数字按 404 资源不存在处理（不暴露存在性）。 */
export function intParam(c: Context, name: string, resource: string): number {
  const raw = c.req.param(name)
  if (raw === undefined || !/^\d+$/.test(raw)) throw notFound(`${resource} not found`)
  return Number(raw)
}
