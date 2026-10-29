/**
 * 服务端通用辅助：UUID 生成、时间戳、错误类型、snake_case → camelCase 映射。
 */
import { randomUUID } from 'node:crypto'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { DbClient } from '@commonapp/dbkit'
import { ErrorCode } from '../../shared/types.js'

/** 平台资源类型，与 bootstrap.ts 返回结构一致 */
export type Platform = { db: DbClient; close: () => Promise<void> }

export function uuid(): string {
  return randomUUID()
}

export function now(): string {
  return new Date().toISOString()
}

/** 统一业务错误，携带错误码与 HTTP 状态码 */
export class ApiError extends HTTPException {
  constructor(
    readonly apiCode: string,
    status: ContentfulStatusCode,
    message: string,
  ) {
    super(status, { message })
    this.name = 'ApiError'
  }
}

export function validationError(message: string): ApiError {
  return new ApiError(ErrorCode.Validation, 400, message)
}

export function notFound(message: string): ApiError {
  return new ApiError(ErrorCode.NotFound, 404, message)
}

export function conflict(message: string): ApiError {
  return new ApiError(ErrorCode.Conflict, 409, message)
}

/** 递归将对象键名从 snake_case 转为 camelCase，供路由层统一映射 */
export function toCamel<T>(value: unknown): T {
  if (Array.isArray(value)) return value.map(toCamel) as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const camelKey = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
      out[camelKey] = toCamel(val)
    }
    return out as T
  }
  return value as T
}
