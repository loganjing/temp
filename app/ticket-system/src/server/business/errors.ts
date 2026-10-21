// 业务 API 统一错误：按契约第 1 节映射为 {error:{code,message}} 与 HTTP 状态码。
export type ApiStatusCode = 400 | 401 | 403 | 404 | 409

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

export const invalidInput = (message: string): ApiError => new ApiError(400, 'INVALID_INPUT', message)
export const unauthenticated = (message = '请先登录'): ApiError => new ApiError(401, 'UNAUTHENTICATED', message)
export const forbidden = (message: string): ApiError => new ApiError(403, 'FORBIDDEN', message)
export const notFound = (message = '资源不存在'): ApiError => new ApiError(404, 'NOT_FOUND', message)
export const invalidState = (message: string): ApiError => new ApiError(409, 'INVALID_STATE', message)
export const conflict = (message: string): ApiError => new ApiError(409, 'CONFLICT', message)

// SQLite 唯一约束冲突 → 409（调用方按业务语义决定 INVALID_STATE 或 CONFLICT）。
export function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  if (typeof code === 'string' && code.startsWith('SQLITE_CONSTRAINT')) return true
  return error instanceof Error && /unique constraint/i.test(error.message)
}
