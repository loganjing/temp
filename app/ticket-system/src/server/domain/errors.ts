import { HTTPException } from 'hono/http-exception'

/** 业务错误：统一 { error: { code, message } } 响应形状（契约第 1 节）。 */
export class ApiError extends HTTPException {
  readonly apiCode: string

  constructor(apiCode: string, status: 400 | 401 | 403 | 404 | 409 | 422 | 500, message: string) {
    super(status, { message })
    this.apiCode = apiCode
  }
}

export const invalidInput = (message: string) => new ApiError('INVALID_INPUT', 400, message)
export const forbidden = (message = 'You do not have permission to perform this action') => new ApiError('FORBIDDEN', 403, message)
export const notFound = (message = 'Resource not found') => new ApiError('NOT_FOUND', 404, message)
export const invalidState = (message: string) => new ApiError('INVALID_STATE', 409, message)
export const duplicate = (message: string) => new ApiError('DUPLICATE', 409, message)
export const validationFailed = (message: string) => new ApiError('VALIDATION_FAILED', 422, message)
