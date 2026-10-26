import CumulativeFocus from './components/CumulativeFocus.jsx'
import PomodoroTimer from './components/PomodoroTimer.jsx'
import Heatmap from './components/Heatmap.jsx'
import { usePomodoro } from './hooks/usePomodoro.js'

export default function App() {
  const { phase, secondsLeft, running, sessions, startFocus, startBreak, startNext } = usePomodoro()

  return (
    <div className="app">
      <header className="app-header">
        <h1>TimeLing · 专注时段记录</h1>
        <p className="app-subtitle">番茄钟驱动，自动记录当日专注分布</p>
      </header>

      <main className="app-main">
        <CumulativeFocus sessions={sessions} />
        <PomodoroTimer
          phase={phase}
          secondsLeft={secondsLeft}
          running={running}
          startFocus={startFocus}
          startBreak={startBreak}
          startNext={startNext}
        />
        <Heatmap sessions={sessions} />
      </main>

      <footer className="app-footer">
        <span>专注 25 分钟 · 休息 5 分钟 · 自动记录当日时段</span>
      </footer>
    </div>
  )
}
