import { openDatabase, runMigrations, type DB } from '@commonapp/dbkit';
import { initAudit } from '@commonapp/auditkit';

let dbInstance: DB | null = null;

/**
 * Initializes and returns the singleton database connection.
 * Runs migrations and initializes audit table.
 */
export function getDatabase(): DB {
  if (dbInstance) return dbInstance;

  const dbPath = process.env.DB_PATH || './data/application.db';
  dbInstance = openDatabase({ path: dbPath });

  const migrationsDir = process.env.MIGRATIONS_DIR || './migrations/sqlite';
  runMigrations(dbInstance, { directory: migrationsDir });

  initAudit(dbInstance);

  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
