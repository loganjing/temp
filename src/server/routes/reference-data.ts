import { Hono } from 'hono';
import type { AuthUser } from '../../shared/types';
import type { DB } from '@commonapp/dbkit';

type AppEnv = { Variables: { user: AuthUser; db: DB } };

export function createReferenceDataRoutes(db: DB) {
  const app = new Hono<AppEnv>();

  // GET /api/categories — all authenticated users
  app.get('/categories', (c) => {
    const rows = db
      .prepare('SELECT id, name FROM categories ORDER BY id')
      .all() as { id: number; name: string }[];
    return c.json({ items: rows }, 200);
  });

  // GET /api/companies — admin sees all, others see their own
  app.get('/companies', (c) => {
    const user = c.get('user');

    if (!user.roles.includes('admin')) {
      const row = db
        .prepare('SELECT id, name FROM companies WHERE id = ?')
        .get(user.companyId) as { id: number; name: string } | undefined;
      return c.json({ items: row ? [row] : [] }, 200);
    }

    const rows = db
      .prepare('SELECT id, name FROM companies ORDER BY id')
      .all() as { id: number; name: string }[];
    return c.json({ items: rows }, 200);
  });

  return app;
}
