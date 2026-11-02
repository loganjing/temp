import { ApiRequestError } from './api-client'

const errorCodeMessages: Record<string, string> = {
  validation_error: '提交内容不符合要求，请检查必填项和取值范围。',
  not_authenticated: '登录状态已失效，请重新登录。',
  invalid_credentials: '邮箱或密码不正确。',
  forbidden: '无权访问该内容，或它不在你的可见范围内。',
  not_found: '该内容不存在或已被移除。',
  invalid_transition: '当前状态不允许该操作，请刷新后重试。',
  ticket_closed: '工单已结束，无法继续操作。',
  already_rated: '该工单已完成评价，不能重复评价。',
  rule_exists: '该分类已存在分配规则，请直接调整对应业务组。',
  duplicate_group: '业务组名称已存在，请换一个名称。',
  group_in_use: '业务组仍被未完成工单或分配规则引用，暂时无法删除。',
  already_sent: '该通知已发送成功，无需重发。',
  rate_limited: '操作过于频繁，请稍后再试。',
  internal_error: '服务暂时不可用，请稍后重试。',
}

export function describeError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 403) return errorCodeMessages.forbidden
    if (error.code && errorCodeMessages[error.code]) return errorCodeMessages[error.code]
    return error.message || `请求失败（HTTP ${error.status}）`
  }
  return error instanceof Error && error.message ? error.message : '请求失败，请稍后重试。'
}

export function isForbidden(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 403
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 404
}
