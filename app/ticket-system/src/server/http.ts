/**
 * 业务路由通用助手：统一错误结构、路径参数解析与当前身份解析。
 */
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { DbClient } from '@commonapp/dbkit'
import type { AuthUser } from '@commonapp/userkit'
import { findAuthProfile, toProfileContext, type ProfileContext } from './profile'

/** 业务错误：由 route 包装统一转为 `{ error: { code, message } }`。 */
export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export const errorJson = (context: Context, status: ContentfulStatusCode, code: string, message: string) =>
  context.json({ error: { code, message } }, status)

/** 包装业务 handler，把 ApiError 转成契约错误结构；其余异常交给全局 500 兜底。 */
export function route(fn: (context: Context) => Promise<Response>) {
  return async (context: Context): Promise<Response> => {
    try {
      return await fn(context)
    } catch (error) {
      if (error instanceof ApiError) return errorJson(context, error.status, error.code, error.message)
      throw error
    }
  }
}

/** 认证中间件写入的平台用户（authkit 信任边界输出）。 */
export function currentUser(context: Context): AuthUser {
  return (context as unknown as { get(key: string): unknown }).get('currentUser') as AuthUser
}

/** 解析当前用户的业务档案（公司、部门、跨公司视角），作为公司隔离依据。 */
export async function currentProfile(db: DbClient, context: Context): Promise<ProfileContext> {
  const row = await findAuthProfile(db, currentUser(context).id)
  if (!row) throw new ApiError(403, 'PROFILE_NOT_FOUND', '当前用户缺少业务档案，请联系管理员')
  return toProfileContext(row)
}

/** 解析路径数字 ID；非法值按资源不存在处理。 */
export function pathId(raw: string | undefined): number {
  const id = Number(raw ?? '')
  if (!Number.isInteger(id) || id < 1) throw new ApiError(404, 'NOT_FOUND', '资源不存在')
  return id
}

/** better-sqlite3 唯一约束冲突识别（409 语义）。 */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message)
}

/** 查询参数中的可选整数。 */
export function optionalQueryInteger(context: Context, name: string): number | null {
  const raw = context.req.query(name)
  if (raw === undefined || raw === '') return null
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1) throw new ApiError(400, 'VALIDATION_ERROR', `${name} 取值不合法`)
  return value
}

/**
 * 公司范围参数（契约 3.2/4.1/7.2 通用语义）：
 * 省略时默认本公司；仅 crossCompanyView 用户可指定其他公司，普通用户传非本公司值返回 403。
 */
export function resolveCompanyFilter(context: Context, me: ProfileContext): number {
  const requested = optionalQueryInteger(context, 'companyId')
  if (requested === null) return me.companyId
  if (!me.crossCompanyView && requested !== me.companyId) {
    throw new ApiError(403, 'COMPANY_FORBIDDEN', '无权访问其他公司的工单')
  }
  return requested
}

/**
 * 统计范围（契约 7.1/7.2/8.2）：省略时跨公司视角统计全部、普通用户限定本公司；
 * 显式 companyId 仅对跨公司视角生效。
 */
export function resolveStatsScope(context: Context, me: ProfileContext): number | 'all' {
  const requested = optionalQueryInteger(context, 'companyId')
  if (requested === null) return me.crossCompanyView ? 'all' : me.companyId
  if (!me.crossCompanyView && requested !== me.companyId) {
    throw new ApiError(403, 'COMPANY_FORBIDDEN', '无权访问其他公司的工单')
  }
  return requested
}

/** 请求体必填字符串（trim 后非空且不超过 max）。 */
export function requiredString(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > max) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${label}需为 1-${max} 个字符`)
  }
  return value.trim()
}

/** 请求体整数。 */
export function requiredInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${label}需为正整数`)
  }
  return value
}
