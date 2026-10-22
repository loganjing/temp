import { Hono } from 'hono';
import type { AppEnv } from '../middleware/session.js';
import { requireAuth } from '../middleware/session.js';
import { requireOperator } from '../access-control.js';
import * as statsService from '../services/statistics.js';
import { AppError } from '../errors.js';

export const statsRoutes = new Hono<AppEnv>();

statsRoutes.use('*', requireAuth());

// GET /api/stats/distribution
statsRoutes.get('/distribution', (c) => {
  const operator = requireOperator(c.get('operator'));
  const dimension = c.req.query('dimension');
  if (!dimension || (dimension !== 'company' && dimension !== 'department')) {
    throw new AppError('VALIDATION_FAILED', 'dimension 必须为 company 或 department', { fields: { dimension: ['must be company or department'] } });
  }
  const result = statsService.getDistribution(operator, dimension);
  return c.json(result);
});

// GET /api/stats/dashboard
statsRoutes.get('/dashboard', (c) => {
  const operator = requireOperator(c.get('operator'));
  const result = statsService.getDashboard(operator);
  return c.json(result);
});
