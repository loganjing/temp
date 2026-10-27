import { useState, useEffect } from 'react'
import './Clock.css'

/**
 * 将 Date 对象格式化为 HH:MM:SS（两位补零）。
 * @param {Date} date
 * @returns {string}
 */
export function formatTime(date) {
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

/**
 * 实时时钟组件：打开后立即显示当前系统时间的时分秒，
 * 每秒自动更新，用户无需手动刷新。
 */
export default function Clock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const time = formatTime(now)

  return (
    <main className="clock-page" aria-label="实时时钟">
      <h1 className="clock-title">当前时间</h1>
      <time
        className="clock-time"
        dateTime={time}
        aria-live="polite"
        aria-atomic="true"
      >
        {time}
      </time>
    </main>
  )
}
