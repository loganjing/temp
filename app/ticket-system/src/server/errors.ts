/** 领域层统一错误：路由层 wrap 捕获后按契约序列化为 {"error":{"code","message"}}。 */
export type ApiStatusCode = 400 | 401 | 403 | 404 | 409 | 500

export class ApiError extends Error {
  constructor(
    readonly status: ApiStatusCode,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export const validationError = (message: string) => new ApiError(400, 'VALIDATION', message)
export const unauthorized = (message = 'Authentication required') => new ApiError(401, 'UNAUTHORIZED', message)
export const forbidden = (message = 'Insufficient permissions') => new ApiError(403, 'FORBIDDEN', message)
export const notFound = (message = 'Resource not found') => new ApiError(404, 'NOT_FOUND', message)
export const conflict = (code: string, message: string) => new ApiError(409, code, message)
