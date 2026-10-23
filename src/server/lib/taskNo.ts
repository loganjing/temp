import type { Database } from 'better-sqlite3';

/**
 * 将日期格式化为 YYYYMMDD 字符串（用于任务编号）。
 */
export function formatDateForTaskNo(date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

/**
 * 根据日期字符串和序号构建任务编号 PT-YYYYMMDD-NNN。
 */
export function formatTaskNo(dateStr: string, sequence: number): string {
  return `PT-${dateStr}-${String(sequence).padStart(3, '0')}`;
}

/**
 * 根据给定日期和当日已有任务数构建任务编号。
 * 序号 = 已有任务数 + 1。
 */
export function buildTaskNo(date: Date, existingCount: number): string {
  const dateStr = formatDateForTaskNo(date);
  return formatTaskNo(dateStr, existingCount + 1);
}

/**
 * 生成任务编号（PT-YYYYMMDD-NNN）。
 * 查询数据库中当日已有任务数，序号 = 已有任务数 + 1。
 */
export function generateTaskNo(db: Database, date: Date = new Date()): string {
  const dateStr = formatDateForTaskNo(date);
  const prefix = `PT-${dateStr}-`;
  const row = db
    .prepare(`SELECT COUNT(*) AS cnt FROM picking_tasks WHERE task_no LIKE ?`)
    .get(`${prefix}%`) as { cnt: number };
  return formatTaskNo(dateStr, row.cnt + 1);
}
