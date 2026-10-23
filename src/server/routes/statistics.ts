import { Hono } from 'hono';
import { requireRole } from '@commonapp/permissionkit';
import type { AuthUser } from '../../shared/types';
import type { DB } from '@commonapp/dbkit';

type AppEnv = { Variables: { user: AuthUser; db: DB } };

export function createStatisticsRoutes(db: DB) {
  const app = new Hono<AppEnv>();

  // GET /api/statistics/overview
  app.get('/overview', requireRole('admin'), async (c) => {
    const user = c.get('user');
    const q = c.req.query();

    const companyId = q.companyId ? parseInt(q.companyId) : user.companyId;
    const startDate = q.startDate;
    const endDate = q.endDate;

    const dateConditions: string[] = [];
    const dateParams: (string | number)[] = [];
    if (startDate) {
      dateConditions.push('t.created_at >= ?');
      dateParams.push(startDate);
    }
    if (endDate) {
      dateConditions.push('t.created_at <= ?');
      dateParams.push(endDate);
    }
    const dateClause = dateConditions.length > 0 ? `AND ${dateConditions.join(' AND ')}` : '';

    const baseParams = [companyId, ...dateParams];

    const totalRow = db
      .prepare(
        `SELECT COUNT(*) as count FROM tickets t WHERE t.company_id = ? ${dateClause}`
      )
      .get(...baseParams) as { count: number };

    const completedRow = db
      .prepare(
        `SELECT COUNT(*) as count FROM tickets t WHERE t.company_id = ? AND t.status = 'completed' ${dateClause}`
      )
      .get(...baseParams) as { count: number };

    const pendingRow = db
      .prepare(
        `SELECT COUNT(*) as count FROM tickets t WHERE t.company_id = ? AND (t.status = 'pending_assignment' OR t.status = 'pending_processing') ${dateClause}`
      )
      .get(...baseParams) as { count: number };

    const cancelledRow = db
      .prepare(
        `SELECT COUNT(*) as count FROM tickets t WHERE t.company_id = ? AND t.status = 'cancelled' ${dateClause}`
      )
      .get(...baseParams) as { count: number };

    // Average response time: from created_at to completed_at, in minutes
    const responseTimeRow = db
      .prepare(
        `SELECT AVG((julianday(t.completed_at) - julianday(t.created_at)) * 24 * 60) as avg_minutes
         FROM tickets t
         WHERE t.company_id = ? AND t.status = 'completed' AND t.completed_at IS NOT NULL ${dateClause}`
      )
      .get(...baseParams) as { avg_minutes: number | null };

    // Average satisfaction
    const satisfactionRow = db
      .prepare(
        `SELECT AVG(se.rating) as avg_rating, COUNT(*) as count
         FROM satisfaction_evaluations se
         JOIN tickets t ON se.ticket_id = t.id
         WHERE t.company_id = ? ${dateClause}`
      )
      .get(...baseParams) as { avg_rating: number | null; count: number };

    return c.json({
      totalTickets: totalRow.count,
      completedTickets: completedRow.count,
      pendingTickets: pendingRow.count,
      cancelledTickets: cancelledRow.count,
      averageResponseTimeMinutes: Math.round(responseTimeRow.avg_minutes || 0),
      averageSatisfaction: satisfactionRow.avg_rating
        ? Math.round(satisfactionRow.avg_rating * 10) / 10
        : 0,
      satisfactionCount: satisfactionRow.count,
    }, 200);
  });

  // GET /api/statistics/distribution
  app.get('/distribution', requireRole('admin'), async (c) => {
    const user = c.get('user');
    const q = c.req.query();
    const dimension = q.dimension || 'company';
    const companyId = q.companyId ? parseInt(q.companyId) : user.companyId;

    if (dimension === 'company') {
      const rows = db
        .prepare(
          `SELECT co.name AS label,
                  COUNT(*) as total,
                  SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) as completed,
                  SUM(CASE WHEN t.status = 'pending_assignment' OR t.status = 'pending_processing' THEN 1 ELSE 0 END) as pending,
                  SUM(CASE WHEN t.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
           FROM tickets t
           LEFT JOIN companies co ON t.company_id = co.id
           GROUP BY t.company_id
           ORDER BY total DESC`
        )
        .all() as {
        label: string;
        total: number;
        completed: number;
        pending: number;
        cancelled: number;
      }[];

      return c.json({
        dimension: 'company',
        items: rows,
      }, 200);
    } else {
      // dimension = department
      const rows = db
        .prepare(
          `SELECT dep.name AS label,
                  COUNT(*) as total,
                  SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) as completed,
                  SUM(CASE WHEN t.status = 'pending_assignment' OR t.status = 'pending_processing' THEN 1 ELSE 0 END) as pending,
                  SUM(CASE WHEN t.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
           FROM tickets t
           LEFT JOIN users u ON t.submitter_id = u.id
           LEFT JOIN departments dep ON u.department_id = dep.id
           WHERE t.company_id = ?
           GROUP BY dep.id
           ORDER BY total DESC`
        )
        .all(companyId) as {
        label: string;
        total: number;
        completed: number;
        pending: number;
        cancelled: number;
      }[];

      return c.json({
        dimension: 'department',
        items: rows,
      }, 200);
    }
  });

  // GET /api/statistics/hot-topics
  app.get('/hot-topics', requireRole('admin'), async (c) => {
    const user = c.get('user');
    const q = c.req.query();
    const companyId = q.companyId ? parseInt(q.companyId) : user.companyId;
    const limit = Math.max(1, Math.min(50, parseInt(q.limit || '10')));

    const rows = db
      .prepare(
        `SELECT t.category_id, c.name AS category_name, COUNT(*) as ticket_count
         FROM tickets t
         LEFT JOIN categories c ON t.category_id = c.id
         WHERE t.company_id = ?
         GROUP BY t.category_id
         ORDER BY ticket_count DESC
         LIMIT ?`
      )
      .all(companyId, limit) as {
      category_id: number;
      category_name: string;
      ticket_count: number;
    }[];

    return c.json({
      items: rows.map((r) => ({
        categoryId: r.category_id,
        categoryName: r.category_name,
        ticketCount: r.ticket_count,
      })),
    }, 200);
  });

  return app;
}
