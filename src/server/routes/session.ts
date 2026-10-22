import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import type { AppEnv } from '../middleware/session.js';
import { resolveOperatorByUserId, toUserContext } from '../access-control.js';
import { AppError, assertString } from '../errors.js';

export const sessionRoutes = new Hono<AppEnv>();

// GET /api/session - return current operator context
sessionRoutes.get('/', (c) => {
  const operator = c.get('operator');
  if (!operator) {
    return c.json({ user: null, capabilities: [] });
  }
  return c.json({
    user: toUserContext(operator),
    capabilities: operator.capabilities,
  });
});

// POST /api/session - switch operator
sessionRoutes.post('/', async (c) => {
  const body = await c.req.json();
  const userId = assertString(body?.userId, 'userId');

  const operator = resolveOperatorByUserId(userId);
  if (!operator) {
    throw new AppError('NOT_FOUND', '用户不存在');
  }

  setCookie(c, 'session_user', userId, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });

  return c.json({
    user: toUserContext(operator),
    capabilities: operator.capabilities,
  });
});
