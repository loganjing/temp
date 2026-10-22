import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getDb } from './db.js';

export function runMigrations(): void {
  const db = getDb();

  db.exec(`CREATE TABLE IF NOT EXISTS migration_version (
    version TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);

  const migrationsDir = join(process.cwd(), 'migrations');
  if (!existsSync(migrationsDir)) return;

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    const already = db.prepare('SELECT 1 FROM migration_version WHERE version = ?').get(version);
    if (already) continue;

    const sql = readFileSync(join(migrationsDir, file), 'utf-8');
    const tx = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO migration_version (version, applied_at) VALUES (?, ?)').run(version, new Date().toISOString());
    });
    tx();
  }
}

export function getAppliedMigrations(): { version: string; applied_at: string }[] {
  const db = getDb();
  return db.prepare('SELECT version, applied_at FROM migration_version ORDER BY version').all() as { version: string; applied_at: string }[];
}
