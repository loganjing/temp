// Query helper functions for building ticket responses

import type { DB } from '@commonapp/dbkit';
import type {
  TicketResponse,
  TicketDetailResponse,
  ReplyResponse,
  EvaluationResponse,
} from '../shared/types';

interface TicketJoinRow {
  id: number;
  title: string;
  description: string;
  category_id: number;
  category_name: string;
  submitter_id: number;
  submitter_name: string;
  company_id: number;
  sla_priority: string;
  status: string;
  handler_id: number | null;
  handler_name: string | null;
  business_group_id: number | null;
  created_by: string;
  created_at: string;
  completed_at: string | null;
}

const TICKET_SELECT = `
  SELECT
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
`;

export function mapTicketResponse(row: TicketJoinRow): TicketResponse {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    categoryId: row.category_id,
    categoryName: row.category_name,
    submitterId: row.submitter_id,
    submitterName: row.submitter_name,
    companyId: row.company_id,
    slaPriority: row.sla_priority,
    status: row.status,
    handlerId: row.handler_id,
    handlerName: row.handler_name,
    businessGroupId: row.business_group_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

export function getTicketById(db: DB, ticketId: number): TicketJoinRow | undefined {
  return db.prepare(`${TICKET_SELECT} WHERE t.id = ?`).get(ticketId) as
    | TicketJoinRow
    | undefined;
}

export function getTicketDetail(
  db: DB,
  ticketId: number
): TicketDetailResponse | undefined {
  const row = db.prepare(
    `${TICKET_SELECT}
     LEFT JOIN companies co ON t.company_id = co.id
     LEFT JOIN business_groups bg ON t.business_group_id = bg.id
     WHERE t.id = ?`
  ).get(ticketId) as
    | (TicketJoinRow & {
        company_name: string;
        business_group_name: string | null;
      })
    | undefined;

  if (!row) return undefined;

  const replies = db
    .prepare(
      `SELECT tr.id, tr.ticket_id, tr.replier_id, u.name AS replier_name, tr.content, tr.created_at
       FROM ticket_replies tr
       LEFT JOIN users u ON tr.replier_id = u.id
       WHERE tr.ticket_id = ?
       ORDER BY tr.created_at ASC`
    )
    .all(ticketId) as {
    id: number;
    ticket_id: number;
    replier_id: number;
    replier_name: string;
    content: string;
    created_at: string;
  }[];

  const evalRow = db
    .prepare(
      `SELECT id, ticket_id, rating, created_at FROM satisfaction_evaluations WHERE ticket_id = ?`
    )
    .get(ticketId) as
    | { id: number; ticket_id: number; rating: number; created_at: string }
    | undefined;

  const base = mapTicketResponse(row);
  return {
    ...base,
    companyName: row.company_name,
    businessGroupName: row.business_group_name,
    replies: replies.map((r) => ({
      id: r.id,
      ticketId: r.ticket_id,
      replierId: r.replier_id,
      replierName: r.replier_name,
      content: r.content,
      createdAt: r.created_at,
    })),
    evaluation: evalRow
      ? {
          id: evalRow.id,
          ticketId: evalRow.ticket_id,
          rating: evalRow.rating,
          createdAt: evalRow.created_at,
        }
      : null,
  };
}
