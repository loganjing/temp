import { usePomodoroTimer } from './hooks/usePomodoroTimer';
import { FocusSummary } from './components/FocusSummary';
import { TimerDisplay } from './components/TimerDisplay';
import { SessionList } from './components/SessionList';
import { Heatmap } from './components/Heatmap';

export default function App() {
  const {
    phase,
    remainingSec,
    sessions,
    cumulativeMin,
    start,
    pause,
    resume,
    reset,
  } = usePomodoroTimer();

  return (
    <div className="app-container">
      <header className="app-header">
        <h1 className="app-title">Timeling</h1>
        <p className="app-subtitle">专注时段记录系统</p>
      </header>

      <main className="app-main">
        <FocusSummary cumulativeMin={cumulativeMin} sessionCount={sessions.length} />

        <TimerDisplay
          phase={phase}
          remainingSec={remainingSec}
          onStart={start}
          onPause={pause}
          onResume={resume}
          onReset={reset}
        />

        <SessionList sessions={sessions} />

        <Heatmap sessions={sessions} />
      </main>

      <footer className="app-footer">
        <p>25 分钟专注 · 5 分钟休息 · 数据保存在本地浏览器</p>
      </footer>
    </div>
  );
}
