import type { ApiErrorCode } from '../../shared/ticket-domain'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export const validationError = (message: string, fields?: Record<string, string>) =>
  new ApiError(400, 'validation_error', message, fields)
export const forbidden = (message = '无权访问该资源') => new ApiError(403, 'forbidden', message)
export const notFound = (message = '资源不存在') => new ApiError(404, 'not_found', message)
export const conflict = (code: Extract<ApiErrorCode, 'invalid_transition' | 'ticket_closed' | 'already_rated' | 'rule_exists' | 'duplicate_group' | 'group_in_use' | 'already_sent'>, message: string) =>
  new ApiError(409, code, message)
