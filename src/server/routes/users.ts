import { Hono } from 'hono';
import type { AppEnv } from '../middleware/session.js';
import { requireAuth } from '../middleware/session.js';
import { requireOperator } from '../access-control.js';
import * as ticketService from '../services/ticket.js';

export const userRoutes = new Hono<AppEnv>();

userRoutes.use('*', requireAuth());

// GET /api/users/:id/profile
userRoutes.get('/:id/profile', (c) => {
  const operator = requireOperator(c.get('operator'));
  const userId = c.req.param('id');
  const profile = ticketService.getSubmitterProfile(operator, userId);
  return c.json(profile);
});
