import { Hono } from 'hono';
import type { AppEnv } from '../middleware/session.js';
import { requireAuth } from '../middleware/session.js';
import { requireOperator } from '../access-control.js';
import * as notificationService from '../services/notification.js';

export const notificationRoutes = new Hono<AppEnv>();

notificationRoutes.use('*', requireAuth());

// GET /api/notifications
notificationRoutes.get('/', (c) => {
  const operator = requireOperator(c.get('operator'));
  const ticketId = c.req.query('ticketId') || undefined;
  const status = c.req.query('status') || undefined;
  const result = notificationService.listNotifications(operator, { ticketId, status });
  return c.json(result);
});
