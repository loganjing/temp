import { getDb, generateId } from '../db.js';
import { AppError, assertString, assertInteger, assertOptionalString, assertEnum } from '../errors.js';
import { enqueueCompletionNotice } from './notification.js';
import type { Operator } from '../access-control.js';
import type {
  Ticket, Reply, LogEntry, LogAction, Priority,
  TicketStatus, ReplyAuthorRole, TicketListResult, TicketDetail,
  SubmitterProfile,
} from '../../shared/types.js';

// ---- Row types ----
interface TicketRow {
  id: string;
  company_id: string;
  company_name: string;
  subject: string;
  description: string;
  category: string;
  priority: Priority;
  status: TicketStatus;
  submitter_id: string;
  submitter_name: string;
  submitter_email: string;
  submitter_company_id: string;
  submitter_department: string;
  created_at: string;
  group_id: string | null;
  group_name: string | null;
  assigned_at: string | null;
  assigned_mode: string | null;
  assignee_id: string | null;
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

function formatTicket(row: TicketRow): Ticket {
  return {
    id: row.id,
    companyId: row.company_id,
    companyName: row.company_name,
    subject: row.subject,
    description: row.description,
    category: row.category,
    priority: row.priority,
    status: row.status,
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

// ---- Log helper ----
export function appendLog(ticketId: string, action: LogAction, actorId: string, detail?: Record<string, unknown>): void {
  const db = getDb();
  const id = generateId('lg_');
  db.prepare(`INSERT INTO operation_log (id, ticket_id, action, actor_id, created_at, detail) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, ticketId, action, actorId, new Date().toISOString(), detail ? JSON.stringify(detail) : null);
}

// ---- Ticket operations ----

export function createTicket(
  operator: Operator,
  input: { subject: string; description: string; category: string; priority: string; companyId?: string }
): Ticket {
  const subject = assertString(input.subject, 'subject', { min: 1, max: 200 });
  const description = assertString(input.description, 'description', { min: 1, max: 5000 });
  const category = assertString(input.category, 'category', { min: 1, max: 64 });
  const priority = assertEnum(input.priority, 'priority', ['P0', 'P1', 'P2', 'P3', 'P4'] as const);

  const db = getDb();
  const ticketId = generateId('tk_', 6);
  const now = new Date().toISOString();
  const companyId = operator.companyId;

  let status: TicketStatus = 'pending_assignment';

  // Auto-assign: find enabled rule for this company + category
  const rule = db.prepare(`
    SELECT group_id FROM assignment_rule
    WHERE company_id = ? AND category = ? AND enabled = 1
  `).get(companyId, category) as { group_id: string } | undefined;

  let groupId: string | null = null;
  let assignedAt: string | null = null;
  let assignedMode: string | null = null;

  const tx = db.transaction(() => {
    if (rule) {
      groupId = rule.group_id;
      assignedAt = now;
      assignedMode = 'auto';
      status = 'pending_handling';
    }

    db.prepare(`
      INSERT INTO ticket (id, company_id, subject, description, category, priority, status,
        submitter_id, created_at, group_id, assigned_at, assigned_mode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(ticketId, companyId, subject, description, category, priority, status,
      operator.userId, now, groupId, assignedAt, assignedMode);

    appendLog(ticketId, 'ticket_created', operator.userId, { subject, category, priority });

    if (rule) {
      appendLog(ticketId, 'ticket_assigned', operator.userId, { groupId: rule.group_id, mode: 'auto' });
    }
  });
  tx();

  const row = db.prepare(`${TICKET_SELECT} WHERE t.id = ?`).get(ticketId) as TicketRow;
  return formatTicket(row);
}

export function listTickets(
  operator: Operator,
  query: {
    q?: string; category?: string; priority?: string; status?: string;
    companyId?: string; sort?: string; page?: number; pageSize?: number;
  }
): TicketListResult {
  const db = getDb();
  const companyId = operator.companyId;

  const conditions: string[] = ['t.company_id = ?'];
  const params: (string | number)[] = [companyId];

  if (query.q) {
    conditions.push('(t.subject LIKE ? OR t.description LIKE ? OR t.id LIKE ?)');
    const kw = `%${query.q}%`;
    params.push(kw, kw, kw);
  }
  if (query.category) {
    conditions.push('t.category = ?');
    params.push(query.category);
  }
  if (query.priority) {
    conditions.push('t.priority = ?');
    params.push(query.priority);
  }
  if (query.status) {
    conditions.push('t.status = ?');
    params.push(query.status);
  }

  const where = conditions.join(' AND ');
  const sort = query.sort === 'createdAt_asc' ? 't.created_at ASC' : 't.created_at DESC';
  const page = Math.max(1, Math.floor(query.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(query.pageSize ?? 20)));
  const offset = (page - 1) * pageSize;

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM ticket t WHERE ${where}`).get(...params) as { total: number };
  const rows = db.prepare(`${TICKET_SELECT} WHERE ${where} ORDER BY ${sort} LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset) as TicketRow[];

  return {
    items: rows.map(formatTicket),
    total: countRow.total,
    page,
    pageSize,
  };
}

export function getTicketRow(operator: Operator, ticketId: string): TicketRow {
  const db = getDb();
  const row = db.prepare(`${TICKET_SELECT} WHERE t.id = ? AND t.company_id = ?`)
    .get(ticketId, operator.companyId) as TicketRow | undefined;
  if (!row) {
    throw new AppError('NOT_FOUND', '工单不存在或不在可见范围内');
  }
  return row;
}

export function getTicketDetail(operator: Operator, ticketId: string): TicketDetail {
  const db = getDb();
  const ticketRow = getTicketRow(operator, ticketId);
  const ticket = formatTicket(ticketRow);

  const replies = db.prepare(`
    SELECT r.id, r.ticket_id, r.author_id, r.author_role, r.content, r.created_at,
      u.name AS author_name
    FROM ticket_reply r
    JOIN app_user u ON r.author_id = u.id
    WHERE r.ticket_id = ?
    ORDER BY r.created_at ASC
  `).all(ticketId) as {
    id: string; ticket_id: string; author_id: string; author_name: string;
    author_role: ReplyAuthorRole; content: string; created_at: string;
  }[];

  const transfers = db.prepare(`
    SELECT t.id, t.ticket_id, t.from_group_id, t.from_user_id, t.to_group_id, t.to_user_id,
      t.transferred_by, t.transferred_at, t.note, u.name AS transferred_by_name
    FROM ticket_transfer t
    JOIN app_user u ON t.transferred_by = u.id
    WHERE t.ticket_id = ?
    ORDER BY t.transferred_at ASC
  `).all(ticketId) as {
    id: string; ticket_id: string; from_group_id: string | null; from_user_id: string | null;
    to_group_id: string | null; to_user_id: string | null; transferred_by: string;
    transferred_by_name: string; transferred_at: string; note: string | null;
  }[];

  const logs = db.prepare(`
    SELECT l.id, l.ticket_id, l.action, l.actor_id, l.created_at, l.detail,
      u.name AS actor_name
    FROM operation_log l
    JOIN app_user u ON l.actor_id = u.id
    WHERE l.ticket_id = ?
    ORDER BY l.created_at ASC
  `).all(ticketId) as {
    id: string; ticket_id: string; action: LogAction; actor_id: string;
    actor_name: string; created_at: string; detail: string | null;
  }[];

  return {
    ticket,
    replies: replies.map((r) => ({
      id: r.id,
      ticketId: r.ticket_id,
      author: { id: r.author_id, name: r.author_name },
      authorRole: r.author_role,
      content: r.content,
      createdAt: r.created_at,
    })),
    transfers: transfers.map((t) => ({
      id: t.id,
      fromGroupId: t.from_group_id,
      fromUserId: t.from_user_id,
      toGroupId: t.to_group_id,
      toUserId: t.to_user_id,
      transferredBy: { id: t.transferred_by, name: t.transferred_by_name },
      transferredAt: t.transferred_at,
      note: t.note,
    })),
    logs: logs.map((l) => ({
      id: l.id,
      ticketId: l.ticket_id,
      action: l.action,
      actor: { id: l.actor_id, name: l.actor_name },
      createdAt: l.created_at,
      detail: l.detail ? JSON.parse(l.detail) : null,
    })),
  };
}

export function addReply(
  operator: Operator,
  ticketId: string,
  content: string
): Reply {
  const text = assertString(content, 'content', { min: 1, max: 5000 });
  const db = getDb();
  const ticket = getTicketRow(operator, ticketId);

  if (ticket.status === 'completed' || ticket.status === 'cancelled') {
    throw new AppError('INVALID_TRANSITION', `工单为 ${ticket.status}，无法回复`);
  }

  const authorRole: ReplyAuthorRole = ticket.submitter_id === operator.userId ? 'submitter' : 'handler';
  const replyId = generateId('rp_');
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO ticket_reply (id, ticket_id, author_id, author_role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(replyId, ticketId, operator.userId, authorRole, text, now);
    appendLog(ticketId, 'ticket_replied', operator.userId, { authorRole });
  });
  tx();

  return {
    id: replyId,
    ticketId,
    author: { id: operator.userId, name: operator.name },
    authorRole,
    content: text,
    createdAt: now,
  };
}

export function completeTicket(
  operator: Operator,
  ticketId: string,
  resolution?: string
): { ticket: Ticket } {
  const resolutionText = assertOptionalString(resolution, 'resolution', { max: 2000 });
  const db = getDb();
  const ticket = getTicketRow(operator, ticketId);

  if (ticket.status !== 'pending_handling') {
    throw new AppError('INVALID_TRANSITION', `工单状态为 ${ticket.status}，无法完成`);
  }

  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare(`UPDATE ticket SET status = 'completed', handler_id = ?, handled_at = ?, resolution = ? WHERE id = ?`)
      .run(operator.userId, now, resolutionText ?? null, ticketId);
    appendLog(ticketId, 'ticket_status_changed', operator.userId, { from: ticket.status, to: 'completed' });
    appendLog(ticketId, 'ticket_completed', operator.userId, { resolution: resolutionText ?? null });
  });
  tx();

  // Enqueue completion notice (after transaction commits)
  enqueueCompletionNotice(ticketId);

  const row = db.prepare(`${TICKET_SELECT} WHERE t.id = ?`).get(ticketId) as TicketRow;
  return { ticket: formatTicket(row) };
}

