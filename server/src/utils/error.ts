import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export interface ErrorBody {
  code: string;
  message: string;
  fields?: Record<string, string>;
}

/**
 * 构造统一错误响应（按技术契约 §5）。
 * fields 仅在 VALIDATION_ERROR 时出现。
 */
export function errorResponse(
  c: Context,
  status: ContentfulStatusCode,
  code: string,
  message: string,
  fields?: Record<string, string>,
) {
  const error: ErrorBody = { code, message };
  if (fields && Object.keys(fields).length > 0) {
    error.fields = fields;
  }
  return c.json({ error }, status);
}
