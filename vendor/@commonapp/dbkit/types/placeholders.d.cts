import type { DbDriver } from './types.cjs';
export interface CompiledSql {
    text: string;
    paramCount: number;
}
/**
 * 将逻辑 SQL（? 占位符）编译为目标 driver 格式。
 * 校验参数数量与占位符数量一致。
 */
export declare function compilePlaceholders(sql: string, driver: DbDriver, params?: readonly unknown[]): CompiledSql;
