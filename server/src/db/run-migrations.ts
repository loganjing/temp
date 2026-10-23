import { getDatabase } from './database';

/**
 * Standalone migration runner.
 * Usage: `npm run migrate` or `tsx src/db/run-migrations.ts`
 */
if (require.main === module) {
  const db = getDatabase();
  console.log('[migrate] Migrations applied successfully.');
  db.close();
  process.exit(0);
}
