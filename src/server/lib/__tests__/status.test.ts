import { describe, it, expect } from 'vitest';
import {
  canTransitionTaskStatus,
  canTransitionExceptionStatus,
  isTerminalTaskStatus,
  isTerminalExceptionStatus,
} from '../status.js';
import type { TaskStatus, ExceptionStatus } from '../../../shared/types.js';

describe('canTransitionTaskStatus', () => {
  // 待执行 → 执行中、已取消
  it('待执行 → 执行中 允许', () => {
    expect(canTransitionTaskStatus('待执行', '执行中')).toBe(true);
  });
  it('待执行 → 已取消 允许', () => {
    expect(canTransitionTaskStatus('待执行', '已取消')).toBe(true);
  });
  it('待执行 → 已完成 不允许', () => {
    expect(canTransitionTaskStatus('待执行', '已完成')).toBe(false);
  });

  // 执行中 → 已完成、已取消
  it('执行中 → 已完成 允许', () => {
    expect(canTransitionTaskStatus('执行中', '已完成')).toBe(true);
  });
  it('执行中 → 已取消 允许', () => {
    expect(canTransitionTaskStatus('执行中', '已取消')).toBe(true);
  });
  it('执行中 → 待执行 不允许', () => {
    expect(canTransitionTaskStatus('执行中', '待执行')).toBe(false);
  });

  // 已完成 → 终态
  it('已完成 → 任意 不允许', () => {
    const targets: TaskStatus[] = ['待执行', '执行中', '已取消'];
    for (const t of targets) {
      expect(canTransitionTaskStatus('已完成', t)).toBe(false);
    }
  });

  // 已取消 → 终态
  it('已取消 → 任意 不允许', () => {
    const targets: TaskStatus[] = ['待执行', '执行中', '已完成'];
    for (const t of targets) {
      expect(canTransitionTaskStatus('已取消', t)).toBe(false);
    }
  });
});

describe('canTransitionExceptionStatus', () => {
  // 待处理 → 处理中、已解决
  it('待处理 → 处理中 允许', () => {
    expect(canTransitionExceptionStatus('待处理', '处理中')).toBe(true);
  });
  it('待处理 → 已解决 允许', () => {
    expect(canTransitionExceptionStatus('待处理', '已解决')).toBe(true);
  });

  // 处理中 → 已解决
  it('处理中 → 已解决 允许', () => {
    expect(canTransitionExceptionStatus('处理中', '已解决')).toBe(true);
  });
  it('处理中 → 待处理 不允许', () => {
    expect(canTransitionExceptionStatus('处理中', '待处理')).toBe(false);
  });

  // 已解决 → 终态
  it('已解决 → 任意 不允许', () => {
    const targets: ExceptionStatus[] = ['待处理', '处理中'];
    for (const t of targets) {
      expect(canTransitionExceptionStatus('已解决', t)).toBe(false);
    }
  });
});

describe('isTerminalTaskStatus', () => {
  it('已完成是终态', () => {
    expect(isTerminalTaskStatus('已完成')).toBe(true);
  });
  it('已取消是终态', () => {
    expect(isTerminalTaskStatus('已取消')).toBe(true);
  });
  it('待执行不是终态', () => {
    expect(isTerminalTaskStatus('待执行')).toBe(false);
  });
  it('执行中不是终态', () => {
    expect(isTerminalTaskStatus('执行中')).toBe(false);
  });
});

describe('isTerminalExceptionStatus', () => {
  it('已解决是终态', () => {
    expect(isTerminalExceptionStatus('已解决')).toBe(true);
  });
  it('待处理不是终态', () => {
    expect(isTerminalExceptionStatus('待处理')).toBe(false);
  });
  it('处理中不是终态', () => {
    expect(isTerminalExceptionStatus('处理中')).toBe(false);
  });
});