export function cancelTicket(
  operator: Operator,
  ticketId: string,
  reason?: string
): { ticket: Ticket } {
  const reasonText = assertOptionalString(reason, 'reason', { max: 500 });
  const db = getDb();
  const ticket = getTicketRow(operator, ticketId);

  if (ticket.status === 'completed' || ticket.status === 'cancelled') {
    throw new AppError('INVALID_TRANSITION', `工单状态为 ${ticket.status}，无法取消`);
  }

  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare(`UPDATE ticket SET status = 'cancelled', cancelled_at = ?, cancel_reason = ? WHERE id = ?`)
      .run(now, reasonText ?? null, ticketId);
    appendLog(ticketId, 'ticket_cancelled', operator.userId, { reason: reasonText ?? null });
    appendLog(ticketId, 'ticket_status_changed', operator.userId, { from: ticket.status, to: 'cancelled' });
  });
  tx();

  const row = db.prepare(`${TICKET_SELECT} WHERE t.id = ?`).get(ticketId) as TicketRow;
  return { ticket: formatTicket(row) };
}

export function submitRating(
  operator: Operator,
  ticketId: string,
  score: number
): { score: number; ratedBy: { id: string; name: string }; ratedAt: string; ticketId: string } {
  assertInteger(score, 'score', { min: 1, max: 5 });
  const db = getDb();
  const ticket = getTicketRow(operator, ticketId);

  if (ticket.submitter_id !== operator.userId) {
    throw new AppError('FORBIDDEN', '仅工单提交人可提交评价');
  }
  if (ticket.status !== 'completed') {
    throw new AppError('INVALID_TRANSITION', `工单状态为 ${ticket.status}，无法评价`);
  }

  const existing = db.prepare('SELECT 1 FROM ticket_rating WHERE ticket_id = ?').get(ticketId);
  if (existing) {
    throw new AppError('ALREADY_RATED', '该工单已提交过评价');
  }

  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    const countRow = db.prepare('SELECT MAX(CAST(SUBSTR(id, 4) AS INTEGER)) as max_num FROM ticket_rating').get() as { max_num: number | null } | undefined;
    const nextNum = (countRow?.max_num ?? 0) + 1;
    const rtId = `rt_${nextNum}`;
    db.prepare(`INSERT INTO ticket_rating (id, ticket_id, rated_by, score, rated_at) VALUES (?, ?, ?, ?, ?)`)
      .run(rtId, ticketId, operator.userId, score, now);
    appendLog(ticketId, 'rating_submitted', operator.userId, { score });
  });
  tx();

  return {
    score,
    ratedBy: { id: operator.userId, name: operator.name },
    ratedAt: now,
    ticketId,
  };
}

