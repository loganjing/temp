import { Hono } from 'hono';
import { requireRole } from '@commonapp/permissionkit';
import type { AuthUser } from '../../shared/types';
import type { DB } from '@commonapp/dbkit';

type AppEnv = { Variables: { user: AuthUser; db: DB } };

export function createBusinessGroupRoutes(db: DB) {
  const app = new Hono<AppEnv>();

  // GET /api/business-groups
  app.get('/', requireRole('admin'), async (c) => {
    const user = c.get('user');
    const q = c.req.query();
    const companyId = q.companyId ? parseInt(q.companyId) : user.companyId;

    const groups = db
      .prepare(
        `SELECT bg.id, bg.company_id, bg.name FROM business_groups bg WHERE bg.company_id = ? ORDER BY bg.id`
      )
      .all(companyId) as { id: number; company_id: number; name: string }[];

    const result = groups.map((g) => {
      const members = db
        .prepare(
          `SELECT bgm.id, bgm.user_id, u.name AS user_name, u.email AS user_email
           FROM business_group_members bgm
           LEFT JOIN users u ON bgm.user_id = u.id
           WHERE bgm.group_id = ?
           ORDER BY bgm.id`
        )
        .all(g.id) as {
        id: number;
        user_id: number;
        user_name: string;
        user_email: string;
      }[];

      return {
        id: g.id,
        companyId: g.company_id,
        name: g.name,
        members: members.map((m) => ({
          id: m.id,
          userId: m.user_id,
          userName: m.user_name,
          userEmail: m.user_email,
        })),
      };
    });

    return c.json({ items: result }, 200);
  });

  // POST /api/business-groups
  app.post('/', requireRole('admin'), async (c) => {
    const user = c.get('user');
    const body = await c.req.json().catch(() => null);

    if (!body || !body.name || typeof body.name !== 'string') {
      return c.json({ error: 'Validation error: name is required' }, 400);
    }

    const memberUserIds: number[] = Array.isArray(body.memberUserIds) ? body.memberUserIds : [];

    // Verify all member users belong to the same company
    for (const uid of memberUserIds) {
      const u = db.prepare('SELECT company_id FROM users WHERE id = ?').get(uid) as
        | { company_id: number }
        | undefined;
      if (!u || u.company_id !== user.companyId) {
        return c.json({ error: `User ${uid} does not belong to your company` }, 400);
      }
    }

    const result = db
      .prepare('INSERT INTO business_groups (company_id, name) VALUES (?, ?)')
      .run(user.companyId, body.name);
    const groupId = result.lastInsertRowid as number;

    const members: { id: number; userId: number; userName: string }[] = [];
    for (const uid of memberUserIds) {
      const mResult = db
        .prepare('INSERT INTO business_group_members (group_id, user_id) VALUES (?, ?)')
        .run(groupId, uid);
      const u = db.prepare('SELECT name FROM users WHERE id = ?').get(uid) as { name: string };
      members.push({ id: mResult.lastInsertRowid as number, userId: uid, userName: u.name });
    }

    return c.json({
      id: groupId,
      companyId: user.companyId,
      name: body.name,
      members,
    }, 201);
  });

  // POST /api/business-groups/:id/members
  app.post('/:id/members', requireRole('admin'), async (c) => {
    const user = c.get('user');
    const groupId = parseInt(c.req.param('id'));
    const body = await c.req.json().catch(() => null);

    if (!body || !body.userId || typeof body.userId !== 'number') {
      return c.json({ error: 'Validation error: userId is required' }, 400);
    }

    const group = db
      .prepare('SELECT id, company_id FROM business_groups WHERE id = ?')
      .get(groupId) as { id: number; company_id: number } | undefined;

    if (!group) {
      return c.json({ error: 'Business group not found' }, 404);
    }

    if (group.company_id !== user.companyId) {
      return c.json({ error: 'Business group does not belong to your company' }, 403);
    }

    const targetUser = db.prepare('SELECT id, name, company_id FROM users WHERE id = ?').get(body.userId) as
      | { id: number; name: string; company_id: number }
      | undefined;

    if (!targetUser) {
      return c.json({ error: 'User not found' }, 404);
    }

    if (targetUser.company_id !== user.companyId) {
      return c.json({ error: 'User does not belong to your company' }, 403);
    }

    // Check for existing membership
    const existing = db
      .prepare('SELECT id FROM business_group_members WHERE group_id = ? AND user_id = ?')
      .get(groupId, body.userId);
    if (existing) {
      return c.json({ error: 'User is already a member' }, 409);
    }

    const result = db
      .prepare('INSERT INTO business_group_members (group_id, user_id) VALUES (?, ?)')
      .run(groupId, body.userId);

    return c.json({
      id: result.lastInsertRowid as number,
      groupId,
      userId: body.userId,
      userName: targetUser.name,
    }, 201);
  });

  // DELETE /api/business-groups/:id/members/:userId
  app.delete('/:id/members/:userId', requireRole('admin'), async (c) => {
    const user = c.get('user');
    const groupId = parseInt(c.req.param('id'));
    const userId = parseInt(c.req.param('userId'));

    const group = db
      .prepare('SELECT id, company_id FROM business_groups WHERE id = ?')
      .get(groupId) as { id: number; company_id: number } | undefined;

    if (!group) {
      return c.json({ error: 'Business group not found' }, 404);
    }

    if (group.company_id !== user.companyId) {
      return c.json({ error: 'Business group does not belong to your company' }, 403);
    }

    db.prepare('DELETE FROM business_group_members WHERE group_id = ? AND user_id = ?').run(
      groupId,
      userId
    );

    return c.body(null, 204);
  });

  return app;
}
