import type { TaskStatus, ExceptionStatus } from '../../shared/types.js';

/**
 * 采摘任务状态转换规则表。
 * 键 = 当前状态，值 = 允许的目标状态列表。
 *
 * 待执行 → 执行中、已取消
 * 执行中 → 已完成、已取消
 * 已完成 → （终态，不允许转换）
 * 已取消 → （终态，不允许转换）
 */
const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  '待执行': ['执行中', '已取消'],
  '执行中': ['已完成', '已取消'],
  '已完成': [],
  '已取消': [],
};

/**
 * 异常报告状态转换规则表。
 *
 * 待处理 → 处理中、已解决
 * 处理中 → 已解决
 * 已解决 → （终态，不允许转换）
 */
const EXCEPTION_TRANSITIONS: Record<ExceptionStatus, ExceptionStatus[]> = {
  '待处理': ['处理中', '已解决'],
  '处理中': ['已解决'],
  '已解决': [],
};

/**
 * 判断采摘任务状态转换是否允许。
 */
export function canTransitionTaskStatus(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_TRANSITIONS[from].includes(to);
}

/**
 * 判断异常报告状态转换是否允许。
 */
export function canTransitionExceptionStatus(
  from: ExceptionStatus,
  to: ExceptionStatus,
): boolean {
  return EXCEPTION_TRANSITIONS[from].includes(to);
}

/**
 * 判断采摘任务状态是否为终态（已完成 / 已取消）。
 */
export function isTerminalTaskStatus(status: TaskStatus): boolean {
  return status === '已完成' || status === '已取消';
}

/**
 * 判断异常报告状态是否为终态（已解决）。
 */
export function isTerminalExceptionStatus(status: ExceptionStatus): boolean {
  return status === '已解决';
}

// 供路由层用于 zod 校验
export const VALID_TASK_STATUSES_FOR_TRANSITION: TaskStatus[] = [
  '执行中',
  '已完成',
  '已取消',
];

export const VALID_EXCEPTION_STATUSES_FOR_UPDATE: ExceptionStatus[] = [
  '处理中',
  '已解决',
];
