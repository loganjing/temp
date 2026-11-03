/** 数据库驱动类型 */
export type DbDriver = 'sqlite' | 'postgres';
/**
 * 一条待执行的 SQL 语句。
 * 文本中使用 `?` 作为逻辑占位符，由 dbkit placeholder compiler
 * 编译为目标 driver 格式（SQLite 保持 `?`，PG 转为 `$1..$n`）。
 * 参数值必须放入 params，禁止拼接到 text。
 */
export interface SqlStatement {
    text: string;
    params?: readonly unknown[];
}
/** 写操作（INSERT/UPDATE/DELETE）的执行结果 */
export interface RunResult {
    /** 实际影响行数，不能固定返回 1 */
    changes: number;
}
/**
 * 统一数据库客户端接口。
 * SQLite 底层同步，但 adapter 统一 Promise 化，避免 driver 差异泄漏到 Repository。
 */
export interface DbClient {
    readonly driver: DbDriver;
    /** 单行查询，无结果返回 null */
    queryOne<T>(statement: SqlStatement): Promise<T | null>;
    /** 多行查询 */
    queryAll<T>(statement: SqlStatement): Promise<T[]>;
    /** 写操作，返回影响行数 */
    run(statement: SqlStatement): Promise<RunResult>;
    /** 批量 DDL / migration 执行，不接受用户输入 */
    exec(sql: string): Promise<void>;
    /** 事务：回调必须使用传入的 tx，不能继续使用外部 client */
    transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T>;
    /** 关闭连接，幂等且安全 */
    close(): Promise<void>;
}
/** 数据库配置 */
export interface DbConfig {
    driver: DbDriver;
    /** SQLite 文件路径，或 ':memory:' */
    sqlitePath: string;
    /** PostgreSQL 连接串，仅 driver=postgres 时使用 */
    postgresUrl?: string;
    /** PG 连接池选项 */
    postgresPool?: {
        max?: number;
        idleTimeoutMillis?: number;
        connectionTimeoutMillis?: number;
        ssl?: boolean | object;
    };
}
/** Migration 执行选项 */
export interface MigrationOptions {
    /** migration 目录绝对或相对路径，内部按 driver 选 sqlite/ 或 postgres/ 子目录 */
    directory: string;
    /** migration 记录表名，默认 'commonapp_migrations' */
    tableName?: string;
}
/** Migration 执行状态 */
export interface MigrationRecord {
    name: string;
    checksum: string;
    appliedAt: string;
}
export interface MigrationStatus {
    /** 已执行的 migration 列表 */
    applied: MigrationRecord[];
    /** 待执行的 migration 文件名 */
    pending: string[];
}
