import type { MiddlewareHandler } from 'hono';
import { extractBearerToken, verifyToken } from '@commonapp/authkit';
import type { AuthUser } from '../../shared/types';
import type { DB } from '@commonapp/dbkit';

/**
 * Auth middleware: extracts the Bearer token, verifies it, and loads the user from the database.
 * Sets c.var.user on success. Returns 401 on failure.
 */
export function authMiddleware(db: DB): MiddlewareHandler {
  return async (c, next) => {
    const token = extractBearerToken(c.req.header('Authorization'));
    if (!token) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const userId = verifyToken(token);
    if (userId === null) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const row = db
      .prepare(
        `SELECT u.id, u.name, u.email, u.company_id, u.department_id, u.roles
         FROM users u WHERE u.id = ?`
      )
      .get(userId) as
      | {
          id: number;
          name: string;
          email: string;
          company_id: number;
          department_id: number | null;
          roles: string;
        }
      | undefined;

    if (!row) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const user: AuthUser = {
      id: row.id,
      name: row.name,
      email: row.email,
      companyId: row.company_id,
      departmentId: row.department_id,
      roles: row.roles ? row.roles.split(',').map((r) => r.trim()) : [],
    };

    c.set('user', user);
    c.set('db', db);
    await next();
  };
}
