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
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase()),
      camelCaseResponse(nested),
    ]),
  )
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

function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') sp.append(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

export function apiGet<T>(
  path: string,
  params?: Record<string, string | number | undefined | null>,
): Promise<T> {
  return apiRequest<T>(params ? path + buildQuery(params) : path)
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function apiDelete(path: string): Promise<void> {
  return apiRequest<void>(path, { method: 'DELETE' })
}
