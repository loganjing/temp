import { type TimerPhase, formatTime } from '../types';

interface TimerDisplayProps {
  phase: TimerPhase;
  remainingSec: number;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
}

const phaseLabels: Record<TimerPhase, string> = {
  idle: '待开始',
  focusing: '专注中',
  'paused-focusing': '专注已暂停',
  resting: '休息中',
  'paused-resting': '休息已暂停',
};

const phaseColors: Record<TimerPhase, string> = {
  idle: '#6b7280',
  focusing: '#dc2626',
  'paused-focusing': '#f59e0b',
  resting: '#16a34a',
  'paused-resting': '#f59e0b',
};

export function TimerDisplay({ phase, remainingSec, onStart, onPause, onResume, onReset }: TimerDisplayProps) {
  const isRunning = phase === 'focusing' || phase === 'resting';
  const isPaused = phase === 'paused-focusing' || phase === 'paused-resting';
  const canStart = phase === 'idle';
  const color = phaseColors[phase];

  return (
    <div className="timer-card">
      <div className="phase-label" style={{ color }}>
        {phaseLabels[phase]}
      </div>
      <div className="timer-display" style={{ color }}>
        {formatTime(remainingSec)}
      </div>
      <div className="timer-controls">
        {canStart && (
          <button className="btn btn-start" onClick={onStart}>
            开始专注
          </button>
        )}
        {isRunning && (
          <button className="btn btn-pause" onClick={onPause}>
            暂停
          </button>
        )}
        {isPaused && (
          <button className="btn btn-resume" onClick={onResume}>
            恢复
          </button>
        )}
        {!canStart && (
          <button className="btn btn-reset" onClick={onReset}>
            重置
          </button>
        )}
      </div>
    </div>
  );
}
