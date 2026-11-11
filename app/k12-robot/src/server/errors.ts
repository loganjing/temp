// 统一 API 错误：{error:{code,message}}，400/404/500 对应 bad_request/not_found/internal_error。

export type ApiErrorCode = 'bad_request' | 'not_found' | 'internal_error'

export class ApiError extends Error {
  constructor(
    readonly status: 400 | 404 | 500,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export const badRequest = (message: string): ApiError => new ApiError(400, 'bad_request', message)
export const notFound = (message: string): ApiError => new ApiError(404, 'not_found', message)
