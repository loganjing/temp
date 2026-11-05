import type { Context } from 'hono'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export const unauthenticated = () => new ApiError(401, 'UNAUTHENTICATED', '请先登录')
export const accountDisabled = () => new ApiError(403, 'ACCOUNT_DISABLED', '账号已停用，请联系管理员')
export const forbidden = (message = '无权访问该资源') => new ApiError(403, 'FORBIDDEN', message)
export const notFound = (message = '资源不存在') => new ApiError(404, 'NOT_FOUND', message)
export const invalidState = (message = '当前状态不允许该操作') => new ApiError(409, 'INVALID_STATE', message)
export const duplicateName = (message = '同名记录已存在') => new ApiError(409, 'DUPLICATE_NAME', message)
export const duplicateMember = (message = '该成员已在业务组中') => new ApiError(409, 'DUPLICATE_MEMBER', message)
export const duplicateRating = (message = '该工单已评价，不可重复评价') => new ApiError(409, 'DUPLICATE_RATING', message)
export const rateLimited = () => new ApiError(429, 'RATE_LIMITED', '登录尝试过于频繁，请稍后再试')
export const validationFailed = (message: string, fields: Record<string, string>) => new ApiError(422, 'VALIDATION_FAILED', message, fields)

export function apiErrorResponse(context: Context, error: ApiError) {
  return context.json(
    { error: { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}) } },
    error.status as 400,
  )
}

export function readBody(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

export function requireText(
  value: unknown,
  field: string,
  label: string,
  maxLength: number,
  errors: Record<string, string>,
  options: { required?: boolean } = {},
): string | undefined {
  if (value === undefined || value === null || value === '') {
    if (options.required !== false) errors[field] = `${label}不能为空`
    return undefined
  }
  if (typeof value !== 'string') {
    errors[field] = `${label}必须是文本`
    return undefined
  }
  const trimmed = value.trim()
  if (!trimmed) {
    if (options.required !== false) errors[field] = `${label}不能为空`
    return undefined
  }
  if (trimmed.length > maxLength) {
    errors[field] = `${label}不能超过${maxLength}个字符`
    return undefined
  }
  return trimmed
}

export function requireBoolean(value: unknown, field: string, label: string, errors: Record<string, string>): boolean | undefined {
  if (typeof value !== 'boolean') {
    errors[field] = `${label}必须是布尔值`
    return undefined
  }
  return value
}

export function throwIfInvalid(errors: Record<string, string>) {
  if (Object.keys(errors).length > 0) throw validationFailed('提交内容有误，请检查后重试', errors)
}
