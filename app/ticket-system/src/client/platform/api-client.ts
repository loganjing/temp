export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

// 403 与 404 一律呈现为“不存在或无权访问”，避免泄露他公司对象的存在性。
export function describeError(error: unknown, fallback = '操作失败 / Request failed'): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 403 || error.status === 404) return '不存在或无权访问 / Not found or no access'
    if (error.status === 401) return '登录状态已失效，请重新登录 / Session expired, please sign in again'
    if (error.status === 409) return `操作冲突：${error.message} / Conflict: ${error.message}`
    if (error.status === 422) return `当前状态不允许此操作：${error.message} / Not allowed in the current state`
    return error.message || fallback
  }
  return error instanceof Error ? error.message : fallback
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
  throw new ApiRequestError(typeof detail?.message === 'string' ? detail.message : typeof error === 'string' ? error : `HTTP ${response.status}`, response.status, typeof detail?.code === 'string' ? detail.code : undefined)
}
