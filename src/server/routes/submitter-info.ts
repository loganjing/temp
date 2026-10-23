import { Hono } from 'hono';
import { requireRole } from '@commonapp/permissionkit';
import type { AuthUser } from '../../shared/types';
import type { DB } from '@commonapp/dbkit';
import { getTicketById } from '../queries';

type AppEnv = { Variables: { user: AuthUser; db: DB } };

export function createSubmitterInfoRoutes(db: DB) {
  const app = new Hono<AppEnv>();

  // GET /api/tickets/:id/submitter-info
  app.get('/:id/submitter-info', requireRole('handler', 'admin'), async (c) => {
    const user = c.get('user');
    const ticketId = parseInt(c.req.param('id'));

    const ticket = getTicketById(db, ticketId);
    if (!ticket) {
      return c.json({ error: 'Ticket not found' }, 404);
    }

    // Company isolation
    if (!user.roles.includes('admin') && ticket.company_id !== user.companyId) {
      return c.json({ error: 'Company isolation: cannot access other company ticket' }, 403);
    }

    // Must be the handler or admin
    if (!user.roles.includes('admin') && ticket.handler_id !== user.id) {
      return c.json({ error: 'Forbidden: only the handler or admin can view submitter info' }, 403);
    }

    const submitter = db
      .prepare(
        `SELECT u.id, u.name, u.email, u.company_id, u.department_id,
                co.name AS company_name, dep.name AS department_name
         FROM users u
         LEFT JOIN companies co ON u.company_id = co.id
         LEFT JOIN departments dep ON u.department_id = dep.id
         WHERE u.id = ?`
      )
      .get(ticket.submitter_id) as
      | {
          id: number;
          name: string;
          email: string;
          company_id: number;
          department_id: number | null;
          company_name: string;
          department_name: string | null;
        }
      | undefined;

    if (!submitter) {
      return c.json({ error: 'Submitter not found' }, 404);
    }

    const historyTickets = db
      .prepare(
        `SELECT id, title, status, created_at FROM tickets WHERE submitter_id = ? ORDER BY created_at DESC`
      )
      .all(ticket.submitter_id) as {
      id: number;
      title: string;
      status: string;
      created_at: string;
    }[];

    return c.json({
      userId: submitter.id,
      name: submitter.name,
      email: submitter.email,
      companyName: submitter.company_name,
      departmentName: submitter.department_name || '',
      historyTickets: historyTickets.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        createdAt: t.created_at,
      })),
    }, 200);
  });

  return app;
}
