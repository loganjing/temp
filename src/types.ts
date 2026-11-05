export interface FocusRecord {
  id: string
  /** ISO-8601 本地时刻 */
  completedAt: string
  durationMinutes: number
}

export type PomodoroPhase = 'idle' | 'focusing' | 'resting'

export interface PomodoroState {
  phase: PomodoroPhase
  remainingSeconds: number
  running: boolean
}

export interface PomodoroDurations {
  focusSeconds: number
  restSeconds: number
}
