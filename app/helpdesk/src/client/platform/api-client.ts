// 浏览器请求边界：统一鉴权头、Accept-Language、错误结构解码与线格式归一。

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

const TOKEN_STORAGE_KEY = 'helpdesk.token'
/** 会话令牌失效时广播，SessionProvider 监听后回到匿名态 */
export const UNAUTHORIZED_EVENT = 'helpdesk:unauthorized'

let apiLocale = 'zh'

export function setApiLocale(locale: string): void {
  apiLocale = locale === 'en' ? 'en' : 'zh'
}

export function getApiLocale(): string {
  return apiLocale
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token)
    else localStorage.removeItem(TOKEN_STORAGE_KEY)
  } catch {
    /* 存储不可用时按无令牌处理 */
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

async function decodeError(response: Response): Promise<ApiRequestError> {
  const data: unknown = await response.json().catch(() => undefined)
  const body = data && typeof data === 'object' ? (data as Record<string, unknown>) : undefined
  const error = body?.error
  const detail = error && typeof error === 'object' ? (error as Record<string, unknown>) : undefined
  const details =
    detail?.details && typeof detail.details === 'object' ? (detail.details as Record<string, unknown>) : undefined
  return new ApiRequestError(
    typeof detail?.message === 'string' ? detail.message : typeof error === 'string' ? error : `HTTP ${response.status}`,
    response.status,
    typeof detail?.code === 'string' ? detail.code : undefined,
    details,
  )
}

function requestHeaders(skipAuth: boolean, extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { 'Accept-Language': getApiLocale() }
  if (!skipAuth) {
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }
  return extra ? { ...headers, ...extra } : headers
}

export interface RequestInitEx extends RequestInit {
  skipAuth?: boolean
}

export async function apiRequest<T>(path: string, init?: RequestInitEx): Promise<T> {
  const headers = requestHeaders(init?.skipAuth ?? false, init?.headers as Record<string, string> | undefined)
  const response = await fetch(path, { ...init, headers })
  if (response.status === 401 && !(init?.skipAuth ?? false)) {
    setToken(null)
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
  }
  if (!response.ok) throw await decodeError(response)
  if (response.status === 204) return undefined as T
  return camelCaseResponse(await response.json()) as T
}

/** multipart 上传（浏览器自动生成边界，不手写 Content-Type） */
export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  const response = await fetch(path, { method: 'POST', headers: requestHeaders(false), body: form })
  if (!response.ok) throw await decodeError(response)
  return camelCaseResponse(await response.json()) as T
}

/** 鉴权文件下载：以 Blob 触发浏览器保存 */
export async function apiDownload(path: string, fallbackName: string): Promise<void> {
  const response = await fetch(path, { headers: requestHeaders(false) })
  if (!response.ok) throw await decodeError(response)
  const blob = await response.blob()
  const disposition = response.headers.get('Content-Disposition') ?? ''
  const match = /filename\*?=(?:UTF-8''|")?([^";]+)"?/i.exec(disposition)
  const fileName = match?.[1] ? decodeURIComponent(match[1].trim()) : fallbackName
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

/** JSON 请求体便捷构造 */
export function jsonInit(method: string, body: unknown, skipAuth = false): RequestInitEx {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  return { method, skipAuth, headers, body: JSON.stringify(body) }
}
