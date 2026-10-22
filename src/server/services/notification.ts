import { getDb } from '../db.js';
import type { Operator } from '../access-control.js';
import type { Notification } from '../../shared/types.js';

interface OutboxRow {
  id: string;
  ticket_id: string;
  to_email: string;
  subject: string;
  status: string;
  created_at: string;
  sent_at: string | null;
  error: string | null;
}

function formatNotification(row: OutboxRow): Notification {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    toEmail: row.to_email,
    subject: row.subject,
    status: row.status as Notification['status'],
    createdAt: row.created_at,
    sentAt: row.sent_at,
    error: row.error,
  };
}

export function enqueueCompletionNotice(ticketId: string): Notification {
  const db = getDb();

  // Idempotency: check if a notification already exists for this ticket
  const existing = db.prepare('SELECT * FROM email_outbox WHERE ticket_id = ?').get(ticketId) as OutboxRow | undefined;
  if (existing) {
    return formatNotification(existing);
  }

  // Get submitter email from ticket
  const ticket = db.prepare(`
    SELECT t.id, t.company_id, u.email AS submitter_email
    FROM ticket t
    JOIN app_user u ON t.submitter_id = u.id
    WHERE t.id = ?
  `).get(ticketId) as { id: string; company_id: string; submitter_email: string } | undefined;

  if (!ticket) {
    throw new Error(`Ticket not found: ${ticketId}`);
  }

  const now = new Date().toISOString();
  const countRow = db.prepare('SELECT MAX(CAST(SUBSTR(id, 4) AS INTEGER)) as max_num FROM email_outbox').get() as { max_num: number | null } | undefined;
  const nextNum = (countRow?.max_num ?? 0) + 1;
  const id = `em_${nextNum}`;
  const subject = `工单 ${ticketId} 已完成`;

  // Local outbox channel: immediately mark as sent
  db.prepare(`
    INSERT INTO email_outbox (id, ticket_id, to_email, subject, status, created_at, sent_at, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, ticketId, ticket.submitter_email, subject, 'sent', now, now, null);

  const row = db.prepare('SELECT * FROM email_outbox WHERE id = ?').get(id) as OutboxRow;
  return formatNotification(row);
}

export function listNotifications(
  operator: Operator,
  filter: { ticketId?: string; status?: string }
): { items: Notification[] } {
  const db = getDb();
  const conditions = ['t.company_id = ?'];
  const params: (string)[] = [operator.companyId];

  if (filter.ticketId) {
    conditions.push('e.ticket_id = ?');
    params.push(filter.ticketId);
  }
  if (filter.status) {
    conditions.push('e.status = ?');
    params.push(filter.status);
  }

  const where = conditions.join(' AND ');
  const rows = db.prepare(`
    SELECT e.id, e.ticket_id, e.to_email, e.subject, e.status, e.created_at, e.sent_at, e.error
    FROM email_outbox e
    JOIN ticket t ON e.ticket_id = t.id
    WHERE ${where}
    ORDER BY e.created_at DESC
  `).all(...params) as OutboxRow[];

  return { items: rows.map(formatNotification) };
}
