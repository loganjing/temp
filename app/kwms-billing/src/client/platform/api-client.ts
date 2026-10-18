export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string, readonly field?: string) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

async function decodeError(response: Response): Promise<ApiRequestError> {
  const data: unknown = await response.json().catch(() => undefined)
  const body = data && typeof data === 'object' ? (data as Record<string, unknown>) : undefined
  const error = body?.error
  const detail = error && typeof error === 'object' ? (error as Record<string, unknown>) : undefined
  const message = typeof detail?.message === 'string' && detail.message
    ? detail.message
    : typeof error === 'string' ? error : `请求失败（HTTP ${response.status}）`
  return new ApiRequestError(
    message,
    response.status,
    typeof detail?.code === 'string' ? detail.code : undefined,
    typeof detail?.field === 'string' ? detail.field : undefined,
  )
}

function authHeaders(): Headers {
  const headers = new Headers()
  const token = localStorage.getItem('platform-token')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return headers
}

export async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = authHeaders()
  if (options?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  let response: Response
  try {
    response = await fetch(path, { ...options, headers })
  } catch {
    throw new ApiRequestError('无法连接服务，请检查网络后重试', 0, 'NETWORK_ERROR')
  }
  if (response.status === 401) localStorage.removeItem('platform-token')
  const data: unknown = response.status === 204 ? undefined : await response.json().catch(() => undefined)
  if (response.ok) return data as T
  throw await decodeError(response)
}

// 报表导出：请求 xlsx 二进制流并触发浏览器保存，返回保存的文件名。
export async function apiDownload(path: string, fallbackName: string): Promise<string> {
  let response: Response
  try {
    response = await fetch(path, { headers: authHeaders() })
  } catch {
    throw new ApiRequestError('无法连接服务，请检查网络后重试', 0, 'NETWORK_ERROR')
  }
  if (response.status === 401) localStorage.removeItem('platform-token')
  if (!response.ok) throw await decodeError(response)
  const disposition = response.headers.get('Content-Disposition') ?? ''
  const match = /filename="?([^";]+)"?/.exec(disposition)
  const filename = match?.[1] ?? fallbackName
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
  return filename
}
