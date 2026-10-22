import { describe, expect, it } from 'vitest';
import {
  createPomodoroState,
  pomodoroReducer,
  progressRatio,
  type PomodoroAction,
  type PomodoroState,
} from './pomodoro';

const T0 = 1_760_000_000_000;
const MINUTE = 60 * 1000;
const FOCUS_MS = 25 * MINUTE;
const BREAK_MS = 5 * MINUTE;

function run(state: PomodoroState, actions: PomodoroAction[]): PomodoroState {
  return actions.reduce((acc, action) => pomodoroReducer(acc, action), state);
}

describe('番茄钟状态机', () => {
  it('初始状态为 25 分钟专注待开始、5 分钟休息', () => {
    const state = createPomodoroState();
    expect(state.phase).toBe('focus');
    expect(state.status).toBe('idle');
    expect(state.remainingMs).toBe(FOCUS_MS);
    expect(state.breakMs).toBe(BREAK_MS);
    expect(state.deadline).toBeNull();
    expect(state.lastCompleted).toBeNull();
  });

  it('开始后倒计时递减，暂停冻结剩余时间，继续后恢复递减', () => {
    let state = run(createPomodoroState(), [{ type: 'start', now: T0 }]);
    expect(state.status).toBe('running');
    expect(state.phaseStartedAt).toBe(T0);

    state = pomodoroReducer(state, { type: 'tick', now: T0 + MINUTE });
    expect(state.remainingMs).toBe(24 * MINUTE);

    state = pomodoroReducer(state, { type: 'pause', now: T0 + 2 * MINUTE });
    expect(state.status).toBe('paused');
    expect(state.deadline).toBeNull();
    expect(state.remainingMs).toBe(23 * MINUTE);

    state = pomodoroReducer(state, { type: 'tick', now: T0 + 30 * MINUTE });
    expect(state.remainingMs).toBe(23 * MINUTE);

    state = pomodoroReducer(state, { type: 'resume', now: T0 + 30 * MINUTE });
    expect(state.status).toBe('running');
    expect(state.deadline).toBe(T0 + 30 * MINUTE + 23 * MINUTE);
  });

  it('专注倒计时自然结束后自动进入 5 分钟休息并产生一条完成记录', () => {
    const end = T0 + FOCUS_MS;
    const state = run(createPomodoroState(), [
      { type: 'start', now: T0 },
      { type: 'tick', now: end },
    ]);

    expect(state.phase).toBe('break');
    expect(state.status).toBe('running');
    expect(state.remainingMs).toBe(BREAK_MS);
    expect(state.deadline).toBe(end + BREAK_MS);
    expect(state.lastCompleted).toEqual({ startedAt: T0, endedAt: end, durationMs: FOCUS_MS });
  });

  it('休息倒计时结束后回到可再次开始的 25 分钟专注状态', () => {
    const focusEnd = T0 + FOCUS_MS;
    const state = run(createPomodoroState(), [
      { type: 'start', now: T0 },
      { type: 'tick', now: focusEnd },
      { type: 'tick', now: focusEnd + BREAK_MS },
    ]);

    expect(state.phase).toBe('focus');
    expect(state.status).toBe('idle');
    expect(state.remainingMs).toBe(FOCUS_MS);
    expect(state.deadline).toBeNull();
    expect(state.lastCompleted).toBeNull();
  });

  it('未走完就重置的专注时段不产生记录', () => {
    const state = run(createPomodoroState(), [
      { type: 'start', now: T0 },
      { type: 'tick', now: T0 + 3 * MINUTE },
      { type: 'reset' },
    ]);

    expect(state.status).toBe('idle');
    expect(state.phase).toBe('focus');
    expect(state.remainingMs).toBe(FOCUS_MS);
    expect(state.lastCompleted).toBeNull();
  });

  it('重置休息时段回到 5 分钟休息的起始状态', () => {
    const focusEnd = T0 + FOCUS_MS;
    const state = run(createPomodoroState(), [
      { type: 'start', now: T0 },
      { type: 'tick', now: focusEnd },
      { type: 'tick', now: focusEnd + 2 * MINUTE },
      { type: 'reset' },
    ]);

    expect(state.phase).toBe('break');
    expect(state.status).toBe('idle');
    expect(state.remainingMs).toBe(BREAK_MS);
  });

  it('完成事件被消费后再读取为空，且不重复产生记录', () => {
    const focusEnd = T0 + FOCUS_MS;
    const completed = run(createPomodoroState(), [
      { type: 'start', now: T0 },
      { type: 'tick', now: focusEnd },
    ]);
    const consumed = pomodoroReducer(completed, { type: 'consume' });

    expect(consumed.lastCompleted).toBeNull();
    expect(consumed.phase).toBe('break');
    expect(pomodoroReducer(consumed, { type: 'consume' })).toBe(consumed);
  });

  it('重复的开始/暂停/继续操作不会改变状态', () => {
    const idle = createPomodoroState();
    expect(pomodoroReducer(idle, { type: 'pause', now: T0 })).toBe(idle);
    expect(pomodoroReducer(idle, { type: 'resume', now: T0 })).toBe(idle);

    const running = pomodoroReducer(idle, { type: 'start', now: T0 });
    expect(pomodoroReducer(running, { type: 'start', now: T0 + MINUTE })).toBe(running);
  });

  it('进度比例随已过时间增长', () => {
    const state = run(createPomodoroState(), [
      { type: 'start', now: T0 },
      { type: 'tick', now: T0 + 5 * MINUTE },
    ]);
    expect(progressRatio(state)).toBeCloseTo(0.2, 5);
    expect(progressRatio(createPomodoroState())).toBe(0);
  });
});