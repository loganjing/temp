import type { ApiErrorCode } from '../shared/contract'

/**
 * 统一 API 错误：携带契约错误码与 HTTP 状态。
 * 由 app.ts 的 onError 转成 { error: { code, message } } 响应体。
 */
export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    readonly status: 404 | 409 | 422 | 500,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export const apiError = {
  validation: (message: string) => new ApiError('VALIDATION_ERROR', 422, message),
  notFound: (message: string) => new ApiError('NOT_FOUND', 404, message),
  invalidState: (message: string) => new ApiError('INVALID_STATE', 409, message),
  conflict: (message: string) => new ApiError('CONFLICT', 409, message),
  internal: (message: string) => new ApiError('INTERNAL_ERROR', 500, message),
}
