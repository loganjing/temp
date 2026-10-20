// 业务错误：携带 HTTP 状态与契约错误码，由 app.ts 统一映射为
// { error: { code, message } } 响应形状（契约第 1 节错误模型）。
export type ApiStatus = 400 | 401 | 403 | 404 | 409 | 500

export class ApiError extends Error {
  constructor(
    readonly status: ApiStatus,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export const validationFailed = (message: string): ApiError => new ApiError(400, 'VALIDATION_FAILED', message)
export const forbidden = (message = '无权执行该操作'): ApiError => new ApiError(403, 'FORBIDDEN', message)
export const notFound = (message = '资源不存在'): ApiError => new ApiError(404, 'NOT_FOUND', message)
export const invalidState = (message = '当前状态不允许该操作'): ApiError => new ApiError(409, 'INVALID_STATE', message)
