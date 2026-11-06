import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { mkdirSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * 创建 SQLite 连接，自动创建 data 目录并执行版本化迁移。
 */
export function createConnection(dbPath: string): DatabaseType {
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations(db);

  return db;
}

/**
 * 版本化迁移执行器：在 _migrations 表中记录已应用的迁移，
 * 按文件名排序依次执行未应用的 .sql 脚本。
 */
function runMigrations(db: DatabaseType): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    )
  `);

  const migrationsDir = join(__dirname, 'migrations');
  if (!existsSync(migrationsDir)) {
    return;
  }

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const appliedRows = db
    .prepare('SELECT name FROM _migrations')
    .all() as { name: string }[];
  const appliedNames = new Set(appliedRows.map((r) => r.name));

  for (const file of files) {
    if (appliedNames.has(file)) {
      continue;
    }
    const sql = readFileSync(join(migrationsDir, file), 'utf-8');
    const migrate = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(
        file,
        new Date().toISOString(),
      );
    });
    migrate();
  }
}
