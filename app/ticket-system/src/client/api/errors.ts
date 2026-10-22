import { ApiRequestError } from '../platform/api-client'

// 把契约错误码/状态码转换为面向用户的中文提示；403 表示跨公司访问被拒绝。
export function describeApiError(error: unknown, fallback = '操作失败，请重试。'): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 403) return '无权访问该内容：它可能不属于你所在的公司范围。'
    if (error.status === 409) return error.message || '当前工单状态不允许该操作。'
    if (error.status === 404) return error.message || '未找到对应的记录。'
    return error.message || fallback
  }
  return error instanceof Error ? error.message : fallback
}
