// 唯一浏览器请求边界：Bearer token、JSON 编解码与 API 错误解码。
// 错误结构统一为 {"error":{"code":"<CODE>","message":"..."}}（契约第 0 节）。
export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

let unauthorizedHandler: (() => void) | null = null

/** 注册 401 处理（App 用它清理会话并回到登录页）。 */
export function onUnauthorized(handler: () => void): void {
  unauthorizedHandler = handler
}

export async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('platform-token')
  const headers = new Headers(options?.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (options?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(path, { ...options, headers })
  if (response.status === 401) unauthorizedHandler?.()
  const data: unknown = response.status === 204 ? undefined : await response.json().catch(() => undefined)
  if (response.ok) return data as T
  const body = data && typeof data === 'object' ? (data as Record<string, unknown>) : undefined
  const error = body?.error
  const detail = error && typeof error === 'object' ? (error as Record<string, unknown>) : undefined
  throw new ApiRequestError(
    typeof detail?.message === 'string' && detail.message ? detail.message : `HTTP ${response.status}`,
    response.status,
    typeof detail?.code === 'string' ? detail.code : undefined,
  )
}

/** 组装查询串：跳过 undefined / null / 空字符串。 */
export function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const query = search.toString()
  return query ? `?${query}` : ''
}
