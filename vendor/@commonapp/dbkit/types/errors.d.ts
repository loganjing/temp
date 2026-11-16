export declare class DbkitError extends Error {
    constructor(message: string);
}
/** 占位符编译错误：参数数量不匹配、未闭合字符串/注释、混用占位符形式 */
export declare class PlaceholderError extends DbkitError {
}
/** 不支持的 DB_DRIVER 值 */
export declare class InvalidDriverError extends DbkitError {
}
/** postgres 模式缺少 DATABASE_URL */
export declare class MissingDatabaseUrlError extends DbkitError {
}
/** 已执行 migration 的 checksum 与文件内容不一致 */
export declare class MigrationChecksumError extends DbkitError {
}
/** migration 执行失败或并发冲突 */
export declare class MigrationConflictError extends DbkitError {
}
