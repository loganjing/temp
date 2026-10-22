import { Hono } from 'hono';
import type { AppEnv } from './middleware/session.js';
import { sessionMiddleware } from './middleware/session.js';
import { AppError } from './errors.js';
import { sessionRoutes } from './routes/session.js';
import { ticketRoutes } from './routes/tickets.js';
import { businessGroupRoutes } from './routes/business-groups.js';
import { assignmentRuleRoutes } from './routes/assignment-rules.js';
import { statsRoutes } from './routes/stats.js';
import { notificationRoutes } from './routes/notifications.js';
import { userRoutes } from './routes/users.js';

export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // Error handler
  app.onError((err, c) => {
    if (err instanceof AppError) {
      // Use header() + body() to avoid ContentfulStatusCode type constraint
      return c.json(err.toResponse(), err.status as any);
    }
    console.error('Unhandled error:', err);
    return c.json({ error: { code: 'INTERNAL', message: '服务器内部错误' } }, 500);
  });

  // Session middleware (runs for all routes)
  app.use('*', sessionMiddleware());

  // Mount routes
  app.route('/api/session', sessionRoutes);
  app.route('/api/tickets', ticketRoutes);
  app.route('/api/business-groups', businessGroupRoutes);
  app.route('/api/assignment-rules', assignmentRuleRoutes);
  app.route('/api/stats', statsRoutes);
  app.route('/api/notifications', notificationRoutes);
  app.route('/api/users', userRoutes);

  // Health check
  app.get('/api/health', (c) => c.json({ ok: true }));

  return app;
}
