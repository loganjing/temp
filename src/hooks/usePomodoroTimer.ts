import { useCallback, useEffect, useRef, useState } from 'react'
import type { FocusRecord, PomodoroDurations, PomodoroPhase } from '../types'
import {
  appendRecord,
  clearRecords,
  defaultDurations,
  loadRecords,
} from '../storage'
import { generateId } from '../utils/time'
import { FOCUS_DURATION_MINUTES } from '../storage'

export interface UsePomodoroResult {
  phase: PomodoroPhase
  remainingSeconds: number
  running: boolean
  durations: PomodoroDurations
  records: FocusRecord[]
  start: () => void
  pause: () => void
  resume: () => void
  reset: () => void
  skipToFocusEnd: () => void
  setDurations: (d: PomodoroDurations) => void
  clearTodayRecords: () => void
}

export function usePomodoroTimer(): UsePomodoroResult {
  const [durations, setDurationsState] = useState<PomodoroDurations>(defaultDurations())
  const [phase, setPhase] = useState<PomodoroPhase>('idle')
  const [remainingSeconds, setRemainingSeconds] = useState<number>(durations.focusSeconds)
  const [running, setRunning] = useState<boolean>(false)
  const [records, setRecords] = useState<FocusRecord[]>(() => loadRecords())

  // Keep remainingSeconds in sync when durations change while idle
  const phaseRef = useRef(phase)
  const runningRef = useRef(running)
  const remainingRef = useRef(remainingSeconds)
  const durationsRef = useRef(durations)
  phaseRef.current = phase
  runningRef.current = running
  remainingRef.current = remainingSeconds
  durationsRef.current = durations

  const commitFocusRecord = useCallback(() => {
    const record: FocusRecord = {
      id: generateId(),
      completedAt: new Date().toISOString(),
      durationMinutes: FOCUS_DURATION_MINUTES,
    }
    const next = appendRecord(record)
    setRecords(next)
  }, [])

  const tick = useCallback(() => {
    const currentPhase = phaseRef.current
    const currentRemaining = remainingRef.current
    if (!runningRef.current) return

    if (currentRemaining > 1) {
      setRemainingSeconds(currentRemaining - 1)
      return
    }

    // reached zero
    setRemainingSeconds(0)
    if (currentPhase === 'focusing') {
      // 自然归零 → 记录并进入休息
      commitFocusRecord()
      const restSecs = durationsRef.current.restSeconds
      setPhase('resting')
      setRemainingSeconds(restSecs)
      // 休息自动启动
      setRunning(true)
    } else if (currentPhase === 'resting') {
      // 休息归零 → 回到 idle
      setPhase('idle')
      setRemainingSeconds(durationsRef.current.focusSeconds)
      setRunning(false)
    }
  }, [commitFocusRecord])

  useEffect(() => {
    if (!running) return
    const interval = window.setInterval(tick, 1000)
    return () => window.clearInterval(interval)
  }, [running, tick])

  const start = useCallback(() => {
    if (phaseRef.current === 'idle') {
      setPhase('focusing')
      setRemainingSeconds(durationsRef.current.focusSeconds)
      setRunning(true)
    }
  }, [])

  const pause = useCallback(() => {
    if (phaseRef.current === 'focusing' && runningRef.current) {
      setRunning(false)
    }
  }, [])

  const resume = useCallback(() => {
    if (phaseRef.current === 'focusing' && !runningRef.current) {
      setRunning(true)
    }
  }, [])

  const reset = useCallback(() => {
    setRunning(false)
    setPhase('idle')
    setRemainingSeconds(durationsRef.current.focusSeconds)
  }, [])

  const skipToFocusEnd = useCallback(() => {
    if (phaseRef.current === 'focusing') {
      setRemainingSeconds(1)
      // trigger the next tick to commit; but if paused, force commit directly
      if (!runningRef.current) {
        // 暂停状态下直接推进到归零边界并触发记录
        setRemainingSeconds(0)
        commitFocusRecord()
        setPhase('resting')
        setRemainingSeconds(durationsRef.current.restSeconds)
        setRunning(true)
      }
    }
  }, [commitFocusRecord])

  const setDurations = useCallback((d: PomodoroDurations) => {
    setDurationsState(d)
    if (phaseRef.current === 'idle') {
      setRemainingSeconds(d.focusSeconds)
    } else if (phaseRef.current === 'resting' && !runningRef.current) {
      setRemainingSeconds(d.restSeconds)
    }
  }, [])

  const clearTodayRecords = useCallback(() => {
    clearRecords()
    setRecords([])
  }, [])

  // Expose debug helpers in test mode
  useEffect(() => {
    if (typeof window === 'undefined') return
    const w = window as unknown as {
      __focusDebug__?: {
        setDurations: (d: PomodoroDurations) => void
        skipToFocusEnd: () => void
        clearTodayRecords: () => void
      }
    }
    w.__focusDebug__ = {
      setDurations,
      skipToFocusEnd,
      clearTodayRecords,
    }
    return () => {
      delete w.__focusDebug__
    }
  }, [setDurations, skipToFocusEnd, clearTodayRecords])

  return {
    phase,
    remainingSeconds,
    running,
    durations,
    records,
    start,
    pause,
    resume,
    reset,
    skipToFocusEnd,
    setDurations,
    clearTodayRecords,
  }
}
