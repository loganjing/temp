import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** API 统一错误响应体。 */
export interface ApiErrorBody {
  error: string;
  code: string;
}

export const ERROR_CODES = {
  INVALID_TABLE_ID: { status: 400, code: 'INVALID_TABLE_ID' },
  INVALID_NAME: { status: 400, code: 'INVALID_NAME' },
  INVALID_STATUS: { status: 400, code: 'INVALID_STATUS' },
  TASK_NOT_FOUND: { status: 404, code: 'TASK_NOT_FOUND' },
  ROBOT_NOT_FOUND: { status: 404, code: 'ROBOT_NOT_FOUND' },
  TASK_ALREADY_DONE: { status: 400, code: 'TASK_ALREADY_DONE' },
  ROBOT_DELIVERING: { status: 400, code: 'ROBOT_DELIVERING' },
  ROBOT_NOT_DELIVERING: { status: 400, code: 'ROBOT_NOT_DELIVERING' },
  NO_CURRENT_TASK: { status: 400, code: 'NO_CURRENT_TASK' },
  INTERNAL_ERROR: { status: 500, code: 'INTERNAL_ERROR' },
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

/** 业务异常，携带错误码。 */
export class AppError extends Error {
  readonly code: string;
  readonly status: ContentfulStatusCode;
  constructor(code: ErrorCode, message?: string) {
    const def = ERROR_CODES[code];
    super(message ?? code);
    this.code = def.code;
    this.status = def.status as ContentfulStatusCode;
  }
}

/** 在 Hono 上下文上输出统一错误响应。 */
export function errorResponse(c: Context, code: ErrorCode, message?: string): Response {
  const def = ERROR_CODES[code];
  const body: ApiErrorBody = { error: message ?? code, code: def.code };
  return c.json(body, def.status as ContentfulStatusCode);
}
