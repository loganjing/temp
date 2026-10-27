import { formatDuration } from '../types';

interface FocusSummaryProps {
  cumulativeMin: number;
  sessionCount: number;
}

export function FocusSummary({ cumulativeMin, sessionCount }: FocusSummaryProps) {
  return (
    <div className="summary-card">
      <div className="summary-icon">🎯</div>
      <div className="summary-content">
        <div className="summary-label">今日累计专注</div>
        <div className="summary-value">{formatDuration(cumulativeMin)}</div>
        <div className="summary-sub">
          已完成 {sessionCount} 个番茄钟
        </div>
      </div>
    </div>
  );
}
