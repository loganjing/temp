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
