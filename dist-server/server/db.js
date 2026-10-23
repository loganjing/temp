import Database from 'better-sqlite3';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
let dbInstance = null;
/**
 * 获取 SQLite 数据库连接（单例）。
 * 首次调用时打开数据库文件并自动运行迁移脚本。
 *
 * 数据库路径通过 DB_PATH 环境变量配置，默认 ./data/app.db。
 */
export function getDb() {
    if (dbInstance)
        return dbInstance;
    const dbPath = process.env.DB_PATH || './data/app.db';
    const dir = dirname(dbPath);
    if (dir && dir !== '.') {
        mkdirSync(dir, { recursive: true });
    }
    dbInstance = new Database(dbPath);
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.pragma('foreign_keys = ON');
    runMigrations(dbInstance);
    return dbInstance;
}
/**
 * 运行版本化迁移脚本。
 * 通过 _migrations 表跟踪已应用的迁移，避免重复执行。
 */
export function runMigrations(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL UNIQUE,
      applied_at  TEXT    NOT NULL
    )
  `);
    const migrationFiles = ['001_init.sql'];
    for (const file of migrationFiles) {
        const applied = db
            .prepare('SELECT 1 FROM _migrations WHERE name = ?')
            .get(file);
        if (applied)
            continue;
        const sqlPath = join(process.cwd(), 'migrations', file);
        const sql = readFileSync(sqlPath, 'utf-8');
        db.exec(sql);
        db
            .prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)')
            .run(file, new Date().toISOString());
    }
}
/**
 * 关闭数据库连接（用于测试或优雅关闭）。
 */
export function closeDb() {
    if (dbInstance) {
        dbInstance.close();
        dbInstance = null;
    }
}
