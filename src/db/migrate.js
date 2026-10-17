import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 编号 SQL 迁移执行器（src/db/，架构基线 1.6/3.3）。
 * - migrations/sqlite/ 下按文件名（序号_名称.sql）排序执行
 * - schema_migrations 登记已应用迁移，只执行未登记文件
 * - 每个迁移在独立事务中执行（迁移文件内不写事务语句）
 */

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'migrations',
  'sqlite',
);

export function listMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

export function runMigrations(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);

  const selectApplied = db.prepare('SELECT name FROM schema_migrations');
  const insertRecord = db.prepare(
    'INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)',
  );

  const applied = new Set(selectApplied.all().map((r) => r.name));
  const files = listMigrationFiles();
  const newlyApplied = [];

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const apply = db.transaction(() => {
      db.exec(sql);
      insertRecord.run(file, new Date().toISOString());
    });
    apply();
    newlyApplied.push(file);
  }

  return { total: files.length, newlyApplied };
}
