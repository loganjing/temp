import type { ValidationDetail } from '../types'

export class ApiRequestError extends Error {
  readonly details?: ValidationDetail[]
  constructor(message: string, readonly status: number, readonly code?: string, details?: ValidationDetail[]) {
    super(message)
    this.name = 'ApiRequestError'
    this.details = details
  }
}

export function errorText(cause: unknown): string {
  if (cause instanceof ApiRequestError) {
    const details = (cause.details ?? []).map((item) => `${item.field}：${item.reason}`).join('；')
    return details ? `${cause.message}（${details}）` : cause.message
  }
  return cause instanceof Error ? cause.message : '请求失败，请稍后重试'
}

type ApiHandlers = { onUnauthorized?: () => void; onPasswordChangeRequired?: () => void }
let handlers: ApiHandlers = {}
export function setApiHandlers(next: ApiHandlers) {
  handlers = next
}

/** 从错误体解析 { error: { code, message, details } }（服务端 lib/api 契约形状）。 */
function decodeError(data: unknown): { code?: string; message: string; details?: ValidationDetail[] } {
  const body = data && typeof data === 'object' ? (data as Record<string, unknown>) : undefined
  const error = body?.error
  const detail = error && typeof error === 'object' ? (error as Record<string, unknown>) : undefined
  const code = typeof detail?.code === 'string' ? detail.code : undefined
  const message = typeof detail?.message === 'string' ? detail.message : typeof error === 'string' ? error : '请求失败'
  const details = Array.isArray(detail?.details)
    ? (detail!.details as unknown[]).filter(
        (item): item is ValidationDetail =>
          typeof item === 'object' && item !== null && typeof (item as ValidationDetail).field === 'string' && typeof (item as ValidationDetail).reason === 'string',
      )
    : undefined
  return { code, message, details }
}

export async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('platform-token')
  const headers = new Headers(options?.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const isFormData = typeof FormData !== 'undefined' && options?.body instanceof FormData
  if (options?.body && !isFormData && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(path, { ...options, headers })
  const data: unknown = response.status === 204 ? undefined : await response.json().catch(() => undefined)
  if (response.ok) return data as T
  const { code, message, details } = decodeError(data)
  // 401 且本次请求携带 token 时才触发全局登出（登录失败自身的 401 不应重置会话）。
  if (token && (response.status === 401 || code === 'UNAUTHENTICATED')) handlers.onUnauthorized?.()
  if (code === 'PASSWORD_CHANGE_REQUIRED') handlers.onPasswordChangeRequired?.()
  throw new ApiRequestError(message, response.status, code, details)
}

/** 受控文件下载（附件/交接 CSV）：带 Authorization 拉取字节流后转存本地。 */
export async function apiDownload(path: string, fileName: string): Promise<void> {
  const token = localStorage.getItem('platform-token')
  const response = await fetch(path, token ? { headers: { Authorization: `Bearer ${token}` } } : {})
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => undefined)
    throw new ApiRequestError(decodeError(data).message, response.status, decodeError(data).code)
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
