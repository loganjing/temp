export const TOKEN_STORAGE_KEY = 'platform-token'
export const UNAUTHORIZED_EVENT = 'platform:unauthorized'

const FALLBACK_MESSAGE: Record<string, string> = {
  UNAUTHENTICATED: '登录状态已失效，请重新登录',
  ACCOUNT_DISABLED: '账号已停用，请联系公司管理员',
  FORBIDDEN: '没有权限访问该数据',
  NOT_FOUND: '数据不存在或已被删除',
  VALIDATION_FAILED: '提交内容校验失败，请检查填写项',
  INVALID_STATE: '当前工单状态不允许该操作',
  DUPLICATE_RATING: '该工单已评价，不能重复评价',
  DUPLICATE_NAME: '名称已存在，请更换后重试',
  DUPLICATE_MEMBER: '该成员已在业务组中',
  RATE_LIMITED: '尝试次数过多，请稍后再试',
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

function readFields(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object') return undefined
  const fields: Record<string, string> = {}
  for (const [key, message] of Object.entries(value as Record<string, unknown>)) {
    if (typeof message === 'string') fields[key] = message
  }
  return Object.keys(fields).length > 0 ? fields : undefined
}

/** 唯一请求边界：统一附加 Bearer 令牌、解码错误体，并在令牌失效时清理会话。 */
export async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY)
  const headers = new Headers(options?.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (options?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

  let response: Response
  try {
    response = await fetch(path, { ...options, headers })
  } catch {
    throw new ApiRequestError('无法连接服务器，请检查网络后重试', 0)
  }

  const data: unknown = response.status === 204 ? undefined : await response.json().catch(() => undefined)
  if (response.ok) return data as T

  if (response.status === 401 && token) {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
  }

  const body = data && typeof data === 'object' ? (data as Record<string, unknown>) : undefined
  const error = body?.error
  const detail = error && typeof error === 'object' ? (error as Record<string, unknown>) : undefined
  const code = typeof detail?.code === 'string' ? detail.code : undefined
  const message = typeof detail?.message === 'string' && detail.message
    ? detail.message
    : typeof error === 'string'
      ? error
      : code && FALLBACK_MESSAGE[code]
        ? FALLBACK_MESSAGE[code]
        : `请求失败（HTTP ${response.status}）`
  throw new ApiRequestError(message, response.status, code, readFields(detail?.fields))
}

/** 把查询参数拼接为 URL，空值不参与查询。 */
export function toQuery(params: Record<string, string | number | boolean | undefined | null | string[]>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      for (const item of value) if (item) search.append(key, item)
      continue
    }
    search.set(key, String(value))
  }
  const query = search.toString()
  return query ? `?${query}` : ''
}

export function errorMessage(cause: unknown, fallback = '操作失败，请稍后重试'): string {
  return cause instanceof Error && cause.message ? cause.message : fallback
}

export function errorFields(cause: unknown): Record<string, string> | undefined {
  return cause instanceof ApiRequestError ? cause.fields : undefined
}

export function errorStatus(cause: unknown): number | undefined {
  return cause instanceof ApiRequestError ? cause.status : undefined
}