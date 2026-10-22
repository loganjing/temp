import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return dbInstance;
}

export function initDb(dbPath: string): Database.Database {
  const dir = dirname(dbPath);
  mkdirSync(dir, { recursive: true });

  dbInstance = new Database(dbPath);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');

  return dbInstance;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

// Generate a sequential ID with a prefix and zero-padded number
export function generateId(prefix: string, zeroPad = 0): string {
  const db = getDb();
  const tables: Record<string, string> = {
    tk_: 'ticket',
    rp_: 'ticket_reply',
    tf_: 'ticket_transfer',
    lg_: 'operation_log',
    em_: 'email_outbox',
    g_: 'business_group',
    r_: 'assignment_rule',
  };
  const table = tables[prefix];
  if (!table) throw new Error(`Unknown ID prefix: ${prefix}`);
  const row = db.prepare(`SELECT MAX(CAST(SUBSTR(id, ?) AS INTEGER)) as max_num FROM ${table}`).get(prefix.length + 1) as { max_num: number | null } | undefined;
  const next = (row?.max_num ?? 0) + 1;
  if (zeroPad > 0) {
    return `${prefix}${String(next).padStart(zeroPad, '0')}`;
  }
  return `${prefix}${next}`;
}
