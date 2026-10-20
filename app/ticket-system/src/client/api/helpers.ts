import { ApiRequestError } from '../platform/api-client'

type QueryParams = Record<string, string | number | undefined>

export function buildQuery(params: QueryParams): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value))
  }
  const query = search.toString()
  return query ? `?${query}` : ''
}

const errorCodeText: Record<string, string> = {
  invalid_credentials: '邮箱或密码不正确',
  account_disabled: '账号已停用，请联系管理员',
  forbidden: '无权限执行该操作',
  ticket_not_found: '工单不存在或无权访问',
  invalid_state: '工单当前状态不支持该操作，请刷新后重试',
  rating_exists: '该工单已有满意度评价',
  group_name_conflict: '同名业务组已存在',
  rule_conflict: '该分类已存在分配规则',
  company_not_found: '公司不存在',
  group_not_found: '业务组不存在',
  rule_not_found: '分配规则不存在或已被删除',
  invalid_member: '所选成员不存在或不属于该公司',
  group_company_mismatch: '所选业务组不属于该公司',
  invalid_dimension: '统计维度不合法',
  internal: '服务器内部错误，请稍后重试',
  INTERNAL_ERROR: '服务器内部错误，请稍后重试',
}

export function apiErrorText(error: unknown, fallback = '请求失败，请稍后重试'): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 429) return '请求过于频繁，请稍后再试'
    if (error.code) {
      const mapped = errorCodeText[error.code]
      if (mapped) return mapped
    }
    if (error.message && error.message !== `HTTP ${error.status}`) return error.message
  }
  return fallback
}
