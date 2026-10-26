import { buildHeatmap } from '../lib/storage.js'

/**
 * 根据专注分钟数返回热度等级 (0-4) 与对应背景色。
 */
function heatLevel(minutes) {
  if (minutes === 0) return { level: 0, color: 'var(--heat-0)' }
  if (minutes <= 25) return { level: 1, color: 'var(--heat-1)' }
  if (minutes <= 50) return { level: 2, color: 'var(--heat-2)' }
  if (minutes <= 75) return { level: 3, color: 'var(--heat-3)' }
  return { level: 4, color: 'var(--heat-4)' }
}

export default function Heatmap({ sessions }) {
  const buckets = buildHeatmap(sessions)
  const maxMinutes = Math.max(...buckets, 25) // 至少基准 25 以避免全空时无差异

  return (
    <section className="heatmap-section">
      <div className="heatmap-label">当日专注热力图（按小时分桶）</div>
      <div className="heatmap-grid">
        {buckets.map((minutes, hour) => {
          const { level, color } = heatLevel(minutes)
          const intensity = maxMinutes > 0 ? Math.round((minutes / maxMinutes) * 100) : 0
          return (
            <div
              key={hour}
              className={`heatmap-cell ${level > 0 ? 'active' : ''}`}
              style={{ backgroundColor: color }}
              title={`${hour}:00 - ${hour}:00 — 专注 ${minutes} 分钟`}
            >
              <span className="heatmap-hour">{hour}</span>
              {minutes > 0 && <span className="heatmap-mins">{minutes}</span>}
            </div>
          )
        })}
      </div>
      <div className="heatmap-scale">
        <span className="scale-label">少</span>
        {[0, 1, 2, 3, 4].map(l => (
          <span
            key={l}
            className="scale-swatch"
            style={{ backgroundColor: `var(--heat-${l})` }}
          />
        ))}
        <span className="scale-label">多</span>
      </div>
      <div className="heatmap-list">
        <div className="heatmap-list-label">当日完成记录</div>
        {sessions.length === 0 ? (
          <div className="heatmap-empty">暂无专注记录</div>
        ) : (
          <ul className="session-list">
            {sessions.map((s, i) => {
              const time = new Date(s.completedAt)
              const hh = String(time.getHours()).padStart(2, '0')
              const mm = String(time.getMinutes()).padStart(2, '0')
              return (
                <li key={i} className="session-item">
                  <span className="session-time">{hh}:{mm}</span>
                  <span className="session-dur">专注 {s.duration} 分钟</span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
