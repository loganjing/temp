/**
 * DB 行 → API 对象组装（technical-contract.md 第 4 节映射责任）：
 * 联表生成 {id, name} 概要、detail JSON 解析为对象、可空字段映射为 null。
 */

const TICKET_SELECT = `
  SELECT
    t.id, t.ticket_no, t.subject, t.description, t.priority, t.status,
    t.created_at, t.updated_at, t.completed_at, t.completed_by,
    t.category_id, c.name AS category_name,
    t.submitter_id,
    su.name AS submitter_name, su.email AS submitter_email,
    su.department AS submitter_department, su.is_company_admin AS submitter_is_company_admin,
    su.company_id AS submitter_company_id, sc.name AS submitter_company_name,
    t.assigned_group_id, ag.name AS assigned_group_name,
    t.assignee_id, aa.name AS assignee_name,
    cb.name AS completed_by_name,
    (SELECT COUNT(*) FROM ticket_replies r WHERE r.ticket_id = t.id) AS reply_count,
    (SELECT sr.score FROM satisfaction_ratings sr WHERE sr.ticket_id = t.id) AS rating_score,
    (SELECT sr.comment FROM satisfaction_ratings sr WHERE sr.ticket_id = t.id) AS rating_comment,
    (SELECT sr.created_at FROM satisfaction_ratings sr WHERE sr.ticket_id = t.id) AS rating_created_at
  FROM tickets t
  JOIN categories c ON c.id = t.category_id
  JOIN users su ON su.id = t.submitter_id
  JOIN companies sc ON sc.id = su.company_id
  LEFT JOIN business_groups ag ON ag.id = t.assigned_group_id
  LEFT JOIN users aa ON aa.id = t.assignee_id
  LEFT JOIN users cb ON cb.id = t.completed_by
`;

export function getTicketRow(db, ticketId) {
  return db.prepare(`${TICKET_SELECT} WHERE t.id = ?`).get(ticketId);
}

export function mapTicketRow(row) {
  return {
    id: row.id,
    ticketNo: row.ticket_no,
    subject: row.subject,
    description: row.description,
    category: { id: row.category_id, name: row.category_name },
    priority: row.priority,
    status: row.status,
    submitter: {
      id: row.submitter_id,
      name: row.submitter_name,
      email: row.submitter_email,
      company: { id: row.submitter_company_id, name: row.submitter_company_name },
      department: row.submitter_department,
      isCompanyAdmin: !!row.submitter_is_company_admin,
    },
    assignedGroup: row.assigned_group_id
      ? { id: row.assigned_group_id, name: row.assigned_group_name }
      : null,
    assignee: row.assignee_id
      ? { id: row.assignee_id, name: row.assignee_name }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? null,
    completedBy: row.completed_by
      ? { id: row.completed_by, name: row.completed_by_name }
      : null,
    replyCount: row.reply_count,
    rating:
      row.rating_score !== null && row.rating_score !== undefined
        ? {
            score: row.rating_score,
            comment: row.rating_comment ?? null,
            createdAt: row.rating_created_at,
          }
        : null,
  };
}

export function listTicketRows(db, whereSql, params, extraOrderBy = '') {
  return db
    .prepare(`${TICKET_SELECT} ${whereSql} ORDER BY t.created_at DESC, t.id DESC ${extraOrderBy}`)
    .all(...params);
}

/** 工单详情（契约 3.3）：附加 replies / events，均按 createdAt 升序 */
export function ticketDetail(db, ticketId) {
  const row = getTicketRow(db, ticketId);
  if (!row) return null;
  const ticket = mapTicketRow(row);

  ticket.replies = db
    .prepare(
      `SELECT r.id, r.author_id, u.name AS author_name, r.content, r.created_at
       FROM ticket_replies r
       JOIN users u ON u.id = r.author_id
       WHERE r.ticket_id = ?
       ORDER BY r.created_at ASC, r.id ASC`,
    )
    .all(ticketId)
    .map((r) => ({
      id: r.id,
      author: { id: r.author_id, name: r.author_name },
      content: r.content,
      createdAt: r.created_at,
    }));

  ticket.events = db
    .prepare(
      `SELECT e.id, e.type, e.actor_id, u.name AS actor_name, e.detail, e.created_at
       FROM ticket_events e
       JOIN users u ON u.id = e.actor_id
       WHERE e.ticket_id = ?
       ORDER BY e.created_at ASC, e.id ASC`,
    )
    .all(ticketId)
    .map((r) => ({
      id: r.id,
      type: r.type,
      actor: { id: r.actor_id, name: r.actor_name },
      detail: JSON.parse(r.detail),
      createdAt: r.created_at,
    }));

  return ticket;
}

export function mapReplyRow(row) {
  return {
    id: row.id,
    author: { id: row.author_id, name: row.author_name },
    content: row.content,
    createdAt: row.created_at,
  };
}
