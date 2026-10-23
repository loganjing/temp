import { Hono } from 'hono';
import type { AuthUser } from '../../shared/types';
import type { DB } from '@commonapp/dbkit';
import { getTicketById } from '../queries';

type AppEnv = { Variables: { user: AuthUser; db: DB } };

export function createReplyRoutes(db: DB) {
  const app = new Hono<AppEnv>();

  // POST /api/tickets/:id/replies
  app.post('/:id/replies', async (c) => {
    const user = c.get('user');
    const ticketId = parseInt(c.req.param('id'));
    const body = await c.req.json().catch(() => null);

    if (!body || !body.content || typeof body.content !== 'string') {
      return c.json({ error: 'Validation error: content is required' }, 400);
    }

    const ticket = getTicketById(db, ticketId);
    if (!ticket) {
      return c.json({ error: 'Ticket not found' }, 404);
    }

    // Company isolation: user must belong to the ticket's company
    if (!user.roles.includes('admin') && ticket.company_id !== user.companyId) {
      return c.json({ error: "Company isolation: cannot reply to other company's ticket" }, 403);
    }

    const now = new Date().toISOString();
    const result = db
      .prepare(
        `INSERT INTO ticket_replies (ticket_id, replier_id, content, created_at) VALUES (?, ?, ?, ?)`
      )
      .run(ticketId, user.id, body.content, now);

    const replyId = result.lastInsertRowid as number;

    return c.json({
      id: replyId,
      ticketId,
      replierId: user.id,
      replierName: user.name,
      content: body.content,
      createdAt: now,
    }, 201);
  });

  // GET /api/tickets/:id/replies
  app.get('/:id/replies', async (c) => {
    const user = c.get('user');
    const ticketId = parseInt(c.req.param('id'));

    const ticket = getTicketById(db, ticketId);
    if (!ticket) {
      return c.json({ error: 'Ticket not found' }, 404);
    }

    if (!user.roles.includes('admin') && ticket.company_id !== user.companyId) {
      return c.json({ error: "Company isolation: cannot access other company's ticket" }, 403);
    }

    const replies = db
      .prepare(
        `SELECT tr.id, tr.replier_id, u.name AS replier_name, tr.content, tr.created_at
         FROM ticket_replies tr
         LEFT JOIN users u ON tr.replier_id = u.id
         WHERE tr.ticket_id = ?
         ORDER BY tr.created_at ASC`
      )
      .all(ticketId) as {
      id: number;
      replier_id: number;
      replier_name: string;
      content: string;
      created_at: string;
    }[];

    return c.json({
      items: replies.map((r) => ({
        id: r.id,
        replierId: r.replier_id,
        replierName: r.replier_name,
        content: r.content,
        createdAt: r.created_at,
      })),
    }, 200);
  });

  return app;
}
