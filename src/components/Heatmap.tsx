import { type SessionRecord } from '../types';
import { getHourlyCounts, getIntensity, intensityColors } from '../HeatmapLogic';

interface HeatmapProps {
  sessions: SessionRecord[];
}

export function Heatmap({ sessions }: HeatmapProps) {
  const counts = getHourlyCounts(sessions);
  const max = Math.max(...counts, 1);

  return (
    <div className="heatmap-card">
      <h3 className="section-title">当日专注热力图</h3>
      <div className="heatmap-grid">
        {counts.map((count, hour) => {
          const intensity = getIntensity(count, max);
          return (
            <div
              key={hour}
              className="heatmap-cell"
              style={{ backgroundColor: intensityColors[intensity] }}
              title={`${String(hour).padStart(2, '0')}:00 — ${count} 个番茄钟`}
            >
              <span className="heatmap-hour">{String(hour).padStart(2, '0')}</span>
              {count > 0 && <span className="heatmap-count">{count}</span>}
            </div>
          );
        })}
      </div>
      <div className="heatmap-legend">
        <span className="legend-label">少</span>
        {intensityColors.map((color, i) => (
          <div key={i} className="legend-cell" style={{ backgroundColor: color }} />
        ))}
        <span className="legend-label">多</span>
      </div>
    </div>
  );
}
