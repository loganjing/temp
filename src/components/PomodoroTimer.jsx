function formatTime(secondsLeft) {
  const m = Math.floor(secondsLeft / 60)
  const s = secondsLeft % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const PHASE_LABEL = {
  idle: '待启动',
  focus: '专注中',
  break: '休息中',
  ready: '休息结束',
}

export default function PomodoroTimer({ phase, secondsLeft, running, startFocus, startBreak, startNext }) {
  const phaseClass = phase === 'focus' ? 'timer-focus'
    : phase === 'break' ? 'timer-break'
    : 'timer-idle'

  const canStartFocus = phase === 'idle' || phase === 'ready'
  const canStartBreak = phase === 'idle'

  return (
    <section className={`timer-section ${phaseClass}`}>
      <div className="timer-phase">{PHASE_LABEL[phase]}</div>
      <div className="timer-display">{formatTime(secondsLeft)}</div>
      <div className="timer-controls">
        {canStartFocus && (
          <button className="btn btn-primary" onClick={phase === 'ready' ? startNext : startFocus}>
            开始专注
          </button>
        )}
        {phase === 'focus' && running && (
          <span className="timer-running-hint">专注进行中…</span>
        )}
        {phase === 'break' && running && (
          <span className="timer-running-hint">休息中，稍后可启动下一轮</span>
        )}
        {phase === 'break' && !running && canStartBreak && (
          <button className="btn btn-secondary" onClick={startBreak}>
            开始休息
          </button>
        )}
      </div>
      <div className="timer-legend">
        <span className="legend-item"><span className="dot dot-focus" />专注 25 分钟</span>
        <span className="legend-item"><span className="dot dot-break" />休息 5 分钟</span>
      </div>
    </section>
  )
}
