export type Phase = 'focus' | 'break';
export type PhaseStatus = 'idle' | 'running' | 'paused';

/** 一个已完成专注时段的不可变事实，由番茄钟在专注倒计时自然结束时产生。 */
export interface CompletedFocus {
  /** 该专注时段开始计时的时刻（首次开始或最后一次继续时的时间锚点）。 */
  startedAt: number;
  /** 专注倒计时归零的时刻。 */
  endedAt: number;
  /** 实际专注时长，等于配置的专注时长。 */
  durationMs: number;
}

export interface PomodoroState {
  phase: Phase;
  status: PhaseStatus;
  /** 当前时段剩余毫秒数；运行中以 tick 校准。 */
  remainingMs: number;
  /** 运行中的倒计时终点（epoch 毫秒），非运行时为 null。 */
  deadline: number | null;
  /** 当前专注时段开始计时的时刻；休息时段为 null。 */
  phaseStartedAt: number | null;
  /** 待消费的一次完成事件；由调用方读取后通过 consume 清除。 */
  lastCompleted: CompletedFocus | null;
  focusMs: number;
  breakMs: number;
}

export type PomodoroAction =
  | { type: 'start'; now: number }
  | { type: 'pause'; now: number }
  | { type: 'resume'; now: number }
  | { type: 'reset' }
  | { type: 'tick'; now: number }
  | { type: 'consume' };

export const FOCUS_DURATION_MS = 25 * 60 * 1000;
export const BREAK_DURATION_MS = 5 * 60 * 1000;

export interface PomodoroDurations {
  focusMs: number;
  breakMs: number;
}

export const DEFAULT_DURATIONS: PomodoroDurations = {
  focusMs: FOCUS_DURATION_MS,
  breakMs: BREAK_DURATION_MS,
};

export function createPomodoroState(durations: PomodoroDurations = DEFAULT_DURATIONS): PomodoroState {
  return {
    phase: 'focus',
    status: 'idle',
    remainingMs: durations.focusMs,
    deadline: null,
    phaseStartedAt: null,
    lastCompleted: null,
    focusMs: durations.focusMs,
    breakMs: durations.breakMs,
  };
}

function durationOf(state: PomodoroState, phase: Phase): number {
  return phase === 'focus' ? state.focusMs : state.breakMs;
}

/**
 * 番茄钟状态机：专注 25 分钟 → 自动进入休息 5 分钟 → 回到可再次开始的专注状态。
 * 只有专注倒计时自然结束（tick 到达终点）才会产生 lastCompleted 事件；
 * 重置或中途放弃不产生记录。
 */
export function pomodoroReducer(state: PomodoroState, action: PomodoroAction): PomodoroState {
  switch (action.type) {
    case 'start': {
      if (state.status !== 'idle') return state;
      return {
        ...state,
        status: 'running',
        deadline: action.now + state.remainingMs,
        phaseStartedAt: state.phase === 'focus' ? action.now : null,
      };
    }

    case 'pause': {
      if (state.status !== 'running' || state.deadline === null) return state;
      return {
        ...state,
        status: 'paused',
        remainingMs: Math.max(0, state.deadline - action.now),
        deadline: null,
      };
    }

    case 'resume': {
      if (state.status !== 'paused') return state;
      return {
        ...state,
        status: 'running',
        deadline: action.now + state.remainingMs,
      };
    }

    case 'reset': {
      return {
        ...state,
        status: 'idle',
        remainingMs: durationOf(state, state.phase),
        deadline: null,
        phaseStartedAt: null,
        lastCompleted: null,
      };
    }

    case 'consume': {
      if (state.lastCompleted === null) return state;
      return { ...state, lastCompleted: null };
    }

    case 'tick': {
      if (state.status !== 'running' || state.deadline === null) return state;
      const remaining = state.deadline - action.now;
      if (remaining > 0) {
        return { ...state, remainingMs: remaining };
      }
      const finishedAt = state.deadline;
      if (state.phase === 'focus') {
        return {
          ...state,
          phase: 'break',
          status: 'running',
          remainingMs: state.breakMs,
          deadline: finishedAt + state.breakMs,
          phaseStartedAt: null,
          lastCompleted: {
            startedAt: state.phaseStartedAt ?? finishedAt - state.focusMs,
            endedAt: finishedAt,
            durationMs: state.focusMs,
          },
        };
      }
      return {
        ...state,
        phase: 'focus',
        status: 'idle',
        remainingMs: state.focusMs,
        deadline: null,
        phaseStartedAt: null,
        lastCompleted: null,
      };
    }

    default:
      return state;
  }
}

export function progressRatio(state: PomodoroState): number {
  const total = durationOf(state, state.phase);
  if (total <= 0) return 0;
  const elapsed = total - Math.max(0, state.remainingMs);
  return Math.min(1, Math.max(0, elapsed / total));
}