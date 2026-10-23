import { Hono } from 'hono';
import { requireRole } from '@commonapp/permissionkit';
import type { AuthUser } from '../../shared/types';
import type { DB } from '@commonapp/dbkit';

type AppEnv = { Variables: { user: AuthUser; db: DB } };

export function createAssignmentRuleRoutes(db: DB) {
  const app = new Hono<AppEnv>();

  // GET /api/assignment-rules
  app.get('/', requireRole('admin'), async (c) => {
    const user = c.get('user');
    const q = c.req.query();
    const companyId = q.companyId ? parseInt(q.companyId) : user.companyId;

    const rules = db
      .prepare(
        `SELECT car.id, car.company_id, car.category_id, cat.name AS category_name,
                car.target_group_id, bg.name AS target_group_name
         FROM category_assignment_rules car
         LEFT JOIN categories cat ON car.category_id = cat.id
         LEFT JOIN business_groups bg ON car.target_group_id = bg.id
         WHERE car.company_id = ?
         ORDER BY car.id`
      )
      .all(companyId) as {
      id: number;
      company_id: number;
      category_id: number;
      category_name: string;
      target_group_id: number;
      target_group_name: string;
    }[];

    return c.json({
      items: rules.map((r) => ({
        id: r.id,
        companyId: r.company_id,
        categoryId: r.category_id,
        categoryName: r.category_name,
        targetGroupId: r.target_group_id,
        targetGroupName: r.target_group_name,
      })),
    }, 200);
  });

  // POST /api/assignment-rules
  app.post('/', requireRole('admin'), async (c) => {
    const user = c.get('user');
    const body = await c.req.json().catch(() => null);

    if (!body || !body.categoryId || !body.targetGroupId) {
      return c.json({ error: 'Validation error: categoryId and targetGroupId are required' }, 400);
    }

    // Verify target group belongs to user's company
    const group = db
      .prepare('SELECT id, company_id FROM business_groups WHERE id = ?')
      .get(body.targetGroupId) as { id: number; company_id: number } | undefined;

    if (!group) {
      return c.json({ error: 'Target business group not found' }, 404);
    }

    if (group.company_id !== user.companyId) {
      return c.json({ error: 'Target business group does not belong to your company' }, 403);
    }

    // Verify category exists
    const category = db.prepare('SELECT id, name FROM categories WHERE id = ?').get(body.categoryId) as
      | { id: number; name: string }
      | undefined;

    if (!category) {
      return c.json({ error: 'Category not found' }, 404);
    }

    // Check for duplicate
    const existing = db
      .prepare(
        'SELECT id FROM category_assignment_rules WHERE company_id = ? AND category_id = ?'
      )
      .get(user.companyId, body.categoryId);
    if (existing) {
      return c.json({ error: 'Assignment rule already exists for this category' }, 409);
    }

    const result = db
      .prepare(
        'INSERT INTO category_assignment_rules (company_id, category_id, target_group_id) VALUES (?, ?, ?)'
      )
      .run(user.companyId, body.categoryId, body.targetGroupId);

    const groupName = db
      .prepare('SELECT name FROM business_groups WHERE id = ?')
      .get(body.targetGroupId) as { name: string };

    return c.json({
      id: result.lastInsertRowid as number,
      companyId: user.companyId,
      categoryId: body.categoryId,
      categoryName: category.name,
      targetGroupId: body.targetGroupId,
      targetGroupName: groupName.name,
    }, 201);
  });

  // DELETE /api/assignment-rules/:id
  app.delete('/:id', requireRole('admin'), async (c) => {
    const user = c.get('user');
    const ruleId = parseInt(c.req.param('id'));

    const rule = db
      .prepare('SELECT company_id FROM category_assignment_rules WHERE id = ?')
      .get(ruleId) as { company_id: number } | undefined;

    if (!rule) {
      return c.json({ error: 'Assignment rule not found' }, 404);
    }

    if (rule.company_id !== user.companyId) {
      return c.json({ error: 'Assignment rule does not belong to your company' }, 403);
    }

    db.prepare('DELETE FROM category_assignment_rules WHERE id = ?').run(ruleId);

    return c.body(null, 204);
  });

  return app;
}
