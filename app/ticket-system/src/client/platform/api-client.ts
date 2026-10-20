export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

// 全局 401 处理：认证会话失效时由认证模块注册跳转登录，登录接口自身不触发。
let unauthorizedHandler: (() => void) | null = null

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler
}

export async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('platform-token')
  const headers = new Headers(options?.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (options?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(path, { ...options, headers })
  const data: unknown = response.status === 204 ? undefined : await response.json().catch(() => undefined)
  if (response.ok) return data as T
  if (response.status === 401 && token) unauthorizedHandler?.()
  const body = data && typeof data === 'object' ? data as Record<string, unknown> : undefined
  const error = body?.error
  const detail = error && typeof error === 'object' ? error as Record<string, unknown> : undefined
  throw new ApiRequestError(typeof detail?.message === 'string' ? detail.message : typeof error === 'string' ? error : `HTTP ${response.status}`, response.status, typeof detail?.code === 'string' ? detail.code : undefined)
}

// 统一把请求异常转为用户可读文案；404 按契约语义显示资源不存在或无权访问。
export function toUserMessage(cause: unknown, fallback: string): string {
  if (cause instanceof ApiRequestError) {
    if (cause.status === 404) return '资源不存在或无权访问'
    if (cause.message) return cause.message
  }
  return fallback
}
