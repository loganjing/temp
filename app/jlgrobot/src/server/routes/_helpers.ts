import type { Context } from 'hono'

/** 统一 400 错误响应，符合契约 {error:{code,message}} */
export function badRequest(c: Context, message: string) {
  return c.json({ error: { code: 'BAD_REQUEST', message } }, 400)
}

/** 统一 404 错误响应 */
export function notFound(c: Context, message: string) {
  return c.json({ error: { code: 'NOT_FOUND', message } }, 404)
}

/** 读取 JSON 请求体；解析失败返回 null（由调用方决定 400 响应） */
export async function readJsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json()
  } catch {
    return null
  }
}

export function isString(value: unknown): value is string {
  return typeof value === 'string'
}

export function trimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}
