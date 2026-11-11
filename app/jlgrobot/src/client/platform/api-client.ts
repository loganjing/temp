// 单一浏览器请求边界：请求 /api，响应标准化与 API 错误解码。
// 响应保持契约 snake_case 字段（与 src/shared/contracts.ts 一致），不做 camelCase 转换。

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

export interface ListResponse<T> {
  items: T[]
}

type QueryValue = string | number | undefined | null

function buildQuery(params: Record<string, QueryValue>): string {
  const sp = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') sp.set(key, String(value))
  }
  const str = sp.toString()
  return str ? `?${str}` : ''
}

function jsonHeaders(init?: HeadersInit): HeadersInit {
  return { 'Content-Type': 'application/json', ...(init ?? {}) }
}

export async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: jsonHeaders(options?.headers),
  })
  const data: unknown =
    response.status === 204 ? undefined : await response.json().catch(() => undefined)
  if (response.ok) return data as T

  const body = data && typeof data === 'object' ? (data as Record<string, unknown>) : undefined
  const error = body?.error
  const detail = error && typeof error === 'object' ? (error as Record<string, unknown>) : undefined
  throw new ApiRequestError(
    typeof detail?.message === 'string'
      ? detail.message
      : typeof error === 'string'
        ? error
        : `HTTP ${response.status}`,
    response.status,
    typeof detail?.code === 'string' ? detail.code : undefined,
  )
}

export async function apiGet<T>(path: string, params?: Record<string, QueryValue>): Promise<T> {
  return apiRequest<T>(`${path}${buildQuery(params ?? {})}`)
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: 'POST',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: 'PATCH',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}
