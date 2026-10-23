import { Hono } from 'hono';
import { verifyPassword, createToken } from '@commonapp/authkit';
import type { AuthUser } from '../../shared/types';
import type { DB } from '@commonapp/dbkit';

type AppEnv = { Variables: { user: AuthUser; db: DB } };

/**
 * Creates auth route handlers. Currently unused by index.ts (login is handled inline),
 * but exported for testing and modularity.
 */
export function createAuthRoutes(db: DB) {
  const app = new Hono<AppEnv>();

  // POST /login
  app.post('/login', async (c) => {
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

  // GET /me (requires auth middleware to have set c.var.user)
  app.get('/me', async (c) => {
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

  return app;
}
