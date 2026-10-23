import { Hono } from 'hono';
import { requireRole } from '@commonapp/permissionkit';
import type { AuthUser } from '../../shared/types';
import type { DB } from '@commonapp/dbkit';
import { mapTicketResponse } from '../queries';

type AppEnv = { Variables: { user: AuthUser; db: DB } };

export function createWorkbenchRoutes(db: DB) {
  const app = new Hono<AppEnv>();

  // GET /api/workbench/tickets
  app.get('/tickets', requireRole('handler', 'admin'), async (c) => {
    const user = c.get('user');
    const q = c.req.query();

    const isAdmin = user.roles.includes('admin');
    const companyFilter = q.companyId ? parseInt(q.companyId) : user.companyId;

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (isAdmin) {
      // Admin sees all pending tickets in the (optionally specified) company
      if (companyFilter) {
        conditions.push('t.company_id = ?');
        params.push(companyFilter);
      }
      // Pending = pending_assignment OR pending_processing
      conditions.push("(t.status = 'pending_assignment' OR t.status = 'pending_processing')");
    } else {
      // Handler: only tickets assigned to their business groups, status pending_processing
      conditions.push('t.status = ?');
      params.push('pending_processing');
      conditions.push('t.company_id = ?');
      params.push(user.companyId);
      conditions.push(
        `t.business_group_id IN (SELECT group_id FROM business_group_members WHERE user_id = ?)`
      );
      params.push(user.id);
    }

    if (q.slaPriority) {
      conditions.push('t.sla_priority = ?');
      params.push(q.slaPriority);
    }
    if (q.categoryId) {
      conditions.push('t.category_id = ?');
      params.push(parseInt(q.categoryId));
    }
    if (q.keyword) {
      conditions.push('(t.title LIKE ? OR t.description LIKE ?)');
      params.push(`%${q.keyword}%`, `%${q.keyword}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sortBy = q.sortBy || 'createdAt';
    const validSortFields = ['createdAt', 'slaPriority'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const columnMap: Record<string, string> = {
      createdAt: 't.created_at',
      slaPriority: 't.sla_priority',
    };
    const sortOrder = q.sortOrder === 'asc' ? 'ASC' : 'DESC';

    const page = Math.max(1, parseInt(q.page || '1'));
    const pageSize = Math.max(1, Math.min(100, parseInt(q.pageSize || '20')));
    const offset = (page - 1) * pageSize;

    const countRow = db
      .prepare(`SELECT COUNT(*) as total FROM tickets t ${whereClause}`)
      .get(...params) as { total: number };

    const rows = db
      .prepare(
        `SELECT
          t.id, t.title, t.description,
          t.category_id, c.name AS category_name,
          t.submitter_id, su.name AS submitter_name,
          t.company_id,
          t.sla_priority, t.status,
          t.handler_id, hu.name AS handler_name,
          t.business_group_id,
          t.created_by, t.created_at, t.completed_at
        FROM tickets t
        LEFT JOIN categories c ON t.category_id = c.id
        LEFT JOIN users su ON t.submitter_id = su.id
        LEFT JOIN users hu ON t.handler_id = hu.id
        ${whereClause}
        ORDER BY ${columnMap[sortField]} ${sortOrder}
        LIMIT ? OFFSET ?`
      )
      .all(...params, pageSize, offset) as Parameters<typeof mapTicketResponse>[0][];

    return c.json({
      items: rows.map(mapTicketResponse),
      total: countRow.total,
      page,
      pageSize,
    }, 200);
  });

  return app;
}
