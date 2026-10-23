import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import type { AuthUser } from '../shared/types';
import type { DB } from '@commonapp/dbkit';
import { getDatabase, closeDatabase } from './db';
import { authMiddleware } from './middleware/auth';
import { verifyPassword, createToken } from '@commonapp/authkit';
import { createTicketRoutes } from './routes/tickets';
import { createReplyRoutes } from './routes/replies';
import { createEvaluationRoutes } from './routes/evaluations';
import { createSubmitterInfoRoutes } from './routes/submitter-info';
import { createBusinessGroupRoutes } from './routes/business-groups';
import { createAssignmentRuleRoutes } from './routes/assignment-rules';
import { createWorkbenchRoutes } from './routes/workbench';
import { createStatisticsRoutes } from './routes/statistics';
import { createLogRoutes } from './routes/logs';

type AppEnv = { Variables: { user: AuthUser; db: DB } };

function createApp(db: DB): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // Global error handler
  app.onError((err, c) => {
    console.error('[server] Unhandled error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  });

  // Health check (no auth)
  app.get('/health', (c) => c.json({ status: 'ok' }));

  // POST /api/auth/login — public, no auth required
  app.post('/api/auth/login', async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || !body.email || !body.password) {
      return c.json({ error: 'Validation error: email and password are required' }, 400);
    }

    const row = db
      .prepare(
        'SELECT id, name, email, password, company_id, department_id, roles FROM users WHERE email = ?'
      )
      .get(body.email) as
      | {
          id: number;
          name: string;
          email: string;
          password: string;
          company_id: number;
          department_id: number | null;
          roles: string;
        }
      | undefined;

    if (!row || !verifyPassword(body.password, row.password)) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    const token = createToken(row.id);
    const roles = row.roles ? row.roles.split(',').map((r) => r.trim()) : [];

    return c.json({
      token,
      user: {
        id: row.id,
        name: row.name,
        email: row.email,
        companyId: row.company_id,
        departmentId: row.department_id,
        roles,
      },
    });
  });

  // All remaining /api routes require authentication
  const api = new Hono<AppEnv>();
  api.use('*', authMiddleware(db));

  // GET /api/auth/me
  api.get('/api/auth/me', (c) => {
    const user = c.get('user');
    return c.json({
      id: user.id,
      name: user.name,
      email: user.email,
      companyId: user.companyId,
      departmentId: user.departmentId,
      roles: user.roles,
    });
  });

  // Ticket routes (CRUD + status flow + transfer + complete + cancel)
  api.route('/api/tickets', createTicketRoutes(db));
  // Reply routes (POST/GET /api/tickets/:id/replies)
  api.route('/api/tickets', createReplyRoutes(db));
  // Evaluation routes (POST/GET /api/tickets/:id/evaluation)
  api.route('/api/tickets', createEvaluationRoutes(db));
  // Submitter info (GET /api/tickets/:id/submitter-info)
  api.route('/api/tickets', createSubmitterInfoRoutes(db));
  // Audit log routes (GET /api/tickets/:id/logs)
  api.route('/api/tickets', createLogRoutes(db));
  // Business group routes
  api.route('/api/business-groups', createBusinessGroupRoutes(db));
  // Assignment rule routes
  api.route('/api/assignment-rules', createAssignmentRuleRoutes(db));
  // Workbench routes
  api.route('/api/workbench', createWorkbenchRoutes(db));
  // Statistics routes
  api.route('/api/statistics', createStatisticsRoutes(db));

  app.route('/', api);

  return app;
}

// Main entry point
const db = getDatabase();
const app = createApp(db);

const port = parseInt(process.env.PORT || '3000', 10);

serve(
  { fetch: app.fetch, port },
  (info) => {
    console.log(`[server] Helpdesk API server running on http://localhost:${info.port}`);
  }
);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('[server] Shutting down...');
  closeDatabase();
  process.exit(0);
});
process.on('SIGTERM', () => {
  console.log('[server] Shutting down...');
  closeDatabase();
  process.exit(0);
});

export { createApp, app };
