import { db } from '../db.js';
import { emit } from '../events.js';
import { AppError } from '../errors.js';
import type { Alert, AlertRow, AlertType } from '../types.js';
import { toAlert } from './mappers.js';

export function createAlert(
  type: AlertType,
  message: string,
  robotId: number | null = null
): Alert {
  const ts = new Date().toISOString();
  const info = db
    .prepare(
      'INSERT INTO alerts (type, message, robot_id, resolved, created_at) VALUES (?, ?, ?, 0, ?)'
    )
    .run(type, message, robotId, ts);
  const row = db
    .prepare('SELECT * FROM alerts WHERE id = ?')
    .get(info.lastInsertRowid) as AlertRow;
  const alert = toAlert(row);
  emit('alert.created', alert);
  return alert;
}

export function listAlerts(resolved: boolean | null): Alert[] {
  const rows =
    resolved === null
      ? (db.prepare('SELECT * FROM alerts ORDER BY created_at DESC').all() as AlertRow[])
      : (db
          .prepare('SELECT * FROM alerts WHERE resolved = ? ORDER BY created_at DESC')
          .all(resolved ? 1 : 0) as AlertRow[]);
  return rows.map(toAlert);
}

export function countUnresolved(): number {
  const row = db.prepare('SELECT COUNT(*) AS c FROM alerts WHERE resolved = 0').get() as {
    c: number;
  };
  return row.c;
}

export function resolveAlert(id: number): Alert {
  const row = db.prepare('SELECT * FROM alerts WHERE id = ?').get(id) as AlertRow | undefined;
  if (!row) throw new AppError('INTERNAL_ERROR', 'alert not found');
  db.prepare('UPDATE alerts SET resolved = 1 WHERE id = ?').run(id);
  return toAlert({ ...row, resolved: 1 });
}
