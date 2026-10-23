import { randomUUID } from 'node:crypto';
import type { DB } from '@commonapp/dbkit';

export type AuditAction =
  | 'created'
  | 'assigned'
  | 'transferred'
  | 'completed'
  | 'cancelled'
  | 'evaluated';

export interface WriteAuditParams {
  ticketId: number;
  companyId: number;
  action: AuditAction;
  operatorId: number;
  operatorName: string;
  details?: Record<string, unknown>;
}

export interface AuditEvent {
  id: string;
  ticket_id: number;
  company_id: number;
  action: string;
  operator_id: number;
  operator_name: string;
  operator_time: string;
  details: string;
}

/**
 * Initializes the audit_events table. Called once during server startup.
 */
export function initAudit(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      ticket_id INTEGER NOT NULL,
      company_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      operator_id INTEGER NOT NULL,
      operator_name TEXT NOT NULL,
      operator_time TEXT NOT NULL,
      details TEXT
    )
  `);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_audit_events_ticket_id ON audit_events(ticket_id)`
  );
}

/**
 * Writes an audit event for a ticket lifecycle operation.
 */
export function writeAuditEvent(db: DB, params: WriteAuditParams): void {
  const id = randomUUID();
  const operatorTime = new Date().toISOString();
  const details = params.details ? JSON.stringify(params.details) : '{}';
  db.prepare(
    `INSERT INTO audit_events (id, ticket_id, company_id, action, operator_id, operator_name, operator_time, details)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    params.ticketId,
    params.companyId,
    params.action,
    params.operatorId,
    params.operatorName,
    operatorTime,
    details
  );
}

/**
 * Queries audit events for a specific ticket, ordered by time ascending.
 */
export function queryAuditEvents(db: DB, ticketId: number): AuditEvent[] {
  return db
    .prepare(
      `SELECT * FROM audit_events WHERE ticket_id = ? ORDER BY operator_time ASC`
    )
    .all(ticketId) as AuditEvent[];
}
