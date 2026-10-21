// API 层统一业务错误：由 app.onError 映射为 { error: { code, message } } + HTTP 状态码。
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export const unauthenticated = (message = '未认证或会话过期') => new ApiError(401, 'UNAUTHENTICATED', message)
export const forbidden = (message: string) => new ApiError(403, 'FORBIDDEN', message)
export const notFound = (message: string) => new ApiError(404, 'NOT_FOUND', message)
export const stateConflict = (message: string) => new ApiError(409, 'STATE_CONFLICT', message)
export const validationError = (message: string) => new ApiError(422, 'VALIDATION_ERROR', message)
