import type { ContentfulStatusCode } from 'hono/utils/http-status'

/**
 * 业务错误：由路由/服务层抛出，app.ts 统一映射为契约错误结构
 * `{"error": "<code>"}` + HTTP 状态（technical-contract.md §1）。
 */
export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
  ) {
    super(code)
    this.name = 'ApiError'
  }
}

export function forbidden(): ApiError {
  return new ApiError(403, 'forbidden')
}

export function invalidRequest(): ApiError {
  return new ApiError(400, 'invalid_request')
}

export function ticketNotFound(): ApiError {
  return new ApiError(404, 'ticket_not_found')
}

export function invalidState(): ApiError {
  return new ApiError(409, 'invalid_state')
}
