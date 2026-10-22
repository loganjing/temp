import { getCookie } from 'hono/cookie';
import type { MiddlewareHandler } from 'hono';
import { resolveOperatorByUserId, type Operator } from '../access-control.js';

export interface AppEnv {
  Variables: {
    operator: Operator | null;
  };
}

export const sessionMiddleware = (): MiddlewareHandler<AppEnv> => async (c, next) => {
  const userId = getCookie(c, 'session_user');
  let operator: Operator | null = null;
  if (userId) {
    operator = resolveOperatorByUserId(userId);
  }
  c.set('operator', operator);
  await next();
};

export const requireAuth = (): MiddlewareHandler<AppEnv> => async (c, next) => {
  const operator = c.get('operator');
  if (!operator) {
    throw new (await import('../errors.js')).AppError('UNAUTHENTICATED', '缺少或无效会话');
  }
  await next();
};
