import { type SessionRecord, formatDuration } from '../types';

interface SessionListProps {
  sessions: SessionRecord[];
}

export function SessionList({ sessions }: SessionListProps) {
  if (sessions.length === 0) {
    return (
      <div className="session-list-empty">
        <p>今日尚未完成专注番茄钟，点击上方"开始专注"开启第一个番茄钟吧。</p>
      </div>
    );
  }

  const reversed = [...sessions].reverse();

  return (
    <div className="session-list">
      <h3 className="section-title">当日专注记录</h3>
      <ul className="session-items">
        {reversed.map((session, idx) => {
          const time = new Date(session.completedAt);
          const timeStr = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;
          const seqNum = sessions.length - idx;
          return (
            <li key={`${session.completedAt}-${idx}`} className="session-item">
              <span className="session-seq">#{seqNum}</span>
              <span className="session-time">{timeStr}</span>
              <span className="session-duration">{formatDuration(session.durationMin)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
