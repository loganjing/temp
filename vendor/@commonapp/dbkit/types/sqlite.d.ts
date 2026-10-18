import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { DbClient, DbDriver, RunResult, SqlStatement } from './types.js';
export interface SqliteClientOptions {
    /** 事务中的 tx 实例不能 close，默认 false */
    readonly closable?: boolean;
}
export declare class SqliteClient implements DbClient {
    private readonly db;
    private readonly opts;
    readonly driver: DbDriver;
    private closed;
    constructor(db: SqliteDatabase, opts?: SqliteClientOptions);
    queryOne<T>(statement: SqlStatement): Promise<T | null>;
    queryAll<T>(statement: SqlStatement): Promise<T[]>;
    run(statement: SqlStatement): Promise<RunResult>;
    exec(sql: string): Promise<void>;
    transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T>;
    close(): Promise<void>;
    private assertNotClosed;
}
/**
 * 创建 SQLite DbClient。
 * 自动设置 WAL（非 :memory:）和 foreign_keys = ON。
 */
export declare function createSqliteClient(path: string): SqliteClient;
