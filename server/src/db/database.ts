import Database from 'better-sqlite3';
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import type { Database as DatabaseType } from 'better-sqlite3';

const DEFAULT_DB_PATH = 'data/warehouse.db';

let dbInstance: DatabaseType | null = null;

/**
 * Returns a singleton better-sqlite3 Database connection.
 * Creates the parent directory and applies all pending migrations on first call.
 */
export function getDatabase(): DatabaseType {
  if (dbInstance) return dbInstance;

  const dbPath = process.env.DB_PATH || DEFAULT_DB_PATH;
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations(db);
  dbInstance = db;
  return db;
}

/**
 * Runs versioned SQL migration files from the migrations directory.
 * Tracks applied migrations in a `_migrations` table.
 */
export function runMigrations(db: DatabaseType): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const migrationsDir = join(__dirname, 'migrations');
  if (!existsSync(migrationsDir)) return;

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const applied = new Set(
    db.prepare('SELECT version FROM _migrations').all().map((r: any) => r.version)
  );

  const insertMigration = db.prepare(
    'INSERT INTO _migrations (version, applied_at) VALUES (?, ?)'
  );

  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    if (applied.has(version)) continue;

    const sql = readFileSync(join(migrationsDir, file), 'utf-8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      insertMigration.run(version, new Date().toISOString());
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${version} failed: ${(err as Error).message}`);
    }
  }
}

/**
 * Closes the singleton database connection (used in tests / shutdown).
 */
export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export type { DatabaseType };
