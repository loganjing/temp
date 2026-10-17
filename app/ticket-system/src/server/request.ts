import type { Context } from 'hono'
import { apiError } from './api-error'

const FIELD_LABELS: Record<string, string> = {
  operatorId: '操作者',
  subject: '主题',
  description: '描述',
  category: '分类',
  priority: '优先级',
  name: '姓名',
  email: '邮箱',
  companyId: '公司',
  department: '部门',
  groupId: '业务组',
  userIds: '成员列表',
  content: '回复内容',
  rating: '评分',
  toGroupId: '转派目标业务组',
  toUserId: '转派目标成员',
  note: '备注',
  submitter: '提交人信息',
}

function label(field: string): string {
  return FIELD_LABELS[field] ?? field
}

/** 读取 JSON 请求体；非 JSON 或非对象按空对象处理，交由字段校验报 422。 */
export async function readJson(context: Context): Promise<Record<string, unknown>> {
  let body: unknown
  try {
    body = await context.req.json()
  } catch {
    return {}
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {}
  return body as Record<string, unknown>
}

export function requireString(body: Record<string, unknown>, field: string, max?: number): string {
  const value = body[field]
  if (typeof value !== 'string' || value.length === 0) throw apiError.validation(`${label(field)}不能为空`)
  if (max !== undefined && value.length > max) throw apiError.validation(`${label(field)}长度不能超过 ${max} 字符`)
  return value
}

export function optionalString(body: Record<string, unknown>, field: string): string | null {
  const value = body[field]
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') throw apiError.validation(`${label(field)}须为字符串或空`)
  return value
}

export function requireStringArray(body: Record<string, unknown>, field: string): string[] {
  const value = body[field]
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw apiError.validation(`${label(field)}须为字符串数组`)
  }
  return value as string[]
}

export function requireEnum<T extends string>(body: Record<string, unknown>, field: string, values: readonly T[]): T {
  const value = requireString(body, field)
  if (!values.includes(value as T)) throw apiError.validation(`${label(field)}取值不合法`)
  return value as T
}

/** 满意度评分为 1–5 整数（AD-4 最小量表）。 */
export function requireRating(body: Record<string, unknown>): number {
  const value = body.rating
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 5) {
    throw apiError.validation('评分须为 1–5 的整数')
  }
  return value
}
