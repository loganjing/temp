/**
 * API 契约帮助层：统一错误形状 {error:{code,message,details}}、
 * 请求体解析、分页与 decimal 输入归一（契约第 0 与 13 节）。
 */
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
    readonly details?: Array<{ field: string; reason: string }>
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export const errors = {
  badRequest: (message: string) => new ApiError(400, 'BAD_REQUEST', message),
  unauthenticated: () => new ApiError(401, 'UNAUTHENTICATED', 'Authentication required'),
  forbidden: (message = 'Insufficient permissions') => new ApiError(403, 'FORBIDDEN', message),
  planLocked: () => new ApiError(403, 'PLAN_LOCKED', 'Plan is locked for editing; copy it into a new plan instead'),
  notFound: (message = 'Resource not found') => new ApiError(404, 'NOT_FOUND', message),
  statusConflict: (message: string) => new ApiError(409, 'STATUS_CONFLICT', message),
  deleteForbiddenStatus: () =>
    new ApiError(409, 'DELETE_FORBIDDEN_STATUS', 'Parcel in review or completed cannot be deleted; abandon it with a reason instead'),
  validationFailed: (details: Array<{ field: string; reason: string }>, message = 'Validation failed') =>
    new ApiError(422, 'VALIDATION_FAILED', message, details),
  notFormalized: () => new ApiError(422, 'NOT_FORMALIZED', 'Only formalized plans can be submitted'),
  formalizeChecksFailed: (details: Array<{ field: string; reason: string }>) =>
    new ApiError(422, 'FORMALIZE_CHECKS_FAILED', 'Plan checks failed before formalization', details),
  adoptedPlanRequired: () =>
    new ApiError(422, 'ADOPTED_PLAN_REQUIRED', 'A completed parcel requires an adopted plan'),
  returnReasonRequired: () => new ApiError(422, 'RETURN_REASON_REQUIRED', 'A return reason is required'),
  aiProviderUnavailable: () => new ApiError(502, 'AI_PROVIDER_UNAVAILABLE', 'AI provider is unavailable'),
}

export async function readJsonBody(context: Context): Promise<Record<string, unknown>> {
  const body = await context.req.json().catch(() => null)
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw errors.badRequest('Request body must be a JSON object')
  }
  return body as Record<string, unknown>
}

export type Pagination = { page: number; pageSize: number; offset: number }

export function pagination(context: Context, defaultPageSize = 20): Pagination {
  const page = positiveInt(context.req.query('page'), 1)
  const pageSize = positiveInt(context.req.query('pageSize'), defaultPageSize)
  return { page, pageSize, offset: (page - 1) * pageSize }
}

function positiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  return Number.isInteger(value) && value > 0 && value <= 1000 ? value : fallback
}

export function pagedResponse<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, page, pageSize, total }
}

/** decimal 输入归一：字符串/整数形态原样保留精度；null/undefined/'' 视为缺省。 */
export function decimalInput(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number' && Number.isInteger(value)) return String(value)
  if (typeof value === 'string') return value.trim()
  throw errors.validationFailed([{ field: 'decimal', reason: `value must be a decimal string, got ${JSON.stringify(value)}` }])
}

export function requiredString(value: unknown, field: string, maxLength = 500): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw errors.validationFailed([{ field, reason: 'is required' }])
  }
  if (value.length > maxLength) {
    throw errors.validationFailed([{ field, reason: `exceeds max length ${maxLength}` }])
  }
  return value.trim()
}

export function optionalString(value: unknown, field: string, maxLength = 2000): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') {
    throw errors.validationFailed([{ field, reason: 'must be a string' }])
  }
  if (value.length > maxLength) {
    throw errors.validationFailed([{ field, reason: `exceeds max length ${maxLength}` }])
  }
  return value
}

export function optionalBoolean(value: unknown, field: string): boolean | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'boolean') {
    throw errors.validationFailed([{ field, reason: 'must be a boolean' }])
  }
  return value
}

export function optionalInt(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' && Number.isInteger(value)) return value
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return Number(value.trim())
  throw errors.validationFailed([{ field, reason: 'must be an integer' }])
}

export function requiredInt(value: unknown, field: string): number {
  const parsed = optionalInt(value, field)
  if (parsed === null) throw errors.validationFailed([{ field, reason: 'is required' }])
  return parsed
}

export function optionalEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T
  throw errors.validationFailed([{ field, reason: `must be one of ${allowed.join(' | ')}` }])
}

export function requiredEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  const parsed = optionalEnum(value, field, allowed)
  if (parsed === null) throw errors.validationFailed([{ field, reason: `is required and must be one of ${allowed.join(' | ')}` }])
  return parsed
}

export function optionalJsonObject(value: unknown, field: string): Record<string, unknown> | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  throw errors.validationFailed([{ field, reason: 'must be a JSON object' }])
}

export function optionalJsonArray(value: unknown, field: string): unknown[] | null {
  if (value === null || value === undefined) return null
  if (Array.isArray(value)) return value
  throw errors.validationFailed([{ field, reason: 'must be a JSON array' }])
}

/** 列表查询的逗号分隔数值解析（敏感性维度值，契约第 8 节）。 */
export function decimalValues(value: unknown, field: string): string[] {
  if (typeof value !== 'string' && !Array.isArray(value)) {
    throw errors.validationFailed([{ field, reason: 'must be a decimal list' }])
  }
  const parts = Array.isArray(value) ? value.map((item) => String(item)) : value.split(',')
  const parsed = parts.map((part) => part.trim()).filter((part) => part !== '')
  if (parsed.length === 0) throw errors.validationFailed([{ field, reason: 'requires at least one value' }])
  return parsed
}

export function currentActor(context: Context): { id: string; name: string } {
  const user = (context as unknown as { get(name: string): unknown }).get('currentUser') as
    | { id: string; name: string }
    | undefined
  if (!user || !user.id) throw errors.unauthenticated()
  return { id: user.id, name: user.name ?? user.id }
}
