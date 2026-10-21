import type { DbClient, MigrationOptions, MigrationStatus } from './types.js';
/**
 * 执行 pending migration。
 * - 已执行且 checksum 不变 → 跳过
 * - 已执行但 checksum 改变 → 抛 MigrationChecksumError
 * - 未执行 → 在事务内执行（PG 先取 advisory_xact_lock），成功后记录
 * - 单个 migration 失败 → 事务回滚，整体抛错，修复后可重试
 */
export declare function runMigrations(db: DbClient, options: MigrationOptions): Promise<MigrationStatus>;
/** 查询 migration 状态（只读，不执行） */
export declare function getMigrationStatus(db: DbClient, options: MigrationOptions): Promise<MigrationStatus>;
