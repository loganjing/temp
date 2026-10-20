// 契约 §1：统一 JSON 错误结构 { error: { code, message } }。
// 业务模块抛 ApiError，路由层统一转换为响应；未捕获错误由 app.onError 兜底 500。
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export class ApiError extends Error {
  constructor(readonly status: ContentfulStatusCode, readonly code: string, message: string) {
    super(message)
  }
}

export const unauthorized = (message = 'Authentication required') => new ApiError(401, 'UNAUTHORIZED', message)
export const forbidden = (message = 'You do not have permission to perform this action') => new ApiError(403, 'FORBIDDEN', message)
export const notFound = (message = 'Resource not found') => new ApiError(404, 'NOT_FOUND', message)
export const validation = (message: string) => new ApiError(400, 'VALIDATION', message)
export const conflict = (message: string) => new ApiError(409, 'CONFLICT', message)
export const stateConflict = (status: string, message: string) => new ApiError(409, 'STATE_CONFLICT', `${message} (current status: ${status})`)

export const errorBody = (code: string, message: string) => ({ error: { code, message } })
