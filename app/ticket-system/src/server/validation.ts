import { ApiError, validationError } from './errors'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function requireString(value: unknown, field: string, minLength: number, maxLength: number): string {
  if (typeof value !== 'string') throw validationError(`${field} must be a string`)
  const trimmed = value.trim()
  if (trimmed.length < minLength) throw validationError(`${field} must contain at least ${minLength} characters`)
  if (value.length > maxLength) throw validationError(`${field} must be at most ${maxLength} characters`)
  return trimmed
}

/** 未提供（undefined/null）返回 undefined；提供则按 min/max 校验（允许空串，用于 0-N 字段）。 */
export function optionalString(value: unknown, field: string, minLength: number, maxLength: number): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw validationError(`${field} must be a string`)
  if (value.trim().length < minLength) throw validationError(`${field} must contain at least ${minLength} characters`)
  if (value.length > maxLength) throw validationError(`${field} must be at most ${maxLength} characters`)
  return value.trim()
}

/** 凭证类字段校验：不做 trim，保留原始值（密码等敏感输入）。 */
export function requireSecret(value: unknown, field: string, minLength: number, maxLength: number): string {
  if (typeof value !== 'string') throw validationError(`${field} must be a string`)
  if (value.length < minLength) throw validationError(`${field} must contain at least ${minLength} characters`)
  if (value.length > maxLength) throw validationError(`${field} must be at most ${maxLength} characters`)
  return value
}

export function requireInt(value: unknown, field: string): number {
  if (typeof value === 'number' && Number.isInteger(value)) return value
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return Number(value.trim())
  throw validationError(`${field} must be an integer`)
}

export function optionalInt(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return requireInt(value, field)
}

export function requireEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T
  throw validationError(`${field} must be one of: ${allowed.join(', ')}`)
}

export function requireEmail(value: unknown, field: string): string {
  const text = requireString(value, field, 3, 320)
  if (!EMAIL_PATTERN.test(text)) throw validationError(`${field} must be a valid email address`)
  return text.toLowerCase()
}

export function optionalEmail(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined
  return requireEmail(value, field)
}

/** 查询参数解析：非数字或越界时抛 400 VALIDATION。 */
export function parsePagination(query: { page?: string; pageSize?: string }): { page: number; pageSize: number } {
  const page = query.page === undefined || query.page === '' ? 1 : requireInt(query.page, 'page')
  const pageSize = query.pageSize === undefined || query.pageSize === '' ? 20 : requireInt(query.pageSize, 'pageSize')
  if (page < 1) throw validationError('page must be >= 1')
  if (pageSize < 1 || pageSize > 100) throw validationError('pageSize must be between 1 and 100')
  return { page, pageSize }
}

export const errBadRequest = (message: string): ApiError => validationError(message)
