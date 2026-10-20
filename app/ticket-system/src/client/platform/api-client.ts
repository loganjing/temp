// 前端唯一请求边界：Token 注入、响应归一化与 API 错误解码。
// 错误码与状态语义见 docs/wi-t1000313/technical-contract.md 第 1 节。

export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

let unauthorizedHandler: (() => void) | null = null

/** 注册会话失效（携带 Token 的请求返回 401）时的全局处理，由应用壳负责回到登录页。 */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler
}

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: '登录状态已失效，请重新登录',
  INVALID_CREDENTIALS: '邮箱或密码不正确',
  FORBIDDEN: '没有权限执行此操作',
  NOT_FOUND: '资源不存在或无权访问',
  VALIDATION_FAILED: '提交内容校验未通过，请检查输入',
  INVALID_STATE: '当前状态不允许执行此操作',
  ALREADY_RATED: '该工单已完成过满意度评价',
  DUPLICATE_NAME: '该名称已存在',
  DUPLICATE_EMAIL: '该邮箱已被使用',
  DUPLICATE_MEMBER: '该用户已是业务组成员',
  GROUP_IN_USE: '业务组仍有待处理工单，无法删除',
  GROUP_COMPANY_MISMATCH: '所选业务组不属于对应公司',
  USER_COMPANY_MISMATCH: '所选用户不属于对应公司',
  PASSWORD_CHANGE_REQUIRED: '请先完成初始密码修改后再继续',
}

/** 将请求异常转换为面向用户的中文文案；未识别的错误码回退到服务端可读信息。 */
export function describeApiError(error: unknown, fallback = '请求失败，请稍后重试'): string {
  if (error instanceof ApiRequestError) {
    if (error.code && ERROR_MESSAGES[error.code]) return ERROR_MESSAGES[error.code]
    if (error.message && !error.message.startsWith('HTTP ')) return error.message
    return `请求失败（HTTP ${error.status}）`
  }
  if (error instanceof TypeError) return '无法连接服务器，请检查网络后重试'
  return fallback
}

export async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('platform-token')
  const headers = new Headers(options?.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (options?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(path, { ...options, headers })
  const data: unknown = response.status === 204 ? undefined : await response.json().catch(() => undefined)
  if (response.ok) return data as T
  if (token && response.status === 401) unauthorizedHandler?.()
  const body = data && typeof data === 'object' ? (data as Record<string, unknown>) : undefined
  const error = body?.error
  const detail = error && typeof error === 'object' ? (error as Record<string, unknown>) : undefined
  throw new ApiRequestError(
    typeof detail?.message === 'string' ? detail.message : typeof error === 'string' ? error : `HTTP ${response.status}`,
    response.status,
    typeof detail?.code === 'string' ? detail.code : undefined,
  )
}
