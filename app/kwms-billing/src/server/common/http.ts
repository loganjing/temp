import type { Context } from 'hono'
import { errors } from './errors'
import { BusinessError } from './errors'

// 业务路由包装：业务错误统一转为 {error:{code,message,field?}}，未知错误继续抛给全局 onError
type RouteHandler = (context: Context) => Promise<Response>

export function route(handler: RouteHandler): RouteHandler {
  return async (context) => {
    try {
      return await handler(context)
    } catch (error) {
      if (error instanceof BusinessError) {
        const body: { code: string; message: string; field?: string } = { code: error.code, message: error.message }
        if (error.field) body.field = error.field
        return context.json({ error: body }, error.status as 400)
      }
      throw error
    }
  }
}

// 分页参数（page 1 起，默认 1；pageSize 默认 20，上限 200）
export interface Pagination {
  page: number
  pageSize: number
  offset: number
}

export function paginationOf(context: Context): Pagination {
  const page = Math.max(Number(context.req.query('page') ?? 1) || 1, 1)
  const requested = Number(context.req.query('pageSize') ?? 20) || 20
  const pageSize = Math.min(Math.max(requested, 1), 200)
  return { page, pageSize, offset: (page - 1) * pageSize }
}

export function paginated<T>(items: T[], total: number, pagination: Pagination) {
  return { items, total, page: pagination.page, pageSize: pagination.pageSize }
}

// 路径参数提取：缺失按 404 处理（路由模板声明保证存在，防御性兜底）
export function paramOf(context: Context, name: string): string {
  const value = context.req.param(name)
  if (typeof value !== 'string' || !value) throw errors.notFound('资源不存在或不可见')
  return value
}

// 请求体可选字符串字段（非字符串视为缺省；必填校验由服务层权威复验）
export function strField(body: Record<string, unknown>, field: string): string | undefined {
  const value = body[field]
  return typeof value === 'string' ? value : undefined
}

// 请求体字符串数组字段
export function strArrayField(body: Record<string, unknown>, field: string): string[] {
  const value = body[field]
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw errors.invalidInput(`${field} 须为字符串数组`, field)
  }
  return value as string[]
}

export async function jsonBody(context: Context): Promise<Record<string, unknown>> {
  const body = await context.req.json().catch(() => null)
  return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
}

// 必填字符串
export function requiredString(body: Record<string, unknown>, field: string, maxLength = 500): string {
  const value = body[field]
  if (typeof value !== 'string' || !value.trim()) throw requiredError(field)
  if (value.length > maxLength) throw rangeError(field)
  return value.trim()
}

export function optionalString(body: Record<string, unknown>, field: string, maxLength = 500): string | null {
  const value = body[field]
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') throw typeError(field)
  if (value.length > maxLength) throw rangeError(field)
  return value.trim() || null
}

export function requiredEnum<T extends string>(body: Record<string, unknown>, field: string, allowed: readonly T[]): T {
  const value = body[field]
  if (value === undefined || value === null || value === '') throw requiredError(field)
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw invalidEnumError(field)
  return value as T
}

export function requiredDate(body: Record<string, unknown>, field: string): string {
  const value = body[field]
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw requiredError(field)
  return value
}

export function optionalDate(body: Record<string, unknown>, field: string): string | null {
  const value = body[field]
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw typeError(field)
  return value
}

// 必填正整数（分）；非正数或非整数按场景由调用方决定错误码
export function requiredPositiveInt(body: Record<string, unknown>, field: string): number {
  const value = body[field]
  if (value === undefined || value === null) throw requiredError(field)
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw typeError(field)
  return value
}

export function optionalPositiveInt(body: Record<string, unknown>, field: string): number | null {
  const value = body[field]
  if (value === undefined || value === null) return null
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw typeError(field)
  return value
}

export function optionalPositiveNumber(body: Record<string, unknown>, field: string): number | null {
  const value = body[field]
  if (value === undefined || value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) throw typeError(field)
  return value
}

function requiredError(field: string) {
  return errors.required(field)
}
function typeError(field: string) {
  return errors.invalidInput(`${field}格式不正确`, field)
}
function rangeError(field: string) {
  return errors.invalidInput(`${field}长度超出限制`, field)
}
function invalidEnumError(field: string) {
  return errors.invalidInput(`${field}取值无效`, field)
}
