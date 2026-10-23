import { Hono } from 'hono';
import { queryAuditEvents } from '@commonapp/auditkit';
import type { AuthUser } from '../../shared/types';
import type { DB } from '@commonapp/dbkit';
import { getTicketById } from '../queries';

type AppEnv = { Variables: { user: AuthUser; db: DB } };

export function createLogRoutes(db: DB) {
  const app = new Hono<AppEnv>();

  // GET /api/tickets/:id/logs
  app.get('/:id/logs', async (c) => {
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

    const events = queryAuditEvents(db, ticketId);

    return c.json({
      items: events.map((e) => ({
        id: e.id,
        action: e.action,
        operatorId: e.operator_id,
        operatorName: e.operator_name,
        operatorTime: e.operator_time,
        details: e.details,
      })),
    }, 200);
  });

  return app;
}
