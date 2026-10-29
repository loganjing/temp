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

function camelCaseResponse(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelCaseResponse)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
    key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase()),
    camelCaseResponse(nested),
  ]))
}

export async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, options)
  const data: unknown =
    response.status === 204 ? undefined : await response.json().catch(() => undefined)
  if (response.ok) return camelCaseResponse(data) as T

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

/** GET 请求，自动拼接查询参数（跳过空值）。 */
export async function apiGet<T>(
  path: string,
  params?: Record<string, string | undefined>,
): Promise<T> {
  let url = path
  if (params) {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== '') as [string, string][],
    ).toString()
    if (qs) url += `?${qs}`
  }
  return apiRequest<T>(url)
}

/** POST JSON 请求。 */
export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body != null ? JSON.stringify(body) : undefined,
  })
}

/** DELETE 请求。 */
export async function apiDelete<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: 'DELETE' })
}
