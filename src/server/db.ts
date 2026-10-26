import Database from 'better-sqlite3';
import { mkdirSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type DB = Database.Database;

const dbPath = process.env.DB_PATH ?? './data/catering.db';
mkdirSync(dirname(dbPath), { recursive: true });

/** 全局单例数据库连接（生产路径）。 */
export const db: DB = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const migrationsDir = join(process.cwd(), 'migrations');

/** 直接执行 001_init.sql（幂等），供测试在内存库上初始化 schema + 种子数据。 */
export function applyInitSql(database: DB, sqlPath = join(migrationsDir, '001_init.sql')): void {
  const sql = readFileSync(sqlPath, 'utf8');
  database.exec(sql);
}

/** 启动时执行未应用的迁移文件（按文件名排序），记录到 _migrations。 */
export function runMigrations(database: DB = db): void {
  database.exec(
    'CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, applied_at TEXT NOT NULL)'
  );
  const files = existsSync(migrationsDir)
    ? readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
    : [];
  const applied = new Set(
    (database.prepare('SELECT name FROM _migrations').all() as { name: string }[]).map(
      (r) => r.name
    )
  );
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    database.exec(sql);
    database
      .prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)')
      .run(file, new Date().toISOString());
  }
}

export function nowISO(): string {
  return new Date().toISOString();
}