export function listTicketLogs(operator: Operator, ticketId: string): { items: LogEntry[] } {
  const db = getDb();
  // Verify ticket is visible
  getTicketRow(operator, ticketId);

  const logs = db.prepare(`
    SELECT l.id, l.ticket_id, l.action, l.actor_id, l.created_at, l.detail,
      u.name AS actor_name
    FROM operation_log l
    JOIN app_user u ON l.actor_id = u.id
    WHERE l.ticket_id = ?
    ORDER BY l.created_at ASC
  `).all(ticketId) as {
    id: string; ticket_id: string; action: LogAction; actor_id: string;
    actor_name: string; created_at: string; detail: string | null;
  }[];

  return {
    items: logs.map((l) => ({
      id: l.id,
      ticketId: l.ticket_id,
      action: l.action,
      actor: { id: l.actor_id, name: l.actor_name },
      createdAt: l.created_at,
      detail: l.detail ? JSON.parse(l.detail) : null,
    })),
  };
}

export function getSubmitterProfile(operator: Operator, userId: string): SubmitterProfile {
  const db = getDb();
  const user = db.prepare(`
    SELECT u.id, u.name, u.email, u.company_id, u.department, c.name AS company_name
    FROM app_user u
    JOIN company c ON u.company_id = c.id
    WHERE u.id = ? AND u.company_id = ?
  `).get(userId, operator.companyId) as {
    id: string; name: string; email: string; company_id: string;
    company_name: string; department: string;
  } | undefined;

  if (!user) {
    throw new AppError('NOT_FOUND', '用户不存在或不在可见范围内');
  }

  const tickets = db.prepare(`
    SELECT id, subject, status, created_at
    FROM ticket
    WHERE submitter_id = ? AND company_id = ?
    ORDER BY created_at DESC
  `).all(userId, operator.companyId) as {
    id: string; subject: string; status: TicketStatus; created_at: string;
  }[];

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      companyId: user.company_id,
      companyName: user.company_name,
      department: user.department,
    },
    historyTickets: {
      items: tickets.map((t) => ({
        id: t.id,
        subject: t.subject,
        status: t.status,
        createdAt: t.created_at,
      })),
      total: tickets.length,
    },
  };
}
