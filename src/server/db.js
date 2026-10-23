// db.js — SQLite 数据库初始化、迁移与连接管理
import Database from 'better-sqlite3';
import { readFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db = null;

/**
 * 返回数据库文件路径，支持 DB_PATH 环境变量覆盖。
 */
export function getDbPath() {
  return process.env.DB_PATH || './data/application.db';
}

/**
 * 初始化数据库连接并执行迁移。
 * @param {string} [dbPath] — 可选的数据库路径，默认使用 DB_PATH 或 ./data/application.db
 * @returns {Database} better-sqlite3 实例
 */
export function initDb(dbPath) {
  const path = dbPath || getDbPath();

  // 确保数据目录存在（:memory: 除外）
  if (path !== ':memory:') {
    const dir = dirname(path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  db = new Database(path);
  db.pragma('journal_mode = WAL');

  runMigrations(db);
  return db;
}

/**
 * 获取当前数据库实例。若未初始化则自动初始化。
 * @returns {Database}
 */
export function getDb() {
  if (!db) {
    initDb();
  }
  return db;
}

/**
 * 关闭数据库连接。
 */
export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * 执行 migrations/sqlite/ 目录下的所有 .sql 迁移文件（按文件名排序）。
 * 使用 _migrations 表追踪已执行的迁移，保证幂等。
 */
function runMigrations(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      filename   TEXT NOT NULL UNIQUE,
      executed_at TEXT NOT NULL
    )
  `);

  const migrationsDir = join(__dirname, '..', '..', 'migrations', 'sqlite');

  let files = [];
  try {
    files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
  } catch {
    // 迁移目录不存在时跳过
    return;
  }

  const checkStmt = database.prepare('SELECT filename FROM _migrations WHERE filename = ?');
  const insertStmt = database.prepare(
    'INSERT INTO _migrations (filename, executed_at) VALUES (?, ?)'
  );

  for (const file of files) {
    if (checkStmt.get(file)) continue;

    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    database.exec(sql);
    insertStmt.run(file, new Date().toISOString());
  }
}
