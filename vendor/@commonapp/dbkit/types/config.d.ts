import type { DbConfig } from './types.js';
/**
 * 构造并校验 DbConfig。
 * - driver 默认 'sqlite'（从 DB_DRIVER 环境变量读取）
 * - postgres 模式必须提供 postgresUrl 或 DATABASE_URL
 * - sqlitePath 默认 ./data/helpdesk.db（从 DB_PATH 读取）
 */
export declare function createDbConfig(options?: Partial<DbConfig>): DbConfig;
