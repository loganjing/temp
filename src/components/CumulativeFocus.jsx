import { totalFocusMinutes } from '../lib/storage.js'

function formatDuration(minutes) {
  if (minutes < 60) return `${minutes} 分钟`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h} 小时 ${m} 分钟` : `${h} 小时`
}

export default function CumulativeFocus({ sessions }) {
  const minutes = totalFocusMinutes(sessions)
  const count = sessions.length

  return (
    <section className="cumulative-section">
      <div className="cumulative-label">当日累计专注时长</div>
      <div className="cumulative-value">{formatDuration(minutes)}</div>
      <div className="cumulative-sub">已完成 {count} 个番茄钟 · 每个 25 分钟</div>
    </section>
  )
}
