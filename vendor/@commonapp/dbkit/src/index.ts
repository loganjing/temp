import Database from 'better-sqlite3';
import { readFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

export type DB = Database.Database;

/**
 * Opens a SQLite database connection with WAL mode and foreign keys enabled.
 * Creates the parent directory if it does not exist.
 */
export function openDatabase(options: { path: string }): DB {
  const dir = dirname(options.path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const db = new Database(options.path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

/**
 * Runs versioned SQL migrations from the specified directory.
 * Each .sql file is executed in sorted order; already-applied files are skipped.
 */
export function runMigrations(db: DB, options: { directory: string }): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT UNIQUE NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const appliedRows = db.prepare('SELECT filename FROM _migrations').all() as { filename: string }[];
  const applied = new Set(appliedRows.map((r) => r.filename));

  let files: string[] = [];
  if (existsSync(options.directory)) {
    files = readdirSync(options.directory)
      .filter((f) => f.endsWith('.sql'))
      .sort();
  }

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(options.directory, file), 'utf-8');
    const migrate = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO _migrations (filename) VALUES (?)').run(file);
    });
    migrate();
  }
}

/**
 * Wraps a callback in a transaction.
 */
export function withTransaction<T>(db: DB, fn: () => T): T {
  const tx = db.transaction(fn);
  return tx();
}
