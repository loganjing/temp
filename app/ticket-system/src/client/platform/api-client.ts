export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message)
    this.name = 'ApiRequestError'
  }
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

export interface Pagination {
  page: number
  limit: number
  total: number
}

export interface Paginated<T> {
  data: T[]
  pagination: Pagination
}

// 从查询参数对象构造 query string，跳过 undefined / null / 空字符串。
export function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    sp.set(key, String(value))
  }
  const str = sp.toString()
  return str ? `?${str}` : ''
}

export function errorCodeOf(error: unknown): string | undefined {
  return error instanceof ApiRequestError ? error.code : undefined
}

export function isForbidden(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 403
}

export function isConflict(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 409
}
