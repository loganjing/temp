import { useEffect, useState } from 'react'

/**
 * 将 0-59 的整数补零为两位字符串。
 * @param {number} value
 * @returns {string}
 */
export function pad(value) {
  return String(value).padStart(2, '0')
}

/**
 * 从 Date 对象生成 HH:MM:SS 格式字符串。
 * @param {Date} date
 * @returns {string}
 */
export function formatTime(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export default function Clock() {
  const [time, setTime] = useState(() => formatTime(new Date()))

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(formatTime(new Date()))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <main className="clock" aria-live="polite" aria-atomic="true">
      <span className="clock__time">{time}</span>
    </main>
  )
}
