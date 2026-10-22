import { getDb } from '../db.js';
import type { Operator } from '../access-control.js';
import type { DistributionItem, DashboardStats } from '../../shared/types.js';

export function getDistribution(
  operator: Operator,
  dimension: 'company' | 'department'
): { dimension: string; items: DistributionItem[]; total: number } {
  const db = getDb();
  const companyId = operator.companyId;

  let items: DistributionItem[];

  if (dimension === 'company') {
    const rows = db.prepare(`
      SELECT c.id AS key, c.name AS label, COUNT(*) AS count
      FROM ticket t
      JOIN company c ON t.company_id = c.id
      WHERE t.company_id = ?
      GROUP BY c.id, c.name
      ORDER BY count DESC
    `).all(companyId) as { key: string; label: string; count: number }[];
    items = rows;
  } else {
    const rows = db.prepare(`
      SELECT u.department AS key, u.department AS label, COUNT(*) AS count
      FROM ticket t
      JOIN app_user u ON t.submitter_id = u.id
      WHERE t.company_id = ?
      GROUP BY u.department
      ORDER BY count DESC
    `).all(companyId) as { key: string; label: string; count: number }[];
    items = rows;
  }

  const total = items.reduce((sum, i) => sum + i.count, 0);
  return { dimension, items, total };
}

export function getDashboard(operator: Operator): DashboardStats {
  const db = getDb();
  const companyId = operator.companyId;

  // Ticket count
  const countRow = db.prepare('SELECT COUNT(*) AS cnt FROM ticket WHERE company_id = ?').get(companyId) as { cnt: number };
  const ticketCount = countRow.cnt;

  // Average response time: create → first handler reply
  // For tickets that have at least one handler reply:
  //   avg = avg(min(handler_reply.created_at) - ticket.created_at) in minutes
  const responseRow = db.prepare(`
    SELECT
      AVG(
        (julianday(j.first_reply_at) - julianday(t.created_at)) * 24 * 60
      ) AS avg_minutes,
      COUNT(*) AS sample_count
    FROM ticket t
    JOIN (
      SELECT ticket_id, MIN(created_at) AS first_reply_at
      FROM ticket_reply
      WHERE author_role = 'handler'
      GROUP BY ticket_id
    ) j ON j.ticket_id = t.id
    WHERE t.company_id = ?
  `).get(companyId) as { avg_minutes: number | null; sample_count: number };

  // Average satisfaction
  const ratingRow = db.prepare(`
    SELECT AVG(score) AS avg_score, COUNT(*) AS cnt
    FROM ticket_rating r
    JOIN ticket t ON r.ticket_id = t.id
    WHERE t.company_id = ?
  `).get(companyId) as { avg_score: number | null; cnt: number };

  // Hot categories
  const hotRows = db.prepare(`
    SELECT category, COUNT(*) AS count
    FROM ticket
    WHERE company_id = ?
    GROUP BY category
    ORDER BY count DESC
    LIMIT 5
  `).all(companyId) as { category: string; count: number }[];

  return {
    ticketCount,
    avgResponseMinutes: responseRow.avg_minutes !== null ? Math.round(responseRow.avg_minutes * 10) / 10 : null,
    avgResponseSampleCount: responseRow.sample_count,
    avgSatisfaction: ratingRow.avg_score !== null ? Math.round(ratingRow.avg_score * 100) / 100 : null,
    ratingSampleCount: ratingRow.cnt,
    hotCategories: hotRows,
  };
}
