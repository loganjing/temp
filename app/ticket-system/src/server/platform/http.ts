import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { ERROR_CODES, type ApiErrorCode } from '../../shared/contracts'

type FieldIssues = Record<string, string>

/** 契约错误形状：{ error: { code, message, details? } }。 */
export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export const apiError = (status: ContentfulStatusCode, code: ApiErrorCode, message: string, details?: Record<string, unknown>) =>
  new ApiError(status, code, message, details)

export const notFound = () => apiError(404, ERROR_CODES.NOT_FOUND, 'Object not found or not accessible')
export const forbidden = (message = 'Missing permission or out-of-scope object') => apiError(403, ERROR_CODES.FORBIDDEN, message)
export const conflict = (message: string) => apiError(409, ERROR_CODES.CONFLICT, message)
export const stateViolation = (message: string) => apiError(422, ERROR_CODES.STATE_VIOLATION, message)

const errorBody = (error: ApiError) => error.details
  ? { error: { code: error.code, message: error.message, details: error.details } }
  : { error: { code: error.code, message: error.message } }

/** 收集字段级校验失败，一次性以 400 invalid_request 返回 details.fields。 */
export class FieldCollector {
  readonly fields: FieldIssues = {}

  fail(field: string, reason: string): void {
    if (!(field in this.fields)) this.fields[field] = reason
  }

  assertEmpty(): void {
    if (Object.keys(this.fields).length > 0) {
      throw apiError(400, ERROR_CODES.INVALID_REQUEST, 'Invalid request', { fields: this.fields })
    }
  }
}

export async function readJsonObject(context: Context): Promise<Record<string, unknown>> {
  const body = await context.req.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw apiError(400, ERROR_CODES.INVALID_REQUEST, 'A JSON object body is required')
  }
  return body as Record<string, unknown>
}

type StringOptions = { max: number; min?: number; optional?: boolean; trim?: boolean }

/** 读取字符串字段，按契约约束裁剪与长度校验；返回 null 表示可空且未提供。 */
export function stringField(collector: FieldCollector, field: string, value: unknown, options: StringOptions): string | null {
  if (value === undefined || value === null) {
    if (options.optional) return null
    collector.fail(field, 'is required')
    return null
  }
  if (typeof value !== 'string') {
    collector.fail(field, 'must be a string')
    return null
  }
  const text = options.trim === false ? value : value.trim()
  if (text.length < (options.min ?? 1)) {
    collector.fail(field, `must contain at least ${options.min ?? 1} characters`)
    return null
  }
  if (text.length > options.max) {
    collector.fail(field, `must contain at most ${options.max} characters`)
    return null
  }
  return text
}

export function enumField<TValue extends string>(
  collector: FieldCollector,
  field: string,
  value: unknown,
  allowed: readonly TValue[],
  options: { optional?: boolean } = {},
): TValue | null {
  if (value === undefined || value === null) {
    if (options.optional) return null
    collector.fail(field, 'is required')
    return null
  }
  if (typeof value !== 'string' || !allowed.includes(value as TValue)) {
    collector.fail(field, `must be one of ${allowed.join(', ')}`)
    return null
  }
  return value as TValue
}

export function integerField(
  collector: FieldCollector,
  field: string,
  value: unknown,
  options: { min: number; max: number },
): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < options.min || value > options.max) {
    collector.fail(field, `must be an integer between ${options.min} and ${options.max}`)
    return null
  }
  return value
}

export function stringArrayField(collector: FieldCollector, field: string, value: unknown): string[] | null {
  if (value === undefined || value === null) {
    collector.fail(field, 'is required')
    return null
  }
  if (!Array.isArray(value)) {
    collector.fail(field, 'must be an array of member ids')
    return null
  }
  const ids: string[] = []
  for (const item of value) {
    if (typeof item !== 'string' || !item.trim()) {
      collector.fail(field, 'must be an array of non-empty member ids')
      return null
    }
    ids.push(item.trim())
  }
  return [...new Set(ids)]
}

export function queryString(context: Context, name: string): string | null {
  const value = context.req.query(name)
  return value === undefined || value === '' ? null : value
}

export function queryInteger(
  collector: FieldCollector,
  context: Context,
  name: string,
  options: { min: number; max: number; fallback: number },
): number {
  const raw = context.req.query(name)
  if (raw === undefined || raw === '') return options.fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < options.min || value > options.max) {
    collector.fail(name, `must be an integer between ${options.min} and ${options.max}`)
    return options.fallback
  }
  return value
}

export function pagination(context: Context): { page: number; pageSize: number; offset: number } {
  const collector = new FieldCollector()
  const page = queryInteger(collector, context, 'page', { min: 1, max: 100000, fallback: 1 })
  const pageSize = queryInteger(collector, context, 'pageSize', { min: 1, max: 100, fallback: 20 })
  collector.assertEmpty()
  return { page, pageSize, offset: (page - 1) * pageSize }
}

export function isoDateTime(collector: FieldCollector, field: string, value: string | null): string | null {
  if (value === null) return null
  if (Number.isNaN(Date.parse(value))) {
    collector.fail(field, 'must be an ISO-8601 date-time string')
    return null
  }
  return value
}

export function booleanQuery(collector: FieldCollector, context: Context, name: string, fallback: boolean): boolean {
  const raw = context.req.query(name)
  if (raw === undefined || raw === '') return fallback
  if (raw === 'true') return true
  if (raw === 'false') return false
  collector.fail(name, 'must be true or false')
  return fallback
}

export function likeContains(value: string): string {
  return `%${value.replace(/[\\%_]/g, (matched) => `\\${matched}`)}%`
}

export function currentUserId(context: Context): string {
  return (context.get as (key: string) => { id: string })('currentUser').id
}

/** 统一 handler 包装：把 ApiError 映射为契约错误，未知错误记为 internal_error。 */
export function handler(fn: (context: Context) => Promise<Response> | Response) {
  return async (context: Context): Promise<Response> => {
    try {
      return await fn(context)
    } catch (error) {
      return respondToError(context, error)
    }
  }
}

export function respondToError(context: Context, error: unknown): Response {
  if (error instanceof ApiError) return context.json(errorBody(error), error.status)
  console.error('[api] unhandled request error', error)
  return context.json({ error: { code: ERROR_CODES.INTERNAL_ERROR, message: 'Internal server error' } }, 500)
}
