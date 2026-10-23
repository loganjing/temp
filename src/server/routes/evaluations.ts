import { Hono } from 'hono';
import { requireRole } from '@commonapp/permissionkit';
import { writeAuditEvent } from '@commonapp/auditkit';
import type { AuthUser } from '../../shared/types';
import type { DB } from '@commonapp/dbkit';
import { getTicketById } from '../queries';

type AppEnv = { Variables: { user: AuthUser; db: DB } };

export function createEvaluationRoutes(db: DB) {
  const app = new Hono<AppEnv>();

  // POST /api/tickets/:id/evaluation
  app.post('/:id/evaluation', requireRole('submitter'), async (c) => {
    const user = c.get('user');
    const ticketId = parseInt(c.req.param('id'));
    const body = await c.req.json().catch(() => null);

    if (!body || typeof body.rating !== 'number' || body.rating < 1 || body.rating > 5) {
      return c.json({ error: 'Validation error: rating must be a number between 1 and 5' }, 400);
    }

    const ticket = getTicketById(db, ticketId);
    if (!ticket) {
      return c.json({ error: 'Ticket not found' }, 404);
    }

    // Must be the submitter
    if (ticket.submitter_id !== user.id) {
      return c.json({ error: 'Forbidden: only the submitter can evaluate' }, 403);
    }

    // Ticket must be completed
    if (ticket.status !== 'completed') {
      return c.json({ error: 'Can only evaluate completed tickets' }, 400);
    }

    // Check for existing evaluation
    const existing = db
      .prepare('SELECT id FROM satisfaction_evaluations WHERE ticket_id = ?')
      .get(ticketId);
    if (existing) {
      return c.json({ error: 'Evaluation already exists' }, 409);
    }

    const now = new Date().toISOString();
    const result = db
      .prepare('INSERT INTO satisfaction_evaluations (ticket_id, rating, created_at) VALUES (?, ?, ?)')
      .run(ticketId, body.rating, now);

    const evalId = result.lastInsertRowid as number;

    writeAuditEvent(db, {
      ticketId,
      companyId: ticket.company_id,
      action: 'evaluated',
      operatorId: user.id,
      operatorName: user.name,
      details: { rating: body.rating },
    });

    return c.json({
      id: evalId,
      ticketId,
      rating: body.rating,
      createdAt: now,
    }, 201);
  });

  // GET /api/tickets/:id/evaluation
  app.get('/:id/evaluation', async (c) => {
    const user = c.get('user');
    const ticketId = parseInt(c.req.param('id'));

    const ticket = getTicketById(db, ticketId);
    if (!ticket) {
      return c.json({ error: 'Ticket not found' }, 404);
    }

    if (!user.roles.includes('admin') && ticket.company_id !== user.companyId) {
      return c.json({ error: "Company isolation: cannot access other company's ticket" }, 403);
    }

    const evalRow = db
      .prepare('SELECT id, ticket_id, rating, created_at FROM satisfaction_evaluations WHERE ticket_id = ?')
      .get(ticketId) as
      | { id: number; ticket_id: number; rating: number; created_at: string }
      | undefined;

    if (!evalRow) {
      return c.json({ error: 'Evaluation not found' }, 404);
    }

    return c.json({
      id: evalRow.id,
      ticketId: evalRow.ticket_id,
      rating: evalRow.rating,
      createdAt: evalRow.created_at,
    }, 200);
  });

  return app;
}
