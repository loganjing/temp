import type { ApiError } from './types'

export class FetchError extends Error {
  code: string
  status: number
  details: Record<string, unknown> | undefined

  constructor(code: string, message: string, status: number, details?: Record<string, unknown>) {
    super(message)
    this.name = 'FetchError'
    this.code = code
    this.status = status
    this.details = details
  }
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  let resp: Response
  try {
    resp = await fetch(path, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ...(options?.headers || {}),
      },
      ...options,
    })
  } catch (e) {
    throw new FetchError('NETWORK', '网络请求失败，请检查连接', 0)
  }

  const text = await resp.text()
  let body: unknown = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }

  if (!resp.ok) {
    const err = (body as { error?: ApiError })?.error
    if (err) {
      throw new FetchError(err.code, err.message, resp.status, err.details)
    }
    throw new FetchError('HTTP_ERROR', `请求失败 (${resp.status})`, resp.status)
  }

  return body as T
}
