import { getDb, generateId } from '../db.js';
import { AppError, assertOptionalString } from '../errors.js';
import { getTicketRow } from './ticket.js';
import { appendLog } from './ticket.js';
import type { Operator } from '../access-control.js';
import type { Ticket, Transfer } from '../../shared/types.js';

interface TicketRow {
  id: string;
  company_id: string;
  status: string;
  group_id: string | null;
  assignee_id: string | null;
  subject: string;
  description: string;
  category: string;
  priority: string;
  submitter_id: string;
  created_at: string;
  company_name: string;
  submitter_name: string;
  submitter_email: string;
  submitter_company_id: string;
  submitter_department: string;
  group_name: string | null;
  assigned_at: string | null;
  assigned_mode: string | null;
  handler_id: string | null;
  handler_name: string | null;
  handled_at: string | null;
  cancelled_at: string | null;
  resolution: string | null;
  cancel_reason: string | null;
  rating_score: number | null;
  rating_rated_by: string | null;
  rating_rated_by_name: string | null;
  rating_rated_at: string | null;
  reply_count: number;
}

function formatTicket(row: TicketRow): Ticket {
  return {
    id: row.id,
    companyId: row.company_id,
    companyName: row.company_name,
    subject: row.subject,
    description: row.description,
    category: row.category,
    priority: row.priority as Ticket['priority'],
    status: row.status as Ticket['status'],
    submitter: {
      id: row.submitter_id,
      name: row.submitter_name,
      email: row.submitter_email,
      companyId: row.submitter_company_id,
      department: row.submitter_department,
    },
    createdAt: row.created_at,
    assignment: row.group_id ? {
      groupId: row.group_id,
      groupName: row.group_name!,
      assignedAt: row.assigned_at!,
      assignedMode: row.assigned_mode as 'auto' | 'manual',
      assigneeId: row.assignee_id,
    } : null,
    completion: row.handler_id ? {
      handledBy: { id: row.handler_id, name: row.handler_name! },
      handledAt: row.handled_at!,
    } : null,
    cancelledAt: row.cancelled_at,
    rating: row.rating_score != null ? {
      score: row.rating_score,
      ratedBy: { id: row.rating_rated_by!, name: row.rating_rated_by_name! },
      ratedAt: row.rating_rated_at!,
    } : null,
    replyCount: row.reply_count,
  };
}

const TICKET_SELECT = `
  SELECT t.id, t.company_id, t.subject, t.description, t.category, t.priority, t.status,
    t.submitter_id, t.created_at, t.group_id, t.assigned_at, t.assigned_mode, t.assignee_id,
    t.handler_id, t.handled_at, t.cancelled_at, t.resolution, t.cancel_reason,
    c.name AS company_name,
    u.name AS submitter_name, u.email AS submitter_email, u.company_id AS submitter_company_id, u.department AS submitter_department,
    g.name AS group_name,
    h.name AS handler_name,
    r.score AS rating_score, r.rated_by AS rating_rated_by, ru.name AS rating_rated_by_name, r.rated_at AS rating_rated_at,
    (SELECT COUNT(*) FROM ticket_reply WHERE ticket_id = t.id) AS reply_count
  FROM ticket t
  JOIN company c ON t.company_id = c.id
  JOIN app_user u ON t.submitter_id = u.id
  LEFT JOIN business_group g ON t.group_id = g.id
  LEFT JOIN app_user h ON t.handler_id = h.id
  LEFT JOIN ticket_rating r ON r.ticket_id = t.id
  LEFT JOIN app_user ru ON r.rated_by = ru.id
`;

export function transferTicket(
  operator: Operator,
  ticketId: string,
  input: { groupId?: string; assigneeId?: string; note?: string }
): { ticket: Ticket; transfer: Transfer } {
  if (!input.groupId && !input.assigneeId) {
    throw new AppError('VALIDATION_FAILED', 'groupId 与 assigneeId 至少需要一个', { fields: { groupId: ['at least one required'], assigneeId: ['at least one required'] } });
  }

  const note = assertOptionalString(input.note, 'note', { max: 500 });
  const db = getDb();

  // Get ticket and verify visibility + status
  const ticket = getTicketRow(operator, ticketId);

  if (ticket.status !== 'pending_handling') {
    throw new AppError('INVALID_TRANSITION', `工单状态为 ${ticket.status}，无法转派`);
  }

  // Validate target group belongs to same company
  let toGroupId: string | null = null;
  if (input.groupId) {
    const group = db.prepare('SELECT id FROM business_group WHERE id = ? AND company_id = ?')
      .get(input.groupId, operator.companyId) as { id: string } | undefined;
    if (!group) {
      throw new AppError('VALIDATION_FAILED', '目标业务组不存在或不在同一公司', { fields: { groupId: ['not in company'] } });
    }
    toGroupId = group.id;
  }

  // Validate target user belongs to same company
  let toUserId: string | null = null;
  if (input.assigneeId) {
    const user = db.prepare('SELECT id FROM app_user WHERE id = ? AND company_id = ?')
      .get(input.assigneeId, operator.companyId) as { id: string } | undefined;
    if (!user) {
      throw new AppError('VALIDATION_FAILED', '目标成员不存在或不在同一公司', { fields: { assigneeId: ['not in company'] } });
    }
    toUserId = user.id;
  }

  const now = new Date().toISOString();
  const transferId = generateId('tf_');

  const tx = db.transaction(() => {
    // Record transfer
    db.prepare(`
      INSERT INTO ticket_transfer (id, ticket_id, from_group_id, from_user_id, to_group_id, to_user_id, transferred_by, transferred_at, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(transferId, ticketId, ticket.group_id, ticket.assignee_id, toGroupId, toUserId, operator.userId, now, note);

    // Update ticket assignment
    db.prepare(`
      UPDATE ticket SET group_id = COALESCE(?, group_id), assignee_id = ?, assigned_mode = 'manual'
      WHERE id = ?
    `).run(toGroupId, toUserId, ticketId);

    appendLog(ticketId, 'ticket_transferred', operator.userId, {
      fromGroupId: ticket.group_id, toGroupId, toUserId, note,
    });
  });
  tx();

  // Read back
  const updatedRow = db.prepare(`${TICKET_SELECT} WHERE t.id = ?`).get(ticketId) as TicketRow;
  const ticket2 = formatTicket(updatedRow);

  const transfer: Transfer = {
    id: transferId,
    fromGroupId: ticket.group_id,
    fromUserId: ticket.assignee_id,
    toGroupId,
    toUserId,
    transferredBy: { id: operator.userId, name: operator.name },
    transferredAt: now,
    note: note ?? null,
  };

  return { ticket: ticket2, transfer };
}
