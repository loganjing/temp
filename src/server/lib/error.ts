import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ErrorResponse } from '../../shared/types.js';

export function error(
  c: Context,
  status: ContentfulStatusCode,
  code: string,
  message: string,
) {
  return c.json<ErrorResponse>({ error: { code, message } }, status);
}

export type ErrorFn = typeof error;
