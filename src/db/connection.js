import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 数据库连接管理（src/db/，架构基线 2.1）。
 * - DB_PATH 环境变量可覆盖（相对路径按进程 cwd 解析）
 * - 打开前自动创建父目录（保证干净目录启动）
 * - 单例连接：better-sqlite3 同步驱动，全服务共享一个连接
 */

let db = null;

export function resolveDbPath(env = process.env) {
  const raw = env.DB_PATH && String(env.DB_PATH).trim() !== '' ? String(env.DB_PATH) : null;
  if (raw) return path.resolve(raw);
  return path.resolve(process.cwd(), 'data', 'application.db');
}

export function getDb() {
  if (db) return db;
  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
