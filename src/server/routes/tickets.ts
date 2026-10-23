import { Hono } from 'hono';
import { requireRole } from '@commonapp/permissionkit';
import { writeAuditEvent } from '@commonapp/auditkit';
import { sendEmail } from '@commonapp/emailkit';
import type { AuthUser } from '../../shared/types';
import type { DB } from '@commonapp/dbkit';
import { mapTicketResponse, getTicketById, getTicketDetail } from '../queries';

type AppEnv = { Variables: { user: AuthUser; db: DB } };

const VALID_PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'P4'];
const VALID_STATUSES = ['pending_assignment', 'pending_processing', 'completed', 'cancelled'];

export function createTicketRoutes(db: DB) {
  const app = new Hono<AppEnv>();

  // POST /api/tickets — create ticket with auto-assignment
  app.post('/', requireRole('submitter', 'admin'), async (c) => {
    const user = c.get('user');
    const body = await c.req.json().catch(() => null);

    if (!body || !body.title || !body.description) {
      return c.json({ error: 'Validation error: title and description are required' }, 400);
    }
    if (!body.categoryId || typeof body.categoryId !== 'number') {
      return c.json({ error: 'Validation error: categoryId is required' }, 400);
    }
    const slaPriority = body.slaPriority || 'P2';
    if (!VALID_PRIORITIES.includes(slaPriority)) {
      return c.json({ error: `Validation error: slaPriority must be one of ${VALID_PRIORITIES.join(', ')}` }, 400);
    }

    // Verify category exists
    const category = db.prepare('SELECT id, name FROM categories WHERE id = ?').get(body.categoryId) as
      | { id: number; name: string }
      | undefined;
    if (!category) {
      return c.json({ error: 'Validation error: category not found' }, 400);
    }

    const now = new Date().toISOString();
    const createdAt = now;

    // Insert ticket with status pending_assignment
    const result = db
      .prepare(
        `INSERT INTO tickets (title, description, category_id, submitter_id, company_id, sla_priority, status, handler_id, business_group_id, created_by, created_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending_assignment', NULL, NULL, ?, ?, NULL)`
      )
      .run(body.title, body.description, body.categoryId, user.id, user.companyId, slaPriority, user.name, createdAt);

    const ticketId = result.lastInsertRowid as number;

    // Write audit: created
    writeAuditEvent(db, {
      ticketId,
      companyId: user.companyId,
      action: 'created',
      operatorId: user.id,
      operatorName: user.name,
      details: { title: body.title, categoryId: body.categoryId, slaPriority },
    });

    // Auto-assign: check category_assignment_rules
    const rule = db
      .prepare(
        `SELECT target_group_id FROM category_assignment_rules WHERE company_id = ? AND category_id = ?`
      )
      .get(user.companyId, body.categoryId) as { target_group_id: number } | undefined;

    if (rule) {
      db.prepare(
        `UPDATE tickets SET business_group_id = ?, status = 'pending_processing' WHERE id = ?`
      ).run(rule.target_group_id, ticketId);

      writeAuditEvent(db, {
        ticketId,
        companyId: user.companyId,
        action: 'assigned',
        operatorId: user.id,
        operatorName: user.name,
        details: { type: 'auto', targetGroupId: rule.target_group_id },
      });
    }

    const ticket = getTicketById(db, ticketId)!;
    return c.json(mapTicketResponse(ticket), 201);
  });

  // GET /api/tickets — list with filter/search/sort/pagination
  app.get('/', async (c) => {
    const user = c.get('user');
    const q = c.req.query();

    const isAdmin = user.roles.includes('admin');
    const companyFilter = q.companyId ? parseInt(q.companyId) : null;
    const effectiveCompanyId = isAdmin ? companyFilter : user.companyId;

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (effectiveCompanyId !== null) {
      conditions.push('t.company_id = ?');
      params.push(effectiveCompanyId);
    }

    if (q.status) {
      conditions.push('t.status = ?');
      params.push(q.status);
    }
    if (q.categoryId) {
      conditions.push('t.category_id = ?');
      params.push(parseInt(q.categoryId));
    }
    if (q.slaPriority) {
      conditions.push('t.sla_priority = ?');
      params.push(q.slaPriority);
    }
    if (q.businessGroupId) {
      conditions.push('t.business_group_id = ?');
      params.push(parseInt(q.businessGroupId));
    }
    if (q.handlerId) {
      conditions.push('t.handler_id = ?');
      params.push(parseInt(q.handlerId));
    }
    if (q.submitterId) {
      conditions.push('t.submitter_id = ?');
      params.push(parseInt(q.submitterId));
    }
    if (q.keyword) {
      conditions.push('(t.title LIKE ? OR t.description LIKE ?)');
      params.push(`%${q.keyword}%`, `%${q.keyword}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sortBy = q.sortBy || 'createdAt';
    const validSortFields = ['createdAt', 'slaPriority', 'status'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const columnMap: Record<string, string> = {
      createdAt: 't.created_at',
      slaPriority: 't.sla_priority',
      status: 't.status',
    };
    const sortOrder = q.sortOrder === 'asc' ? 'ASC' : 'DESC';

    const page = Math.max(1, parseInt(q.page || '1'));
    const pageSize = Math.max(1, Math.min(100, parseInt(q.pageSize || '20')));
    const offset = (page - 1) * pageSize;

    const countRow = db.prepare(
      `SELECT COUNT(*) as total FROM tickets t ${whereClause}`
    ).get(...params) as { total: number };

    const rows = db.prepare(
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
    ).all(...params, pageSize, offset) as Parameters<typeof mapTicketResponse>[0][];

    return c.json({
      items: rows.map(mapTicketResponse),
      total: countRow.total,
      page,
      pageSize,
    }, 200);
  });

  // GET /api/tickets/:id — ticket detail with replies and evaluation
  app.get('/:id', async (c) => {
    const user = c.get('user');
    const ticketId = parseInt(c.req.param('id'));

    const detail = getTicketDetail(db, ticketId);
    if (!detail) {
      return c.json({ error: 'Ticket not found' }, 404);
    }

    // Company isolation
    if (!user.roles.includes('admin') && detail.companyId !== user.companyId) {
      return c.json({ error: "Company isolation: cannot access other company's ticket" }, 403);
    }

    return c.json(detail, 200);
  });

  // PATCH /api/tickets/:id/status — manual assignment
  app.patch('/:id/status', requireRole('admin', 'handler'), async (c) => {
    const user = c.get('user');
    const ticketId = parseInt(c.req.param('id'));
    const body = await c.req.json().catch(() => null);

    if (!body || !body.status || !VALID_STATUSES.includes(body.status)) {
      return c.json({ error: 'Validation error: valid status required' }, 400);
    }

    const ticket = getTicketById(db, ticketId);
    if (!ticket) {
      return c.json({ error: 'Ticket not found' }, 404);
    }

    // Company isolation
    if (!user.roles.includes('admin') && ticket.company_id !== user.companyId) {
      return c.json({ error: "Company isolation: cannot access other company's ticket" }, 403);
    }

    // If handler role, verify they are a member of the target business group
    if (user.roles.includes('handler') && !user.roles.includes('admin')) {
      if (body.businessGroupId) {
        const membership = db
          .prepare('SELECT 1 FROM business_group_members WHERE group_id = ? AND user_id = ?')
          .get(body.businessGroupId, user.id);
        if (!membership) {
          return c.json({ error: 'Forbidden: not a member of the target business group' }, 403);
        }
      }
    }

    const handlerId = body.handlerId ?? null;
    const businessGroupId = body.businessGroupId ?? null;

    db.prepare(
      `UPDATE tickets SET status = ?, handler_id = ?, business_group_id = ? WHERE id = ?`
    ).run(body.status, handlerId, businessGroupId, ticketId);

    writeAuditEvent(db, {
      ticketId,
      companyId: ticket.company_id,
      action: 'assigned',
      operatorId: user.id,
      operatorName: user.name,
      details: { type: 'manual', status: body.status, handlerId, businessGroupId },
    });

    const updated = getTicketById(db, ticketId)!;
    return c.json([mapTicketResponse(updated)], 200);
  });

  // POST /api/tickets/:id/transfer
  app.post('/:id/transfer', requireRole('handler'), async (c) => {
    const user = c.get('user');
    const ticketId = parseInt(c.req.param('id'));
    const body = await c.req.json().catch(() => null);

    if (!body || !body.targetUserId || typeof body.targetUserId !== 'number') {
      return c.json({ error: 'Validation error: targetUserId is required' }, 400);
    }

    const ticket = getTicketById(db, ticketId);
    if (!ticket) {
      return c.json({ error: 'Ticket not found' }, 404);
    }

    // Company isolation for the ticket
    if (ticket.company_id !== user.companyId) {
      return c.json({ error: 'Cannot transfer ticket outside your company' }, 403);
    }

    // Current user must be the handler
    if (ticket.handler_id !== user.id) {
      return c.json({ error: 'Forbidden: only the current handler can transfer' }, 403);
    }

    // Target user must be in the same company
    const targetUser = db
      .prepare('SELECT id, name, company_id FROM users WHERE id = ?')
      .get(body.targetUserId) as
      | { id: number; name: string; company_id: number }
      | undefined;

    if (!targetUser) {
      return c.json({ error: 'Target user not found' }, 404);
    }
    if (targetUser.company_id !== user.companyId) {
      return c.json({ error: 'Cannot transfer to user outside your company' }, 403);
    }

    db.prepare('UPDATE tickets SET handler_id = ? WHERE id = ?').run(targetUser.id, ticketId);

    writeAuditEvent(db, {
      ticketId,
      companyId: ticket.company_id,
      action: 'transferred',
      operatorId: user.id,
      operatorName: user.name,
      details: { fromHandlerId: user.id, toHandlerId: targetUser.id, toHandlerName: targetUser.name },
    });

    return c.json({
      id: ticketId,
      status: ticket.status,
      handlerId: targetUser.id,
      handlerName: targetUser.name,
    }, 200);
  });

  // POST /api/tickets/:id/complete
  app.post('/:id/complete', requireRole('handler'), async (c) => {
    const user = c.get('user');
    const ticketId = parseInt(c.req.param('id'));

    const ticket = getTicketById(db, ticketId);
    if (!ticket) {
      return c.json({ error: 'Ticket not found' }, 404);
    }

    // Company isolation
    if (ticket.company_id !== user.companyId) {
      return c.json({ error: 'Cannot complete ticket outside your company' }, 403);
    }

    // Current user must be the handler
    if (ticket.handler_id !== user.id) {
      return c.json({ error: 'Forbidden: only the current handler can complete' }, 403);
    }

    // Already completed?
    if (ticket.status === 'completed') {
      return c.json({ error: 'Ticket is already completed' }, 409);
    }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE tickets SET status = 'completed', handler_id = ?, completed_at = ? WHERE id = ?`
    ).run(user.id, now, ticketId);

    writeAuditEvent(db, {
      ticketId,
      companyId: ticket.company_id,
      action: 'completed',
      operatorId: user.id,
      operatorName: user.name,
      details: { completedAt: now },
    });

    // Send email notification to submitter (best-effort)
    const submitter = db
      .prepare('SELECT email FROM users WHERE id = ?')
      .get(ticket.submitter_id) as { email: string } | undefined;

    if (submitter) {
      try {
        await sendEmail({
          to: submitter.email,
          subject: `工单已完成: ${ticket.title}`,
          html: `<p>您的工单「${ticket.title}」已完成处理。</p><p>处理人: ${user.name}</p><p>完成时间: ${now}</p>`,
          text: `您的工单「${ticket.title}」已完成处理。处理人: ${user.name}，完成时间: ${now}`,
        });
      } catch (err) {
        console.error(`[tickets] Email notification failed for ticket ${ticketId}:`, err);
        // Email failure does not affect ticket completion
      }
    }

    return c.json({
      id: ticketId,
      status: 'completed',
      handlerId: user.id,
      handlerName: user.name,
      completedAt: now,
    }, 200);
  });

  // POST /api/tickets/:id/cancel
  app.post('/:id/cancel', requireRole('submitter', 'admin'), async (c) => {
    const user = c.get('user');
    const ticketId = parseInt(c.req.param('id'));

    const ticket = getTicketById(db, ticketId);
    if (!ticket) {
      return c.json({ error: 'Ticket not found' }, 404);
    }

    // Submitter can only cancel own tickets; admin can cancel any in-company ticket
    if (user.roles.includes('admin')) {
      if (ticket.company_id !== user.companyId) {
        return c.json({ error: 'Cannot cancel ticket outside your company' }, 403);
      }
    } else {
      if (ticket.submitter_id !== user.id) {
        return c.json({ error: 'Forbidden: can only cancel your own tickets' }, 403);
      }
    }

    // Already completed?
    if (ticket.status === 'completed') {
      return c.json({ error: 'Cannot cancel a completed ticket' }, 409);
    }

    db.prepare("UPDATE tickets SET status = 'cancelled' WHERE id = ?").run(ticketId);

    writeAuditEvent(db, {
      ticketId,
      companyId: ticket.company_id,
      action: 'cancelled',
      operatorId: user.id,
      operatorName: user.name,
      details: { previousStatus: ticket.status },
    });

    return c.json({ id: ticketId, status: 'cancelled' }, 200);
  });

  return app;
}
