export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

export function describeError(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message
  if (error instanceof Error && error.message !== '') return error.message
  return '请求失败，请稍后重试'
}

// 会话失效（401 + AUTH_REQUIRED）时由会话层注册的回调；登录接口本身的
// 401（AUTH_INVALID）不触发，避免把“用户名或密码错误”当成会话过期。
let sessionExpiredHandler: (() => void) | null = null

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler
}

export async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('platform-token')
  const headers = new Headers(options?.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (options?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(path, { ...options, headers })
  const data: unknown = response.status === 204 ? undefined : await response.json().catch(() => undefined)
  if (response.ok) return data as T
  const body = data && typeof data === 'object' ? data as Record<string, unknown> : undefined
  const error = body?.error
  const detail = error && typeof error === 'object' ? error as Record<string, unknown> : undefined
  const code = typeof detail?.code === 'string' ? detail.code : undefined
  const message = typeof detail?.message === 'string'
    ? detail.message
    : typeof error === 'string' ? error : `HTTP ${response.status}`
  if (response.status === 401 && code === 'AUTH_REQUIRED') sessionExpiredHandler?.()
  throw new ApiRequestError(message, response.status, code)
}
