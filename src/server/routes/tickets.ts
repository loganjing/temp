import { Hono } from 'hono';
import type { AppEnv } from '../middleware/session.js';
import { requireAuth } from '../middleware/session.js';
import { requireOperator, assertCapability } from '../access-control.js';
import * as ticketService from '../services/ticket.js';
import * as collaborationService from '../services/collaboration.js';
import { enqueueCompletionNotice } from '../services/notification.js';
import { AppError, assertString, assertOptionalString, assertInteger } from '../errors.js';
import { getDb } from '../db.js';

export const ticketRoutes = new Hono<AppEnv>();

// All ticket routes require auth
ticketRoutes.use('*', requireAuth());

// POST /api/tickets - create ticket
ticketRoutes.post('/', async (c) => {
  const operator = requireOperator(c.get('operator'));
  assertCapability(operator, 'submit_ticket');
  const body = await c.req.json();

  const ticket = ticketService.createTicket(operator, {
    subject: body?.subject,
    description: body?.description,
    category: body?.category,
    priority: body?.priority,
    companyId: body?.companyId,
  });

  return c.json({ ticket }, 201);
});

// GET /api/tickets - list tickets
ticketRoutes.get('/', (c) => {
  const operator = requireOperator(c.get('operator'));
  const q = c.req.query('q');
  const category = c.req.query('category');
  const priority = c.req.query('priority');
  const status = c.req.query('status');
  const companyId = c.req.query('companyId');
  const sort = c.req.query('sort');
  const page = c.req.query('page') ? parseInt(c.req.query('page')!, 10) : undefined;
  const pageSize = c.req.query('pageSize') ? parseInt(c.req.query('pageSize')!, 10) : undefined;

  const result = ticketService.listTickets(operator, {
    q: q || undefined,
    category: category || undefined,
    priority: priority || undefined,
    status: status || undefined,
    companyId: companyId || undefined,
    sort: sort || undefined,
    page,
    pageSize,
  });

  return c.json(result);
});

// GET /api/tickets/:id - ticket detail
ticketRoutes.get('/:id', (c) => {
  const operator = requireOperator(c.get('operator'));
  const ticketId = c.req.param('id');
  const detail = ticketService.getTicketDetail(operator, ticketId);
  return c.json(detail);
});

// POST /api/tickets/:id/replies - add reply
ticketRoutes.post('/:id/replies', async (c) => {
  const operator = requireOperator(c.get('operator'));
  // Need either submit_ticket or handle_ticket capability
  if (!operator.capabilities.includes('submit_ticket') && !operator.capabilities.includes('handle_ticket')) {
    throw new AppError('FORBIDDEN', '不具备回复工单所需能力');
  }
  const ticketId = c.req.param('id');
  const body = await c.req.json();
  const content = assertString(body?.content, 'content', { min: 1, max: 5000 });

  const reply = ticketService.addReply(operator, ticketId, content);
  return c.json({ reply }, 201);
});

// POST /api/tickets/:id/transfer - transfer ticket
ticketRoutes.post('/:id/transfer', async (c) => {
  const operator = requireOperator(c.get('operator'));
  assertCapability(operator, 'handle_ticket');
  const ticketId = c.req.param('id');
  const body = await c.req.json();

  const result = collaborationService.transferTicket(operator, ticketId, {
    groupId: body?.groupId,
    assigneeId: body?.assigneeId,
    note: body?.note,
  });

  return c.json(result, 200);
});

// POST /api/tickets/:id/complete - complete ticket
ticketRoutes.post('/:id/complete', async (c) => {
  const operator = requireOperator(c.get('operator'));
  assertCapability(operator, 'handle_ticket');
  const ticketId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const resolution = assertOptionalString(body?.resolution, 'resolution', { max: 2000 });

  const { ticket } = ticketService.completeTicket(operator, ticketId, resolution);

  // Read notification record (it was enqueued inside completeTicket)
  const db = getDb();
  const notifRow = db.prepare('SELECT id, ticket_id, to_email, subject, status, created_at, sent_at, error FROM email_outbox WHERE ticket_id = ?').get(ticketId) as {
    id: string; ticket_id: string; to_email: string; subject: string;
    status: string; created_at: string; sent_at: string | null; error: string | null;
  };

  return c.json({
    ticket,
    notification: {
      id: notifRow.id,
      toEmail: notifRow.to_email,
      status: notifRow.status,
      createdAt: notifRow.created_at,
    },
  }, 200);
});

// POST /api/tickets/:id/cancel - cancel ticket
ticketRoutes.post('/:id/cancel', async (c) => {
  const operator = requireOperator(c.get('operator'));
  const ticketId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const reason = assertOptionalString(body?.reason, 'reason', { max: 500 });

  const { ticket } = ticketService.cancelTicket(operator, ticketId, reason);
  return c.json({ ticket }, 200);
});

// POST /api/tickets/:id/rating - submit rating
ticketRoutes.post('/:id/rating', async (c) => {
  const operator = requireOperator(c.get('operator'));
  assertCapability(operator, 'submit_ticket');
  const ticketId = c.req.param('id');
  const body = await c.req.json();
  const score = assertInteger(body?.score, 'score', { min: 1, max: 5 });

  const rating = ticketService.submitRating(operator, ticketId, score);
  return c.json({ rating }, 201);
});

// GET /api/tickets/:id/logs - list ticket logs
ticketRoutes.get('/:id/logs', (c) => {
  const operator = requireOperator(c.get('operator'));
  const ticketId = c.req.param('id');
  const result = ticketService.listTicketLogs(operator, ticketId);
  return c.json(result);
});
