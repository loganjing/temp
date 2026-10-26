import { useCallback, useEffect, useRef, useState } from 'react'
import { loadSessions, saveSession } from '../lib/storage.js'

const FOCUS_SECONDS = 25 * 60
const BREAK_SECONDS = 5 * 60

/**
 * 番茄钟状态机:
 *   idle   — 待启动专注
 *   focus  — 专注倒计时中 (25:00 → 00:00)
 *   break  — 休息倒计时中 (05:00 → 00:00)
 *   ready  — 休息结束，可启动下一轮专注
 */
export function usePomodoro() {
  const [phase, setPhase] = useState('idle')
  const [secondsLeft, setSecondsLeft] = useState(FOCUS_SECONDS)
  const [running, setRunning] = useState(false)
  const [sessions, setSessions] = useState(() => loadSessions())
  const intervalRef = useRef(null)

  // 倒计时驱动
  useEffect(() => {
    if (!running) return

    intervalRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          // 当前阶段倒计时结束
          setRunning(false)
          clearInterval(intervalRef.current)

          if (phase === 'focus') {
            // 专注完成 → 记录 + 进入休息
            const now = Date.now()
            const updated = saveSession({ completedAt: now, duration: 25 })
            setSessions(updated)
            setPhase('break')
            setSecondsLeft(BREAK_SECONDS)
            setRunning(true)
          } else if (phase === 'break') {
            // 休息完成 → 可启动下一轮
            setPhase('ready')
            setSecondsLeft(FOCUS_SECONDS)
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(intervalRef.current)
  }, [running, phase])

  const startFocus = useCallback(() => {
    setPhase('focus')
    setSecondsLeft(FOCUS_SECONDS)
    setRunning(true)
  }, [])

  const startBreak = useCallback(() => {
    setPhase('break')
    setSecondsLeft(BREAK_SECONDS)
    setRunning(true)
  }, [])

  // 仅当 ready → 下一轮时使用 startFocus
  const startNext = useCallback(() => {
    startFocus()
  }, [startFocus])

  return {
    phase,
    secondsLeft,
    running,
    sessions,
    startFocus,
    startBreak,
    startNext,
  }
}
