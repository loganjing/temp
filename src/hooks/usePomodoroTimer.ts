import { useState, useEffect, useCallback, useRef } from 'react';
import {
  type TimerPhase,
  type SessionRecord,
  FOCUS_DURATION_SEC,
  REST_DURATION_SEC,
  FOCUS_DURATION_MIN,
  todayKey,
  loadSessions,
  saveSessions,
} from '../types';

export interface PomodoroState {
  phase: TimerPhase;
  remainingSec: number;
  sessions: SessionRecord[];
  cumulativeMin: number;
}

export function usePomodoroTimer() {
  const [phase, setPhase] = useState<TimerPhase>('idle');
  const [remainingSec, setRemainingSec] = useState(FOCUS_DURATION_SEC);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickSecondsRef = useRef(1);

  // Load from localStorage on mount
  useEffect(() => {
    const key = todayKey();
    const loaded = loadSessions(key);
    setSessions(loaded);
  }, []);

  // Timer tick
  useEffect(() => {
    if (phase === 'focusing' || phase === 'resting') {
      tickRef.current = setInterval(() => {
        setRemainingSec((prev: number) => {
          const decrement = tickSecondsRef.current;
          const next = prev - decrement;
          if (next <= 0) {
            // Phase complete
            if (phase === 'focusing') {
              // Record session and transition to rest
              const session: SessionRecord = {
                completedAt: new Date().toISOString(),
                durationMin: FOCUS_DURATION_MIN,
              };
              setSessions((prevSessions) => {
                const updated = [...prevSessions, session];
                const key = todayKey();
                saveSessions(key, updated);
                return updated;
              });
              setPhase('resting');
              return REST_DURATION_SEC;
            } else {
              // Rest complete → idle
              setPhase('idle');
              return FOCUS_DURATION_SEC;
            }
          }
          return next;
        });
      }, 1000);
      return () => {
        if (tickRef.current) {
          clearInterval(tickRef.current);
          tickRef.current = null;
        }
      };
    }
  }, [phase]);

  const start = useCallback(() => {
    if (phase === 'idle') {
      setRemainingSec(FOCUS_DURATION_SEC);
      setPhase('focusing');
    }
  }, [phase]);

  const pause = useCallback(() => {
    if (phase === 'focusing') setPhase('paused-focusing');
    else if (phase === 'resting') setPhase('paused-resting');
  }, [phase]);

  const resume = useCallback(() => {
    if (phase === 'paused-focusing') setPhase('focusing');
    else if (phase === 'paused-resting') setPhase('resting');
  }, [phase]);

  const reset = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    setPhase('idle');
    setRemainingSec(FOCUS_DURATION_SEC);
  }, []);

  // Dev test controls
  useEffect(() => {
    if (import.meta.env.DEV) {
      const testControls = {
        fastForwardFocus: () => {
          if (phase === 'focusing') {
            setRemainingSec(0);
          }
        },
        fastForwardRest: () => {
          if (phase === 'resting') {
            setRemainingSec(0);
          }
        },
        setFocusTickSeconds: (sec: number) => {
          tickSecondsRef.current = sec;
        },
        clearTodaySessions: () => {
          const key = todayKey();
          localStorage.removeItem(key);
          setSessions([]);
          setPhase('idle');
          setRemainingSec(FOCUS_DURATION_SEC);
        },
      };
      (window as unknown as Record<string, unknown>).__TIMELING_TEST__ = testControls;
      return () => {
        delete (window as unknown as Record<string, unknown>).__TIMELING_TEST__;
      };
    }
  });

  const cumulativeMin = sessions.reduce((sum, s) => sum + s.durationMin, 0);

  return {
    phase,
    remainingSec,
    sessions,
    cumulativeMin,
    start,
    pause,
    resume,
    reset,
  };
}
